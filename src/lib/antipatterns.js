/**
 * Deckbuilding anti-pattern detection — the things experienced
 * Commander players keep harping on that the health score's
 * fundamentals don't catch.
 *
 * Each check returns null when the deck looks fine and an object
 * { id, severity, title, detail, formula? } when something looks
 * off. Callers (Stats / Health UI) collect non-null results and
 * render them.
 *
 * Severity ladder:
 *   - 'info'  — heads-up, no real penalty (e.g. minor curve drift)
 *   - 'warn'  — meaningful gap, fixable in a few card swaps
 *   - 'major' — structural issue that materially hurts the deck
 *
 * Adding a new check: write a `checkX(deck)` that returns null or
 * one warning object, then add it to `runAntipatternChecks()`.
 */

import { recommendByCurve } from './health.js';

const COLOR_PIPS = new Set(['W', 'U', 'B', 'R', 'G']);

function nonLandCards(deck) {
  return deck.cards.filter(
    (c) => c.scryfall && !c.scryfall.type_line?.includes('Land')
  );
}

function totalNonLandCount(deck) {
  return nonLandCards(deck).reduce((s, c) => s + c.count, 0);
}

function totalLandCount(deck) {
  return deck.cards
    .filter((c) => c.scryfall?.type_line?.includes('Land'))
    .reduce((s, c) => s + c.count, 0);
}

function averageCmc(deck) {
  const nonLand = nonLandCards(deck);
  const total = nonLand.reduce((s, c) => s + c.count, 0);
  if (total === 0) return 0;
  const sum = nonLand.reduce((s, c) => s + (c.scryfall.cmc || 0) * c.count, 0);
  return sum / total;
}

function colorCount(deck) {
  // Prefer the commander's color identity when present, since
  // that's the deck's actual mana ceiling. Fall back to whatever
  // identity surfaces across the spells (X spells + any-color rocks
  // can lie; that's why we prefer the commander first).
  const fromCmdr = deck.commander?.color_identity;
  if (Array.isArray(fromCmdr) && fromCmdr.length > 0) {
    return fromCmdr.filter((c) => COLOR_PIPS.has(c)).length;
  }
  const seen = new Set();
  for (const c of nonLandCards(deck)) {
    for (const ci of c.scryfall.color_identity || []) {
      if (COLOR_PIPS.has(ci)) seen.add(ci);
    }
  }
  return seen.size;
}

function countByTag(deck, tag) {
  return deck.cards.reduce((s, c) => {
    if (!c.scryfall) return s;
    return (c.tags || []).includes(tag) ? s + c.count : s;
  }, 0);
}

/**
 * Underland check — the Karsten-derived formula. "Lands < 28 + 2×colors + avg_MV - 1"
 * is the most-cited casual-deckbuilding mistake. Surfacing the formula
 * (not just "you're thin on lands") gives the user something to act on.
 *
 * Returns null when the deck's curve-aware target accepts the land
 * count — we don't double-fire on top of the existing health-score
 * land warning. The advisor speaks up only when the Karsten floor
 * is breached.
 */
export function checkUnderland(deck) {
  const lands = totalLandCount(deck);
  const avgMv = averageCmc(deck);
  const colors = colorCount(deck);
  if (avgMv === 0) return null; // empty / land-only deck — nothing to advise

  // Karsten formula floor — what every casual deck should clear.
  const target = Math.round(28 + 2 * colors + avgMv - 1);

  // Curve-aware band already covers the "fine" zone; only warn when the
  // deck is below BOTH the band's ok-low AND the Karsten floor. That
  // way a low-curve aggro deck running 32 lands with avg MV 1.8 is
  // fine (32 ≥ Karsten target ≈ 31), and the warning fires only when
  // the deck is genuinely under-landed for its curve.
  const band = recommendByCurve(avgMv).land.ok;
  if (lands >= target || lands >= band[0]) return null;

  const gap = target - lands;
  return {
    id: 'underland',
    severity: gap >= 3 ? 'major' : 'warn',
    title: `Underland — short ${gap} land${gap === 1 ? '' : 's'}`,
    detail: `${lands} lands for a ${colors}-color deck at avg MV ${avgMv.toFixed(1)}. Add ${gap} land${gap === 1 ? '' : 's'} or trim curve.`,
    formula: `28 + 2×${colors} + ${avgMv.toFixed(1)} − 1 = ${target}`,
  };
}

/**
 * Over-tutoring without targets — a deck with 6 tutors and 2 wincons
 * is tutoring for the same generic value card every time. The fix is
 * either more wincons or fewer tutors; we surface both options. Uses
 * the Tutor tag (oracle-text pattern) and the Win condition tag
 * (named-list + generic patterns + assembled-combo membership).
 */
export function checkOverTutoring(deck) {
  const tutorCount = countByTag(deck, 'Tutor');
  if (tutorCount === 0) return null;
  const winconCount = countByTag(deck, 'Win condition');
  if (tutorCount <= winconCount + 2) return null;
  const gap = tutorCount - winconCount;
  return {
    id: 'over-tutoring',
    severity: gap >= 5 ? 'major' : 'warn',
    title: `${tutorCount} tutors with only ${winconCount} win condition${winconCount === 1 ? '' : 's'}`,
    detail: `What are you tutoring for? Either add more closers or trim tutors. Tutor-to-wincon ratio: ${tutorCount}:${winconCount}.`,
  };
}

/**
 * Top-heavy curve without compensating ramp — a 4.0-MV deck with 8
 * ramp can't cast its bombs. Health score already warns about each
 * piece separately, but the derived "you're under AND over" check is
 * more actionable than two unrelated notes.
 */
export function checkCurveRampImbalance(deck) {
  const avgMv = averageCmc(deck);
  if (avgMv < 3.8) return null;
  const rampCount = countByTag(deck, 'Ramp') + countByTag(deck, 'Mana rock');
  if (rampCount >= 11) return null;
  const need = 11 - rampCount;
  return {
    id: 'curve-ramp-imbalance',
    severity: avgMv >= 4.2 && rampCount < 8 ? 'major' : 'warn',
    title: 'Top-heavy curve without enough ramp',
    detail: `avg MV ${avgMv.toFixed(2)} with only ${rampCount} ramp — add ${need} more or trim a high-MV card.`,
  };
}

/**
 * Run every check and return the non-null warnings, sorted by
 * severity so the most important issues render first.
 */
const SEVERITY_RANK = { major: 0, warn: 1, info: 2 };

export function runAntipatternChecks(deck) {
  if (!deck?.cards?.length) return [];
  const checks = [checkUnderland, checkCurveRampImbalance, checkOverTutoring];
  return checks
    .map((fn) => {
      try { return fn(deck); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));
}
