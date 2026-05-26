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

function deckToRow(deck, userId) {
  const targetId = isUuid(deck.id) ? deck.id : undefined; // let Postgres mint a new uuid
  return {
    ...(targetId ? { id: targetId } : {}),
    owner_id: userId,
    name: deck.name || 'Untitled',
    commander_name: deck.commander?.name || null,
    is_public: !!deck.is_public,
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
  const { data, error } = await supabase
    .from('decks')
    .select('id, name, commander_name, is_public, data, created_at, updated_at')
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
  const { error } = await supabase.from('decks').delete().eq('id', id);
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
  const { data: decks, error } = await supabase
    .from('decks')
    .select('id, name, commander_name, is_public, data, updated_at, owner_id')
    .eq('is_public', true)
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
    .select('user_id, username')
    .in('user_id', ownerIds);

  const usernameByOwner = new Map();
  for (const p of profiles || []) usernameByOwner.set(p.user_id, p.username);

  return decks.map((row) => ({
    ...rowToDeck(row),
    ownerUsername: usernameByOwner.get(row.owner_id) || 'someone',
  }));
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
