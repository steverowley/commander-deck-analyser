import { describe, it, expect } from 'vitest';
import { commanderSlug, recommendationIndex, suggestCuts, topRecommendations } from './edhrec.js';

describe('commanderSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(commanderSlug('Edgar Markov')).toBe('edgar-markov');
  });
  it('strips apostrophes and commas', () => {
    expect(commanderSlug("Atraxa, Praetors' Voice")).toBe('atraxa-praetors-voice');
    expect(commanderSlug("K'rrik, Son of Yawgmoth")).toBe('krrik-son-of-yawgmoth');
  });
  it('replaces ampersand', () => {
    expect(commanderSlug('Will & Rowan')).toBe('will-and-rowan');
  });
  it('strips diacritics', () => {
    expect(commanderSlug('Sliver Queen')).toBe('sliver-queen');
  });
});

describe('recommendationIndex', () => {
  it('returns empty map when payload is null', () => {
    expect(recommendationIndex(null).size).toBe(0);
  });
  it('indexes cards across themes, keeping the best synergy', () => {
    const recs = {
      themes: [
        { header: 'Ramp', cards: [{ name: 'Sol Ring', synergy: 0.1, inclusion: 0.8 }] },
        { header: 'Combo', cards: [{ name: 'Sol Ring', synergy: 0.3, inclusion: 0.8 }] },
      ],
    };
    const idx = recommendationIndex(recs);
    expect(idx.get('sol ring').synergy).toBeCloseTo(0.3);
    expect(idx.get('sol ring').themes).toEqual(expect.arrayContaining(['Ramp', 'Combo']));
  });
});

describe('topRecommendations', () => {
  it('dedupes a card appearing in multiple themes and ranks by synergy', () => {
    const recs = {
      themes: [
        { header: 'A', cards: [
          { name: 'Skullclamp', synergy: 0.2, inclusion: 0.5, label: '' },
          { name: 'Sol Ring',  synergy: 0.05, inclusion: 0.9, label: '' },
        ]},
        { header: 'B', cards: [
          { name: 'Skullclamp', synergy: 0.4, inclusion: 0.5, label: '' },
        ]},
      ],
    };
    const top = topRecommendations(recs, new Set(), 10);
    expect(top[0].name).toBe('Skullclamp');
    expect(top[0].synergy).toBeCloseTo(0.4); // best wins
  });

  it('filters out excluded names', () => {
    const recs = {
      themes: [{ header: 'A', cards: [
        { name: 'Sol Ring', synergy: 0.5, inclusion: 0.9, label: '' },
        { name: 'Bloodghast', synergy: 0.3, inclusion: 0.4, label: '' },
      ]}],
    };
    const top = topRecommendations(recs, new Set(['sol ring']), 10);
    expect(top.find((c) => c.name === 'Sol Ring')).toBeUndefined();
    expect(top.find((c) => c.name === 'Bloodghast')).toBeDefined();
  });
});

describe('suggestCuts', () => {
  const recs = {
    themes: [{
      header: 'Vampires',
      cards: [
        { name: 'Bloodghast', synergy: 0.4, inclusion: 0.6 },
        { name: 'Skullclamp', synergy: 0.05, inclusion: 0.5 },
      ],
    }],
  };

  it('flags a card not present in EDHREC as off-strategy', () => {
    const deck = {
      cards: [{ name: 'Random Bear', tags: ['Creature'], scryfall: { name: 'Random Bear', type_line: 'Creature' } }],
    };
    const cuts = suggestCuts(deck, recs);
    expect(cuts.length).toBe(1);
    expect(cuts[0].reason).toBe('missing-from-edhrec');
  });

  it('flags an untagged card', () => {
    const deck = {
      cards: [{ name: 'Bloodghast', tags: [], scryfall: { name: 'Bloodghast', type_line: 'Creature' } }],
    };
    const cuts = suggestCuts(deck, recs);
    expect(cuts[0].reason).toBe('untagged');
  });

  it('does not flag a tagged in-EDHREC card', () => {
    const deck = {
      cards: [{ name: 'Bloodghast', tags: ['Tribal: Vampire'], scryfall: { name: 'Bloodghast', type_line: 'Creature' } }],
    };
    expect(suggestCuts(deck, recs)).toEqual([]);
  });

  it('ignores basic lands', () => {
    const deck = {
      cards: [{ name: 'Swamp', tags: [], scryfall: { name: 'Swamp', type_line: 'Basic Land — Swamp' } }],
    };
    expect(suggestCuts(deck, recs)).toEqual([]);
  });
});
