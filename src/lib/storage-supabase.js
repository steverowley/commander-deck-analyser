/**
 * Supabase-backed deck storage. Drop-in replacement for storage.js when
 * a user is signed in.
 *
 * Public contract matches lib/storage.js exactly so call sites are
 * blind to which backend is active:
 *   loadDecks()    → Promise<Deck[]>    (ordered by updated desc)
 *   saveDeck(deck) → Promise<boolean>   (insert-or-update on id)
 *   deleteDeck(id) → Promise<void>
 *
 * Schema reference (see Supabase migrations):
 *   public.decks(id uuid pk, owner_id uuid, name text, commander_name
 *     text, is_public bool, data jsonb, created_at, updated_at)
 *
 * The `data` column is the full deck JSON shape — cards, commander,
 * wishlist, tags, notes, strictIdentity, etc. The top-level columns
 * are denormalised from data for query/index efficiency on the gallery.
 */

import { supabase } from './supabase.js';
import { assessBracket } from './analyzers.js';
import { computeHealth } from './health.js';

/**
 * Deck IDs in the local app are 'deck_<ts>' strings. Supabase uses uuids.
 * On first save into Supabase we mint a fresh uuid and remap; subsequent
 * saves use that uuid. We hold the local→cloud id mapping inside the
 * deck object itself (deck.cloudId) so the original local id stays as
 * the React key but persistence targets the cloud.
 */
function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function rowToDeck(row) {
  // Spread the JSONB last so any explicit columns we added (id/name) win
  // over the embedded copy. Use the cloud uuid as the canonical id.
  return {
    ...(row.data || {}),
    id: row.id,
    name: row.name,
    commander: row.data?.commander || null,
    is_public: row.is_public,
    created: new Date(row.created_at).getTime(),
    updated: new Date(row.updated_at).getTime(),
  };
}

// Slim mapper for the public gallery. The SELECT pulls only the
// denormalised columns + commander sub-extract — no `data` blob — so the
// resulting deck has commander/badges/timestamps but no `cards` array.
// View / Copy actions in the gallery lazy-load the full deck via
// loadDeckById() before handing it to the editor.
function rowToSlimDeck(row) {
  return {
    id: row.id,
    name: row.name,
    commander: row.commander || null,
    is_public: row.is_public,
    card_count: row.card_count ?? 0,
    bracket: row.bracket ?? null,
    health_score: row.health_score ?? null,
    updated: new Date(row.updated_at).getTime(),
  };
}

function safeCardCount(cards) {
  if (!Array.isArray(cards)) return 0;
  return cards.reduce((s, c) => s + (Number(c?.count) || 0), 0);
}

// Compute the denormalised gallery columns from a deck. Wrapped in a
// try/catch because the analyzers expect a fully-shaped deck — a
// half-populated one (e.g. mid-edit, no commander yet) should still
// save, just with NULL bracket/health for that snapshot.
function denormStats(deck) {
  const card_count = safeCardCount(deck.cards);
  let bracket = null;
  let health_score = null;
  if (deck.commander && Array.isArray(deck.cards) && deck.cards.length > 0) {
    try { bracket = assessBracket(deck).bracket ?? null; } catch { bracket = null; }
    try {
      const h = computeHealth(deck);
      health_score = h && !h.empty ? h.score : null;
    } catch { health_score = null; }
  }
  return { card_count, bracket, health_score };
}

function deckToRow(deck, userId) {
  const targetId = isUuid(deck.id) ? deck.id : undefined; // let Postgres mint a new uuid
  const { card_count, bracket, health_score } = denormStats(deck);
  return {
    ...(targetId ? { id: targetId } : {}),
    owner_id: userId,
    name: deck.name || 'Untitled',
    commander_name: deck.commander?.name || null,
    is_public: !!deck.is_public,
    card_count,
    bracket,
    health_score,
    // Snapshot the whole deck except for fields stored in columns.
    data: { ...deck, id: undefined, created: undefined, updated: undefined, is_public: undefined },
  };
}

async function currentUserId() {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not signed in');
  return user.id;
}

