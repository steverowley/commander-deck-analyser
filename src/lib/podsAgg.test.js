import { describe, it, expect } from 'vitest';
import { aggregateMatchups, aggregatePodStats } from './podsAgg.js';

const DAY = 24 * 60 * 60 * 1000;

describe('aggregateMatchups', () => {
  // Two games for my deck: I win game A (vs Atraxa + an un-named seat) and
  // lose game B (vs Atraxa). Wins / losses are tracked from MY perspective.
  const mySeats = [
    { id: 's1', game_id: 'gA', member_id: 'm1' },
    { id: 's4', game_id: 'gB', member_id: 'm1' },
  ];
  const games = [
    { id: 'gA', winner_member_id: 'm1' }, // I won
    { id: 'gB', winner_member_id: 'm2' }, // I lost
  ];
  const allSeats = [
    { id: 's1', game_id: 'gA', member_id: 'm1' },
    { id: 's2', game_id: 'gA', member_id: 'm2', commander_name: 'Atraxa' },
    { id: 's3', game_id: 'gA', member_id: 'm3' }, // no commander → member name
    { id: 's4', game_id: 'gB', member_id: 'm1' },
    { id: 's5', game_id: 'gB', member_id: 'm2', commander_name: 'Atraxa' },
  ];
  const memberNames = new Map([['m3', 'Bob']]);

  it('counts the games my deck actually played', () => {
    const { games: total } = aggregateMatchups({ deckId: 'deck-1', mySeats, games, allSeats, memberNames });
    expect(total).toBe(2);
  });

  it('tracks wins and losses per opponent commander', () => {
    const { byOpponent } = aggregateMatchups({ deckId: 'deck-1', mySeats, games, allSeats, memberNames });
    const atraxa = byOpponent.find((o) => o.opponentName === 'Atraxa');
    expect(atraxa).toEqual({ opponentName: 'Atraxa', wins: 1, losses: 1, games: 2 });
  });

  it('falls back to the member display name when a seat has no commander', () => {
    const { byOpponent } = aggregateMatchups({ deckId: 'deck-1', mySeats, games, allSeats, memberNames });
    const bob = byOpponent.find((o) => o.opponentName === 'Bob');
    expect(bob).toEqual({ opponentName: 'Bob', wins: 1, losses: 0, games: 1 });
  });

  it('falls back to "(unknown opponent)" when neither commander nor name is known', () => {
    const { byOpponent } = aggregateMatchups({
      deckId: 'deck-1',
      mySeats: [{ id: 's1', game_id: 'gA', member_id: 'm1' }],
      games: [{ id: 'gA', winner_member_id: 'm1' }],
      allSeats: [
        { id: 's1', game_id: 'gA', member_id: 'm1' },
        { id: 's2', game_id: 'gA', member_id: 'mX' },
      ],
      memberNames: new Map(),
    });
    expect(byOpponent[0].opponentName).toBe('(unknown opponent)');
  });

  it('sorts opponents by games played descending', () => {
    const { byOpponent } = aggregateMatchups({ deckId: 'deck-1', mySeats, games, allSeats, memberNames });
    expect(byOpponent[0].opponentName).toBe('Atraxa'); // 2 games
    expect(byOpponent[1].opponentName).toBe('Bob'); // 1 game
  });

  it('ignores games my deck did not sit in', () => {
    const { games: total } = aggregateMatchups({
      deckId: 'deck-1',
      mySeats: [{ id: 's1', game_id: 'gA', member_id: 'm1' }],
      games: [{ id: 'gA', winner_member_id: 'm1' }, { id: 'gZ', winner_member_id: 'm9' }],
      allSeats: [
        { id: 's1', game_id: 'gA', member_id: 'm1' },
        { id: 's2', game_id: 'gA', member_id: 'm2', commander_name: 'Atraxa' },
      ],
      memberNames: new Map(),
    });
    expect(total).toBe(1);
  });
});

describe('aggregatePodStats', () => {
  const members = [
    { id: 'm1', display_name: 'Alice' },
    { id: 'm2', display_name: 'Bob' },
  ];
  const games = [
    { id: 'g1', winner_member_id: 'm1', played_at: new Date(Date.now() - 1 * DAY).toISOString() },
    { id: 'g2', winner_member_id: 'm1', played_at: new Date(Date.now() - 60 * DAY).toISOString() },
    { id: 'g3', winner_member_id: 'm2', played_at: new Date(Date.now() - 2 * DAY).toISOString() },
  ];

  it('counts total games', () => {
    expect(aggregatePodStats({ games, allSeats: [], members }).games).toBe(3);
  });

  it('counts only games played in the last 30 days as recent', () => {
    expect(aggregatePodStats({ games, allSeats: [], members }).recent30Days).toBe(2);
  });

  it('tallies wins per member and sorts the summary by wins descending', () => {
    const { memberSummary } = aggregatePodStats({ games, allSeats: [], members });
    expect(memberSummary).toEqual([
      { id: 'm1', displayName: 'Alice', wins: 2 },
      { id: 'm2', displayName: 'Bob', wins: 1 },
    ]);
  });

  it('reports zero wins for a member who never won', () => {
    const { memberSummary } = aggregatePodStats({
      games: [{ id: 'g1', winner_member_id: 'm1', played_at: new Date().toISOString() }],
      allSeats: [],
      members,
    });
    expect(memberSummary.find((m) => m.id === 'm2').wins).toBe(0);
  });

  it('ignores games with no recorded winner', () => {
    const { memberSummary } = aggregatePodStats({
      games: [{ id: 'g1', winner_member_id: null, played_at: new Date().toISOString() }],
      allSeats: [],
      members,
    });
    expect(memberSummary.every((m) => m.wins === 0)).toBe(true);
  });
});
