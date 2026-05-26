/**
 * Auto-seed deck construction. Pulls EDHREC's typical-deck data,
 * resolves cards via Scryfall, then assembles a 99 that respects a
 * curve-aware land target plus minimums for ramp / draw / removal.
 *
 * Why bother balancing? EDHREC's "top synergy" ranks by deck-specific
 * synergy score, so the raw top 99 can be ~25 lands and a card-draw
 * desert. We pull a larger pool and bucket-fill by role so the seed
 * is actually playable out of the gate.
 *
 * Returns { commander, cards, missing, summary } where `summary` is
 * the per-bucket counts (useful for the auto-seed attribution note).
 */

import { fetchRecommendations, topRecommendations } from './edhrec.js';
import { fetchCardsByName } from './scryfall.js';
import { detectTags } from './tags.js';
import { recommendByCurve } from './health.js';

const POOL_SIZE = 180;
const DRAW_TARGET = 9;
const REMOVAL_TARGET = 9;
const DECK_TOTAL = 99;

const BASIC_BY_COLOR = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
  C: 'Wastes',
};

function isLand(card) {
  return (card.type_line || '').includes('Land');
}

function categorize(card) {
  if (isLand(card)) return 'land';
  const tags = new Set(detectTags(card));
  if (tags.has('Ramp') || tags.has('Mana rock')) return 'ramp';
  if (tags.has('Card draw') || tags.has('Tutor')) return 'draw';
  if (tags.has('Targeted removal') || tags.has('Board wipe')) return 'removal';
  return 'other';
}

function avgCmcOf(cards) {
  const nonLand = cards.filter((c) => !isLand(c));
  if (nonLand.length === 0) return 3.0;
  return nonLand.reduce((s, c) => s + (c.cmc ?? 0), 0) / nonLand.length;
}

function entryFor(card, count = 1) {
  return { name: card.name, count, scryfall: card };
}

function totalLandSlots(entries) {
  return entries.reduce((s, e) => (isLand(e.scryfall) ? s + e.count : s), 0);
}

function totalSlots(entries) {
  return entries.reduce((s, e) => s + e.count, 0);
}

export async function buildSeededDeck(commander, onProgress) {
  if (!commander?.name) {
    return { commander: null, cards: [], missing: ['no commander'], summary: null };
  }
  onProgress?.(`Fetching EDHREC recs for ${commander.name}...`);
  const recs = await fetchRecommendations(commander.name);
  if (!recs) {
    return { commander, cards: [], missing: ['EDHREC has no page for this commander'], summary: null };
  }
  // Pull a bigger pool than 99 so we have spares to fill each category.
  const top = topRecommendations(recs, new Set([commander.name.toLowerCase()]), POOL_SIZE);
  const names = top.map((r) => r.name);
  if (names.length === 0) {
    return { commander, cards: [], missing: ['no recommendations'], summary: null };
  }
  onProgress?.(`Fetching ${names.length} cards from Scryfall...`);
  const { results, notFound } = await fetchCardsByName(names, onProgress);
  // Preserve EDHREC's synergy ordering — `names` is already sorted.
  const pool = names
    .map((n) => results[n.toLowerCase()])
    .filter(Boolean);

  // Bucket by role. Each bucket stays in EDHREC's synergy order so
  // `.shift()` picks the most-synergistic candidate first.
  const buckets = { land: [], ramp: [], draw: [], removal: [], other: [] };
  for (const card of pool) buckets[categorize(card)].push(card);

  // Curve-aware targets.
  const sample = pool.slice(0, 60);
  const avgCmc = avgCmcOf(sample);
  const curve = recommendByCurve(avgCmc);
  const targets = {
    lands: curve.land.ideal[1],
    ramp: curve.ramp.ideal[1],
    draw: DRAW_TARGET,
    removal: REMOVAL_TARGET,
  };

  onProgress?.(`Balancing — target ${targets.lands} lands, ${targets.ramp} ramp, ${targets.draw} draw, ${targets.removal} removal...`);

  const entries = [];
  const summary = { lands: 0, ramp: 0, draw: 0, removal: 0, other: 0, basics: 0 };

  // Fill priority buckets in order. Each `add` consumes a slot from
  // the 99-card budget, so check the budget before grabbing.
  const addFromBucket = (key, target) => {
    while (totalSlots(entries) < DECK_TOTAL && buckets[key].length > 0 && summary[key] < target) {
      entries.push(entryFor(buckets[key].shift()));
      summary[key]++;
    }
  };
  addFromBucket('land', targets.lands);
  addFromBucket('ramp', targets.ramp);
  addFromBucket('draw', targets.draw);
  addFromBucket('removal', targets.removal);

  // Fill remaining slots with synergy / strategy cards. Pull from
  // `other` first (the actual strategy fillers), then dip into the
  // category overflows in case the user rolled a commander whose
  // top picks are mostly utility.
  const overflow = [
    ...buckets.other,
    ...buckets.ramp,
    ...buckets.draw,
    ...buckets.removal,
    ...buckets.land,
  ];
  while (totalSlots(entries) < DECK_TOTAL && overflow.length > 0) {
    const card = overflow.shift();
    entries.push(entryFor(card));
    summary.other++;
  }

  // Pad lands with basics if EDHREC didn't deliver enough nonbasics.
  // Distributed round-robin across the commander's color identity so
  // pip ratios stay roughly even — good enough for an auto-seed
  // starting point that the user can tune.
  let landSlots = totalLandSlots(entries);
  if (landSlots < targets.lands) {
    const missingLands = Math.min(
      targets.lands - landSlots,
      DECK_TOTAL - totalSlots(entries) + (targets.lands - landSlots)
    );
    if (missingLands > 0) {
      onProgress?.(`Padding ${missingLands} basic lands...`);
      const identity = (commander.color_identity || []).filter((c) => 'WUBRG'.includes(c));
      const basicNames = identity.length === 0
        ? [BASIC_BY_COLOR.C]
        : identity.map((c) => BASIC_BY_COLOR[c]);
      const { results: basicResults } = await fetchCardsByName(basicNames);
      // Make room for basics — if we already hit 99, drop the
      // lowest-priority synergy fillers (the last 'other' entries)
      // to free slots.
      let need = missingLands;
      while (need > 0 && totalSlots(entries) >= DECK_TOTAL) {
        // Drop a non-priority filler from the tail.
        const idx = [...entries].reverse().findIndex((e) => categorize(e.scryfall) === 'other');
        if (idx < 0) break;
        const realIdx = entries.length - 1 - idx;
        entries.splice(realIdx, 1);
        summary.other--;
        // We freed one slot; keep going until we've made enough room.
      }
      const distribution = {};
      for (let i = 0; i < need; i++) {
        const name = basicNames[i % basicNames.length];
        distribution[name] = (distribution[name] || 0) + 1;
      }
      for (const [name, count] of Object.entries(distribution)) {
        const card = basicResults[name.toLowerCase()];
        if (!card) continue;
        entries.push(entryFor(card, count));
        summary.basics += count;
      }
    }
  }

  return { commander, cards: entries, missing: notFound, summary };
}
