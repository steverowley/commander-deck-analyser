import {
  TAG_PATTERNS, TYPE_TAGS, GAME_CHANGERS, MLD_CARDS,
  EXTRA_TURN_CARDS, WIN_CONDITION_CARDS,
} from './constants.js';
import { COMBO_INDEX } from './combos.js';
import { lc } from './utils.js';

/**
 * Inspect a card and return the list of tags it qualifies for.
 * deckCardNames is a Set of all lowercase card names already in the deck;
 * it's used to mark cards as "Combo piece" when their partner is present.
 */
export function detectTags(card, deckCardNames = new Set()) {
  const tags = new Set();
  const oracle =
    (card.oracle_text || '') + ' ' +
    ((card.card_faces || []).map((f) => f.oracle_text || '').join(' '));
  const typeLine = card.type_line || '';
  const name = lc(card.name);

  for (const t of TYPE_TAGS) if (typeLine.includes(t)) tags.add(t);

  if (typeLine.includes('Creature') || typeLine.includes('Tribal')) {
    const subMatch = typeLine.match(/—\s*(.+?)(?:\s*\/\/|$)/);
    if (subMatch) {
      for (const sub of subMatch[1].split(/\s+/)) {
        if (sub && sub.length > 2) tags.add(`Tribal: ${sub}`);
      }
    }
  }

  for (const [tag, patterns] of Object.entries(TAG_PATTERNS)) {
    for (const p of patterns) {
      if (p.test(oracle)) { tags.add(tag); break; }
    }
  }

  if (typeLine.includes('Equipment')) tags.add('Equipment');
  if (typeLine.includes('Aura')) tags.add('Aura');
  if (typeLine.includes('Vehicle')) tags.add('Vehicle');

  if (GAME_CHANGERS.has(name)) tags.add('Game Changer');
  if (MLD_CARDS.has(name)) tags.add('Mass Land Destruction');
  if (EXTRA_TURN_CARDS.has(name)) tags.add('Extra Turn');
  if (WIN_CONDITION_CARDS.has(name)) tags.add('Win condition');

  for (const combo of COMBO_INDEX) {
    const lcCards = combo.cards.map((n) => lc(n));
    const idx = lcCards.indexOf(name);
    if (idx === -1) continue;
    // All *other* required cards from the combo must be in the deck for
    // this card to be tagged as a combo piece.
    const partnersPresent = lcCards.every((n, i) => i === idx || deckCardNames.has(n));
    if (partnersPresent) {
      tags.add('Combo piece');
      // Assembled combo pieces are wincons by definition — every entry
      // in COMBO_INDEX has a `results` block that ends the game.
      tags.add('Win condition');
      break;
    }
  }

  // Lands tapping for mana isn't "ramp" in the EDH-deckbuilding sense
  // — that role belongs to spells/permanents that put you ahead on
  // mana relative to your land count. Without this filter every basic
  // and most utility lands also pick up the Ramp / Mana rock tags
  // (they all match `{T}: Add {X}` in TAG_PATTERNS), and the health
  // panel reports a deck with 36 lands as having 36+ ramp pieces.
  if (typeLine.includes('Land')) {
    tags.delete('Ramp');
    tags.delete('Mana rock');
  }
  return Array.from(tags);
}

/**
 * Set of all auto-assignable tags. Used by CardsTab to preserve user-added
 * tags when re-running detectTags on the whole deck.
 */
export const AUTO_TAGS = new Set([
  ...Object.keys(TAG_PATTERNS),
  ...TYPE_TAGS,
  'Game Changer', 'Combo piece', 'Mass Land Destruction', 'Extra Turn',
  'Win condition', 'Equipment', 'Aura', 'Vehicle',
]);
