import { describe, it, expect } from 'vitest';
import {
  isBasicLand,
  checkColorIdentity,
  checkSingletonViolations,
  checkDeckLegality,
  checkBannedCards,
  previewAdditions,
} from './legality.js';

const card = (name, overrides = {}) => ({
  count: 1,
  name,
  scryfall: {
    name,
    type_line: 'Creature',
    color_identity: [],
    ...overrides,
  },
});

describe('isBasicLand', () => {
  it('recognises the five basics', () => {
    for (const n of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']) {
      expect(isBasicLand({ name: n, type_line: 'Basic Land' })).toBe(true);
    }
  });

  it('recognises Wastes and snow basics', () => {
    expect(isBasicLand({ name: 'Wastes' })).toBe(true);
    expect(isBasicLand({ name: 'Snow-Covered Forest' })).toBe(true);
  });

  it('falls back on the type line for non-listed basics', () => {
    expect(isBasicLand({ name: 'Custom Basic', type_line: 'Basic Land — Forest' })).toBe(true);
  });

  it('rejects non-basics', () => {
    expect(isBasicLand({ name: 'Command Tower', type_line: 'Land' })).toBe(false);
  });
});

describe('checkColorIdentity', () => {
  const edgar = { color_identity: ['W', 'B', 'R'] };
  it('allows in-identity cards', () => {
    const result = checkColorIdentity({ color_identity: ['B'] }, edgar);
    expect(result.ok).toBe(true);
  });

  it('flags off-color cards with the violating pips', () => {
    const result = checkColorIdentity({ color_identity: ['U', 'G'] }, edgar);
    expect(result.ok).toBe(false);
    expect(result.violation).toEqual(['U', 'G']);
  });

  it('passes when no commander is set', () => {
    expect(checkColorIdentity({ color_identity: ['U'] }, null).ok).toBe(true);
  });
});

describe('checkSingletonViolations', () => {
  it('flags non-basic duplicates', () => {
    const deck = {
      cards: [
        card('Sol Ring', { type_line: 'Artifact' }),
        { ...card('Sol Ring', { type_line: 'Artifact' }), count: 2 },
      ],
    };
    const v = checkSingletonViolations(deck);
    expect(v.length).toBe(1);
    expect(v[0].name).toBe('Sol Ring');
  });

  it('ignores basic-land duplicates', () => {
    const deck = {
      cards: [{ ...card('Forest', { type_line: 'Basic Land — Forest' }), count: 10 }],
    };
    expect(checkSingletonViolations(deck)).toEqual([]);
  });
});

describe('checkDeckLegality', () => {
  const edgar = { color_identity: ['W', 'B', 'R'], name: 'Edgar Markov' };

  it('returns no errors for a clean partial deck', () => {
    const r = checkDeckLegality({
      commander: edgar,
      cards: [card('Bloodghast', { color_identity: ['B'] })],
    });
    expect(r.errors).toEqual([]);
  });

  it('flags color-identity violations against the commander', () => {
    const r = checkDeckLegality({
      commander: edgar,
      cards: [card('Counterspell', { color_identity: ['U'] })],
    });
    expect(r.errors.some((e) => e.toLowerCase().includes('color identity'))).toBe(true);
  });

  it('flags oversize decks as a hard error', () => {
    const cards = [];
    for (let i = 0; i < 101; i++) cards.push(card(`Filler ${i}`));
    const r = checkDeckLegality({ commander: null, cards });
    expect(r.errors.some((e) => e.toLowerCase().includes('over the legal'))).toBe(true);
  });
});

describe('checkBannedCards', () => {
  it('flags a card on the Commander banlist', () => {
    const deck = {
      cards: [card('Mana Crypt', { type_line: 'Artifact' })],
      commander: null,
    };
    expect(checkBannedCards(deck)).toContain('Mana Crypt');
  });
  it('flags a banned commander', () => {
    const deck = {
      cards: [],
      commander: { name: 'Lutri, the Spellchaser', color_identity: ['U', 'R'] },
    };
    expect(checkBannedCards(deck)).toContain('Lutri, the Spellchaser');
  });
  it('returns empty for a clean deck', () => {
    expect(checkBannedCards({ cards: [card('Sol Ring')], commander: null })).toEqual([]);
  });
});

describe('previewAdditions', () => {
  const edgar = { color_identity: ['W', 'B', 'R'], name: 'Edgar Markov' };

  it('rejects off-color adds with a reason', () => {
    const result = previewAdditions(
      { commander: edgar, cards: [] },
      [{ name: 'Counterspell', count: 1, scryfall: { name: 'Counterspell', color_identity: ['U'], type_line: 'Instant' } }]
    );
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].reasons[0]).toMatch(/off-color/);
  });

  it('rejects duplicate non-basic adds as singleton violations', () => {
    const result = previewAdditions(
      { commander: edgar, cards: [card('Sol Ring', { color_identity: [] })] },
      [{ name: 'Sol Ring', count: 1, scryfall: { name: 'Sol Ring', type_line: 'Artifact', color_identity: [] } }]
    );
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].reasons).toContain('singleton');
  });

  it('accepts in-identity new cards', () => {
    const result = previewAdditions(
      { commander: edgar, cards: [] },
      [{ name: 'Bloodghast', count: 1, scryfall: { name: 'Bloodghast', color_identity: ['B'], type_line: 'Creature' } }]
    );
    expect(result.accepted.length).toBe(1);
    expect(result.rejected.length).toBe(0);
  });
});
