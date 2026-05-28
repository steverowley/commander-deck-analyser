import { describe, it, expect } from 'vitest';
import {
  addCardsToDeck,
  safeAddCards,
  removeCardFromDeck,
  setCardCount,
  setCardNote,
  setStrictIdentity,
  setDeckNotes,
  duplicateDeck,
  renameDeck,
  exportDecklist,
  addToWishlist,
  removeFromWishlist,
  promoteFromWishlist,
  demoteToWishlist,
  diffCards,
  recordSwap,
  applyWithLog,
  setSwapNote,
  deleteSwapEntry,
  SWAP_LOG_CAP,
  SWAP_NOTE_MAX,
} from './deckops.js';

const baseDeck = () => ({
  id: 'd1',
  name: 'Test Deck',
  commander: { name: 'Edgar Markov', color_identity: ['W', 'B', 'R'] },
  cards: [],
});

const sampleCard = (name) => ({
  name,
  count: 1,
  scryfall: {
    name,
    type_line: 'Creature — Vampire',
    oracle_text: 'Lifelink',
    color_identity: ['B'],
  },
});

describe('addCardsToDeck', () => {
  it('adds new cards and runs tag detection', () => {
    const updated = addCardsToDeck(baseDeck(), [sampleCard('Bloodghast')]);
    expect(updated.cards.length).toBe(1);
    expect(updated.cards[0].tags).toContain('Lifegain');
  });

  it('merges counts for cards already present (singleton check happens upstream)', () => {
    const deck = addCardsToDeck(baseDeck(), [sampleCard('Bloodghast')]);
    const merged = addCardsToDeck(deck, [sampleCard('Bloodghast')]);
    expect(merged.cards[0].count).toBe(2);
  });
});

describe('removeCardFromDeck', () => {
  it('removes a card by name', () => {
    const deck = addCardsToDeck(baseDeck(), [sampleCard('Bloodghast'), sampleCard('Bloodartist')]);
    const after = removeCardFromDeck(deck, 'Bloodghast');
    expect(after.cards.length).toBe(1);
    expect(after.cards[0].name).toBe('Bloodartist');
  });
});

describe('setCardCount', () => {
  it('changes the count of an existing card', () => {
    const deck = addCardsToDeck(baseDeck(), [sampleCard('Forest')]);
    const after = setCardCount(deck, deck.cards[0], 5);
    expect(after.cards[0].count).toBe(5);
  });

  it('removes the entry on count <= 0', () => {
    const deck = addCardsToDeck(baseDeck(), [sampleCard('Forest')]);
    const after = setCardCount(deck, deck.cards[0], 0);
    expect(after.cards.length).toBe(0);
  });
});

describe('duplicateDeck', () => {
  it('creates a fresh id and "(copy)" suffix', () => {
    const deck = { ...baseDeck(), cards: [sampleCard('Bloodghast')] };
    const copy = duplicateDeck(deck);
    expect(copy.id).not.toBe(deck.id);
    expect(copy.name).toBe('Test Deck (copy)');
  });

  it('deep-clones the card array so edits do not bleed', () => {
    const deck = addCardsToDeck(baseDeck(), [sampleCard('Bloodghast')]);
    const copy = duplicateDeck(deck);
    copy.cards[0].count = 99;
    expect(deck.cards[0].count).toBe(1);
  });
});

describe('renameDeck', () => {
  it('updates the name', () => {
    expect(renameDeck(baseDeck(), 'New Name').name).toBe('New Name');
  });

  it('keeps the old name on empty input', () => {
    expect(renameDeck(baseDeck(), '   ').name).toBe('Test Deck');
  });
});

describe('exportDecklist', () => {
  it('produces a Moxfield-style block with Commander and Deck sections', () => {
    const deck = addCardsToDeck(baseDeck(), [sampleCard('Bloodghast'), sampleCard('Bloodartist')]);
    const text = exportDecklist(deck);
    expect(text).toContain('Commander');
    expect(text).toContain('1 Edgar Markov');
    expect(text).toContain('Deck');
    expect(text).toContain('1 Bloodghast');
    expect(text).toContain('1 Bloodartist');
  });

  it('sorts deck cards alphabetically', () => {
    const deck = addCardsToDeck(baseDeck(), [sampleCard('Wurm'), sampleCard('Anthem')]);
    const text = exportDecklist(deck);
    const wurmIdx = text.indexOf('Wurm');
    const anthemIdx = text.indexOf('Anthem');
    expect(anthemIdx).toBeLessThan(wurmIdx);
  });
});

describe('setStrictIdentity', () => {
  it('toggles the flag', () => {
    const d = baseDeck();
    expect(setStrictIdentity(d, true).strictIdentity).toBe(true);
    expect(setStrictIdentity(d, false).strictIdentity).toBe(false);
  });
});

