/**
 * Aggregate stats across the entire archive — what gets summarised on
 * the landing-page dashboard when there are multiple decks.
 *
 * Returns:
 *   {
 *     deckCount, cardCount, totalPrice, totalPriceUnpriced,
 *     bracketHistogram: [n1, n2, n3, n4, n5],   // counts at each bracket
 *     colorHistogram: { W, U, B, R, G, C },     // # decks running each colour
 *     avgHealth,
 *     archetypeHistogram: [{ name, count }],    // top archetypes
 *     mostRecent: deck | null,
 *   }
 */

import { assessBracket } from './analyzers.js';
import { computeHealth } from './health.js';
import { classifyArchetype } from './strategy.js';
import { deckTotalPrice } from './pricing.js';

export function aggregateStats(decks) {
  const result = {
    deckCount: decks.length,
    cardCount: 0,
    totalPrice: 0,
    totalPriceUnpriced: 0,
    bracketHistogram: [0, 0, 0, 0, 0],
    colorHistogram: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    avgHealth: 0,
    archetypeHistogram: [],
    mostRecent: null,
  };
  if (decks.length === 0) return result;

  let healthSum = 0;
  let healthCount = 0;
  const archetypeCounts = new Map();
  let recent = null;

  for (const d of decks) {
    result.cardCount += d.cards.reduce((s, c) => s + c.count, 0);

    // Price
    const price = deckTotalPrice(d);
    result.totalPrice += price.total;
    result.totalPriceUnpriced += price.unpriced;

    // Bracket — only meaningful with cards present
    if (d.cards.length > 0) {
      const b = assessBracket(d).bracket;
      if (b >= 1 && b <= 5) result.bracketHistogram[b - 1]++;

      const h = computeHealth(d);
      if (!h.empty) {
        healthSum += h.score;
        healthCount++;
      }

      const archetype = classifyArchetype(d).primary;
      if (archetype) {
        archetypeCounts.set(archetype.name, (archetypeCounts.get(archetype.name) || 0) + 1);
      }
    }

    // Color identity histogram. Colorless commander = bumps C.
    const id = d.commander?.color_identity || [];
    if (id.length === 0 && d.commander) result.colorHistogram.C++;
    for (const c of id) {
      if (c in result.colorHistogram) result.colorHistogram[c]++;
    }

    if (!recent || (d.updated || 0) > (recent.updated || 0)) {
      recent = d;
    }
  }

  result.avgHealth = healthCount > 0 ? Math.round(healthSum / healthCount) : 0;
  result.archetypeHistogram = Array.from(archetypeCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  result.mostRecent = recent;

  return result;
}
