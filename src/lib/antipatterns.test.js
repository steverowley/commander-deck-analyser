import { describe, it, expect } from 'vitest';
import {
  checkUnderland,
  checkCurveRampImbalance,
  checkOverTutoring,
  runAntipatternChecks,
} from './antipatterns.js';

const spell = (name, tags, overrides = {}) => ({
  count: 1,
  name,
  tags,
  scryfall: {
    name,
    type_line: 'Creature',
    cmc: 3,
    color_identity: [],
    oracle_text: '',
    ...overrides,
  },
});

const basicLand = (name = 'Forest') =>
  spell(name, [], { type_line: 'Basic Land — Forest', cmc: 0 });

describe('checkUnderland', () => {
  it('warns when a 3-color, 3.5-CMC deck has only 32 lands', () => {
    // Karsten formula: 28 + 2*3 + 3.5 - 1 = 36.5 → target 37
    const cards = [];
    for (let i = 0; i < 32; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 67; i++) cards.push(spell(`Spell ${i}`, [], { cmc: 4 }));
    const deck = { cards, commander: { color_identity: ['W', 'U', 'B'] } };
    const w = checkUnderland(deck);
    expect(w).not.toBeNull();
    expect(w.id).toBe('underland');
    expect(w.severity).toBe('major'); // gap >= 3
    expect(w.formula).toMatch(/28 \+ 2×3/);
  });

  it('does not warn when lands match Karsten target', () => {
    const cards = [];
    for (let i = 0; i < 38; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 61; i++) cards.push(spell(`Spell ${i}`, [], { cmc: 3 }));
    const deck = { cards, commander: { color_identity: ['W', 'U', 'B'] } };
    expect(checkUnderland(deck)).toBeNull();
  });

  it('does not warn for a low-curve aggro deck running 32 lands', () => {
    // Aggro: avg MV 1.8, mono color → Karsten target ≈ 28 + 2 + 1.8 - 1 ≈ 31
    // 32 lands clears the floor.
    const cards = [];
    for (let i = 0; i < 32; i++) cards.push(basicLand(`Mountain ${i}`));
    for (let i = 0; i < 67; i++) cards.push(spell(`Cheap ${i}`, [], { cmc: 2 }));
    const deck = { cards, commander: { color_identity: ['R'] } };
    expect(checkUnderland(deck)).toBeNull();
  });

  it('returns null for an empty/land-only deck', () => {
    expect(checkUnderland({ cards: [] })).toBeNull();
  });
});

describe('checkCurveRampImbalance', () => {
  it('warns when avg MV is 4.0 with only 8 ramp', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 8; i++) cards.push(spell(`Ramp ${i}`, ['Ramp']));
    for (let i = 0; i < 54; i++) cards.push(spell(`Bomb ${i}`, [], { cmc: 5 }));
    const deck = { cards, commander: { color_identity: ['G'] } };
    const w = checkCurveRampImbalance(deck);
    expect(w).not.toBeNull();
    expect(w.id).toBe('curve-ramp-imbalance');
  });

  it('does not warn when ramp compensates the curve', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 12; i++) cards.push(spell(`Ramp ${i}`, ['Ramp']));
    for (let i = 0; i < 50; i++) cards.push(spell(`Bomb ${i}`, [], { cmc: 5 }));
    const deck = { cards, commander: { color_identity: ['G'] } };
    expect(checkCurveRampImbalance(deck)).toBeNull();
  });

  it('does not warn for a normal-curve deck regardless of ramp count', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 5; i++) cards.push(spell(`Ramp ${i}`, ['Ramp']));
    for (let i = 0; i < 57; i++) cards.push(spell(`Mid ${i}`, [], { cmc: 3 }));
    const deck = { cards, commander: { color_identity: ['G'] } };
    expect(checkCurveRampImbalance(deck)).toBeNull();
  });
});

describe('checkOverTutoring', () => {
  it('warns when 6 tutors but only 2 wincons', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 6; i++) cards.push(spell(`Tutor ${i}`, ['Tutor']));
    for (let i = 0; i < 2; i++) cards.push(spell(`Wincon ${i}`, ['Win condition']));
    for (let i = 0; i < 54; i++) cards.push(spell(`Filler ${i}`, []));
    const w = checkOverTutoring({ cards, commander: { color_identity: [] } });
    expect(w).not.toBeNull();
    expect(w.id).toBe('over-tutoring');
    expect(w.title).toMatch(/6 tutors/);
  });

  it('does not warn when tutor count matches the wincon supply', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 6; i++) cards.push(spell(`Tutor ${i}`, ['Tutor']));
    for (let i = 0; i < 5; i++) cards.push(spell(`Wincon ${i}`, ['Win condition']));
    for (let i = 0; i < 51; i++) cards.push(spell(`Filler ${i}`, []));
    expect(checkOverTutoring({ cards })).toBeNull();
  });

  it('returns null for a deck with no tutors', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 62; i++) cards.push(spell(`Filler ${i}`, []));
    expect(checkOverTutoring({ cards })).toBeNull();
  });

  it('escalates severity to major at gap >= 5', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 7; i++) cards.push(spell(`Tutor ${i}`, ['Tutor']));
    for (let i = 0; i < 1; i++) cards.push(spell(`Wincon ${i}`, ['Win condition']));
    for (let i = 0; i < 54; i++) cards.push(spell(`Filler ${i}`, []));
    const w = checkOverTutoring({ cards });
    expect(w.severity).toBe('major');
  });
});

describe('runAntipatternChecks', () => {
  it('sorts warnings by severity (major before warn before info)', () => {
    // Build a deck that triggers BOTH checks: underland (major) +
    // curve-ramp imbalance (warn). Severity-sort puts underland first.
    const cards = [];
    for (let i = 0; i < 30; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 5; i++) cards.push(spell(`Ramp ${i}`, ['Ramp']));
    for (let i = 0; i < 64; i++) cards.push(spell(`Bomb ${i}`, [], { cmc: 5 }));
    const deck = { cards, commander: { color_identity: ['W', 'U', 'B'] } };
    const ws = runAntipatternChecks(deck);
    expect(ws.length).toBe(2);
    expect(ws[0].severity).toBe('major');
    expect(ws[0].id).toBe('underland');
  });

  it('returns empty for a healthy deck', () => {
    const cards = [];
    for (let i = 0; i < 37; i++) cards.push(basicLand(`Forest ${i}`));
    for (let i = 0; i < 10; i++) cards.push(spell(`Ramp ${i}`, ['Ramp']));
    for (let i = 0; i < 52; i++) cards.push(spell(`Filler ${i}`, [], { cmc: 3 }));
    const deck = { cards, commander: { color_identity: ['G'] } };
    expect(runAntipatternChecks(deck)).toEqual([]);
  });

  it('returns empty for a deckless input', () => {
    expect(runAntipatternChecks(null)).toEqual([]);
    expect(runAntipatternChecks({ cards: [] })).toEqual([]);
  });
});