describe('safeAddCards', () => {
  it('passes through to addCardsToDeck when strict is off', () => {
    const deck = baseDeck();
    const offColor = {
      name: 'Counterspell',
      count: 1,
      scryfall: { name: 'Counterspell', type_line: 'Instant', color_identity: ['U'] },
    };
    const { deck: next, rejected } = safeAddCards(deck, [offColor]);
    expect(next.cards.length).toBe(1);
    expect(rejected).toEqual([]);
  });

  it('blocks off-color adds when strict is on', () => {
    const deck = { ...baseDeck(), strictIdentity: true };
    const offColor = {
      name: 'Counterspell',
      count: 1,
      scryfall: { name: 'Counterspell', type_line: 'Instant', color_identity: ['U'] },
    };
    const { deck: next, rejected } = safeAddCards(deck, [offColor]);
    expect(next.cards.length).toBe(0);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reasons.some((r) => /off-color/.test(r))).toBe(true);
  });

  it('still adds in-color cards under strict mode', () => {
    const deck = { ...baseDeck(), strictIdentity: true };
    const inColor = sampleCard('Bloodghast');
    const { deck: next, rejected } = safeAddCards(deck, [inColor]);
    expect(next.cards.length).toBe(1);
    expect(rejected.length).toBe(0);
  });
});

describe('setCardNote', () => {
  it('attaches a note to a specific card entry', () => {
    const deck = addCardsToDeck(baseDeck(), [sampleCard('Bloodghast')]);
    const entry = deck.cards[0];
    const after = setCardNote(deck, entry, 'core engine piece');
    expect(after.cards[0].note).toBe('core engine piece');
  });
});

describe('setDeckNotes', () => {
  it('stores the notes string', () => {
    expect(setDeckNotes(baseDeck(), 'play aggressive').notes).toBe('play aggressive');
  });
  it('caps at 2000 chars', () => {
    const long = 'a'.repeat(3000);
    expect(setDeckNotes(baseDeck(), long).notes.length).toBe(2000);
  });
  it('handles null/undefined as empty string', () => {
    expect(setDeckNotes(baseDeck(), null).notes).toBe('');
    expect(setDeckNotes(baseDeck(), undefined).notes).toBe('');
  });
});

describe('wishlist', () => {
  it('adds a card to the wishlist (initialised on the fly)', () => {
    const d = addToWishlist(baseDeck(), [sampleCard('Bloodghast')]);
    expect(d.wishlist.length).toBe(1);
    expect(d.wishlist[0].name).toBe('Bloodghast');
  });

  it('does not add a card already in the deck', () => {
    const d = addCardsToDeck(baseDeck(), [sampleCard('Bloodghast')]);
    const d2 = addToWishlist(d, [sampleCard('Bloodghast')]);
    expect(d2.wishlist).toEqual([]);
  });

  it('increments count for an already-wishlisted card', () => {
    let d = addToWishlist(baseDeck(), [sampleCard('Bloodghast')]);
    d = addToWishlist(d, [sampleCard('Bloodghast')]);
    expect(d.wishlist[0].count).toBe(2);
  });

  it('removeFromWishlist drops the entry', () => {
    let d = addToWishlist(baseDeck(), [sampleCard('Bloodghast')]);
    d = removeFromWishlist(d, 'Bloodghast');
    expect(d.wishlist).toEqual([]);
  });

  it('promote moves wishlist → cards and re-tags', () => {
    let d = addToWishlist(baseDeck(), [sampleCard('Bloodghast')]);
    d = promoteFromWishlist(d, 'Bloodghast');
    expect(d.wishlist).toEqual([]);
    expect(d.cards.length).toBe(1);
    expect(d.cards[0].tags).toContain('Lifegain');
  });

  it('demote moves cards → wishlist', () => {
    let d = addCardsToDeck(baseDeck(), [sampleCard('Bloodghast')]);
    d = demoteToWishlist(d, 'Bloodghast');
    expect(d.cards).toEqual([]);
    expect(d.wishlist.length).toBe(1);
    expect(d.wishlist[0].name).toBe('Bloodghast');
  });

  it('demote then promote round-trips', () => {
    let d = addCardsToDeck(baseDeck(), [sampleCard('Bloodghast')]);
    d = demoteToWishlist(d, 'Bloodghast');
    d = promoteFromWishlist(d, 'Bloodghast');
    expect(d.cards.length).toBe(1);
    expect(d.wishlist).toEqual([]);
  });
});

