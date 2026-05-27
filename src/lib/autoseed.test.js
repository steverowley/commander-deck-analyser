import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We mock the two network-touching modules so the autoseed pipeline
// runs deterministically. The shapes match what each real function
// returns.

vi.mock('./edhrec.js', () => ({
  fetchRecommendations: vi.fn(),
  topRecommendations: vi.fn((recs, _exclude, limit) => recs.slice(0, limit)),
}));
vi.mock('./scryfall.js', () => ({
  fetchCardsByName: vi.fn(),
}));

import { fetchRecommendations } from './edhrec.js';
import { fetchCardsByName } from './scryfall.js';
import { buildSeededDeck } from './autoseed.js';

const BASICS = {
  plains:  { name: 'Plains',   type_line: 'Basic Land — Plains',   cmc: 0 },
  island:  { name: 'Island',   type_line: 'Basic Land — Island',   cmc: 0 },
  swamp:   { name: 'Swamp',    type_line: 'Basic Land — Swamp',    cmc: 0 },
  mountain:{ name: 'Mountain', type_line: 'Basic Land — Mountain', cmc: 0 },
  forest:  { name: 'Forest',   type_line: 'Basic Land — Forest',   cmc: 0 },
};

function totalCount(cards) {
  return cards.reduce((s, c) => s + c.count, 0);
}

function makeCreature(i) {
  return { name: `Creature ${i}`, type_line: 'Creature — Goblin', cmc: 3, oracle_text: 'Vanilla beater.' };
}
function makeRamp(i) {
  return { name: `Ramp ${i}`, type_line: 'Sorcery', cmc: 2, oracle_text: 'Search your library for a basic land card and put it onto the battlefield.' };
}
function makeDraw(i) {
  return { name: `Draw ${i}`, type_line: 'Sorcery', cmc: 3, oracle_text: 'Draw two cards.' };
}
function makeRemoval(i) {
  return { name: `Removal ${i}`, type_line: 'Instant', cmc: 2, oracle_text: 'Destroy target creature.' };
}
function makeLand(i) {
  return { name: `Utility Land ${i}`, type_line: 'Land', cmc: 0, oracle_text: '{T}: Add one mana of any color.' };
}

function buildResults(cards) {
  const out = {};
  for (const c of cards) out[c.name.toLowerCase()] = c;
  // basics for the lookup path
  out.plains = BASICS.plains;
  out.island = BASICS.island;
  out.swamp = BASICS.swamp;
  out.mountain = BASICS.mountain;
  out.forest = BASICS.forest;
  return out;
}

