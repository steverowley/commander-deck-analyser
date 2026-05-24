import { describe, it, expect } from 'vitest';
import { simulateOpeners, simulatePlayout, simulateMulliganTree } from './goldfish.js';

const land = (name = 'Forest') => ({
  count: 1,
  name,
  tags: [],
  scryfall: { name, type_line: 'Basic Land — Forest', cmc: 0 },
});

const card = (name, tags = [], cmc = 3) => ({
  count: 1,
  name,
  tags,
  scryfall: { name, type_line: 'Creature', cmc, oracle_text: '' },
});

function buildDeck(landCount, rampCount, drawCount, fillerCount) {
  const cards = [];
  for (let i = 0; i < landCount; i++) cards.push(land(`Forest ${i}`));
  for (let i = 0; i < rampCount; i++) cards.push(card(`Ramp ${i}`, ['Ramp']));
  for (let i = 0; i < drawCount; i++) cards.push(card(`Draw ${i}`, ['Card draw']));
  for (let i = 0; i < fillerCount; i++) cards.push(card(`Filler ${i}`, []));
  return { cards };
}

describe('simulateOpeners', () => {
  it('returns null for decks smaller than 7 cards', () => {
    expect(simulateOpeners({ cards: [land()] })).toBeNull();
  });

  it('reports average lands close to deck land fraction', () => {
    const deck = buildDeck(37, 10, 10, 42); // 37/99 = 0.374 -> 7 cards * 0.374 = 2.62
    const sim = simulateOpeners(deck, 1500);
    expect(sim.avgLands).toBeGreaterThan(2.3);
    expect(sim.avgLands).toBeLessThan(3.0);
  });

  it('reports high keepable rate for a balanced deck', () => {
    const deck = buildDeck(37, 10, 10, 42);
    // 3000 samples + a slightly looser threshold to stay stable on slow CI.
    const sim = simulateOpeners(deck, 3000);
    expect(sim.keepableRate).toBeGreaterThan(0.7);
  });

  it('reports low keepable rate for a land-thin deck', () => {
    const deck = buildDeck(15, 0, 0, 84); // 15 lands — very thin
    const sim = simulateOpeners(deck, 3000);
    expect(sim.keepableRate).toBeLessThan(0.65);
  });
});

describe('simulateMulliganTree', () => {
  it('returns null when the deck is too small', () => {
    expect(simulateMulliganTree({ cards: [land()] })).toBeNull();
  });

  it('reports four keep rates that are monotonically decreasing-ish', () => {
    const deck = buildDeck(37, 10, 10, 42);
    const tree = simulateMulliganTree(deck, 800);
    // Stricter keepability at smaller hand sizes — keep rates should decline.
    expect(tree.keepable[7]).toBeGreaterThan(tree.keepable[4]);
  });

  it('stop probabilities sum to ~1 with the further-mulligan tail', () => {
    const deck = buildDeck(37, 10, 10, 42);
    const tree = simulateMulliganTree(deck, 800);
    const sum = tree.stop[7] + tree.stop[6] + tree.stop[5] + tree.stop[4] + tree.stop.further;
    expect(sum).toBeCloseTo(1, 2);
  });
});

describe('simulatePlayout', () => {
  it('returns null when the deck is too small', () => {
    expect(simulatePlayout({ cards: [land()] })).toBeNull();
  });

  it('returns one log entry per turn', () => {
    const deck = buildDeck(37, 10, 10, 42);
    const log = simulatePlayout(deck, 6);
    expect(log).toHaveLength(6);
    expect(log[0].turn).toBe(1);
    expect(log[5].turn).toBe(6);
  });

  it('drops a land each turn when lands are available', () => {
    const deck = buildDeck(70, 0, 0, 29);
    const log = simulatePlayout(deck, 6);
    const landsPlayed = log.filter((t) => t.landPlayed).length;
    expect(landsPlayed).toBeGreaterThanOrEqual(5);
  });
});
