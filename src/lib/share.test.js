import { describe, it, expect } from 'vitest';
import { encodeDeckUrl, decodeDeckUrl } from './share.js';

const deck = (overrides = {}) => ({
  name: 'Edgar Markov',
  commander: { name: 'Edgar Markov', color_identity: ['W', 'B', 'R'] },
  cards: [
    { count: 1, name: 'Sol Ring', scryfall: { name: 'Sol Ring' } },
    { count: 1, name: 'Bloodghast', scryfall: { name: 'Bloodghast' } },
  ],
  ...overrides,
});

describe('encode/decode round-trip', () => {
  it('survives name, commander, and card list', () => {
    const enc = encodeDeckUrl(deck());
    expect(enc.startsWith('#d=')).toBe(true);
    const out = decodeDeckUrl(enc);
    expect(out).toEqual({
      name: 'Edgar Markov',
      commanderName: 'Edgar Markov',
      cards: [
        { count: 1, name: 'Sol Ring' },
        { count: 1, name: 'Bloodghast' },
      ],
    });
  });

  it('handles apostrophes / special chars', () => {
    const d = deck({ name: "K'rrik's Pile", commander: { name: "K'rrik, Son of Yawgmoth", color_identity: ['B'] } });
    const enc = encodeDeckUrl(d);
    const out = decodeDeckUrl(enc);
    expect(out.name).toBe("K'rrik's Pile");
    expect(out.commanderName).toBe("K'rrik, Son of Yawgmoth");
  });

  it('handles decks without a commander', () => {
    const out = decodeDeckUrl(encodeDeckUrl(deck({ commander: null })));
    expect(out.commanderName).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(decodeDeckUrl('')).toBeNull();
    expect(decodeDeckUrl('#nothere')).toBeNull();
    expect(decodeDeckUrl('#d=!!!notbase64')).toBeNull();
  });

  it('drops malformed card entries', () => {
    const enc = '#d=' + btoa(JSON.stringify({ n: 'X', c: [[1, 'Good'], ['bad'], [1, 999]] }));
    const out = decodeDeckUrl(enc);
    expect(out.cards).toEqual([{ count: 1, name: 'Good' }]);
  });
});
