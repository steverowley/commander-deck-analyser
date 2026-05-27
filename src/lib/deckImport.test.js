import { describe, it, expect, vi } from 'vitest';
import {
  parseTextDecklist,
  parseMoxfieldUrl,
  parseArchidektUrl,
  detectDeckUrl,
  shapeMoxfieldDeck,
  shapeArchidektDeck,
  fetchDeckFromUrl,
} from './deckImport.js';

describe('parseTextDecklist', () => {
  it('parses "1 Card", "1x Card", and bare names', () => {
    const out = parseTextDecklist(['1 Sol Ring', '2x Forest', 'Lightning Bolt'].join('\n'));
    expect(out).toEqual([
      { name: 'Sol Ring', count: 1, section: 'mainboard' },
      { name: 'Forest', count: 2, section: 'mainboard' },
      { name: 'Lightning Bolt', count: 1, section: 'mainboard' },
    ]);
  });

  it('honours Commander / Deck section headers', () => {
    const text = [
      'Commander',
      '1 Edgar Markov',
      '',
      'Deck',
      '1 Sol Ring',
      '1 Arcane Signet',
    ].join('\n');
    const out = parseTextDecklist(text);
    expect(out[0]).toEqual({ name: 'Edgar Markov', count: 1, section: 'commander' });
    expect(out[1].section).toBe('mainboard');
    expect(out[2].section).toBe('mainboard');
  });

  it('recognises "// Commander" comment headers', () => {
    const text = ['// Commander', '1 Yuriko, the Tiger\'s Shadow', '// Deck', '1 Force of Will'].join('\n');
    const out = parseTextDecklist(text);
    expect(out[0].section).toBe('commander');
    expect(out[1].section).toBe('mainboard');
  });

  it('routes Maybeboard and SB: lines into the maybeboard section', () => {
    const text = [
      '1 Sol Ring',
      'Maybeboard',
      '1 Mana Crypt',
      'SB: 1 Force of Will',
    ].join('\n');
    const out = parseTextDecklist(text);
    expect(out.find((e) => e.name === 'Sol Ring').section).toBe('mainboard');
    expect(out.find((e) => e.name === 'Mana Crypt').section).toBe('maybeboard');
    expect(out.find((e) => e.name === 'Force of Will').section).toBe('maybeboard');
  });

  it('skips Sideboard and Tokens sections entirely', () => {
    const text = [
      '1 Sol Ring',
      'Sideboard',
      '1 Mountain',
      'Tokens',
      '1 Treasure',
    ].join('\n');
    const out = parseTextDecklist(text);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Sol Ring');
  });

  it('strips trailing set codes and foil markers', () => {
    const text = ['1 Sol Ring (CMM) 456', '1 Forest (NEO) 999 *F*', '1 Brainstorm *F*'].join('\n');
    const out = parseTextDecklist(text);
    expect(out[0].name).toBe('Sol Ring');
    expect(out[1].name).toBe('Forest');
    expect(out[2].name).toBe('Brainstorm');
  });

  it('skips blank lines, #/// comments, and unrecognised headers', () => {
    const text = ['# my list', '', '   ', '1 Sol Ring'].join('\n');
    const out = parseTextDecklist(text);
    expect(out).toHaveLength(1);
  });

  it('handles a 100-line header-less paste with default section = mainboard', () => {
    const lines = [];
    for (let i = 0; i < 100; i++) lines.push(`1 Filler ${i}`);
    const out = parseTextDecklist(lines.join('\n'));
    expect(out).toHaveLength(100);
    expect(out.every((e) => e.section === 'mainboard')).toBe(true);
  });

  it('returns [] for empty / non-string input', () => {
    expect(parseTextDecklist('')).toEqual([]);
    expect(parseTextDecklist(null)).toEqual([]);
    expect(parseTextDecklist(undefined)).toEqual([]);
  });

  it('clamps zero / negative counts to 1', () => {
    const out = parseTextDecklist('0 Sol Ring');
    expect(out[0].count).toBe(1);
  });
});

describe('parseMoxfieldUrl', () => {
  it('extracts the deck id from a public Moxfield URL', () => {
    expect(parseMoxfieldUrl('https://www.moxfield.com/decks/abc123_-XY')).toBe('abc123_-XY');
  });
  it('returns null for non-Moxfield URLs', () => {
    expect(parseMoxfieldUrl('https://example.com/decks/abc')).toBeNull();
    expect(parseMoxfieldUrl('not a url')).toBeNull();
    expect(parseMoxfieldUrl('')).toBeNull();
  });
});

describe('parseArchidektUrl', () => {
  it('extracts the numeric deck id', () => {
    expect(parseArchidektUrl('https://archidekt.com/decks/12345678')).toBe('12345678');
    expect(parseArchidektUrl('https://archidekt.com/decks/9876/my-deck-slug')).toBe('9876');
  });
  it('returns null for non-Archidekt URLs', () => {
    expect(parseArchidektUrl('https://moxfield.com/decks/abc')).toBeNull();
  });
});

describe('detectDeckUrl', () => {
  it('returns the source for recognised URLs', () => {
    expect(detectDeckUrl('https://www.moxfield.com/decks/abc')).toBe('moxfield');
    expect(detectDeckUrl('https://archidekt.com/decks/1')).toBe('archidekt');
    expect(detectDeckUrl('https://tappedout.net/mtg-decks/foo')).toBeNull();
  });
});

