import { describe, it, expect } from 'vitest';
import { extractTokens, extractResources, parseTokensFromOracle, tokensAsText } from './tokens.js';

function card(name, oracle, overrides = {}) {
  return {
    count: 1,
    name,
    scryfall: { name, oracle_text: oracle, type_line: 'Creature', cmc: 0, ...overrides },
  };
}

const KRENKO = card(
  'Krenko, Mob Boss',
  'Tap: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.'
);
const PROCESSION = card(
  'Anointed Procession',
  'If one or more tokens would be created under your control, twice that many of those tokens are created instead.'
);
const ELSPETH = card(
  'Elspeth, Knight-Errant',
  '+1: Create a 1/1 white Soldier creature token.'
);
const SMOTHERING_TITHE = card(
  'Smothering Tithe',
  "Whenever an opponent draws a card, unless that player pays {2}, you create a Treasure token."
);
const MONDRAK = card(
  'Mondrak, Glory Dominus',
  'If one or more tokens would be created under your control, twice that many of those tokens are created instead.'
);

describe('parseTokensFromOracle', () => {
  it('extracts a 1/1 red Goblin creature token', () => {
    const out = parseTokensFromOracle(KRENKO.scryfall.oracle_text);
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({
      kind: 'creature', name: 'Goblin', power: '1', toughness: '1', colors: ['R'],
    });
  });

  it('extracts a 1/1 white Soldier', () => {
    const out = parseTokensFromOracle(ELSPETH.scryfall.oracle_text);
    expect(out[0]).toMatchObject({ kind: 'creature', name: 'Soldier', power: '1', toughness: '1', colors: ['W'] });
  });

  it('extracts a Treasure (artifact) token', () => {
    const out = parseTokensFromOracle(SMOTHERING_TITHE.scryfall.oracle_text);
    expect(out[0]).toMatchObject({ kind: 'artifact', name: 'Treasure' });
  });

  it('handles "create two" / "create three" word counts', () => {
    const out = parseTokensFromOracle(
      'Create three 1/1 blue Spirit creature tokens with flying.'
    );
    expect(out[0]).toMatchObject({ kind: 'creature', name: 'Spirit', power: '1', toughness: '1', colors: ['U'] });
  });

  it('strips "with abilities" and "named X" trailing clauses', () => {
    const out = parseTokensFromOracle(
      'Create a 2/2 black Zombie creature token named Gisa with menace.'
    );
    expect(out[0]).toMatchObject({ kind: 'creature', name: 'Zombie', power: '2', toughness: '2', colors: ['B'] });
  });

  it('returns multiple tokens from a single card', () => {
    const out = parseTokensFromOracle(
      'Create a 1/1 white Soldier creature token. Create a Treasure token.'
    );
    expect(out.length).toBe(2);
  });

  it('deduplicates identical token mentions', () => {
    const out = parseTokensFromOracle(
      'Create a 1/1 white Soldier creature token. Create a 1/1 white Soldier creature token with vigilance.'
    );
    // First & second clauses both parse to the same key (vigilance stripped).
    expect(out.length).toBe(1);
  });

  it('returns [] for cards with no token text', () => {
    expect(parseTokensFromOracle('Counter target spell.')).toEqual([]);
    expect(parseTokensFromOracle('')).toEqual([]);
    expect(parseTokensFromOracle(null)).toEqual([]);
  });
});

