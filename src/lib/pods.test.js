import { describe, it, expect } from 'vitest';
import { aggregateMatchups, aggregatePodStats } from './pods.js';

const DECK = 'deck-uuid-1';
const M_ME   = 'm-me';
const M_ALEX = 'm-alex';
const M_BREN = 'm-bren';
const M_CARL = 'm-carl';

function seat({ id, gameId, memberId, commander = null, deckId = null }) {
  return {
    id, game_id: gameId, member_id: memberId,
    deck_id: deckId, commander_name: commander, placement: null,
  };
}

describe('aggregateMatchups', () => {
  it('counts wins and losses per opponent commander', () => {
    const games = [
      { id: 'g1', winner_member_id: M_ME,   played_at: '2026-05-01' },
      { id: 'g2', winner_member_id: M_ALEX, played_at: '2026-05-02' },
      { id: 'g3', winner_member_id: M_ME,   played_at: '2026-05-03' },
    ];
    const mySeats = [
      seat({ id: 's1', gameId: 'g1', memberId: M_ME, commander: 'Edgar Markov', deckId: DECK }),
      seat({ id: 's2', gameId: 'g2', memberId: M_ME, commander: 'Edgar Markov', deckId: DECK }),
      seat({ id: 's3', gameId: 'g3', memberId: M_ME, commander: 'Edgar Markov', deckId: DECK }),
    ];
    const allSeats = [
      ...mySeats,
      seat({ id: 's4', gameId: 'g1', memberId: M_ALEX, commander: 'Atraxa' }),
      seat({ id: 's5', gameId: 'g2', memberId: M_ALEX, commander: 'Atraxa' }),
      seat({ id: 's6', gameId: 'g3', memberId: M_ALEX, commander: 'Atraxa' }),
      seat({ id: 's7', gameId: 'g3', memberId: M_BREN, commander: 'Yuriko' }),
    ];
    const memberNames = new Map([[M_ME, 'me'], [M_ALEX, 'Alex'], [M_BREN, 'Bren']]);

    const { games: total, byOpponent } = aggregateMatchups({
      deckId: DECK, mySeats, games, allSeats, memberNames,
    });

    expect(total).toBe(3);
    const atraxa = byOpponent.find((b) => b.opponentName === 'Atraxa');
    expect(atraxa).toMatchObject({ wins: 2, losses: 1, games: 3 });
    const yuriko = byOpponent.find((b) => b.opponentName === 'Yuriko');
    expect(yuriko).toMatchObject({ wins: 1, losses: 0, games: 1 });
  });

  it('falls back to member display name when commander is blank', () => {
    const games = [{ id: 'g1', winner_member_id: M_ALEX, played_at: '2026-05-01' }];
    const mySeats = [seat({ id: 's1', gameId: 'g1', memberId: M_ME, commander: 'Krenko', deckId: DECK })];
    const allSeats = [
      ...mySeats,
      seat({ id: 's2', gameId: 'g1', memberId: M_ALEX, commander: '' }),
    ];
    const memberNames = new Map([[M_ALEX, 'Alex']]);
    const { byOpponent } = aggregateMatchups({
      deckId: DECK, mySeats, games, allSeats, memberNames,
    });
    expect(byOpponent[0].opponentName).toBe('Alex');
    expect(byOpponent[0]).toMatchObject({ wins: 0, losses: 1, games: 1 });
  });

  it('sorts opponents by games played descending', () => {
    const games = [
      { id: 'g1', winner_member_id: M_ME },
      { id: 'g2', winner_member_id: M_ME },
      { id: 'g3', winner_member_id: M_ME },
    ];
    const mySeats = ['g1', 'g2', 'g3'].map((gid, i) =>
      seat({ id: `m${i}`, gameId: gid, memberId: M_ME, deckId: DECK })
    );
    const allSeats = [
      ...mySeats,
      seat({ id: 'o1', gameId: 'g1', memberId: M_ALEX, commander: 'Often Played' }),
      seat({ id: 'o2', gameId: 'g2', memberId: M_ALEX, commander: 'Often Played' }),
      seat({ id: 'o3', gameId: 'g3', memberId: M_ALEX, commander: 'Often Played' }),
      seat({ id: 'o4', gameId: 'g1', memberId: M_BREN, commander: 'One-Off' }),
    ];
    const { byOpponent } = aggregateMatchups({
      deckId: DECK, mySeats, games, allSeats, memberNames: new Map(),
    });
    expect(byOpponent[0].opponentName).toBe('Often Played');
    expect(byOpponent[0].games).toBe(3);
    expect(byOpponent[1].opponentName).toBe('One-Off');
  });

  it('skips games where this deck never sat', () => {
    const games = [{ id: 'g-other', winner_member_id: M_ALEX }];
    const mySeats = []; // No seats for this deck
    const allSeats = [seat({ id: 'x', gameId: 'g-other', memberId: M_ALEX, commander: 'Atraxa' })];
    const { games: total, byOpponent } = aggregateMatchups({
      deckId: DECK, mySeats, games, allSeats, memberNames: new Map(),
    });
    expect(total).toBe(0);
    expect(byOpponent).toEqual([]);
  });

  it('treats games with no recorded winner as losses for everyone', () => {
    const games = [{ id: 'g1', winner_member_id: null }];
    const mySeats = [seat({ id: 's1', gameId: 'g1', memberId: M_ME, deckId: DECK })];
    const allSeats = [
      ...mySeats,
      seat({ id: 's2', gameId: 'g1', memberId: M_ALEX, commander: 'Atraxa' }),
    ];
    const { byOpponent } = aggregateMatchups({
      deckId: DECK, mySeats, games, allSeats, memberNames: new Map(),
    });
    expect(byOpponent[0]).toMatchObject({ wins: 0, losses: 1, games: 1 });
  });
});

describe('aggregatePodStats', () => {
  it('counts wins per member sorted descending', () => {
    const members = [
      { id: M_ME, display_name: 'Me' },
      { id: M_ALEX, display_name: 'Alex' },
      { id: M_CARL, display_name: 'Carl' },
    ];
    const games = [
      { id: 'g1', winner_member_id: M_ME,   played_at: new Date().toISOString() },
      { id: 'g2', winner_member_id: M_ME,   played_at: new Date().toISOString() },
      { id: 'g3', winner_member_id: M_ALEX, played_at: new Date().toISOString() },
      { id: 'g4', winner_member_id: null,   played_at: new Date().toISOString() },
    ];
    const { games: total, memberSummary } = aggregatePodStats({ games, allSeats: [], members });
    expect(total).toBe(4);
    expect(memberSummary[0]).toMatchObject({ id: M_ME, wins: 2 });
    expect(memberSummary[1]).toMatchObject({ id: M_ALEX, wins: 1 });
    expect(memberSummary[2]).toMatchObject({ id: M_CARL, wins: 0 });
  });

  it('counts games in the last 30 days', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const { recent30Days } = aggregatePodStats({
      games: [
        { id: 'g1', winner_member_id: null, played_at: old },
        { id: 'g2', winner_member_id: null, played_at: recent },
        { id: 'g3', winner_member_id: null, played_at: recent },
      ],
      allSeats: [],
      members: [],
    });
    expect(recent30Days).toBe(2);
  });
});
