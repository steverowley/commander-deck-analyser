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

export function aggregateStats(decks, currency = 'usd') {
  const result = {
    deckCount: decks.length,
    cardCount: 0,
    totalPrice: 0,
    totalPriceUnpriced: 0,
    bracketHistogram: [0, 0, 0, 0, 0],
    colorHistogram: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    identityHistogram: [], // [{ key: 'WBR', name: 'Mardu', colors: ['W','B','R'], count }]
    avgHealth: 0,
    archetypeHistogram: [],
    mostRecent: null,
  };
  if (decks.length === 0) return result;

  let healthSum = 0;
  let healthCount = 0;
  const archetypeCounts = new Map();
  const identityCounts = new Map(); // key → { name, colors, count }
  let recent = null;

  for (const d of decks) {
    result.cardCount += d.cards.reduce((s, c) => s + c.count, 0);

    // Price — honour the active currency setting so the dashboard total
    // matches what each archive deck-card shows.
    const price = deckTotalPrice(d, currency);
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

    // Identity-combo histogram: group decks by their commander's full
    // colour identity. Mono-W, Azorius, Esper, Mardu etc. all bucket
    // distinctly. Decks without a commander are skipped.
    if (d.commander) {
      const colors = id.filter((c) => ['W', 'U', 'B', 'R', 'G'].includes(c));
      const key = colors.length === 0 ? 'C' : sortIdentity(colors).join('');
      const existing = identityCounts.get(key);
      if (existing) existing.count++;
      else identityCounts.set(key, { key, name: identityName(colors), colors, count: 1 });
    }

    if (!recent || (d.updated || 0) > (recent.updated || 0)) {
      recent = d;
    }
  }

  result.avgHealth = healthCount > 0 ? Math.round(healthSum / healthCount) : 0;
  result.archetypeHistogram = Array.from(archetypeCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  result.identityHistogram = Array.from(identityCounts.values())
    .sort((a, b) => b.count - a.count);
  result.mostRecent = recent;

  return result;
}

// ───────────────────────────────────────────────────────────────────────────────
// Colour-identity → standard MTG combo names (Azorius, Mardu, Esper…)

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

function sortIdentity(colors) {
  return colors.slice().sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b));
}

const COMBO_NAMES = {
  '': 'Colorless',
  // Mono
  W: 'Mono-White', U: 'Mono-Blue', B: 'Mono-Black', R: 'Mono-Red', G: 'Mono-Green',
  // Guilds (2-colour)
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya',
  WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  // Shards (3-colour, contiguous)
  GWU: 'Bant', WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya',
  // Wedges (3-colour, opposite + neighbours)
  WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
  // 4-colour
  WUBR: 'Yore-Tiller', UBRG: 'Glint-Eye', WBRG: 'Dune-Brood', WURG: 'Ink-Treader', WUBG: 'Witch-Maw',
  // 5-colour
  WUBRG: 'Five-Color',
};

export function identityName(colors) {
  const key = colors.length === 0 ? '' : sortIdentity(colors).join('');
  return COMBO_NAMES[key] || `${colors.length}-Color`;
}
