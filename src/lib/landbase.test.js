import { describe, it, expect } from 'vitest';
import {
  analyzeLandBase,
  pipDistribution,
  analyzeColorSources,
  requiredSourcesFor,
  spellPipsByColor,
  producesColor,
  actualSourcesByColor,
  KARSTEN_TABLE,
} from './landbase.js';

const card = (name, manaCost, overrides = {}) => ({
  count: 1,
  name,
  tags: [],
  scryfall: {
    name,
    type_line: 'Creature',
    mana_cost: manaCost,
    cmc: (manaCost.match(/\{/g) || []).length,
    ...overrides,
  },
});

const basic = (name) => ({
  count: 1,
  name,
  tags: [],
  scryfall: { name, type_line: `Basic Land — ${name}`, mana_cost: '', cmc: 0 },
});

describe('pipDistribution', () => {
  it('counts pure-colour pips', () => {
    const deck = { cards: [card('Vamp', '{1}{B}{B}'), card('Wrath', '{2}{W}{W}')] };
    const pips = pipDistribution(deck);
    expect(pips.W).toBe(2);
    expect(pips.B).toBe(2);
    expect(pips.R).toBe(0);
    expect(pips.total).toBe(4);
  });

  it('counts hybrid pips as both colours', () => {
    // {W/U} resolves to one W AND one U match because the regex runs per symbol.
    const deck = { cards: [card('Knight', '{W/U}')] };
    const pips = pipDistribution(deck);
    expect(pips.W).toBe(1);
    expect(pips.U).toBe(1);
  });

  it('honours card count', () => {
    const c = card('Bloodghast', '{B}');
    c.count = 4;
    const pips = pipDistribution({ cards: [c] });
    expect(pips.B).toBe(4);
  });
});

describe('analyzeLandBase', () => {
  const cmdrBR = { color_identity: ['B', 'R'], name: 'Tymna+Tana' };
  const cmdrEdgar = { color_identity: ['W', 'B', 'R'], name: 'Edgar Markov' };

  it('returns recommended basics in same ratio as pips', () => {
    const cards = [
      card('Spell B', '{B}{B}{B}{B}'),
      card('Spell R', '{R}'),
    ];
    const a = analyzeLandBase({ cards, commander: cmdrBR });
    expect(a.recommendedBasics.Swamp).toBeGreaterThan(a.recommendedBasics.Mountain);
  });

  it('falls back to even split if no pips computed yet', () => {
    const a = analyzeLandBase({ cards: [], commander: cmdrEdgar });
    // 3-color reserves 10 utility, 27 basics, evenly split = 9 each.
    const total = a.recommendedBasics.Plains + a.recommendedBasics.Swamp + a.recommendedBasics.Mountain;
    expect(total).toBeGreaterThanOrEqual(26);
    expect(total).toBeLessThanOrEqual(28);
  });

  it('reports current land totals correctly', () => {
    const cards = [basic('Swamp'), basic('Swamp'), basic('Mountain'), card('Spell', '{B}')];
    const a = analyzeLandBase({ cards, commander: cmdrBR });
    expect(a.currentLands).toBe(3);
    expect(a.currentBasics).toBe(3);
  });

  it('flags off-identity basics in the diff', () => {
    const cards = [basic('Plains'), card('Spell', '{B}{R}')];
    const a = analyzeLandBase({ cards, commander: cmdrBR });
    const offColor = a.diff.find((d) => d.name === 'Plains');
    expect(offColor).toBeDefined();
    expect(offColor.recommended).toBe(0);
    expect(offColor.delta).toBe(-1);
  });

  it('shortlists utility lands including Command Tower for any multi-colour deck', () => {
    const a = analyzeLandBase({ cards: [], commander: cmdrEdgar });
    expect(a.utilityLands.map((u) => u.name)).toContain('Command Tower');
  });

  it('shortlists Mardu triome for Edgar Markov', () => {
    const a = analyzeLandBase({ cards: [], commander: cmdrEdgar });
    const names = a.utilityLands.map((u) => u.name);
    expect(names).toContain('Savai Triome');
  });

  it('reduces recommended basics by the nonbasic count the user already runs', () => {
    // Mono-red deck, 37-land target, 20 nonbasic lands, 17 Mountains.
    // The recommendation should be ~17 Mountains, NOT 35 (it was 35
    // previously because the advisor ignored existing nonbasics).
    const cmdrMonoR = { color_identity: ['R'], name: 'Krenko' };
    const land = (name) => ({
      count: 1,
      name,
      tags: [],
      scryfall: { name, type_line: 'Land', mana_cost: '', cmc: 0 },
    });
    const mountain = () => ({
      count: 1,
      name: 'Mountain',
      tags: [],
      scryfall: { name: 'Mountain', type_line: 'Basic Land — Mountain', mana_cost: '', cmc: 0 },
    });
    const cards = [];
    for (let i = 0; i < 20; i++) cards.push(land(`Utility Land ${i}`));
    for (let i = 0; i < 17; i++) cards.push(mountain());
    // Add a few non-land spells so the curve has data
    for (let i = 0; i < 30; i++) cards.push(card(`Spell ${i}`, '{1}{R}'));
    cards[cards.length - 1].scryfall.cmc = 2;

    const a = analyzeLandBase({ cards, commander: cmdrMonoR });
    expect(a.currentNonbasicLands).toBe(20);
    expect(a.currentBasics).toBe(17);
    // basicSlots = target - max(currentNonbasic, utilityReserve)
    // For mono-R target is ~33, currentNonbasic 20, utility 2 → basicSlots ≈ 13
    expect(a.recommendedBasics.Mountain).toBeLessThanOrEqual(20);
    // And nowhere near the old broken 35
    expect(a.recommendedBasics.Mountain).toBeLessThan(35);
  });
});

// ─── Color-source hypergeometric (Karsten) tests ────────────────────────

const dualLand = (name, subtypes) => ({
  count: 1,
  name,
  tags: [],
  scryfall: { name, type_line: `Land — ${subtypes.join(' ')}`, mana_cost: '', cmc: 0, oracle_text: '' },
});

describe('requiredSourcesFor (Karsten lookup)', () => {
  it('returns 18 for a CMC-3 spell with 2 colored pips (Teferi territory)', () => {
    expect(requiredSourcesFor(3, 2)).toBe(18);
  });
  it('returns 23 for a CMC-3 spell with 3 pips', () => {
    expect(requiredSourcesFor(3, 3)).toBe(23);
  });
  it('returns 14 for a 1-CMC 1-pip', () => {
    expect(requiredSourcesFor(1, 1)).toBe(14);
  });
  it('clamps high CMC to row 7', () => {
    expect(requiredSourcesFor(12, 2)).toBe(KARSTEN_TABLE[7][2]);
  });
  it('clamps pip count to 3', () => {
    expect(requiredSourcesFor(5, 5)).toBe(KARSTEN_TABLE[5][3]);
  });
  it('returns 0 when pips is 0 or non-finite', () => {
    expect(requiredSourcesFor(3, 0)).toBe(0);
    expect(requiredSourcesFor(NaN, 2)).toBe(0);
  });
});

describe('spellPipsByColor', () => {
  it('counts pure-colored pips', () => {
    expect(spellPipsByColor({ mana_cost: '{2}{U}{U}' })).toEqual({ W: 0, U: 2, B: 0, R: 0, G: 0 });
  });
  it('counts hybrid as both colors', () => {
    expect(spellPipsByColor({ mana_cost: '{W/U}{W/U}' })).toEqual({ W: 2, U: 2, B: 0, R: 0, G: 0 });
  });
  it('returns zeros for colorless / empty', () => {
    expect(spellPipsByColor({ mana_cost: '{4}' })).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0 });
    expect(spellPipsByColor({})).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0 });
  });
});