describe('extractTokens', () => {
  it('aggregates the same token from multiple creators', () => {
    const krenko2 = card('Goblin Chieftain', 'Create a 1/1 red Goblin creature token.');
    const deck = { cards: [KRENKO, krenko2], commander: null };
    const out = extractTokens(deck);
    // Krenko's X/1 differs from Goblin Chieftain's 1/1 — they're separate
    // entries in the sheet because P/T differs.
    const oneOnes = out.find((t) => t.label === 'Goblin 1/1 R');
    expect(oneOnes).toBeTruthy();
    expect(oneOnes.sources).toContain('Goblin Chieftain');
  });

  it('lists the commander as a source', () => {
    const deck = { cards: [], commander: KRENKO.scryfall };
    const out = extractTokens(deck);
    expect(out[0].sources).toContain('Krenko, Mob Boss');
  });

  it("appends token doublers as sources for every token (Krenko + Anointed Procession produces 'Goblin 1/1 R' with both)", () => {
    const deck = { cards: [KRENKO, PROCESSION], commander: null };
    const out = extractTokens(deck);
    const gob = out.find((t) => /Goblin/.test(t.label));
    expect(gob).toBeTruthy();
    expect(gob.sources).toContain('Krenko, Mob Boss');
    expect(gob.sources).toContain('Anointed Procession');
    expect(gob.doublerSources).toContain('Anointed Procession');
  });

  it('returns an empty array when no card creates tokens', () => {
    const deck = {
      cards: [card('Counterspell', 'Counter target spell.')],
      commander: null,
    };
    expect(extractTokens(deck)).toEqual([]);
  });

  it('sorts creature tokens before artifact tokens, alphabetical within', () => {
    const deck = {
      cards: [SMOTHERING_TITHE, ELSPETH, KRENKO],
      commander: null,
    };
    const out = extractTokens(deck);
    const idxGob = out.findIndex((t) => /Goblin/.test(t.label));
    const idxSol = out.findIndex((t) => /Soldier/.test(t.label));
    const idxTreasure = out.findIndex((t) => t.label === 'Treasure');
    expect(idxGob).toBeLessThan(idxTreasure);
    expect(idxSol).toBeLessThan(idxTreasure);
  });
});

describe('extractResources', () => {
  it('flags monarch, initiative, energy, day/night', () => {
    const deck = {
      cards: [
        card('Throne of the High City', '{T}: Add {C}. You become the monarch.'),
        card('Initiative Card', 'You take the initiative.'),
        card('Aether Hub', 'Pay {E}{E}: Add one mana of any color.'),
        card('Tovolar', 'It becomes night.'),
      ],
      commander: null,
    };
    const ids = new Set(extractResources(deck).map((r) => r.id));
    expect(ids.has('monarch')).toBe(true);
    expect(ids.has('initiative')).toBe(true);
    expect(ids.has('energy')).toBe(true);
    expect(ids.has('day-night')).toBe(true);
  });

  it('groups multiple sources of the same resource', () => {
    const deck = {
      cards: [
        card('Court of Bounty', 'You become the monarch.'),
        card('Marchesa', 'Whenever you become the monarch, draw a card.'),
      ],
      commander: null,
    };
    const m = extractResources(deck).find((r) => r.id === 'monarch');
    // Both cards reference monarch — we want both surfaced so the
    // player remembers the trigger that depends on it, not just the
    // card that creates the state.
    expect(m.sources).toEqual(['Court of Bounty', 'Marchesa']);
  });
});

describe('tokensAsText', () => {
  it('produces a copy-pasteable plain-text sheet', () => {
    const deck = { cards: [KRENKO, PROCESSION, SMOTHERING_TITHE], commander: null };
    const tokens = extractTokens(deck);
    const resources = extractResources(deck);
    const text = tokensAsText({ tokens, resources, deckName: 'Krenko' });
    expect(text).toMatch(/Token sheet — Krenko/);
    expect(text).toMatch(/Goblin/);
    expect(text).toMatch(/Treasure/);
    expect(text).toMatch(/from Krenko, Mob Boss/);
    expect(text).toMatch(/from Anointed Procession/);
  });

  it('surfaces an empty-state message when there are no tokens or resources', () => {
    const text = tokensAsText({ tokens: [], resources: [], deckName: 'Vanilla' });
    expect(text).toMatch(/No tokens or non-token resources detected/);
  });
});
