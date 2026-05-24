import { describe, it, expect } from 'vitest';
import { compareDecks } from './compare.js';

const card = (name, overrides = {}) => ({
  count: 1,
  name,
  tags: [],
  scryfall: { name, type_line: 'Creature', cmc: 2, mana_cost: '{1}{B}', prices: {}, ...overrides },
});

const deck = (name, cardList, commander = null) => ({
  id: name,
  name,
  commander,
  cards: cardList,
});

describe('compareDecks', () => {
  it('identifies shared and unique cards', () => {
    const a = deck('A', [card('Sol Ring'), card('Bloodghast'), card('Skullclamp')]);
    const b = deck('B', [card('Sol Ring'), card('Counterspell')]);
    const cmp = compareDecks(a, b);
    expect(cmp.shared.map((s) => s.name)).toEqual(['Sol Ring']);
    expect(cmp.uniqueA.map((s) => s.name)).toEqual(['Bloodghast', 'Skullclamp']);
    expect(cmp.uniqueB.map((s) => s.name)).toEqual(['Counterspell']);
  });

  it('returns Jaccard-ish overlap percentage', () => {
    // Perfect overlap = 1.0
    const a = deck('A', [card('Sol Ring'), card('Bloodghast')]);
    const b = deck('B', [card('Sol Ring'), card('Bloodghast')]);
    expect(compareDecks(a, b).overlapPct).toBeCloseTo(1);

    // Disjoint = 0
    const c = deck('C', [card('A')]);
    const d = deck('D', [card('B')]);
    expect(compareDecks(c, d).overlapPct).toBe(0);
  });

  it('reports curve histograms for non-land cards', () => {
    const a = deck('A', [
      card('Sol Ring', { cmc: 1 }),
      card('Cultivate', { cmc: 3 }),
      card('Forest', { cmc: 0, type_line: 'Basic Land — Forest' }),
    ]);
    const b = deck('B', []);
    const cmp = compareDecks(a, b);
    expect(cmp.curve.a[1]).toBe(1);
    expect(cmp.curve.a[3]).toBe(1);
    // Land shouldn't count
    expect(cmp.curve.a[0]).toBe(0);
  });

  it('computes price delta', () => {
    const a = deck('A', [card('Pricey', { prices: { usd: '10.00' } })]);
    const b = deck('B', [card('Cheap', { prices: { usd: '1.00' } })]);
    expect(compareDecks(a, b).priceDelta).toBeCloseTo(9);
  });

  it('includes bracket + health snapshots', () => {
    const a = deck('A', [card('Mostly Empty')]);
    const b = deck('B', []);
    const cmp = compareDecks(a, b);
    expect(typeof cmp.bracket.a).toBe('number');
    expect(typeof cmp.health.a.score).toBe('number');
  });
});
