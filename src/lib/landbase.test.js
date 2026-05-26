import { describe, it, expect } from 'vitest';
import { analyzeLandBase, pipDistribution } from './landbase.js';

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
