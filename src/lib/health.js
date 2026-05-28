/**
 * Deck health score — one number that captures whether the deck has the
 * fundamentals every Commander deck needs to function: legality, the right
 * total card count, enough lands, ramp, card draw, removal, and a sane
 * curve.
 *
 * Returns { score (0-100), grade, breakdown: { ... } } where each
 * component carries its own points + a one-line note. Renderers can use
 * the breakdown to show where the deck is strong and where it's thin.
 *
 * Land + ramp recommendations scale with the deck's average CMC rather
 * than being fixed templates — a 2.0-CMC aggro deck needs fewer lands
 * + less ramp than a 4.5-CMC top-heavy deck. Bands follow the rough
 * Karsten-style guidance EDH guides converge on.
 */

import { checkDeckLegality } from './legality.js';

// Component weights track the Command Zone "New Era" template (Ep. 658):
// targeted removal doubled from 5 to 10-12 while board wipes dropped
// from 5 to 3-4. Splitting them in the health score reflects that a
// deck of nine wipes and zero spot removal is broken, not balanced.
const COMPONENTS = {
  legality:         { weight: 20, label: 'Legality' },
  size:             { weight: 5,  label: 'Size' },
  lands:            { weight: 15, label: 'Lands' },
  ramp:             { weight: 15, label: 'Ramp' },
  draw:             { weight: 15, label: 'Card draw' },
  targetedRemoval:  { weight: 10, label: 'Spot removal' },
  boardWipes:       { weight: 5,  label: 'Board wipes' },
  curve:            { weight: 15, label: 'Curve' },
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

/**
 * Curve-aware land + ramp recommendations. `ideal` is the sweet spot
 * (full points), `ok` is acceptable (partial points), anything outside
 * `ok` scores zero or minimal.
 *
 * Source: Frank Karsten's mana research + EDH builder consensus.
 * - Aggro/low-curve decks need fewer lands because they cast cheap
 *   spells and benefit less from late-game flood
 * - Top-heavy decks need more lands AND more ramp to reach their bombs
 */
export function recommendByCurve(avgCmc) {
  if (avgCmc <= 2.0) return { land: { ideal: [32, 34], ok: [30, 36] }, ramp: { ideal: [6, 9],  ok: [4, 12] } };
  if (avgCmc <= 2.5) return { land: { ideal: [34, 36], ok: [32, 38] }, ramp: { ideal: [7, 10], ok: [5, 13] } };
  if (avgCmc <= 3.0) return { land: { ideal: [35, 37], ok: [33, 39] }, ramp: { ideal: [8, 11], ok: [6, 14] } };
  if (avgCmc <= 3.5) return { land: { ideal: [36, 38], ok: [34, 40] }, ramp: { ideal: [9, 12], ok: [7, 15] } };
  if (avgCmc <= 4.0) return { land: { ideal: [38, 40], ok: [36, 42] }, ramp: { ideal: [10, 13], ok: [8, 16] } };
  return                   { land: { ideal: [40, 42], ok: [38, 44] }, ramp: { ideal: [11, 14], ok: [9, 17] } };
}

function fmtRange([lo, hi]) {
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}

export function computeHealth(deck) {
  if (!deck.cards.length) {
    return { score: 0, grade: '—', breakdown: {}, empty: true };
  }

  const legality = checkDeckLegality(deck);
  const totalCards = deck.cards.reduce((s, c) => s + c.count, 0);
  const target = deck.commander ? 99 : 100;
  const sizeDelta = totalCards - target;
  const sizeAbs = Math.abs(sizeDelta);

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
  const spotRemovalCount = countByTag(deck, 'Targeted removal');
  const boardWipeCount = countByTag(deck, 'Board wipe');

  // Curve-aware land + ramp targets.
  const rec = recommendByCurve(avgCmc);
  const landBands = [
    [rec.land.ideal[0], rec.land.ideal[1], 15],
    [rec.land.ok[0],    rec.land.ok[1],    10],
    [rec.land.ok[0] - 2, rec.land.ok[1] + 2, 5],
  ];
  const rampBands = [
    [rec.ramp.ideal[0], rec.ramp.ideal[1], 15],
    [rec.ramp.ok[0],    rec.ramp.ok[1],    10],
    [rec.ramp.ok[0] - 2, rec.ramp.ok[1] + 2, 5],
  ];

  // Don't double-penalise deck-size errors — they have their own component.
  const nonSizeErrors = legality.errors.filter((e) => !/over the legal limit/i.test(e));

  const landDirection =
    lands < rec.land.ideal[0] ? 'thin'
      : lands > rec.land.ideal[1] ? 'flooded'
      : 'within range';
  const rampDirection =
    rampCount < rec.ramp.ideal[0] ? 'light'
      : rampCount > rec.ramp.ideal[1] ? 'heavy'
      : 'within range';

  const breakdown = {
    legality: {
      ...COMPONENTS.legality,
      points: nonSizeErrors.length === 0 ? 20 : Math.max(0, 20 - nonSizeErrors.length * 7),
      note: nonSizeErrors.length === 0 ? 'No format violations' : `${nonSizeErrors.length} hard violation(s)`,
    },
    size: {
      ...COMPONENTS.size,
      points: Math.max(0, 5 - sizeAbs),
      note: sizeDelta === 0
        ? `${totalCards}/${target} — exact`
        : sizeDelta > 0
          ? `${totalCards}/${target} — ${sizeDelta} over the legal limit`
          : `${totalCards}/${target} — short by ${sizeAbs}`,
    },
    lands: {
      ...COMPONENTS.lands,
      points: bandScore(lands, landBands),
      note: `${lands} lands — ${landDirection} (aim ${fmtRange(rec.land.ideal)} for avg CMC ${avgCmc.toFixed(1)})`,
    },
    ramp: {
      ...COMPONENTS.ramp,
      points: bandScore(rampCount, rampBands),
      note: `${rampCount} ramp pieces — ${rampDirection} (aim ${fmtRange(rec.ramp.ideal)} for avg CMC ${avgCmc.toFixed(1)})`,
    },
    draw: {
      ...COMPONENTS.draw,
      points: bandScore(drawCount, [[10, 99, 15], [7, 9, 10], [4, 6, 5]]),
      note: `${drawCount} draw effects` + (drawCount < 10 ? ' — aim for 10-12' : ''),
    },
    targetedRemoval: {
      ...COMPONENTS.targetedRemoval,
      points: bandScore(spotRemovalCount, [[10, 99, 10], [7, 9, 6], [4, 6, 3]]),
      note: `${spotRemovalCount} spot removal` + (spotRemovalCount < 10 ? ' — aim for 10-12' : ''),
    },
    boardWipes: {
      ...COMPONENTS.boardWipes,
      points: bandScore(boardWipeCount, [[3, 99, 5], [1, 2, 3]]),
      note: `${boardWipeCount} board wipes` + (boardWipeCount === 0 ? ' — aim for 3-4' : boardWipeCount < 3 ? ' — light' : ''),
    },
    curve: {
      ...COMPONENTS.curve,
      points: bandScore(avgCmc, [[2.5, 3.5, 15], [2.0, 4.0, 10], [1.5, 4.5, 5]]),
      note: `avg CMC ${avgCmc.toFixed(2)}` +
        (avgCmc > 4 ? ' — top-heavy, hard to cast on curve'
          : avgCmc < 2 ? ' — very low, threats may run dry'
          : ''),
    },
  };

  const score = Object.values(breakdown).reduce((s, b) => s + b.points, 0);
  return {
    score,
    grade: gradeFor(score),
    breakdown,
    // Surface the curve-derived target so the UI can show it elsewhere
    // (Land Base advisor, Recs explainers, etc.) without re-deriving.
    recommendation: rec,
    avgCmc,
  };
}

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
