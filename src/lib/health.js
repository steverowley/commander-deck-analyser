/**
 * Deck health score — one number that captures whether the deck has the
 * fundamentals every Commander deck needs to function: enough lands, ramp,
 * card draw, removal, a sane curve, and basic legality.
 *
 * Returns { score (0-100), grade, breakdown: { ... } } where each
 * component carries its own points + a one-line note. Renderers can use
 * the breakdown to show where the deck is strong and where it's thin.
 *
 * The components are deliberately conservative — these are the heuristics
 * EDH guides agree on, not personal taste. A score of 100 means the deck
 * looks complete on paper; it doesn't guarantee the strategy is good.
 */

import { checkDeckLegality } from './legality.js';

const COMPONENTS = {
  legality: { weight: 25, label: 'Legality' },
  lands:    { weight: 15, label: 'Lands' },
  ramp:     { weight: 15, label: 'Ramp' },
  draw:     { weight: 15, label: 'Card draw' },
  removal:  { weight: 15, label: 'Removal' },
  curve:    { weight: 15, label: 'Curve' },
};

function countByTag(deck, ...tagsAny) {
  const want = new Set(tagsAny);
  return deck.cards.reduce((s, c) => {
    if (!c.scryfall) return s;
    const has = (c.tags || []).some((t) => want.has(t));
    return has ? s + c.count : s;
  }, 0);
}

function bandScore(value, bands) {
  // bands: array of [lo, hi, points], evaluated in order.
  for (const [lo, hi, p] of bands) if (value >= lo && value <= hi) return p;
  return 0;
}

export function computeHealth(deck) {
  if (!deck.cards.length) {
    return { score: 0, grade: '—', breakdown: {}, empty: true };
  }

  const legality = checkDeckLegality(deck);
  const totalCards = deck.cards.reduce((s, c) => s + c.count, 0);
  const lands = deck.cards
    .filter((c) => c.scryfall?.type_line?.includes('Land'))
    .reduce((s, c) => s + c.count, 0);
  const nonLand = totalCards - lands;
  const totalCmc = deck.cards
    .filter((c) => c.scryfall && !c.scryfall.type_line?.includes('Land'))
    .reduce((s, c) => s + (c.scryfall.cmc || 0) * c.count, 0);
  const avgCmc = nonLand > 0 ? totalCmc / nonLand : 0;

  const rampCount = countByTag(deck, 'Ramp', 'Mana rock');
  const drawCount = countByTag(deck, 'Card draw');
  const removalCount = countByTag(deck, 'Targeted removal', 'Board wipe');

  const breakdown = {
    legality: {
      ...COMPONENTS.legality,
      points: legality.errors.length === 0 ? 25 : Math.max(0, 25 - legality.errors.length * 8),
      note: legality.errors.length === 0
        ? 'No format violations'
        : `${legality.errors.length} hard violation(s)`,
    },
    lands: {
      ...COMPONENTS.lands,
      points: bandScore(lands, [[36, 38, 15], [33, 39, 10], [30, 42, 5]]),
      note: `${lands} lands` +
        (lands >= 36 && lands <= 38 ? ' — within range'
          : lands < 33 ? ' — thin, aim for 36-38'
          : lands > 40 ? ' — flooded, trim a few'
          : ' — close to ideal'),
    },
    ramp: {
      ...COMPONENTS.ramp,
      points: bandScore(rampCount, [[8, 14, 15], [6, 16, 10], [4, 18, 5]]),
      note: `${rampCount} ramp pieces` + (rampCount < 8 ? ' — light, aim for 8-12' : rampCount > 14 ? ' — heavy' : ''),
    },
    draw: {
      ...COMPONENTS.draw,
      points: bandScore(drawCount, [[10, 99, 15], [7, 99, 10], [4, 99, 5]]),
      note: `${drawCount} draw effects` + (drawCount < 7 ? ' — thin, aim for 8-10' : ''),
    },
    removal: {
      ...COMPONENTS.removal,
      points: bandScore(removalCount, [[10, 99, 15], [7, 99, 10], [4, 99, 5]]),
      note: `${removalCount} removal pieces` + (removalCount < 7 ? ' — thin, aim for 8-10 mixed' : ''),
    },
    curve: {
      ...COMPONENTS.curve,
      points: bandScore(avgCmc, [[2.5, 3.5, 15], [2.0, 4.0, 10], [1.5, 4.5, 5]]),
      note: `avg CMC ${avgCmc.toFixed(2)}` +
        (avgCmc > 4 ? ' — top-heavy' : avgCmc < 2 ? ' — very low' : ''),
    },
  };

  const score = Object.values(breakdown).reduce((s, b) => s + b.points, 0);
  return { score, grade: gradeFor(score), breakdown };
}

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