describe('swap log', () => {
  it('diffCards: detects an add', () => {
    const a = baseDeck();
    const b = addCardsToDeck(a, [sampleCard('Sol Ring')]);
    const d = diffCards(a, b);
    expect(d.added).toEqual([{ name: 'Sol Ring', count: 1 }]);
    expect(d.removed).toEqual([]);
  });

  it('diffCards: detects a remove', () => {
    const a = addCardsToDeck(baseDeck(), [sampleCard('Sol Ring')]);
    const b = removeCardFromDeck(a, 'Sol Ring');
    const d = diffCards(a, b);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([{ name: 'Sol Ring', count: 1 }]);
  });

  it('diffCards: detects a count change as a partial add or remove', () => {
    const a = addCardsToDeck(baseDeck(), [sampleCard('Forest', { type_line: 'Basic Land — Forest' })]);
    const b = { ...a, cards: a.cards.map((c) => ({ ...c, count: 3 })) };
    expect(diffCards(a, b).added).toEqual([{ name: 'Forest', count: 2 }]);
    const c = { ...a, cards: a.cards.map((c) => ({ ...c, count: 0 })).filter((c) => c.count > 0) };
    expect(diffCards(a, c).removed).toEqual([{ name: 'Forest', count: 1 }]);
  });

  it('recordSwap: appends an entry with timestamp and is a no-op for empty diffs', () => {
    const a = baseDeck();
    expect(recordSwap(a, {}).swap_log).toBeUndefined();
    const b = recordSwap(a, { added: [{ name: 'Sol Ring', count: 1 }] });
    expect(b.swap_log.length).toBe(1);
    expect(b.swap_log[0].added[0]).toMatchObject({ name: 'Sol Ring', count: 1 });
    expect(typeof b.swap_log[0].ts).toBe('number');
  });

  it('recordSwap: caps note length and trims whitespace', () => {
    const longNote = 'x'.repeat(SWAP_NOTE_MAX + 50);
    const out = recordSwap(baseDeck(), { added: [{ name: 'Sol Ring', count: 1 }], note: `   ${longNote}   ` });
    expect(out.swap_log[0].note.length).toBe(SWAP_NOTE_MAX);
  });

  it('recordSwap: trims the log to the cap', () => {
    let d = baseDeck();
    for (let i = 0; i < SWAP_LOG_CAP + 5; i++) {
      d = recordSwap(d, { added: [{ name: `Card ${i}`, count: 1 }] });
    }
    expect(d.swap_log.length).toBe(SWAP_LOG_CAP);
    expect(d.swap_log[0].added[0].name).toBe(`Card 5`); // oldest 5 dropped
  });

  it('applyWithLog: captures editor changes including notes', () => {
    const a = baseDeck();
    const b = addCardsToDeck(a, [sampleCard('Sol Ring')]);
    const c = applyWithLog(a, b, 'rocks are good');
    expect(c.swap_log[0].added[0].name).toBe('Sol Ring');
    expect(c.swap_log[0].note).toBe('rocks are good');
  });

  it('applyWithLog: skips logging when nothing changed', () => {
    const a = addCardsToDeck(baseDeck(), [sampleCard('Sol Ring')]);
    const b = applyWithLog(a, a);
    expect(b.swap_log).toBeUndefined();
  });

  it('setSwapNote: edits the note on an existing entry', () => {
    let d = recordSwap(baseDeck(), { added: [{ name: 'Sol Ring', count: 1 }] });
    const ts = d.swap_log[0].ts;
    d = setSwapNote(d, ts, 'replaced Mana Vault');
    expect(d.swap_log[0].note).toBe('replaced Mana Vault');
  });

  it('setSwapNote: removes the note when given an empty string', () => {
    let d = recordSwap(baseDeck(), { added: [{ name: 'Sol Ring', count: 1 }], note: 'old note' });
    const ts = d.swap_log[0].ts;
    d = setSwapNote(d, ts, '');
    expect(d.swap_log[0].note).toBeUndefined();
  });

  it('deleteSwapEntry: removes a swap entry by timestamp', () => {
    let d = recordSwap(baseDeck(), { added: [{ name: 'Sol Ring', count: 1 }] });
    const ts = d.swap_log[0].ts;
    d = deleteSwapEntry(d, ts);
    expect(d.swap_log).toEqual([]);
  });

  it('survives JSON round-trip (backup/restore)', () => {
    const a = baseDeck();
    const b = applyWithLog(a, addCardsToDeck(a, [sampleCard('Sol Ring')]), 'why not');
    const restored = JSON.parse(JSON.stringify(b));
    expect(restored.swap_log[0].added[0]).toMatchObject({ name: 'Sol Ring', count: 1 });
    expect(restored.swap_log[0].note).toBe('why not');
  });
});
