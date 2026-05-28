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

  it('awards full points for the textbook deck (Command Zone Ep. 658 template)', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 10; i++) cards.push(card(`Ramp ${i}`, ['Ramp']));
    for (let i = 0; i < 10; i++) cards.push(card(`Draw ${i}`, ['Card draw']));
    for (let i = 0; i < 10; i++) cards.push(card(`Spot Removal ${i}`, ['Targeted removal']));
    for (let i = 0; i < 3; i++) cards.push(card(`Wipe ${i}`, ['Board wipe']));
    for (let i = 0; i < 29; i++) cards.push(card(`Filler ${i}`, []));
    const h = computeHealth({ cards, commander: { color_identity: [] } });
    expect(h.score).toBeGreaterThanOrEqual(95);
    expect(h.grade).toBe('A');
    expect(h.breakdown.targetedRemoval.points).toBe(10);
    expect(h.breakdown.boardWipes.points).toBe(5);
  });

  it('scores wipes separately — 9 wipes / 0 spot removal does not earn full points', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 10; i++) cards.push(card(`Ramp ${i}`, ['Ramp']));
    for (let i = 0; i < 10; i++) cards.push(card(`Draw ${i}`, ['Card draw']));
    for (let i = 0; i < 9; i++) cards.push(card(`Wipe ${i}`, ['Board wipe']));
    for (let i = 0; i < 33; i++) cards.push(card(`Filler ${i}`, []));
    const h = computeHealth({ cards, commander: { color_identity: [] } });
    expect(h.breakdown.boardWipes.points).toBe(5);
    expect(h.breakdown.targetedRemoval.points).toBe(0);
    // Confirms the split caught what the old combined-removal score
    // would have missed: lots of wipes can't substitute for spot removal.
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

  it('flags a deck with thin draw as below the 10-12 target', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 8; i++) cards.push(card(`Draw ${i}`, ['Card draw']));
    for (let i = 0; i < 54; i++) cards.push(card(`Filler ${i}`, []));
    const h = computeHealth({ cards, commander: { color_identity: [] } });
    expect(h.breakdown.draw.note).toMatch(/10-12/);
    // 8 draw → partial (10 points), not full (15)
    expect(h.breakdown.draw.points).toBe(10);
  });

  it('penalises a top-heavy curve', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 62; i++) cards.push(card(`Bomb ${i}`, [], { cmc: 7 }));
    const h = computeHealth({ cards, commander: { color_identity: [] } });
    expect(h.breakdown.curve.points).toBeLessThanOrEqual(5);
  });
});
