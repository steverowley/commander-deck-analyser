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


/* ─── Goodstuff-pile detection (#134) ─────────────────────────────────── */

// Theme tags per archetype — mirrors the signature tags each
// classifier score function rewards in strategy.js. 'midrange' is
// curve-based (no theme tags), so density is unmeasurable for it;
// 'spellslinger' counts instants/sorceries by type; 'tribal' matches
// any 'Tribal:' tag.
const ARCHETYPE_THEME_TAGS = {
  tokens: ['Token producer', 'Token doubler', 'Anthem'],
  voltron: ['Equipment', 'Aura', 'Protection'],
  combo: ['Combo piece', 'Tutor'],
  control: ['Board wipe', 'Targeted removal', 'Counterspell'],
  reanimator: ['Reanimation', 'Recursion', 'Discard'],
  aristocrats: ['Sacrifice outlet', 'Death trigger', 'Token producer'],
  aggro: ['Haste enabler', 'Combat trigger', 'Anthem'],
  stax: ['Stax piece', 'Mass Land Destruction'],
  'group-hug': ['Group hug'],
  theft: ['Theft', 'Sacrifice outlet'],
  'self-mill': ['Self-mill', 'Reanimation', 'Recursion'],
  counters: ['Counters matter', '+1/+1 counters'],
};

const ARCHETYPE_NAMES = {
  tokens: 'Token Swarm', voltron: 'Voltron', combo: 'Combo', control: 'Control',
  reanimator: 'Reanimator', aristocrats: 'Aristocrats', aggro: 'Aggro', stax: 'Stax',
  'group-hug': 'Group Hug', theft: 'Theft', 'self-mill': 'Self-Mill', counters: '+1/+1 Counters',
};

function cardMatchesTheme(card, archetypeId, themeTags) {
  const tags = card.tags || [];
  if (archetypeId === 'tribal') return tags.some((t) => t.startsWith('Tribal:'));
  if (archetypeId === 'spellslinger') {
    const tl = card.scryfall?.type_line || '';
    return /Instant|Sorcery/i.test(tl) || tags.includes('Burn');
  }
  return tags.some((t) => themeTags.includes(t));
}

/**
 * Goodstuff-pile warning (#134): a deck whose primary archetype is
 * detectable but where under 30% of non-land cards actually carry the
 * theme is a pile of staples, not a deck that "does the thing".
 * Returns null when no archetype is confidently detected (no baseline
 * to measure against) or on small partial decks.
 */
export function checkGoodstuff(deck) {
  const nonLand = nonLandCards(deck);
  const total = nonLand.reduce((s, c) => s + c.count, 0);
  if (total < 40) return null; // partial deck — density not meaningful yet
  // Baseline from TAG EVIDENCE only. classifyArchetype's curve/type
  // terms (midrange mid-CMC counts, aggro creature counts) would
  // nominate themes the deck shows zero tagged investment in, and an
  // untagged pile would "fail" a theme nobody chose. We pick the
  // archetype with the most theme-tagged cards; fewer than 8 aligned
  // cards is no baseline at all.
  const candidates = [
    ...Object.keys(ARCHETYPE_THEME_TAGS).map((id) => ({ id, name: ARCHETYPE_NAMES[id] })),
    { id: 'tribal', name: 'Tribal' },
    { id: 'spellslinger', name: 'Spellslinger' },
  ];
  let best = null;
  for (const cand of candidates) {
    const aligned = nonLand
      .filter((c) => cardMatchesTheme(c, cand.id, ARCHETYPE_THEME_TAGS[cand.id] || []))
      .reduce((s, c) => s + c.count, 0);
    if (!best || aligned > best.aligned) best = { ...cand, aligned };
  }
  if (!best || best.aligned < 8) return null; // no measurable theme investment
  const density = best.aligned / total;
  if (density >= 0.3) return null;
  const pct = Math.round(density * 100);
  return {
    id: 'goodstuff-pile',
    severity: density < 0.2 ? 'major' : 'warn',
    title: `Goodstuff pile risk — ${pct}% theme density`,
    detail: `Only ${best.aligned} of ${total} non-land cards align with your ${best.name} theme (${pct}%). Aim for 30%+ so the deck does the thing instead of being a pile of staples.`,
    formula: `${best.aligned} theme / ${total} non-land = ${pct}% < 30%`,
  };
}

