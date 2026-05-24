import { describe, it, expect } from 'vitest';
import { assessBracket } from './analyzers.js';

const card = (name, overrides = {}) => ({
  count: 1,
  name,
  scryfall: {
    name,
    cmc: 2,
    type_line: 'Creature — Vampire',
    oracle_text: '',
    color_identity: [],
    ...overrides,
  },
});

const land = (name = 'Forest') =>
  card(name, { type_line: 'Basic Land — Forest', cmc: 0 });

describe('assessBracket', () => {
  it('returns Bracket 2 for a clean, full-size deck with no power tools', () => {
    const cards = [];
    for (let i = 0; i < 60; i++) cards.push(card(`Vanilla Creature ${i}`));
    for (let i = 0; i < 38; i++) cards.push(land(`Forest ${i}`));
    const a = assessBracket({ cards });
    expect(a.bracket).toBe(2);
  });

  it('returns Bracket 1 for a small jank deck with no power tools', () => {
    const cards = [];
    for (let i = 0; i < 50; i++) cards.push(card(`Creature ${i}`));
    const a = assessBracket({ cards });
    expect(a.bracket).toBe(1);
    expect(a.reasons.some((r) => r.toLowerCase().includes('exhibition'))).toBe(true);
  });

  it('returns Bracket 3 when 1-3 Game Changers are present', () => {
    const cards = [card('Rhystic Study'), card('Smothering Tithe')];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const a = assessBracket({ cards });
    expect(a.bracket).toBe(3);
    expect(a.flags.gameChangers.length).toBe(2);
  });

  it('returns Bracket 4 when MLD is present', () => {
    const cards = [card('Armageddon')];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const a = assessBracket({ cards });
    expect(a.bracket).toBeGreaterThanOrEqual(4);
    expect(a.flags.mld).toContain('Armageddon');
  });

  it('returns Bracket 4 when a known 2-card combo is present', () => {
    const cards = [
      card("Thassa's Oracle"),
      card('Demonic Consultation'),
    ];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const a = assessBracket({ cards });
    expect(a.bracket).toBeGreaterThanOrEqual(4);
    expect(a.flags.combos.length).toBeGreaterThan(0);
  });

  it('returns Bracket 5 when cEDH signals stack', () => {
    const cards = [
      // 6 Game Changers
      card("Vampiric Tutor"), card("Demonic Tutor"), card("Mystical Tutor"),
      card("Force of Will"), card("Mana Drain"), card("Rhystic Study"),
      // 3 fast mana
      card("Mana Vault"), card("Chrome Mox"), card("Mox Diamond"),
      // 2 combos
      card("Thassa's Oracle"), card("Demonic Consultation"),
      card("Dockside Extortionist"), card("Temur Sabertooth"),
      // Low curve filler
    ];
    for (let i = 0; i < 50; i++) cards.push(card(`Cheap ${i}`, { cmc: 1 }));
    const a = assessBracket({ cards });
    expect(a.bracket).toBe(5);
  });
});
