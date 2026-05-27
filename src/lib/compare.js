/**
 * Pairwise deck comparison. Pure data — UI renders the result.
 *
 * Returns:
 *   {
 *     a, b,                 // copies of input decks for reference
 *     bracket: { a, b },
 *     health: { a, b },
 *     pips: { a, b },       // { W, U, B, R, G, C, total }
 *     curve: { a, b },      // [0..7+] CMC histogram, non-lands
 *     shared,               // [{ name, countA, countB }]
 *     uniqueA, uniqueB,     // [{ name, count }]
 *     overlapPct,           // share of cards in common (jaccard-ish)
 *     priceDelta,           // a.total - b.total in USD
 *   }
 */

import { assessBracket } from './analyzers.js';
import { computeHealth } from './health.js';
import { pipDistribution } from './landbase.js';
import { deckTotalPrice, activePriceSource } from './pricing.js';
import { lc } from './utils.js';

function curveOf(deck) {
  const curve = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const c of deck.cards) {
    if (!c.scryfall) continue;
    if (c.scryfall.type_line?.includes('Land')) continue;
    const cmc = Math.min(7, Math.floor(c.scryfall.cmc || 0));
    curve[cmc] += c.count;
  }
  return curve;
}

export function compareDecks(a, b) {
  const namesA = new Map();
  const namesB = new Map();
  for (const c of a.cards) if (c.scryfall) namesA.set(lc(c.name), c.count);
  for (const c of b.cards) if (c.scryfall) namesB.set(lc(c.name), c.count);

  const shared = [];
  const uniqueA = [];
  const uniqueB = [];

  for (const [key, count] of namesA) {
    if (namesB.has(key)) {
      // Find a display name from either deck.
      const card = a.cards.find((c) => lc(c.name) === key);
      shared.push({ name: card.name, countA: count, countB: namesB.get(key) });
    } else {
      const card = a.cards.find((c) => lc(c.name) === key);
      uniqueA.push({ name: card.name, count });
    }
  }
  for (const [key, count] of namesB) {
    if (!namesA.has(key)) {
      const card = b.cards.find((c) => lc(c.name) === key);
      uniqueB.push({ name: card.name, count });
    }
  }

  const union = namesA.size + namesB.size - shared.length;
  const overlapPct = union > 0 ? shared.length / union : 0;

  // Capture the price source once so both decks are quoted from the
  // same feed even if settings flip between the two reads.
  const vendor = activePriceSource();
  const priceA = deckTotalPrice(a, 'usd', null, vendor).total;
  const priceB = deckTotalPrice(b, 'usd', null, vendor).total;

  return {
    a, b,
    bracket: { a: assessBracket(a).bracket, b: assessBracket(b).bracket },
    health: { a: computeHealth(a), b: computeHealth(b) },
    pips: { a: pipDistribution(a), b: pipDistribution(b) },
    curve: { a: curveOf(a), b: curveOf(b) },
    shared: shared.sort((x, y) => x.name.localeCompare(y.name)),
    uniqueA: uniqueA.sort((x, y) => x.name.localeCompare(y.name)),
    uniqueB: uniqueB.sort((x, y) => x.name.localeCompare(y.name)),
    overlapPct,
    priceDelta: priceA - priceB,
    prices: { a: priceA, b: priceB },
  };
}
