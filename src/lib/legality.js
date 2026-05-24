/**
 * Commander deck legality checks. These are advisory (warnings shown in UI)
 * rather than enforcement — the user may want to compose a deck before
 * setting a commander, or import a partial decklist with duplicates.
 *
 * Three checks:
 *   - singleton (only one copy of each card except basic lands)
 *   - color identity (every card must fit commander's color identity)
 *   - deck size (commander + 99 = 100)
 */

import { lc } from './utils.js';
import { BANNED_CARDS } from './constants.js';

const BASIC_LANDS = new Set([
  'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
  'snow-covered mountain', 'snow-covered forest', 'snow-covered wastes',
]);

export function isBasicLand(card) {
  if (!card?.name) return false;
  if (BASIC_LANDS.has(lc(card.name))) return true;
  // Type-line fallback: "Basic Land — Plains" etc.
  return /Basic Land/i.test(card.type_line || '');
}

/**
 * Validate a card's color identity fits inside the commander's.
 * Returns { ok, violation } where violation is the offending colors.
 */
export function checkColorIdentity(card, commander) {
  if (!commander) return { ok: true };
  const cmdrColors = new Set(commander.color_identity || []);
  const cardColors = card.color_identity || [];
  const violation = cardColors.filter((c) => !cmdrColors.has(c));
  return { ok: violation.length === 0, violation };
}

/**
 * Check for duplicate non-basic cards across the deck.
 * Returns an array of { name, count } entries that violate singleton.
 */
export function checkSingletonViolations(deck) {
  return deck.cards
    .filter((c) => c.scryfall && !isBasicLand(c.scryfall) && c.count > 1)
    .map((c) => ({ name: c.name, count: c.count }));
}

/**
 * Total card count (excluding commander). A legal commander deck is
 * exactly 99 + 1 = 100.
 */
export function deckSize(deck) {
  return deck.cards.reduce((s, c) => s + (c.count || 0), 0);
}

/**
 * Bundle all legality checks into a single report.
 * Returns { errors: [...], warnings: [...] } so the UI can surface them.
 *
 * Errors are hard violations of the format. Warnings are best-practice
 * issues (over/under deck size, deck has no commander yet, etc.).
 */
export function checkDeckLegality(deck) {
  const errors = [];
  const warnings = [];
  // Structured per-issue data so a richer UI can render card-level
  // lists without re-running the checks. Each entry: { cards: [...] }.
  const issues = {
    singleton: [],   // [{ name, count }]
    offColor: [],    // [{ name, violation: ['U','G'] }]
    banned: [],      // [name]
    size: null,      // { current, target, over: bool }
  };

  const size = deckSize(deck);
  const target = deck.commander ? 99 : 100;
  if (size !== target) {
    issues.size = { current: size, target, over: size > target };
  }
  if (size > target) {
    errors.push(`Deck is ${size - target} card(s) over the legal limit (${size}/${target}).`);
  } else if (size > 0 && size < target) {
    warnings.push(`Deck has ${size}/${target} cards.`);
  }

  if (!deck.commander && size > 0) {
    warnings.push('No commander selected. Color-identity rules cannot be enforced until one is set.');
  }

  const dupes = checkSingletonViolations(deck);
  issues.singleton = dupes;
  if (dupes.length > 0) {
    errors.push(
      `Singleton violation: ${dupes.map((d) => `${d.name} ×${d.count}`).join(', ')}.`
    );
  }

  const banned = checkBannedCards(deck);
  issues.banned = banned;
  if (banned.length > 0) {
    errors.push(`Banned in Commander: ${banned.join(', ')}.`);
  }

  if (deck.commander) {
    const offColor = deck.cards
      .filter((c) => c.scryfall)
      .map((c) => ({ card: c, check: checkColorIdentity(c.scryfall, deck.commander) }))
      .filter((x) => !x.check.ok);
    issues.offColor = offColor.map((x) => ({ name: x.card.name, violation: x.check.violation }));
    if (offColor.length > 0) {
      errors.push(
        `Color identity violation: ${offColor.map((x) => `${x.card.name} (${x.check.violation.join('')})`).join(', ')}.`
      );
    }
  }

  return { errors, warnings, size, target, banned, issues };
}

/**
 * Return names of any cards in the deck that appear on the Commander
 * banned list. Checks the commander as well — banned commanders are
 * banned commanders.
 */
export function checkBannedCards(deck) {
  const hits = [];
  for (const c of deck.cards) {
    if (c.scryfall && BANNED_CARDS.has(lc(c.scryfall.name))) {
      hits.push(c.scryfall.name);
    }
  }
  if (deck.commander && BANNED_CARDS.has(lc(deck.commander.name))) {
    hits.push(deck.commander.name);
  }
  return hits;
}

/**
 * Filter a batch of incoming card adds against the current deck. Returns
 * { accepted, rejected } where rejected entries have a reason string.
 *
 * This is the gate used by CardsTab and the Recommendations tab before
 * a card gets merged into the deck. Singleton and color-identity are
 * surfaced as warnings; nothing is hard-blocked so the user can override.
 */
export function previewAdditions(deck, newCards) {
  const accepted = [];
  const rejected = [];
  const present = new Set(
    deck.cards.filter((c) => c.scryfall).map((c) => lc(c.name))
  );
  if (deck.commander) present.add(lc(deck.commander.name));

  for (const nc of newCards) {
    const card = nc.scryfall;
    if (!card) {
      accepted.push(nc);
      continue;
    }
    const reasons = [];
    if (!isBasicLand(card) && (present.has(lc(nc.name)) || nc.count > 1)) {
      reasons.push('singleton');
    }
    if (BANNED_CARDS.has(lc(card.name))) {
      reasons.push('banned');
    }
    if (deck.commander) {
      const ci = checkColorIdentity(card, deck.commander);
      if (!ci.ok) reasons.push(`off-color (${ci.violation.join('')})`);
    }
    if (reasons.length > 0) rejected.push({ ...nc, reasons });
    else {
      accepted.push(nc);
      present.add(lc(nc.name));
    }
  }
  return { accepted, rejected };
}