describe('producesColor', () => {
  it('counts basic lands by subtype', () => {
    expect(producesColor({ type_line: 'Basic Land — Island', oracle_text: '' }, 'U')).toBe(true);
    expect(producesColor({ type_line: 'Basic Land — Island', oracle_text: '' }, 'R')).toBe(false);
  });
  it('counts dual lands by every basic subtype', () => {
    const tundra = { type_line: 'Land — Plains Island', oracle_text: '' };
    expect(producesColor(tundra, 'W')).toBe(true);
    expect(producesColor(tundra, 'U')).toBe(true);
  });
  it('counts mana rocks with explicit Add {X}', () => {
    expect(producesColor({ type_line: 'Artifact', oracle_text: '{1}, {T}: Add {U}.' }, 'U')).toBe(true);
  });
  it('counts any-color rocks for every color', () => {
    const lantern = { type_line: 'Artifact', oracle_text: 'Lands you control have "{T}: Add one mana of any color".' };
    for (const c of ['W', 'U', 'B', 'R', 'G']) expect(producesColor(lantern, c)).toBe(true);
  });
  it('counts fetch lands as sources for the fetched basic colors', () => {
    const polluted = { type_line: 'Land', oracle_text: '{T}, Pay 1 life, Sacrifice this: Search your library for an Island or Swamp card.' };
    expect(producesColor(polluted, 'U')).toBe(true);
    expect(producesColor(polluted, 'B')).toBe(true);
    expect(producesColor(polluted, 'R')).toBe(false);
  });
});