describe('shapeMoxfieldDeck', () => {
  it('flattens the v3 boards layout', () => {
    const { name, entries } = shapeMoxfieldDeck({
      name: 'Edgar',
      boards: {
        commanders: { cards: { 'a': { quantity: 1, card: { name: 'Edgar Markov' } } } },
        mainboard:  { cards: { 'b': { quantity: 2, card: { name: 'Sol Ring' } } } },
        maybeboard: { cards: { 'c': { quantity: 1, card: { name: 'Mana Crypt' } } } },
      },
    });
    expect(name).toBe('Edgar');
    expect(entries).toContainEqual({ name: 'Edgar Markov', count: 1, section: 'commander' });
    expect(entries).toContainEqual({ name: 'Sol Ring', count: 2, section: 'mainboard' });
    expect(entries).toContainEqual({ name: 'Mana Crypt', count: 1, section: 'maybeboard' });
  });

  it('also accepts the older flat v2 shape', () => {
    const { entries } = shapeMoxfieldDeck({
      name: 'Legacy',
      commanders: { a: { quantity: 1, card: { name: 'Yuriko' } } },
      mainboard:  { b: { quantity: 1, card: { name: 'Brainstorm' } } },
    });
    expect(entries).toContainEqual({ name: 'Yuriko', count: 1, section: 'commander' });
    expect(entries).toContainEqual({ name: 'Brainstorm', count: 1, section: 'mainboard' });
  });

  it('returns empty entries for malformed payloads', () => {
    expect(shapeMoxfieldDeck(null).entries).toEqual([]);
    expect(shapeMoxfieldDeck({}).entries).toEqual([]);
  });
});

describe('shapeArchidektDeck', () => {
  it('uses categories to route commander and maybeboard', () => {
    const { name, entries } = shapeArchidektDeck({
      name: 'Magda',
      cards: [
        { quantity: 1, categories: ['Commander'], card: { oracleCard: { name: 'Magda, Brazen Outlaw' } } },
        { quantity: 1, categories: [],            card: { oracleCard: { name: 'Sol Ring' } } },
        { quantity: 1, categories: ['Maybeboard'], card: { oracleCard: { name: 'Mana Crypt' } } },
        { quantity: 1, categories: ['Sideboard'], card: { oracleCard: { name: 'Pyroblast' } } },
      ],
    });
    expect(name).toBe('Magda');
    expect(entries).toContainEqual({ name: 'Magda, Brazen Outlaw', count: 1, section: 'commander' });
    expect(entries).toContainEqual({ name: 'Sol Ring', count: 1, section: 'mainboard' });
    expect(entries).toContainEqual({ name: 'Mana Crypt', count: 1, section: 'maybeboard' });
    expect(entries.find((e) => e.name === 'Pyroblast')).toBeUndefined();
  });
});

describe('fetchDeckFromUrl', () => {
  it('throws a readable error for unrecognised hosts', async () => {
    await expect(fetchDeckFromUrl('https://example.com/whatever')).rejects.toThrow(
      /recognised Moxfield or Archidekt/i
    );
  });

  it('dispatches Moxfield URLs to the v3 endpoint', async () => {
    const calls = [];
    const fakeFetch = vi.fn(async (u) => {
      calls.push(u);
      return {
        ok: true,
        json: async () => ({
          name: 'Edgar',
          boards: {
            commanders: { cards: { a: { quantity: 1, card: { name: 'Edgar Markov' } } } },
            mainboard:  { cards: { b: { quantity: 1, card: { name: 'Sol Ring' } } } },
          },
        }),
      };
    });
    const original = global.fetch;
    global.fetch = fakeFetch;
    try {
      const out = await fetchDeckFromUrl('https://www.moxfield.com/decks/abc_-123');
      expect(out.source).toBe('moxfield');
      expect(out.name).toBe('Edgar');
      expect(out.entries.length).toBe(2);
      expect(calls[0]).toContain('api2.moxfield.com/v3/decks/all/abc_-123');
    } finally {
      global.fetch = original;
    }
  });

  it('dispatches Archidekt URLs to the Archidekt API', async () => {
    const calls = [];
    const fakeFetch = vi.fn(async (u) => {
      calls.push(u);
      return {
        ok: true,
        json: async () => ({
          name: 'Magda',
          cards: [{ quantity: 1, categories: ['Commander'], card: { oracleCard: { name: 'Magda' } } }],
        }),
      };
    });
    const original = global.fetch;
    global.fetch = fakeFetch;
    try {
      const out = await fetchDeckFromUrl('https://archidekt.com/decks/12345/whatever');
      expect(out.source).toBe('archidekt');
      expect(out.entries[0]).toEqual({ name: 'Magda', count: 1, section: 'commander' });
      expect(calls[0]).toContain('archidekt.com/api/decks/12345/');
    } finally {
      global.fetch = original;
    }
  });

  it('surfaces upstream HTTP failures as a thrown Error', async () => {
    const original = global.fetch;
    global.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    try {
      await expect(fetchDeckFromUrl('https://www.moxfield.com/decks/abc')).rejects.toThrow(
        /HTTP 503/
      );
    } finally {
      global.fetch = original;
    }
  });
});
