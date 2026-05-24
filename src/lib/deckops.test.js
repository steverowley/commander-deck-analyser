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