describe('actualSourcesByColor', () => {
  it('counts every blue source across basics + duals + rocks', () => {
    const deck = {
      cards: [
        { ...basic('Island'), count: 10 },
        dualLand('Tundra', ['Plains', 'Island']),
        { count: 1, name: 'Sky Diamond', tags: [], scryfall: { name: 'Sky Diamond', type_line: 'Artifact', oracle_text: '{T}: Add {U}.', mana_cost: '{2}', cmc: 2 } },
      ],
      commander: null,
    };
    const out = actualSourcesByColor(deck);
    expect(out.U).toBe(12); // 10 islands + 1 tundra + 1 rock
    expect(out.W).toBe(1);   // tundra only
  });
});

describe('analyzeColorSources', () => {
  // Build the canonical Teferi case from the acceptance test.
  const teferi = {
    count: 1, name: 'Teferi, Hero of Dominaria', tags: [],
    scryfall: { name: 'Teferi, Hero of Dominaria', type_line: 'Legendary Planeswalker', mana_cost: '{3}{W}{U}', cmc: 5, oracle_text: '' },
  };
  // Demonstrative deck for the WW @ CMC 3 example the issue calls out.
  const ww3 = {
    count: 1, name: 'Spell with WW at CMC 3', tags: [],
    scryfall: { name: 'Spell with WW at CMC 3', type_line: 'Sorcery', mana_cost: '{1}{W}{W}', cmc: 3, oracle_text: '' },
  };

  it('flags a deficit when blue sources < Karsten requirement', () => {
    const cards = [teferi];
    // 24 islands → 24 U sources, no other blue producers.
    for (let i = 0; i < 24; i++) cards.push({ ...basic('Island') });
    const out = analyzeColorSources({ cards, commander: null });
    const u = out.find((r) => r.color === 'U');
    expect(u).toBeTruthy();
    // Teferi is {3}{W}{U} — 1 blue pip at CMC 5 → 11 sources required.
    expect(u.requiredSources).toBe(11);
    expect(u.actualSources).toBe(24);
    expect(u.deficit).toBe(0);
  });

  it("shows green when sources meet target (Teferi 3WU + 30 sources of each)", () => {
    // Add 30 of each producer to confirm zero deficit even at higher pip counts.
    const cards = [teferi];
    for (let i = 0; i < 30; i++) cards.push({ ...basic('Island') });
    for (let i = 0; i < 30; i++) cards.push({ ...basic('Plains') });
    const out = analyzeColorSources({ cards, commander: null });
    expect(out.every((r) => r.deficit === 0)).toBe(true);
  });

  it('reports a deficit when WW@3 has only 14 white sources (need 18)', () => {
    const cards = [ww3];
    for (let i = 0; i < 14; i++) cards.push({ ...basic('Plains') });
    const out = analyzeColorSources({ cards, commander: null });
    const w = out.find((r) => r.color === 'W');
    expect(w.requiredSources).toBe(18); // CMC 3, 2 pips
    expect(w.actualSources).toBe(14);
    expect(w.deficit).toBe(4);
    expect(w.exampleSpells[0].name).toBe('Spell with WW at CMC 3');
  });

  it('aggregates the highest requirement per color (worst spell wins)', () => {
    const cards = [
      { ...teferi },                  // WU at 5 → U=11
      { ...ww3 },                     // WW at 3 → W=18
      // A 4-CMC double-blue spell so U requirement jumps to 16
      { count: 1, name: 'Deep Analysis', tags: [], scryfall: { name: 'Deep Analysis', type_line: 'Sorcery', mana_cost: '{3}{U}{U}', cmc: 5, oracle_text: '' } },
    ];
    for (let i = 0; i < 30; i++) cards.push({ ...basic('Island') });
    for (let i = 0; i < 30; i++) cards.push({ ...basic('Plains') });
    const out = analyzeColorSources({ cards, commander: null });
    const u = out.find((r) => r.color === 'U');
    expect(u.requiredSources).toBe(15); // CMC 5, 2 pips
  });

  it('skips colors the deck never asks for', () => {
    const cards = [ww3]; // pure W
    for (let i = 0; i < 14; i++) cards.push({ ...basic('Plains') });
    const out = analyzeColorSources({ cards, commander: null });
    expect(out.find((r) => r.color === 'U')).toBeUndefined();
    expect(out.find((r) => r.color === 'B')).toBeUndefined();
  });
});
