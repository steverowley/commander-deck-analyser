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

  it('does NOT push to Bracket 4 for 5 tutors alone (Oct 2025 rule change)', () => {
    // WotC removed the tutor cap from Brackets 1-3 in their Oct 21, 2025
    // bracket update — the Game Changers list now catches the worst
    // tutors directly. A casual deck with 5 modest tutors (e.g. Idyllic
    // Tutor, Heliod's Pilgrim, Steelshaper's Gift) should sit at Bracket 2.
    const cards = [
      card('Idyllic Tutor', { oracle_text: 'Search your library for an enchantment card.' }),
      card('Heliod\'s Pilgrim', { oracle_text: 'When this enters, you may search your library for an Aura card.' }),
      card('Steelshaper\'s Gift', { oracle_text: 'Search your library for an Equipment card.' }),
      card('Open the Armory', { oracle_text: 'Search your library for an Aura or Equipment card.' }),
      card('Stoneforge Mystic', { oracle_text: 'When this enters, you may search your library for an Equipment card.' }),
    ];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const a = assessBracket({ cards });
    expect(a.flags.tutors.length).toBe(5);
    expect(a.bracket).toBe(2);
  });

  it('flags Farewell as a Game Changer (Feb 2026 addition)', () => {
    const cards = [card('Farewell')];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const a = assessBracket({ cards });
    expect(a.flags.gameChangers.map((s) => s.toLowerCase())).toContain('farewell');
    expect(a.bracket).toBeGreaterThanOrEqual(3);
  });

  it('does NOT flag Winota/Urza/Yuriko as Game Changers (Oct 2025 removals)', () => {
    const cards = [
      card('Winota, Joiner of Forces'),
      card('Urza, Lord High Artificer'),
      card('Yuriko, the Tiger\'s Shadow'),
      card('Kinnan, Bonder Prodigy'),
      card('Expropriate'),
    ];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const a = assessBracket({ cards });
    expect(a.flags.gameChangers.length).toBe(0);
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
