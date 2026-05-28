import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We intercept the batch card fetch so we can supply a deterministic
// pool to pickRandomCommanderFromCollection without hitting Scryfall.
// `cacheCard` and the rest of scryfall.js are real — only the network
// call inside fetchCardsByName is mocked through global.fetch.

import { pickRandomCommanderFromCollection, rehydrateMissingOracleText } from './scryfall.js';

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

describe('rehydrateMissingOracleText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  const deckCard = (name, scryfall) => ({ name, count: 1, tags: [], scryfall });

  it('is a no-op when every card already has oracle text', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    const cards = [
      deckCard('Sol Ring', {
        name: 'Sol Ring',
        type_line: 'Artifact',
        oracle_text: '{T}: Add {C}{C}.',
      }),
    ];
    const result = await rehydrateMissingOracleText(cards);
    expect(result.rehydrated).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.cards).toBe(cards);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fills missing oracle text from Scryfall and preserves printing fields', async () => {
    mockScryfallBatch([
      {
        name: 'Cultivate',
        type_line: 'Sorcery',
        oracle_text: 'Search your library for up to two basic land cards…',
        cmc: 3,
        color_identity: ['G'],
      },
    ]);
    const cards = [
      deckCard('Cultivate', {
        name: 'Cultivate',
        type_line: 'Sorcery',
        oracle_text: '',
        // User-chosen printing details that must survive the rehydrate.
        id: 'user-picked-printing-id',
        set: 'cmm',
        collector_number: '0123',
        image_uris: { normal: 'https://example.com/alt-art.jpg' },
      }),
    ];
    const result = await rehydrateMissingOracleText(cards);
    expect(result.rehydrated).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.cards[0].scryfall.oracle_text).toMatch(/basic land/);
    expect(result.cards[0].scryfall.id).toBe('user-picked-printing-id');
    expect(result.cards[0].scryfall.set).toBe('cmm');
    expect(result.cards[0].scryfall.collector_number).toBe('0123');
    expect(result.cards[0].scryfall.image_uris.normal).toBe('https://example.com/alt-art.jpg');
  });

  it('treats card_faces oracle text as present (DFCs are not missing)', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    const cards = [
      deckCard('Delver of Secrets', {
        name: 'Delver of Secrets',
        type_line: 'Creature — Human Wizard // Creature — Human Insect',
        oracle_text: '',
        card_faces: [
          { oracle_text: 'At the beginning of your upkeep, look at the top card…' },
          { oracle_text: 'Flying' },
        ],
      }),
    ];
    const result = await rehydrateMissingOracleText(cards);
    expect(result.rehydrated).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('counts Scryfall not_found entries as failures', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [], not_found: [{ name: 'Bogus Card' }] }),
    }));
    const cards = [
      deckCard('Bogus Card', { name: 'Bogus Card', type_line: 'Creature', oracle_text: '' }),
    ];
    const result = await rehydrateMissingOracleText(cards);
    expect(result.rehydrated).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.cards[0].scryfall.oracle_text).toBe('');
  });

  it('handles a network failure by reporting failed without throwing', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down'); });
    const cards = [
      deckCard('Cultivate', { name: 'Cultivate', type_line: 'Sorcery', oracle_text: '' }),
    ];
    const result = await rehydrateMissingOracleText(cards);
    expect(result.rehydrated).toBe(0);
    expect(result.failed).toBe(1);
  });
});