describe('buildSeededDeck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns exactly 99 cards (count-summed) even when EDHREC has very few lands', async () => {
    // Pool: 90 creatures (other), 5 utility lands → way short of the
    // land target. Padding must fill in basics WITHOUT blowing past 99.
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => makeLand(i)),
      ...Array.from({ length: 90 }, (_, i) => makeCreature(i)),
    ];
    fetchRecommendations.mockResolvedValue({ themes: [] });
    // topRecommendations is mocked above to slice — feed pool names
    // through it by stuffing the recs response directly into recs:
    const recsAsCardviews = pool.map((c) => ({ name: c.name }));
    fetchRecommendations.mockResolvedValue(recsAsCardviews);
    fetchCardsByName.mockImplementation(async (names) => ({
      results: buildResults(pool),
      notFound: [],
      errors: [],
    }));

    const commander = { name: 'Test Cmdr', color_identity: ['R'] };
    const { cards, summary } = await buildSeededDeck(commander);

    expect(totalCount(cards)).toBe(99);
    expect(summary.basics).toBeGreaterThan(0); // padding kicked in
  });

  it('returns exactly 99 cards when EDHREC supplies a full balanced pool', async () => {
    const pool = [
      ...Array.from({ length: 40 }, (_, i) => makeLand(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRamp(i)),
      ...Array.from({ length: 20 }, (_, i) => makeDraw(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRemoval(i)),
      ...Array.from({ length: 80 }, (_, i) => makeCreature(i)),
    ];
    fetchRecommendations.mockResolvedValue(pool.map((c) => ({ name: c.name })));
    fetchCardsByName.mockResolvedValue({ results: buildResults(pool), notFound: [], errors: [] });

    const commander = { name: 'Big Cmdr', color_identity: ['W', 'U', 'B'] };
    const { cards, summary } = await buildSeededDeck(commander);

    expect(totalCount(cards)).toBe(99);
    expect(summary.ramp).toBeGreaterThanOrEqual(7);
    expect(summary.draw).toBeGreaterThanOrEqual(7);
    expect(summary.removal).toBeGreaterThanOrEqual(7);
  });

  it('low-bracket targets drop Game Changer / Combo piece cards from the pool', async () => {
    // Cyclonic Rift is in GAME_CHANGERS but not BANNED_CARDS — a clean
    // test that bracket ≤ 2 filtering excludes the GC list specifically.
    const gameChanger = { name: 'Cyclonic Rift', type_line: 'Instant', cmc: 2, oracle_text: 'Return all nonland permanents your opponents control to their owners\' hands.' };
    const pool = [
      gameChanger,
      ...Array.from({ length: 40 }, (_, i) => makeLand(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRamp(i)),
      ...Array.from({ length: 20 }, (_, i) => makeDraw(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRemoval(i)),
      ...Array.from({ length: 60 }, (_, i) => makeCreature(i)),
    ];
    fetchRecommendations.mockResolvedValue(pool.map((c) => ({ name: c.name })));
    fetchCardsByName.mockResolvedValue({ results: buildResults(pool), notFound: [], errors: [] });

    const commander = { name: 'Test Cmdr', color_identity: ['U'] };
    const { cards } = await buildSeededDeck(commander, { bracket: 2 });
    expect(totalCount(cards)).toBe(99);
    expect(cards.some((c) => c.name === 'Cyclonic Rift')).toBe(false);
  });

  it('always drops banned cards regardless of bracket', async () => {
    // Mana Crypt is on the current Commander banlist — even at bracket
    // 5 (cEDH) the auto-seed shouldn't include a card you can't play.
    const banned = { name: 'Mana Crypt', type_line: 'Artifact', cmc: 0, oracle_text: '{T}: Add {C}{C}.' };
    const pool = [
      banned,
      ...Array.from({ length: 40 }, (_, i) => makeLand(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRamp(i)),
      ...Array.from({ length: 20 }, (_, i) => makeDraw(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRemoval(i)),
      ...Array.from({ length: 60 }, (_, i) => makeCreature(i)),
    ];
    fetchRecommendations.mockResolvedValue(pool.map((c) => ({ name: c.name })));
    fetchCardsByName.mockResolvedValue({ results: buildResults(pool), notFound: [], errors: [] });

    const commander = { name: 'cEDH Cmdr', color_identity: ['B'] };
    const { cards } = await buildSeededDeck(commander, { bracket: 5 });
    expect(cards.some((c) => c.name === 'Mana Crypt')).toBe(false);
  });

  it('enforces total budget — built deck total stays at or near the cap', async () => {
    // Every non-basic in the pool sits comfortably under the per-card
    // cap, so the pre-filter passes them. Without the post-build
    // swap loop, 99 of them at $4 each would push the total to ~$400.
    // The swap-with-basics step should bring it down to the cap.
    const expensive = (i) => ({
      name: `Card ${i}`,
      type_line: 'Creature — Goblin',
      cmc: 3,
      oracle_text: 'Vanilla beater.',
      prices: { usd: '4.00' },
    });
    const pool = Array.from({ length: 200 }, (_, i) => expensive(i));
    fetchRecommendations.mockResolvedValue(pool.map((c) => ({ name: c.name })));
    fetchCardsByName.mockResolvedValue({ results: buildResults(pool), notFound: [], errors: [] });

    const commander = { name: 'Budget Cmdr', color_identity: ['R'] };
    const { cards } = await buildSeededDeck(commander, { budget: 50, currency: 'usd' });
    expect(totalCount(cards)).toBe(99);
    const total = cards.reduce((s, c) => {
      const p = parseFloat(c.scryfall?.prices?.usd) || 0;
      return s + p * c.count;
    }, 0);
    expect(total).toBeLessThanOrEqual(50 * 1.1);
  });

  it('budget cap drops cards priced above the per-card threshold', async () => {
    const pricey = { name: 'Pricey Card', type_line: 'Creature', cmc: 4, oracle_text: 'Flying.', prices: { usd: '120.00' } };
    const cheap = (i) => ({ ...makeCreature(i), prices: { usd: '0.50' } });
    const pool = [
      pricey,
      ...Array.from({ length: 40 }, (_, i) => makeLand(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRamp(i)),
      ...Array.from({ length: 20 }, (_, i) => makeDraw(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRemoval(i)),
      ...Array.from({ length: 60 }, (_, i) => cheap(i)),
    ];
    fetchRecommendations.mockResolvedValue(pool.map((c) => ({ name: c.name })));
    fetchCardsByName.mockResolvedValue({ results: buildResults(pool), notFound: [], errors: [] });

    const commander = { name: 'Test Cmdr', color_identity: ['G'] };
    // $50 budget → per-card cap ≈ $6. The $120 pricey card must NOT make it in.
    const { cards } = await buildSeededDeck(commander, { bracket: 3, budget: 50, currency: 'usd' });
    expect(totalCount(cards)).toBe(99);
    expect(cards.some((c) => c.name === 'Pricey Card')).toBe(false);
  });

  it('archetype preference promotes matching cards into the pool front', async () => {
    // Two creatures: one tagged Token producer (matches Tokens archetype),
    // one vanilla. With archetype=tokens the token producer should land
    // in the deck even when synergy order would have put it last.
    const tokenProducer = { name: 'Token Maker', type_line: 'Creature — Soldier', cmc: 4, oracle_text: 'When this enters, create three 1/1 Soldier tokens.' };
    const vanilla = { name: 'Vanilla Bear', type_line: 'Creature — Bear', cmc: 2, oracle_text: '' };
    // Pool order: token producer LAST so synergy alone would deprioritize it.
    const pool = [
      ...Array.from({ length: 40 }, (_, i) => makeLand(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRamp(i)),
      ...Array.from({ length: 20 }, (_, i) => makeDraw(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRemoval(i)),
      ...Array.from({ length: 200 }, () => vanilla), // floods overflow
      tokenProducer,
    ];
    // dedupe names since vanilla appears 200 times
    const dedupedPool = [];
    const seen = new Set();
    for (const c of pool) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      dedupedPool.push(c);
    }
    fetchRecommendations.mockResolvedValue(dedupedPool.map((c) => ({ name: c.name })));
    fetchCardsByName.mockResolvedValue({ results: buildResults(dedupedPool), notFound: [], errors: [] });

    const commander = { name: 'Token Cmdr', color_identity: ['W'] };
    const { cards } = await buildSeededDeck(commander, { archetype: 'tokens' });
    expect(cards.some((c) => c.name === 'Token Maker')).toBe(true);
  });

  it('ownedOnly restricts the pool to cards present in the collection', async () => {
    // Build a big EDHREC pool but mark only a subset as owned. Every
    // non-basic card in the resulting deck must come from the owned
    // set; missing slots get padded with basics (which the filter
    // explicitly allows).
    const pool = [
      ...Array.from({ length: 60 }, (_, i) => makeRamp(i)),
      ...Array.from({ length: 60 }, (_, i) => makeDraw(i)),
      ...Array.from({ length: 60 }, (_, i) => makeRemoval(i)),
      ...Array.from({ length: 100 }, (_, i) => makeCreature(i)),
    ];
    // Own about 80 of the pool — enough to fill the priority buckets
    // and most of the strategy slots but not the whole deck.
    const collection = {};
    const ownedNames = new Set();
    for (let i = 0; i < 20; i++) { collection[`ramp ${i}`] = { name: `Ramp ${i}`, quantity: 1 }; ownedNames.add(`Ramp ${i}`); }
    for (let i = 0; i < 20; i++) { collection[`draw ${i}`] = { name: `Draw ${i}`, quantity: 1 }; ownedNames.add(`Draw ${i}`); }
    for (let i = 0; i < 20; i++) { collection[`removal ${i}`] = { name: `Removal ${i}`, quantity: 1 }; ownedNames.add(`Removal ${i}`); }
    for (let i = 0; i < 50; i++) { collection[`creature ${i}`] = { name: `Creature ${i}`, quantity: 1 }; ownedNames.add(`Creature ${i}`); }
    fetchRecommendations.mockResolvedValue(pool.map((c) => ({ name: c.name })));
    fetchCardsByName.mockResolvedValue({ results: buildResults(pool), notFound: [], errors: [] });

    const commander = { name: 'Owned Cmdr', color_identity: ['R'] };
    const { cards } = await buildSeededDeck(commander, { ownedOnly: true, collection });

    const basics = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);
    for (const c of cards) {
      if (basics.has(c.name)) continue;
      // Non-basic cards must be in the owned set.
      expect(ownedNames.has(c.name)).toBe(true);
    }
    expect(totalCount(cards)).toBe(99);
  });

  it('ownedOnly matches DFC / adventure / split cards by front-face name', async () => {
    // Real-world failure: pool cards from Scryfall have the canonical
    // "Front // Back" name, but Moxfield CSV imports (and a fair share
    // of hand-typed Vault entries) store only the front-face name.
    // Without a fallback the filter says the user doesn't own the card.
    const adventure = { name: 'Bonecrusher Giant // Stomp', type_line: 'Creature — Giant', cmc: 3, oracle_text: 'When this creature becomes the target of a spell, deal 2 damage to that spell\'s controller.' };
    const dfc = { name: 'Brightclimb Pathway // Grimclimb Pathway', type_line: 'Land', cmc: 0, oracle_text: '{T}: Add {W} or {B}.' };
    const split = { name: 'Fire // Ice', type_line: 'Instant', cmc: 2, oracle_text: 'Deal 2 damage divided as you choose.' };
    const fullNameMatch = { name: 'Murderous Rider // Swift End', type_line: 'Creature — Zombie Knight', cmc: 3, oracle_text: 'Destroy target creature.' };
    const pool = [
      adventure,
      dfc,
      split,
      fullNameMatch,
      ...Array.from({ length: 60 }, (_, i) => makeRamp(i)),
      ...Array.from({ length: 60 }, (_, i) => makeCreature(i)),
    ];
    // Vault holds:
    //   - three by front-face only (Moxfield CSV style)
    //   - one by the full Scryfall name (drag-from-Scryfall style)
    const collection = {
      'bonecrusher giant': { name: 'Bonecrusher Giant', quantity: 1 },
      'brightclimb pathway': { name: 'Brightclimb Pathway', quantity: 1 },
      'fire // ice': { name: 'Fire // Ice', quantity: 1 },
      'murderous rider // swift end': { name: 'Murderous Rider // Swift End', quantity: 1 },
    };
    fetchRecommendations.mockResolvedValue(pool.map((c) => ({ name: c.name })));
    fetchCardsByName.mockResolvedValue({ results: buildResults(pool), notFound: [], errors: [] });

    const commander = { name: 'DFC Cmdr', color_identity: ['R'] };
    const { cards } = await buildSeededDeck(commander, { ownedOnly: true, collection });

    expect(cards.some((c) => c.name === 'Bonecrusher Giant // Stomp')).toBe(true);
    expect(cards.some((c) => c.name === 'Brightclimb Pathway // Grimclimb Pathway')).toBe(true);
    expect(cards.some((c) => c.name === 'Fire // Ice')).toBe(true);
    expect(cards.some((c) => c.name === 'Murderous Rider // Swift End')).toBe(true);
  });

  it('caps non-basic lands at the colour-identity utility reserve and pads the rest with basics', async () => {
    // EDHREC pool packed with 40 utility lands — without the cap the
    // builder would dump all 40 into the deck and never reach for a
    // basic. Mono-red has a reserve of 2 utility lands, so the deck
    // should contain at most 2 utility lands and the rest of the
    // land target as basics.
    const pool = [
      ...Array.from({ length: 40 }, (_, i) => makeLand(i)),
      ...Array.from({ length: 60 }, (_, i) => makeCreature(i)),
      ...Array.from({ length: 20 }, (_, i) => makeRamp(i)),
    ];
    fetchRecommendations.mockResolvedValue(pool.map((c) => ({ name: c.name })));
    fetchCardsByName.mockResolvedValue({ results: buildResults(pool), notFound: [], errors: [] });

    const commander = { name: 'Mono-R Cmdr', color_identity: ['R'] };
    const { cards, summary } = await buildSeededDeck(commander);
    expect(totalCount(cards)).toBe(99);
    // At most `utilityReserve(1)` = 2 utility lands picked from the pool.
    const utilityLandsPicked = cards.filter((c) =>
      c.name.startsWith('Utility Land ')
    ).reduce((s, c) => s + c.count, 0);
    expect(utilityLandsPicked).toBeLessThanOrEqual(2);
    // Basics fill the rest of the land target.
    expect(summary.basics).toBeGreaterThanOrEqual(15);
  });

  it('uses Wastes for a colorless commander when padding basics', async () => {
    const pool = [
      ...Array.from({ length: 3 }, (_, i) => makeLand(i)),
      ...Array.from({ length: 80 }, (_, i) => makeCreature(i)),
    ];
    fetchRecommendations.mockResolvedValue(pool.map((c) => ({ name: c.name })));
    fetchCardsByName.mockResolvedValue({
      results: { ...buildResults(pool), wastes: { name: 'Wastes', type_line: 'Basic Land', cmc: 0 } },
      notFound: [],
      errors: [],
    });

    const commander = { name: 'Kozilek', color_identity: [] };
    const { cards } = await buildSeededDeck(commander);

    expect(totalCount(cards)).toBe(99);
    const wastes = cards.find((c) => c.name === 'Wastes');
    expect(wastes?.count ?? 0).toBeGreaterThan(0);
  });
});
