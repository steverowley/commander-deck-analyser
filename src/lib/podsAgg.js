/**
 * Pure aggregators for the pod tracking feature.
 *
 * Split out of src/lib/pods.js so unit tests can drive the math
 * without importing the Supabase client (which initialises Realtime
 * at module load and fails on Node < 22 without native WebSocket
 * support — that hits the CI runner).
 */

/**
 * Per-deck matchup aggregation.
 *
 * Input:
 *   - deckId:       cloud uuid for the deck under analysis
 *   - mySeats:      this deck's game_decks rows
 *   - games:        the parent games rows (one per game_id in mySeats)
 *   - allSeats:     every game_decks row across the same games
 *   - memberNames:  Map<member_id, display_name> for fallback labels
 *
 * Output: `{ games, byOpponent }` where each `byOpponent` row is
 *   `{ opponentName, wins, losses, games }` sorted by games desc.
 *
 * `opponentName` prefers the opposing seat's commander_name; falls
 * back to the member display name; finally `(unknown opponent)`.
 * A win is when this deck's seat's member_id === game.winner_member_id.
 */
export function aggregateMatchups({ deckId, mySeats, games, allSeats, memberNames }) {
  const mySeatsByGame = new Map(mySeats.map((s) => [s.game_id, s]));

  const buckets = new Map();
  let totalGames = 0;
  for (const game of games) {
    const mine = mySeatsByGame.get(game.id);
    if (!mine) continue;
    totalGames += 1;
    const won = !!game.winner_member_id && game.winner_member_id === mine.member_id;
    const oppSeats = allSeats.filter((s) => s.game_id === game.id && s.id !== mine.id);
    for (const opp of oppSeats) {
      const key =
        (opp.commander_name && opp.commander_name.trim()) ||
        memberNames.get(opp.member_id) ||
        '(unknown opponent)';
      if (!buckets.has(key)) buckets.set(key, { opponentName: key, wins: 0, losses: 0, games: 0 });
      const b = buckets.get(key);
      b.games += 1;
      if (won) b.wins += 1;
      else b.losses += 1;
    }
  }

  const byOpponent = Array.from(buckets.values()).sort(
    (a, b) => b.games - a.games || b.wins - a.wins
  );
  return { games: totalGames, byOpponent };
}

/**
 * Pod-level summary: total games, winner counts per member, recent
 * game count over the last 30 days.
 */
export function aggregatePodStats({ games, allSeats, members }) {
  const winsByMember = new Map();
  for (const g of games) {
    if (!g.winner_member_id) continue;
    winsByMember.set(g.winner_member_id, (winsByMember.get(g.winner_member_id) || 0) + 1);
  }
  const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = games.filter((g) => new Date(g.played_at).getTime() >= last30).length;
  const memberSummary = (members || []).map((m) => ({
    id: m.id,
    displayName: m.display_name,
    wins: winsByMember.get(m.id) || 0,
  })).sort((a, b) => b.wins - a.wins);
  return {
    games: games.length,
    recent30Days: recent,
    memberSummary,
  };
}
