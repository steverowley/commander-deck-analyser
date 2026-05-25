/**
 * Pure deck operations — add/remove cards, rename, duplicate, export.
 *
 * These are the operations that the various tabs call. Keeping them
 * here (rather than inlined in components) means tag re-detection and
 * legality checks are consistent across the app.
 */

import { detectTags, AUTO_TAGS } from './tags.js';
import { lc } from './utils.js';
import { previewAdditions } from './legality.js';

/**
 * Add cards, honouring the deck's `strictIdentity` setting. When strict,
 * cards rejected by previewAdditions (off-colour, singleton, banned) are
 * filtered out and returned in the `rejected` array so the UI can
 * surface them. When not strict, every card is added and `rejected` is
 * empty — same shape as calling addCardsToDeck directly.
 *
 * This is the safer entry point and should be preferred over
 * addCardsToDeck everywhere new cards enter the deck (search bar, bulk
 * import, recommendations, share import).
 */
export function safeAddCards(deck, newCards) {
  if (!deck.strictIdentity) {
    return { deck: addCardsToDeck(deck, newCards), rejected: [] };
  }
  const { accepted, rejected } = previewAdditions(deck, newCards);
  return { deck: addCardsToDeck(deck, accepted), rejected };
}

/**
 * Set/replace a card's user note. Note is a short free-text string the
 * user can attach to explain why a card is in the deck.
 */
export function setCardNote(deck, entry, note) {
  const cards = deck.cards.map((c) => (c === entry ? { ...c, note } : c));
  return { ...deck, cards };
}

/**
 * Toggle strict color-identity mode on or off for a deck.
 */
export function setStrictIdentity(deck, strict) {
  return { ...deck, strictIdentity: !!strict };
}

/**
 * Set the deck's free-text notes field — used as a scratchpad for the
 * builder. Soft-capped at 2000 chars so it stays storage-friendly.
 */
export function setDeckNotes(deck, notes) {
  return { ...deck, notes: (notes || '').slice(0, 2000) };
}

/**
 * Toggle a deck's public flag. Only meaningful when the cloud backend
 * is active; on local storage the field is just along for the ride.
 */
export function setDeckPublic(deck, isPublic) {
  return { ...deck, is_public: !!isPublic };
}

// ───────────────────────────────────────────────────────────────────────────────
// Wishlist — cards held aside while you decide whether to slot them in.
// Doesn't count toward legality, stats, or the 100-card cap.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Add cards to the deck's wishlist (creating it if missing). Cards
 * already present in the wishlist have their count incremented.
 * Cards already present in the deck's main list are silently ignored —
 * the wishlist is for cards you haven't committed to yet.
 */
export function addToWishlist(deck, newCards) {
  const wishlist = (deck.wishlist || []).map((c) => ({ ...c }));
  const deckNames = new Set(deck.cards.map((c) => lc(c.name)));
  for (const nc of newCards) {
    if (deckNames.has(lc(nc.name))) continue;
    const existing = wishlist.find((c) => lc(c.name) === lc(nc.name));
    if (existing) existing.count = Math.min(99, existing.count + nc.count);
    else wishlist.push({ ...nc });
  }
  return { ...deck, wishlist };
}

export function removeFromWishlist(deck, name) {
  const wishlist = (deck.wishlist || []).filter((c) => lc(c.name) !== lc(name));
  return { ...deck, wishlist };
}

/**
 * Move a wishlist card into the deck. Removes from wishlist, adds to
 * cards, re-tags so combo detection works.
 */
export function promoteFromWishlist(deck, name) {
  const wishlist = deck.wishlist || [];
  const entry = wishlist.find((c) => lc(c.name) === lc(name));
  if (!entry) return deck;
  const remaining = wishlist.filter((c) => lc(c.name) !== lc(name));
  const withWishlist = { ...deck, wishlist: remaining };
  return addCardsToDeck(withWishlist, [{ name: entry.name, count: entry.count, scryfall: entry.scryfall }]);
}

/**
 * Move a deck card out to the wishlist. Useful for "thinking about
 * cutting this" without committing to the cut yet.
 */
export function demoteToWishlist(deck, name) {
  const entry = deck.cards.find((c) => lc(c.name) === lc(name));
  if (!entry) return deck;
  const withoutCard = removeCardFromDeck(deck, name);
  return addToWishlist(withoutCard, [{ name: entry.name, count: entry.count, scryfall: entry.scryfall }]);
}

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