/* ─── Effect coverage (#136) ──────────────────────────────────────────── */

// Answer types every deck needs at least one of (EDHRECast heuristic).
// Detection reads oracle text directly rather than minting six new
// auto-tags — keeps card rows free of "Removes: x" pill noise and the
// check self-contained. "Destroy/exile target permanent" counts for
// every permanent type.
const COVERAGE_TYPES = [
  { id: 'creature', label: 'creatures', re: /(destroy|exile)[^.]{0,80}creature/i, suggest: 'Swords to Plowshares / Chaos Warp' },
  { id: 'artifact', label: 'artifacts', re: /(destroy|exile)[^.]{0,80}artifact/i, suggest: 'Nature\u2019s Claim / Vandalblast' },
  { id: 'enchantment', label: 'enchantments', re: /(destroy|exile)[^.]{0,80}enchantment/i, suggest: 'Disenchant / Krosan Grip / Generous Gift' },
  { id: 'planeswalker', label: 'planeswalkers', re: /(destroy|exile)[^.]{0,80}planeswalker/i, suggest: 'Despark / Beast Within' },
  { id: 'graveyard', label: 'graveyards', re: /(exile[^.]{0,60}graveyard)|(graveyard[^.]{0,60}exile)/i, suggest: 'Bojuka Bog / Tormod\u2019s Crypt / Rest in Peace' },
];
const UNIVERSAL_RE = /(destroy|exile)[^.]{0,40}(target|each|any) (nonland )?permanent/i;

/**
 * Effect-coverage gap (#136): volume of removal is not variety of
 * removal — ten destroy-target-creature spells do nothing against a
 * problem enchantment. Counts answers per target type from oracle
 * text; warns listing the missing types with example fixes.
 */
export function checkEffectCoverage(deck) {
  if (totalNonLandCount(deck) < 40) return null; // partial deck
  const counts = Object.fromEntries(COVERAGE_TYPES.map((t) => [t.id, 0]));
  for (const c of deck.cards) {
    const oracle = c.scryfall?.oracle_text || c.scryfall?.card_faces?.map((f) => f.oracle_text).join('\n') || '';
    if (!oracle) continue;
    const universal = UNIVERSAL_RE.test(oracle);
    for (const t of COVERAGE_TYPES) {
      // Universal answers cover every permanent type but not graveyards.
      if ((t.id !== 'graveyard' && universal) || t.re.test(oracle)) counts[t.id] += c.count;
    }
  }
  const missing = COVERAGE_TYPES.filter((t) => counts[t.id] === 0);
  if (missing.length === 0) return null;
  return {
    id: 'effect-coverage',
    severity: missing.length >= 3 ? 'major' : 'warn',
    title: `No answers for ${missing.map((t) => t.label).join(', ')}`,
    detail: `Removal needs variety, not just volume. Missing coverage: ${missing
      .map((t) => `${t.label} (try ${t.suggest})`)
      .join(' \u00b7 ')}.`,
    coverage: counts,
  };
}

/**
 * Run every check and return the non-null warnings, sorted by
 * severity so the most important issues render first.
 */
const SEVERITY_RANK = { major: 0, warn: 1, info: 2 };

export function runAntipatternChecks(deck) {
  if (!deck?.cards?.length) return [];
  const checks = [checkUnderland, checkCurveRampImbalance, checkOverTutoring, checkGoodstuff, checkEffectCoverage];
  return checks
    .map((fn) => {
      try { return fn(deck); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));
}