export async function loadDecks() {
  if (!supabase) return [];
  // The 'Anyone can read public decks' RLS policy means a bare SELECT
  // returns *every* public deck across all users. Explicitly filter
  // to the current owner so the archive shows only what's mine — the
  // public gallery has its own dedicated loader for the read-public
  // case.
  const userId = await currentUserId().catch(() => null);
  if (!userId) return [];
  const { data, error } = await supabase
    .from('decks')
    .select('id, name, commander_name, is_public, data, created_at, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) {
    console.warn('Supabase loadDecks failed', error);
    return [];
  }
  return (data || []).map(rowToDeck);
}

export async function saveDeck(deck) {
  if (!supabase) return false;
  const userId = await currentUserId();
  const row = deckToRow(deck, userId);
  const { data, error } = await supabase
    .from('decks')
    .upsert(row, { onConflict: 'id' })
    .select('id')
    .single();
  if (error) {
    console.warn('Supabase saveDeck failed', error);
    return false;
  }
  // Mutate the deck in place so the caller picks up the new cloud uuid.
  if (data?.id) deck.id = data.id;
  deck.updated = Date.now();
  return true;
}

export async function deleteDeck(id) {
  if (!supabase) return;
  // Bind to the authenticated owner so a stray client (or a future RLS
  // policy that broadens delete) can't drop someone else's row by uuid.
  // Mirrors the owner_id filter on loadDecks / saveDeck.
  const userId = await currentUserId().catch(() => null);
  if (!userId) return;
  const { error } = await supabase
    .from('decks')
    .delete()
    .eq('owner_id', userId)
    .eq('id', id);
  if (error) console.warn('Supabase deleteDeck failed', error);
}

/**
 * Public gallery — recent public decks across all users, with the
 * owner's username joined in client-side.
 *
 * Two-query design: PostgREST can't auto-join decks → profiles because
 * there's no direct FK (both tables reference auth.users, not each
 * other). Fetching profiles separately + mapping by owner_id is
 * cheaper than adding an explicit FK column.
 */
