/**
 * Pod tracking + game log.
 *
 * Supabase schema (see migration `add_pods_tracking`):
 *   pods         (id, owner_id, name, created_at)
 *   pod_members  (id, pod_id, user_id?, display_name)
 *   games        (id, pod_id, played_at, winner_member_id?, notes?)
 *   game_decks   (id, game_id, member_id?, deck_id?, commander_name?, placement?)
 *
 * All access is RLS-gated to `owner_id = auth.uid()` — these helpers
 * intentionally do NOT re-filter on owner_id because the policy already
 * does, and an extra `eq('owner_id', uid)` would just hide failures
 * caused by mis-shared rows.
 */

import { supabase } from './supabase.js';

// Pure aggregators live in ./podsAgg.js so the unit tests can drive
// the math without pulling in the Supabase client at module load
// (Realtime needs native WebSocket which Node < 22 doesn't have).
export { aggregateMatchups, aggregatePodStats } from './podsAgg.js';
import { aggregateMatchups as _aggregateMatchups } from './podsAgg.js';

function client() {
  if (!supabase) throw new Error('Sign in to track pods.');
  return supabase;
}

/* ─── Pods ────────────────────────────────────────────────────────────── */

export async function listPods() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pods')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('listPods failed', error);
    return [];
  }
  return data || [];
}

