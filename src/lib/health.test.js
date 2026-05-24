import { describe, it, expect } from 'vitest';
import { computeHealth } from './health.js';

const card = (name, tags, overrides = {}) => ({
  count: 1,
  name,
  tags,
  scryfall: { name, type_line: 'Creature', cmc: 3, color_identity: [], oracle_text: '', ...overrides },
});

const basicLand = (name = 'Forest') =>
  card(name, [], { type_line: 'Basic Land — Forest', cmc: 0 });

describe('computeHealth', () => {
  it('returns 0 / empty for a deck with no cards', () => {
    const h = computeHealth({ cards: [], commander: null });
    expect(h.score).toBe(0);
    expect(h.empty).toBe(true);
  });

  it('awards full points for the textbook deck', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 10; i++) cards.push(card(`Ramp ${i}`, ['Ramp']));
    for (let i = 0; i < 10; i++) cards.push(card(`Draw ${i}`, ['Card draw']));
    for (let i = 0; i < 10; i++) cards.push(card(`Removal ${i}`, ['Targeted removal']));
    for (let i = 0; i < 32; i++) cards.push(card(`Filler ${i}`, []));
    const h = computeHealth({ cards, commander: { color_identity: [] } });
    expect(h.score).toBeGreaterThanOrEqual(90);
    expect(h.grade).toBe('A');
  });

  it('docks points for a deck with no ramp or draw', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 62; i++) cards.push(card(`Vanilla ${i}`, []));
    const h = computeHealth({ cards, commander: { color_identity: [] } });
    expect(h.score).toBeLessThan(70);
    expect(h.breakdown.ramp.points).toBe(0);
    expect(h.breakdown.draw.points).toBe(0);
  });

  it('penalises a top-heavy curve', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 62; i++) cards.push(card(`Bomb ${i}`, [], { cmc: 7 }));
    const h = computeHealth({ cards, commander: { color_identity: [] } });
    expect(h.breakdown.curve.points).toBeLessThanOrEqual(5);
  });
});
