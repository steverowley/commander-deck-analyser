/**
 * Stress tests — exercise the pure-function library at scale to catch
 * accidental O(n^2) regressions and surface NaN / Infinity bugs that
 * only show on edge-case input distributions.
 *
 * Budgets are deliberately loose so they don't flap on slow CI hosts;
 * they catch order-of-magnitude regressions, not microsecond drift.
 */
import { describe, it, expect } from 'vitest';
import { simulateOpeners, simulatePlayout, simulateMulliganTree } from './goldfish.js';
import { computeHealth } from './health.js';
import { assessBracket } from './analyzers.js';
import { addCardsToDeck } from './deckops.js';
import { analyzeLandBase, pipDistribution } from './landbase.js';
import { compareDecks } from './compare.js';

function makeCard(name, type = 'Creature', cmc = 3, tags = []) {
  return {
    count: 1, name, tags,
    scryfall: { name, type_line: type, cmc, oracle_text: '', mana_cost: '{2}{B}', color_identity: ['B'], prices: { usd: '1.00' } },
  };
}

function makeDeck(size) {
  const cards = [];
  for (let i = 0; i < size; i++) cards.push(makeCard(`Card ${i}`));
  return {
    id: 'big',
    name: 'Big Deck',
    commander: { name: 'Edgar Markov', color_identity: ['W', 'B', 'R'] },
    cards,
  };
}

describe('stress / scale', () => {
  it('simulateOpeners(99-card deck, 5000 samples) completes under 1s', () => {
    const deck = makeDeck(99);
    const t = Date.now();
    const sim = simulateOpeners(deck, 5000);
    const dur = Date.now() - t;
    expect(sim.samples).toBe(5000);
    expect(dur).toBeLessThan(1000);
  });

  it('simulateMulliganTree(99-card deck, 2000 samples) completes under 1s', () => {
    const deck = makeDeck(99);
    const t = Date.now();
    const tree = simulateMulliganTree(deck, 2000);
    const dur = Date.now() - t;
    expect(tree.samples).toBe(2000);
    expect(dur).toBeLessThan(1000);
  });

  it('simulatePlayout(99-card deck, 12 turns) completes under 50ms', () => {
    const deck = makeDeck(99);
    const t = Date.now();
    const log = simulatePlayout(deck, 12);
    const dur = Date.now() - t;
    expect(log).toHaveLength(12);
    expect(dur).toBeLessThan(50);
  });

  it('computeHealth on a 99-card deck completes under 20ms', () => {
    const deck = makeDeck(99);
    const t = Date.now();
    computeHealth(deck);
    expect(Date.now() - t).toBeLessThan(20);
  });

  it('assessBracket on a 99-card deck completes under 20ms', () => {
    const deck = makeDeck(99);
    const t = Date.now();
    assessBracket(deck);
    expect(Date.now() - t).toBeLessThan(20);
  });

  it('addCardsToDeck merging 500 cards completes under 200ms', () => {
    let deck = makeDeck(0);
    const incoming = [];
    for (let i = 0; i < 500; i++) incoming.push(makeCard(`Incoming ${i}`));
    const t = Date.now();
    deck = addCardsToDeck(deck, incoming);
    expect(deck.cards.length).toBe(500);
    expect(Date.now() - t).toBeLessThan(200);
  });

  it('compareDecks on two 99-card decks completes under 50ms', () => {
    const a = makeDeck(99);
    const b = makeDeck(99);
    // Swap half so there's real diff work to do.
    for (let i = 0; i < 50; i++) b.cards[i] = makeCard(`Different ${i}`);
    const t = Date.now();
    compareDecks(a, b);
    expect(Date.now() - t).toBeLessThan(50);
  });
});

describe('edge-case inputs', () => {
  it('pipDistribution on a deck with no mana costs returns total 0', () => {
    const deck = { cards: [makeCard('Token', 'Land', 0)] };
    deck.cards[0].scryfall.mana_cost = '';
    const p = pipDistribution(deck);
    expect(p.total).toBe(0);
  });

  it('analyzeLandBase with no commander returns colorless basics empty', () => {
    const a = analyzeLandBase({ cards: [], commander: null });
    expect(a.colorCount).toBe(0);
    expect(Object.keys(a.recommendedBasics).length).toBe(0);
  });

  it('analyzeLandBase with all 5 colors equally distributed has no NaN', () => {
    const cards = ['W', 'U', 'B', 'R', 'G'].map((c) => makeCard(`Spell ${c}`, 'Spell', 3));
    cards.forEach((card, i) => {
      card.scryfall.mana_cost = `{${['W','U','B','R','G'][i]}}`;
    });
    const a = analyzeLandBase({ cards, commander: { color_identity: ['W','U','B','R','G'] } });
    for (const v of Object.values(a.recommendedBasics)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('computeHealth on a deck of only lands does not divide by zero', () => {
    const cards = [];
    for (let i = 0; i < 60; i++) {
      cards.push(makeCard(`Forest ${i}`, 'Basic Land — Forest', 0));
    }
    const h = computeHealth({ cards, commander: { color_identity: ['G'] } });
    expect(Number.isFinite(h.score)).toBe(true);
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.score).toBeLessThanOrEqual(100);
  });

  it('assessBracket on an empty cards array does not crash', () => {
    const a = assessBracket({ cards: [], commander: null });
    expect(typeof a.bracket).toBe('number');
    expect(a.bracket).toBeGreaterThanOrEqual(1);
    expect(a.bracket).toBeLessThanOrEqual(5);
  });
});