export async function createPod({ name }) {
  const c = client();
  const { data: { user } } = await c.auth.getUser();
  if (!user) throw new Error('Sign in to create a pod.');
  const { data, error } = await c
    .from('pods')
    .insert({ owner_id: user.id, name: (name || '').trim() })
    .select('id, name, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function deletePod(id) {
  const { error } = await client().from('pods').delete().eq('id', id);
  if (error) throw error;
}

export async function renamePod(id, name) {
  const { error } = await client()
    .from('pods')
    .update({ name: (name || '').trim() })
    .eq('id', id);
  if (error) throw error;
}

/* ─── Pod members ─────────────────────────────────────────────────────── */

export async function listPodMembers(podId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pod_members')
    .select('id, pod_id, user_id, display_name, created_at')
    .eq('pod_id', podId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('listPodMembers failed', error);
    return [];
  }
  return data || [];
}

export async function addPodMember({ podId, displayName, userId = null }) {
  const { data, error } = await client()
    .from('pod_members')
    .insert({ pod_id: podId, user_id: userId, display_name: (displayName || '').trim() })
    .select('id, pod_id, user_id, display_name, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function removePodMember(memberId) {
  const { error } = await client().from('pod_members').delete().eq('id', memberId);
  if (error) throw error;
}

/* ─── Games ───────────────────────────────────────────────────────────── */

/**
 * Log a game. `players` is an array of
 *   { memberId, deckId? (uuid), commanderName? (string), placement? (int) }
 * with one entry per seat at the table. `winnerMemberId` identifies the
 * winning member (must appear in `players`). Inserts the game then the
 * per-seat game_decks rows. Best-effort transactional via a single RPC
 * is overkill here — the policy gates both writes to the same owner so
 * a partial insert is the worst case, and the owner can just re-log.
 */
export async function logGame({ podId, players, winnerMemberId, notes, playedAt }) {
  const c = client();
  if (!podId) throw new Error('Pod is required.');
  if (!Array.isArray(players) || players.length < 2) {
    throw new Error('At least two players are required.');
  }
  if (winnerMemberId && !players.some((p) => p.memberId === winnerMemberId)) {
    throw new Error('Winner must be one of the players.');
  }
  const { data: game, error } = await c
    .from('games')
    .insert({
      pod_id: podId,
      winner_member_id: winnerMemberId || null,
      notes: notes && notes.trim() ? notes.trim() : null,
      ...(playedAt ? { played_at: playedAt } : {}),
    })
    .select('id, played_at')
    .single();
  if (error) throw error;

  const rows = players.map((p) => ({
    game_id:        game.id,
    member_id:      p.memberId || null,
    deck_id:        p.deckId || null,
    commander_name: p.commanderName ? p.commanderName.trim() : null,
    placement:      Number.isFinite(p.placement) ? p.placement : null,
  }));
  if (rows.length > 0) {
    const { error: insErr } = await c.from('game_decks').insert(rows);
    if (insErr) {
      // Roll back the orphan game so we don't leave a phantom in the log.
      await c.from('games').delete().eq('id', game.id);
      throw insErr;
    }
  }
  return game.id;
}

export async function deleteGame(id) {
  const { error } = await client().from('games').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Game log for a pod — newest first. Each entry is `{ game, seats[] }`
 * where seats carries the per-player row with the member display name
 * resolved client-side.
 */
export async function listGames(podId) {
  if (!supabase) return [];
  const { data: games, error: gErr } = await supabase
    .from('games')
    .select('id, pod_id, played_at, winner_member_id, notes')
    .eq('pod_id', podId)
    .order('played_at', { ascending: false });
  if (gErr) {
    console.warn('listGames failed', gErr);
    return [];
  }
  if (!games?.length) return [];
  const gameIds = games.map((g) => g.id);
  const { data: seats, error: sErr } = await supabase
    .from('game_decks')
    .select('id, game_id, member_id, deck_id, commander_name, placement')
    .in('game_id', gameIds);
  if (sErr) {
    console.warn('listGames game_decks failed', sErr);
    return games.map((g) => ({ game: g, seats: [] }));
  }
  const byGame = new Map();
  for (const s of seats || []) {
    if (!byGame.has(s.game_id)) byGame.set(s.game_id, []);
    byGame.get(s.game_id).push(s);
  }
  return games.map((g) => ({ game: g, seats: byGame.get(g.id) || [] }));
}

/**
 * Aggregate matchup stats for a deck (cloud uuid). Returns
 *   { games: total games found, byOpponent: [{ opponentName, wins, losses, games }] }
 * sorted by games-played descending.
 *
 * `opponentName` is the most-played commander for the opposing seat
 * when present, otherwise the member display_name as a fallback.
 * A "win" is logged when this deck's seat's member_id === game.winner_member_id.
 */
export async function gamesForDeck(deckId) {
  if (!supabase || !deckId) return [];
  const { data, error } = await supabase
    .from('game_decks')
    .select('id, game_id, member_id, deck_id, commander_name, placement')
    .eq('deck_id', deckId);
  if (error) {
    console.warn('gamesForDeck failed', error);
    return [];
  }
  return data || [];
}

export async function matchupForDeck(deckId) {
  if (!supabase || !deckId) return { games: 0, byOpponent: [] };
  const mySeats = await gamesForDeck(deckId);
  if (mySeats.length === 0) return { games: 0, byOpponent: [] };
  const gameIds = [...new Set(mySeats.map((s) => s.game_id))];
  const { data: games, error: gErr } = await supabase
    .from('games')
    .select('id, winner_member_id, played_at, pod_id')
    .in('id', gameIds);
  if (gErr) {
    console.warn('matchupForDeck games failed', gErr);
    return { games: 0, byOpponent: [] };
  }
  const { data: allSeats, error: sErr } = await supabase
    .from('game_decks')
    .select('id, game_id, member_id, deck_id, commander_name, placement')
    .in('game_id', gameIds);
  if (sErr) {
    console.warn('matchupForDeck game_decks failed', sErr);
    return { games: 0, byOpponent: [] };
  }
  const memberIds = [
    ...new Set((allSeats || []).map((s) => s.member_id).filter(Boolean)),
  ];
  let memberNames = new Map();
  if (memberIds.length > 0) {
    const { data: members } = await supabase
      .from('pod_members')
      .select('id, display_name')
      .in('id', memberIds);
    memberNames = new Map((members || []).map((m) => [m.id, m.display_name]));
  }
  return _aggregateMatchups({
    deckId,
    mySeats,
    games: games || [],
    allSeats: allSeats || [],
    memberNames,
  });
}
