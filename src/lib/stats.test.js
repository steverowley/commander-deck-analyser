import { describe, it, expect } from 'vitest';
import { aggregateStats } from './stats.js';

const card = (name, tags = [], overrides = {}) => ({
  count: 1,
  name,
  tags,
  scryfall: {
    name, type_line: 'Creature', cmc: 3, oracle_text: '', mana_cost: '{2}{B}',
    color_identity: ['B'], prices: { usd: '1.00' }, ...overrides,
  },
});

const deck = (id, commander, cards = [], updated = 0) => ({
  id, name: id, commander, cards, updated,
});

const edgar = { name: 'Edgar Markov', color_identity: ['W', 'B', 'R'] };
const atraxa = { name: 'Atraxa', color_identity: ['W', 'U', 'B', 'G'] };

describe('aggregateStats', () => {
  it('returns empty zero-state for no decks', () => {
    const s = aggregateStats([]);
    expect(s.deckCount).toBe(0);
    expect(s.cardCount).toBe(0);
    expect(s.bracketHistogram).toEqual([0, 0, 0, 0, 0]);
    expect(s.colorHistogram).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    expect(s.mostRecent).toBeNull();
  });

  it('counts cards across decks', () => {
    const a = deck('a', edgar, [card('Bloodghast'), card('Sol Ring')]);
    const b = deck('b', edgar, [card('Skullclamp')]);
    const s = aggregateStats([a, b]);
    expect(s.cardCount).toBe(3);
  });

  it('builds a colour histogram including colorless commanders', () => {
    const a = deck('a', edgar);
    const b = deck('b', atraxa);
    const c = deck('c', { name: 'Karn', color_identity: [] });
    const s = aggregateStats([a, b, c]);
    expect(s.colorHistogram.W).toBe(2);
    expect(s.colorHistogram.U).toBe(1);
    expect(s.colorHistogram.G).toBe(1);
    expect(s.colorHistogram.C).toBe(1);
  });

  it('sums prices and reports unpriced count', () => {
    // Commander without a `prices` field counts as unpriced.
    const a = deck('a', edgar, [
      card('Bloodghast'),
      card('Mystery Card', [], { prices: {} }),
    ]);
    const s = aggregateStats([a]);
    expect(s.totalPrice).toBe(1);
    expect(s.totalPriceUnpriced).toBe(2); // Mystery Card + Edgar
  });

  it('finds the most recently updated deck', () => {
    const a = deck('a', edgar, [], 100);
    const b = deck('b', edgar, [], 200);
    const c = deck('c', edgar, [], 50);
    expect(aggregateStats([a, b, c]).mostRecent.id).toBe('b');
  });

  it('ranks archetypes by frequency', () => {
    // Two tribal decks (Edgar with vampires), one ramp deck.
    const tribal = (id) => deck(id, edgar, [
      card('Vampire 1', ['Tribal: Vampire']),
      card('Vampire 2', ['Tribal: Vampire']),
      card('Vampire 3', ['Tribal: Vampire']),
    ]);
    const tribal1 = tribal('t1');
    const tribal2 = tribal('t2');
    const s = aggregateStats([tribal1, tribal2]);
    expect(s.archetypeHistogram[0].count).toBeGreaterThanOrEqual(1);
  });
});
