import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We intercept the batch card fetch so we can supply a deterministic
// pool to pickRandomCommanderFromCollection without hitting Scryfall.
// `cacheCard` and the rest of scryfall.js are real — only the network
// call inside fetchCardsByName is mocked through global.fetch.

import { pickRandomCommanderFromCollection } from './scryfall.js';

function makeCard({ name, type_line = 'Legendary Creature — Human', color_identity = [], oracle_text = '' }) {
  return { name, type_line, color_identity, oracle_text, cmc: 3 };
}

function makeCollection(cards) {
  const out = {};
  for (const c of cards) out[c.name.toLowerCase()] = { name: c.name, quantity: 1, meta: {} };
  return out;
}

function mockScryfallBatch(cards) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: cards, not_found: [] }),
  }));
}

describe('pickRandomCommanderFromCollection', () => {
  beforeEach(() => {
    // Force determinism: always pick the first candidate.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  it('returns null when the collection is empty', async () => {
    const result = await pickRandomCommanderFromCollection({
      collection: {},
      colors: [],
      partner: false,
    });
    expect(result).toBeNull();
  });

  it('returns null when the collection has no legendary creatures', async () => {
    const cards = [
      makeCard({ name: 'Sol Ring', type_line: 'Artifact' }),
      makeCard({ name: 'Lightning Bolt', type_line: 'Instant' }),
    ];
    mockScryfallBatch(cards);
    const result = await pickRandomCommanderFromCollection({
      collection: makeCollection(cards),
      colors: [],
      partner: false,
    });
    expect(result).toBeNull();
  });

  it('picks a legendary creature from the vault', async () => {
    const cards = [
      makeCard({ name: 'Sol Ring', type_line: 'Artifact' }),
      makeCard({ name: 'Kenrith, the Returned King', color_identity: ['W', 'U', 'B', 'R', 'G'] }),
    ];
    mockScryfallBatch(cards);
    const result = await pickRandomCommanderFromCollection({
      collection: makeCollection(cards),
      colors: [],
      partner: false,
    });
    expect(result?.name).toBe('Kenrith, the Returned King');
  });

  it('filters by exact color identity match', async () => {
    const cards = [
      makeCard({ name: 'Atraxa, Praetors\' Voice', color_identity: ['W', 'U', 'B', 'G'] }),
      makeCard({ name: 'Edgar Markov',            color_identity: ['W', 'B', 'R'] }),
      makeCard({ name: 'Krenko, Mob Boss',        color_identity: ['R'] }),
    ];
    mockScryfallBatch(cards);
    const result = await pickRandomCommanderFromCollection({
      collection: makeCollection(cards),
      colors: ['W', 'B', 'R'],
      partner: false,
    });
    expect(result?.name).toBe('Edgar Markov');
  });

  it('excludes "partner with" commanders when partner is false', async () => {
    const cards = [
      makeCard({
        name: 'Tymna the Weaver',
        color_identity: ['W', 'B'],
        oracle_text: 'Partner (You can have two commanders if both have partner.)\nPartner with Thrasios, Triton Hero',
      }),
      makeCard({
        name: 'Krenko, Mob Boss',
        color_identity: ['R'],
      }),
    ];
    mockScryfallBatch(cards);
    const result = await pickRandomCommanderFromCollection({
      collection: makeCollection(cards),
      colors: [],
      partner: false,
    });
    expect(result?.name).toBe('Krenko, Mob Boss');
  });

  it('excludes "choose a background" commanders when partner is false', async () => {
    const cards = [
      makeCard({
        name: 'Wilson, Refined Grizzly',
        color_identity: ['G'],
        oracle_text: 'Choose a Background (You can have a Background as a second commander.)',
      }),
      makeCard({ name: 'Krenko, Mob Boss', color_identity: ['R'] }),
    ];
    mockScryfallBatch(cards);
    const result = await pickRandomCommanderFromCollection({
      collection: makeCollection(cards),
      colors: [],
      partner: false,
    });
    expect(result?.name).toBe('Krenko, Mob Boss');
  });

  it('includes partner-with commanders when partner is true', async () => {
    const cards = [
      makeCard({
        name: 'Tymna the Weaver',
        color_identity: ['W', 'B'],
        oracle_text: 'Partner with Thrasios, Triton Hero',
      }),
    ];
    mockScryfallBatch(cards);
    const result = await pickRandomCommanderFromCollection({
      collection: makeCollection(cards),
      colors: ['W', 'B'],
      partner: true,
    });
    expect(result?.name).toBe('Tymna the Weaver');
  });

  it('returns null when no candidate matches the color identity', async () => {
    const cards = [
      makeCard({ name: 'Krenko, Mob Boss', color_identity: ['R'] }),
    ];
    mockScryfallBatch(cards);
    const result = await pickRandomCommanderFromCollection({
      collection: makeCollection(cards),
      colors: ['U'],
      partner: false,
    });
    expect(result).toBeNull();
  });
});
