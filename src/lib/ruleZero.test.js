import { describe, it, expect } from 'vitest';
import { buildRuleZeroCard, asMarkdown, winConditions, flagsLine } from './ruleZero.js';

function card(name, overrides = {}) {
  return {
    count: 1,
    name,
    tags: overrides.tags || [],
    scryfall: {
      name,
      cmc: overrides.cmc ?? 2,
      type_line: overrides.type_line || 'Creature',
      oracle_text: overrides.oracle_text || '',
      color_identity: overrides.color_identity || [],
      ...overrides.scryfall,
    },
  };
}

const land = (name = 'Forest') => card(name, { type_line: 'Basic Land — Forest', cmc: 0 });

function fullDeck(cards = [], commander = null) {
  return { name: 'Test', cards, commander };
}

describe('buildRuleZeroCard', () => {
  it('produces bracket, archetype, deck size, and flags from a clean deck', () => {
    const cards = [];
    for (let i = 0; i < 60; i++) cards.push(card(`Vanilla Creature ${i}`));
    for (let i = 0; i < 38; i++) cards.push(land(`Forest ${i}`));
    const card_ = buildRuleZeroCard(fullDeck(cards));
    expect(card_.bracket).toBe(2);
    expect(card_.deckSize).toBe(98);
    expect(card_.flags.combos).toBe(0);
    expect(card_.flags.gameChangers).toBe(0);
  });

  it('detects Thassa\'s Oracle + Demonic Consultation as a combo win', () => {
    const cards = [card("Thassa's Oracle"), card('Demonic Consultation')];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const c = buildRuleZeroCard(fullDeck(cards));
    expect(c.flags.combos).toBeGreaterThan(0);
    expect(c.winCons.some((w) => /Thassa's Oracle/.test(w))).toBe(true);
    expect(c.bracket).toBeGreaterThanOrEqual(4);
  });

  it('flags an alt-win card (Approach of the Second Sun)', () => {
    const cards = [card('Approach of the Second Sun')];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const c = buildRuleZeroCard(fullDeck(cards));
    expect(c.winCons.some((w) => /Alt-win card: Approach of the Second Sun/.test(w))).toBe(true);
  });

  it('flags commander damage when the commander has power ≥ 5 + evasion', () => {
    const commander = card('Skithiryx, the Blight Dragon', {
      oracle_text: 'Flying, swampwalk, infect.',
      scryfall: { power: '4', toughness: '4' },
    }).scryfall;
    // bump power to 6
    commander.power = '6';
    const cards = [];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const c = buildRuleZeroCard(fullDeck(cards, commander));
    expect(c.winCons.some((w) => /Commander damage/.test(w))).toBe(true);
  });

  it('counts stax pieces from the tag list', () => {
    const cards = [
      card('Smokestack',     { tags: ['Stax piece'] }),
      card('Winter Orb',     { tags: ['Stax piece'] }),
    ];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const c = buildRuleZeroCard(fullDeck(cards));
    expect(c.flags.stax).toBe(2);
  });

  it('carries the commander color identity into the card', () => {
    const commander = card('Edgar Markov', { color_identity: ['W', 'B', 'R'] }).scryfall;
    const c = buildRuleZeroCard(fullDeck([], commander));
    expect(c.colors).toBe('WBR');
  });

  it('handles a null deck gracefully', () => {
    expect(buildRuleZeroCard(null)).toBeNull();
  });

  it('falls back to a sensible win-cons message when nothing else applies', () => {
    const cards = [];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const c = buildRuleZeroCard(fullDeck(cards));
    expect(c.winCons.length).toBeGreaterThan(0);
  });
});

describe('asMarkdown', () => {
  it('renders the Rule Zero card as Discord-friendly markdown', () => {
    const cards = [card("Thassa's Oracle"), card('Demonic Consultation')];
    for (let i = 0; i < 60; i++) cards.push(card(`Filler ${i}`));
    const md = asMarkdown(buildRuleZeroCard(fullDeck(cards, card('Inalla, Archmage Ritualist', { color_identity: ['U', 'B', 'R'] }).scryfall)));
    expect(md).toMatch(/## Test/);
    expect(md).toMatch(/\*\*Commander:\*\*/);
    expect(md).toMatch(/\*\*Bracket:\*\* \d+/);
    expect(md).toMatch(/\*\*Win conditions:\*\*/);
    expect(md).toMatch(/Thassa's Oracle/);
    expect(md).toMatch(/Vault — flags are auto-derived/);
  });

  it('returns an empty string when given a null card', () => {
    expect(asMarkdown(null)).toBe('');
  });
});

describe('flagsLine', () => {
  it('formats a compact flag summary', () => {
    expect(flagsLine({ tutors: 4, mld: 1, extraTurns: 0, fastMana: 2, combos: 1, gameChangers: 3, stax: 0 }))
      .toBe('1 combo · 3 GC · 1 MLD · 2 fast mana · 4 tutors');
  });
  it('says "none flagged" when nothing trips', () => {
    expect(flagsLine({ tutors: 0, mld: 0, extraTurns: 0, fastMana: 0, combos: 0, gameChangers: 0, stax: 0 }))
      .toBe('none flagged');
  });
});

describe('winConditions', () => {
  it('returns combo + alt-win + commander damage in priority order', () => {
    const deck = {
      cards: [
        card("Thassa's Oracle"),
        card('Demonic Consultation'),
        card("Maze's End"),
      ],
      commander: {
        name: 'Rakdos, the Showstopper',
        oracle_text: 'Flying, trample.',
        power: '6',
        toughness: '6',
      },
    };
    const combos = { assembled: [{ cards: ["Thassa's Oracle", 'Demonic Consultation'], results: ['Win the game'] }] };
    const out = winConditions(deck, { combos });
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out[0]).toMatch(/Win the game/);
    expect(out.some((w) => /Maze's End/.test(w))).toBe(true);
    expect(out.some((w) => /Commander damage/.test(w))).toBe(true);
  });
});
