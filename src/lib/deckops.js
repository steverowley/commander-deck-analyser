/**
 * Pure deck operations — add/remove cards, rename, duplicate, export.
 *
 * These are the operations that the various tabs call. Keeping them
 * here (rather than inlined in components) means tag re-detection and
 * legality checks are consistent across the app.
 */

import { detectTags, AUTO_TAGS } from './tags.js';
import { lc } from './utils.js';

/**
 * Merge new cards into a deck.
 * - Adds counts for cards already present.
 * - Runs tag detection on freshly added cards.
 * - Re-runs detection across ALL cards because some tags (Combo piece)
 *   depend on what else is in the deck.
 * - Preserves user-added manual tags (anything not in AUTO_TAGS).
 */
export function addCardsToDeck(deck, newCards) {
  const cardsCopy = deck.cards.map((c) => ({ ...c, tags: [...(c.tags || [])] }));
  for (const nc of newCards) {
    const existing = cardsCopy.find((c) => lc(c.name) === lc(nc.name));
    if (existing) existing.count += nc.count;
    else cardsCopy.push({ ...nc, tags: [] });
  }
  return { ...deck, cards: retag(cardsCopy) };
}

/**
 * Remove a card entry from a deck, then re-tag the rest. Necessary so
 * that "Combo piece" tags clear when their partner leaves the deck.
 */
export function removeCardFromDeck(deck, name) {
  const cards = deck.cards.filter((c) => lc(c.name) !== lc(name));
  return { ...deck, cards: retag(cards) };
}

/**
 * Set the count of a card. Removes the entry on count <= 0.
 * Re-tags after a removal (count → 0) so combo tags stay accurate.
 */
export function setCardCount(deck, entry, count) {
  if (count <= 0) {
    const cards = deck.cards.filter((c) => c !== entry);
    return { ...deck, cards: retag(cards) };
  }
  const cards = deck.cards.map((c) => (c === entry ? { ...c, count } : c));
  return { ...deck, cards };
}

/**
 * Re-run tag detection across every card in a deck. Manual tags survive.
 */
export function retag(cards) {
  const cardNames = new Set(cards.map((c) => lc(c.name)));
  return cards.map((c) => {
    if (!c.scryfall) return c;
    const auto = detectTags(c.scryfall, cardNames);
    const manual = (c.tags || []).filter((t) => !AUTO_TAGS.has(t) && !t.startsWith('Tribal:'));
    return { ...c, tags: [...new Set([...auto, ...manual])] };
  });
}

/**
 * Set/replace manual tags on a single card entry.
 */
export function setCardTags(deck, entry, tags) {
  const cards = deck.cards.map((c) => (c === entry ? { ...c, tags } : c));
  return { ...deck, cards };
}

// ───────────────────────────────────────────────────────────────────────────────
// Rename / duplicate / new
// ───────────────────────────────────────────────────────────────────────────────

export function renameDeck(deck, newName) {
  return { ...deck, name: newName.trim() || deck.name };
}

export function duplicateDeck(deck) {
  return {
    ...deck,
    id: 'deck_' + Date.now(),
    name: `${deck.name} (copy)`,
    created: Date.now(),
    updated: Date.now(),
    // Deep-clone cards so edits to the copy don't bleed into the original.
    cards: deck.cards.map((c) => ({ ...c, tags: [...(c.tags || [])] })),
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Export / import
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Build a Moxfield/MTGA-compatible text decklist.
 * Commander goes under "Commander", everything else under "Deck".
 */
export function exportDecklist(deck) {
  const lines = [];
  if (deck.commander) {
    lines.push('Commander');
    lines.push(`1 ${deck.commander.name}`);
    lines.push('');
  }
  lines.push('Deck');
  for (const c of deck.cards.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`${c.count} ${c.name}`);
  }
  return lines.join('\n');
}