export async function loadPublicDecks(limit = 24) {
  if (!supabase) return [];
  // Slim SELECT — denorm columns + commander sub-extract only. The
  // full `data` blob is fetched on demand by loadDeckById() when the
  // user clicks View or Copy → mine on a gallery tile. Saves
  // significant egress on every homepage load.
  const { data: decks, error } = await supabase
    .from('decks')
    .select('id, name, commander_name, is_public, updated_at, owner_id, card_count, bracket, health_score, commander:data->commander')
    .eq('is_public', true)
    // New rolls live in random_rolls, but legacy rolled decks from
    // earlier flows still sit in `decks` with is_public=true and
    // data->seedMeta set. Keep the curated Public Gallery separate
    // by excluding those — they're already surfaced in Latest random
    // rolls if anyone wants them.
    .is('data->seedMeta', null)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('Supabase loadPublicDecks failed', error);
    return [];
  }
  if (!decks?.length) return [];

  const ownerIds = [...new Set(decks.map((d) => d.owner_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, username, supporter')
    .in('user_id', ownerIds);

  const profileByOwner = new Map();
  for (const p of profiles || []) profileByOwner.set(p.user_id, p);

  return decks.map((row) => {
    const p = profileByOwner.get(row.owner_id);
    return {
      ...rowToSlimDeck(row),
      ownerUsername: p?.username || 'someone',
      ownerSupporter: !!p?.supporter,
    };
  });
}

/**
 * Fetch the full deck (including the `data` jsonb blob with cards) by
 * id. Used by the public gallery to lazy-load the heavy payload only
 * when the user clicks View or Copy → mine. RLS already permits
 * "anyone can read public decks" on this table.
 */
export async function loadDeckById(id) {
  if (!supabase || !id) return null;
  const { data, error } = await supabase
    .from('decks')
    .select('id, name, commander_name, is_public, data, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('Supabase loadDeckById failed', error);
    return null;
  }
  if (!data) return null;
  return rowToDeck(data);
}

/**
 * Insert a roll snapshot into random_rolls. Called from the
 * Roll-a-deck flow when the user opts in to share. Persists the
 * commander + cards + roll metadata independently of the user's
 * editable decks, so deleting the deck from their archive doesn't
 * remove the roll from the gallery.
 *
 * Returns { ok } — failures are logged but never block the build.
 */
export async function saveRandomRoll({ commander, cards, seedMeta }) {
  if (!supabase || !commander) return { ok: false };
  const userId = await currentUserId().catch(() => null);
  if (!userId) return { ok: false };
  const { error } = await supabase.from('random_rolls').insert({
    owner_id: userId,
    commander_name: commander.name || null,
    commander_data: commander,
    cards_data: cards || [],
    card_count: safeCardCount(cards),
    seed_meta: seedMeta || null,
  });
  if (error) {
    console.warn('Supabase saveRandomRoll failed', error);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Random-rolls gallery — reads from the dedicated random_rolls table
 * so entries persist even if the user later deletes the deck from
 * their archive. Joins profiles client-side by owner_id.
 */
export async function loadRandomRolls(limit = 12) {
  if (!supabase) return [];
  // Slim SELECT — drops cards_data so the homepage gallery doesn't pull
  // every roll's 99-card payload. View / Copy lazy-load via
  // loadRandomRollById().
  const { data: rolls, error } = await supabase
    .from('random_rolls')
    .select('id, owner_id, commander_name, commander_data, card_count, seed_meta, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('Supabase loadRandomRolls failed', error);
    return [];
  }
  if (!rolls?.length) return [];

  const ownerIds = [...new Set(rolls.map((r) => r.owner_id).filter(Boolean))];
  let profileByOwner = new Map();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, supporter')
      .in('user_id', ownerIds);
    for (const p of profiles || []) profileByOwner.set(p.user_id, p);
  }

  // Adapt to the slim gallery shape — same fields as before minus the
  // `cards` array (now lazy-fetched). card_count carries the total so
  // the tile can still show "99 cards" without the blob.
  return rolls.map((r) => {
    const p = r.owner_id ? profileByOwner.get(r.owner_id) : null;
    return {
      id: `roll:${r.id}`,
      name: r.commander_name || 'Random roll',
      commander: r.commander_data,
      card_count: r.card_count ?? 0,
      seedMeta: r.seed_meta || null,
      created: new Date(r.created_at).getTime(),
      updated: new Date(r.created_at).getTime(),
      ownerUsername: r.owner_id ? (p?.username || 'someone') : '[deleted]',
      ownerSupporter: !!p?.supporter,
      __fromRandomRolls: true,
    };
  });
}

/**
 * Fetch a single random roll (including cards_data) by id. Accepts
 * either the bare uuid or the 'roll:<uuid>' form the gallery uses for
 * React keys. RLS allows anyone-read on this table.
 */
export async function loadRandomRollById(rollId) {
  if (!supabase || !rollId) return null;
  const cleanId = typeof rollId === 'string' && rollId.startsWith('roll:')
    ? rollId.slice(5)
    : rollId;
  const { data: r, error } = await supabase
    .from('random_rolls')
    .select('id, owner_id, commander_name, commander_data, cards_data, seed_meta, created_at')
    .eq('id', cleanId)
    .maybeSingle();
  if (error) {
    console.warn('Supabase loadRandomRollById failed', error);
    return null;
  }
  if (!r) return null;
  return {
    id: `roll:${r.id}`,
    name: r.commander_name || 'Random roll',
    commander: r.commander_data,
    cards: r.cards_data || [],
    seedMeta: r.seed_meta || null,
    created: new Date(r.created_at).getTime(),
    updated: new Date(r.created_at).getTime(),
    __fromRandomRolls: true,
  };
}

/**
 * Bulk-upload localStorage decks into Supabase. Each gets a fresh
 * cloud uuid; the original local id is dropped. Returns the count
 * of successfully uploaded decks.
 *
 * Idempotency caveat: this *appends*. Calling it twice with the same
 * decks produces duplicates. Caller is responsible for guarding (e.g.
 * "have I already migrated?" flag).
 */
export async function uploadLocalDecks(decks) {
  if (!supabase || !decks?.length) return 0;
  const userId = await currentUserId();
  const rows = decks.map((d) => {
    const row = deckToRow(d, userId);
    delete row.id; // force fresh uuid
    return row;
  });
  const { data, error } = await supabase.from('decks').insert(rows).select('id');
  if (error) {
    console.warn('Supabase uploadLocalDecks failed', error);
    return 0;
  }
  return data?.length || 0;
}
