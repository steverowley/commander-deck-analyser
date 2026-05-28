/**
 * Land-base advisor.
 *
 * Given a deck's pip distribution, recommend basic-land counts and a
 * shortlist of utility / fixing lands that suit the commander's color
 * identity. Output is plain data — UI renders it.
 *
 * Heuristics used:
 *   - Target 37 lands (within the 36-38 EDH norm)
 *   - Reserve some land slots for utility/fixing nonbasics:
 *     0-1 colors: 2 slots, 2 colors: 6, 3 colors: 10, 4+ colors: 12
 *   - Distribute remaining basic slots proportional to pip count
 *
 * Utility-land suggestions are a hand-curated shortlist per color
 * identity bucket. They're advisory, not exhaustive.
 */

const COLOR_TO_BASIC = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

// Curve-aware land target. Mid-range default (avg CMC 3.0-3.5 needs ~37
// lands); higher curves get bumped, lower curves trimmed. Source rationale
// in lib/health.js#recommendByCurve.
import { recommendByCurve } from './health.js';

function targetLandsFor(deck) {
  const nonLand = deck.cards
    .filter((c) => c.scryfall && !c.scryfall.type_line?.includes('Land'))
    .reduce((s, c) => s + c.count, 0);
  const totalCmc = deck.cards
    .filter((c) => c.scryfall && !c.scryfall.type_line?.includes('Land'))
    .reduce((s, c) => s + (c.scryfall.cmc || 0) * c.count, 0);
  const avgCmc = nonLand > 0 ? totalCmc / nonLand : 3;
  // Pick the upper end of the ideal range — overshoot a little to leave
  // headroom for utility lands that don't always tap for the colour you
  // need.
  return recommendByCurve(avgCmc).land.ideal[1];
}

export function utilityReserve(colorCount) {
  if (colorCount <= 1) return 2;
  if (colorCount === 2) return 6;
  if (colorCount === 3) return 10;
  return 12;
}

function isLand(card) {
  return !!card?.type_line?.includes('Land');
}

function isBasicLand(card) {
  return /Basic Land/i.test(card?.type_line || '');
}

/**
 * Count mana pips by colour across the deck (cost, not type).
 * Returns { W, U, B, R, G, C, total }. Colourless pips ({C}) are
 * tracked separately so they don't force a basic-land suggestion.
 */
export function pipDistribution(deck) {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of deck.cards) {
    if (!c.scryfall) continue;
    const cost = c.scryfall.mana_cost || '';
    // Walk each brace group ("{W}", "{2}", "{W/U}", "{2/B}", "{W/P}") and
    // count any colour symbol present inside. A hybrid {W/U} contributes
    // one W AND one U pip — the cost can be paid as either, so the deck
    // needs both colours available.
    const groups = cost.match(/\{[^}]+\}/g) || [];
    for (const g of groups) {
      const inner = g.slice(1, -1);
      for (const sym of ['W', 'U', 'B', 'R', 'G', 'C']) {
        if (inner.includes(sym)) pips[sym] += c.count;
      }
    }
  }
  const total = pips.W + pips.U + pips.B + pips.R + pips.G;
  return { ...pips, total };
}

export function analyzeLandBase(deck) {
  const commanderId = deck.commander?.color_identity || [];
  const colors = commanderId.filter((c) => ['W', 'U', 'B', 'R', 'G'].includes(c));
  const colorCount = colors.length;

  // Current land snapshot
  const currentLands = deck.cards
    .filter((c) => c.scryfall && isLand(c.scryfall))
    .reduce((s, c) => s + c.count, 0);
  const currentBasics = deck.cards
    .filter((c) => c.scryfall && isBasicLand(c.scryfall))
    .reduce((s, c) => s + c.count, 0);
  const currentNonbasicLands = currentLands - currentBasics;

  const pips = pipDistribution(deck);

  // Curve-aware land target — higher CMC decks need more lands.
  const target = targetLandsFor(deck);

  // Recommended basic counts proportional to colored pips. The number
  // of basic slots is the land target minus whatever nonbasics the
  // user already runs (their existing duals, fetches, fixers eat into
  // the "non-basic" portion of the manabase). If they have fewer
  // nonbasics than the utility reserve, fall back to the reserve so
  // we still leave room for fixing.
  const utility = utilityReserve(colorCount);
  const nonbasicAllowance = Math.max(currentNonbasicLands, utility);
  const basicSlots = Math.max(0, target - nonbasicAllowance);
  const recBasics = {};
  if (pips.total === 0 && colorCount > 0) {
    // No pips computed yet but we know the identity — even split.
    const each = Math.floor(basicSlots / colorCount);
    let leftover = basicSlots - each * colorCount;
    for (const c of colors) {
      recBasics[COLOR_TO_BASIC[c]] = each + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover--;
    }
  } else if (pips.total > 0) {
    let allocated = 0;
    const ratios = colors.map((c) => ({ color: c, share: pips[c] / pips.total }));
    // Floor each, then distribute remainder by descending fractional remainder.
    const provisional = ratios.map(({ color, share }) => {
      const exact = share * basicSlots;
      return { color, exact, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    allocated = provisional.reduce((s, p) => s + p.floor, 0);
    let leftover = basicSlots - allocated;
    provisional.sort((a, b) => b.frac - a.frac);
    for (const p of provisional) {
      const give = leftover > 0 ? 1 : 0;
      recBasics[COLOR_TO_BASIC[p.color]] = p.floor + give;
      leftover -= give;
    }
  }

  // Diff: what to add / cut to hit the target.
  const currentByName = {};
  for (const c of deck.cards) {
    if (!c.scryfall) continue;
    if (isBasicLand(c.scryfall)) {
      currentByName[c.scryfall.name] = (currentByName[c.scryfall.name] || 0) + c.count;
    }
  }
  const diff = [];
  for (const [name, rec] of Object.entries(recBasics)) {
    const have = currentByName[name] || 0;
    if (have !== rec) diff.push({ name, have, recommended: rec, delta: rec - have });
  }
  // Surface basics the user has but the model didn't suggest (off-identity).
  for (const [name, have] of Object.entries(currentByName)) {
    if (!(name in recBasics)) diff.push({ name, have, recommended: 0, delta: -have });
  }

  return {
    commanderIdentity: colors,
    colorCount,
    currentLands,
    currentBasics,
    currentNonbasicLands,
    targetLands: target,
    utilityReserved: utility,
    pipDistribution: pips,
    recommendedBasics: recBasics,
    diff: diff.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    utilityLands: utilityLandsFor(colors),
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Curated utility / fixing land shortlist by colour identity
// ───────────────────────────────────────────────────────────────────────────────

const ALL_COLOR = ['Command Tower', 'Exotic Orchard', 'Path of Ancestry', 'Reflecting Pool', 'Reliquary Tower'];
const UNIVERSAL = ['Bojuka Bog', 'Strip Mine', 'Wasteland', 'Maze of Ith', 'Myriad Landscape', 'Evolving Wilds', 'Terramorphic Expanse'];

const TWO_COLOR_SHOCK = {
  WU: 'Hallowed Fountain',  WB: 'Godless Shrine',  WR: 'Sacred Foundry',  WG: 'Temple Garden',
  UB: 'Watery Grave',        UR: 'Steam Vents',      UG: 'Breeding Pool',
  BR: 'Blood Crypt',         BG: 'Overgrown Tomb',   RG: 'Stomping Ground',
};

const TWO_COLOR_CHECK = {
  WU: 'Glacial Fortress', WB: 'Isolated Chapel', WR: 'Clifftop Retreat', WG: 'Sunpetal Grove',
  UB: 'Drowned Catacomb',  UR: 'Sulfur Falls',    UG: 'Hinterland Harbor',
  BR: 'Dragonskull Summit', BG: 'Woodland Cemetery', RG: 'Rootbound Crag',
};

const TWO_COLOR_FETCH = {
  WU: 'Flooded Strand', WB: 'Marsh Flats', WR: 'Arid Mesa', WG: 'Windswept Heath',
  UB: 'Polluted Delta',  UR: 'Scalding Tarn', UG: 'Misty Rainforest',
  BR: 'Bloodstained Mire', BG: 'Verdant Catacombs', RG: 'Wooded Foothills',
};

// Triome lookups by 3-colour combo (canonical Magic naming).
const TRIOMES = {
  WUB: 'Raffine\'s Tower',     // Esper
  UBR: 'Xander\'s Lounge',     // Grixis
  BRG: 'Spara\'s Headquarters',// Wait this is wrong, fix below
  RGW: 'Jetmir\'s Garden',     // Naya
  GWU: 'Spara\'s Headquarters',// Bant
  WBG: 'Indatha Triome',       // Abzan
  URW: 'Raugrin Triome',       // Jeskai
  BGU: 'Zagoth Triome',        // Sultai
  RWB: 'Savai Triome',         // Mardu
  GUR: 'Ketria Triome',        // Temur
};
// Fix Jund (BRG):
TRIOMES.BRG = 'Ziatora\'s Proving Ground';

const SHARDS_AND_WEDGES = {
  // Shard pairs
  GWU: 'Bant', WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', RGW: 'Naya',
  // Wedges
  WBG: 'Abzan', URW: 'Jeskai', BGU: 'Sultai', RWB: 'Mardu', GUR: 'Temur',
};

function key2(a, b) {
  const order = ['W', 'U', 'B', 'R', 'G'];
  return [a, b].sort((x, y) => order.indexOf(x) - order.indexOf(y)).join('');
}

function key3(arr) {
  // Triomes use a specific arrangement; canonicalise by sorting WUBRG.
  const order = ['W', 'U', 'B', 'R', 'G'];
  const sorted = arr.slice().sort((x, y) => order.indexOf(x) - order.indexOf(y));
  // Build all rotations and match against TRIOMES keys.
  for (const tryKey of [sorted.join(''), sorted.slice(1).concat(sorted[0]).join(''), sorted.slice(2).concat(sorted.slice(0,2)).join('')]) {
    if (TRIOMES[tryKey]) return tryKey;
  }
  return sorted.join('');
}

function utilityLandsFor(colors) {
  const out = [];

  // Universal staples.
  out.push({ name: 'Command Tower', tag: 'fix' });
  out.push({ name: 'Exotic Orchard', tag: 'fix' });
  if (colors.length >= 2) out.push({ name: 'Path of Ancestry', tag: 'tribal' });

  // Two-colour combos
  if (colors.length === 2) {
    const k = key2(colors[0], colors[1]);
    if (TWO_COLOR_SHOCK[k]) out.push({ name: TWO_COLOR_SHOCK[k], tag: 'shock' });
    if (TWO_COLOR_CHECK[k]) out.push({ name: TWO_COLOR_CHECK[k], tag: 'check' });
    if (TWO_COLOR_FETCH[k]) out.push({ name: TWO_COLOR_FETCH[k], tag: 'fetch' });
  }

  // Three-colour combo: triome + the three constituent shock lands
  if (colors.length === 3) {
    const tk = key3(colors);
    if (TRIOMES[tk]) out.push({ name: TRIOMES[tk], tag: 'triome' });
    // Add the 3 shock-land pairs
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const k = key2(colors[i], colors[j]);
        if (TWO_COLOR_SHOCK[k]) out.push({ name: TWO_COLOR_SHOCK[k], tag: 'shock' });
      }
    }
  }

  // Four/five colour: lean on Mana Confluence and City of Brass
  if (colors.length >= 4) {
    out.push({ name: 'Mana Confluence', tag: 'fix' });
    out.push({ name: 'City of Brass', tag: 'fix' });
    out.push({ name: 'Prismatic Vista', tag: 'fetch' });
  }

  // Universal utility (any identity)
  out.push({ name: 'Bojuka Bog', tag: 'utility' });
  out.push({ name: 'Reliquary Tower', tag: 'utility' });
  out.push({ name: 'Myriad Landscape', tag: 'fix' });
  out.push({ name: 'Strip Mine', tag: 'utility' });

  // Dedupe by name.
  const seen = new Set();
  return out.filter((x) => {
    if (seen.has(x.name)) return false;
    seen.add(x.name);
    return true;
  });
}

export const SHARD_OR_WEDGE_NAME = (colors) => SHARDS_AND_WEDGES[key3(colors)] || null;

// ───────────────────────────────────────────────────────────────────────────────
// Color-source hypergeometric check (Karsten table)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Frank Karsten's "How Many Sources Do You Need to Consistently Cast Your
 * Spells" table, abridged for the Commander 99-card format. Values are
 * the number of sources of a given color needed to cast a spell of that
 * CMC with N colored pips on curve, 90%+ of the time.
 *
 * Source: Karsten 2022 update for Commander, rounded to whole sources.
 * The table is intentionally conservative — it assumes no scry / draw /
 * fetch, so real consistency is usually slightly higher.
 *
 * Shape: { cmc: { pips: requiredSources } }.
 */
export const KARSTEN_TABLE = {
  1: { 1: 14 },
  2: { 1: 13, 2: 21 },
  3: { 1: 12, 2: 18, 3: 23 },
  4: { 1: 12, 2: 16, 3: 20 },
  5: { 1: 11, 2: 15, 3: 19 },
  6: { 1: 11, 2: 14, 3: 18 },
  7: { 1: 10, 2: 14, 3: 17 },
};

const COLOR_TO_SUBTYPE = {
  W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest',
};

/**
 * Look up required sources for a spell of `cmc` with `pips` colored
 * pips in a single color. CMC is clamped to the [1, 7] range Karsten
 * publishes; pips are clamped to [1, 3] (the table doesn't go higher
 * and four-pip costs are rare enough that we conservatively treat them
 * as 3 — caller can layer their own override if needed).
 */
export function requiredSourcesFor(cmc, pips) {
  if (!Number.isFinite(cmc) || !Number.isFinite(pips) || pips < 1) return 0;
  const cmcKey = Math.min(7, Math.max(1, Math.ceil(cmc)));
  const pipKey = Math.min(3, Math.max(1, pips));
  return KARSTEN_TABLE[cmcKey]?.[pipKey] || 0;
}

/**
 * Number of colored pips of each color in a card's mana cost. Hybrid
 * mana ({W/U}, {2/B}) contributes to both colors — the spell can be
 * paid as either, so the deck needs both.
 */
export function spellPipsByColor(card) {
  const out = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const cost = card?.mana_cost || '';
  const groups = cost.match(/\{[^}]+\}/g) || [];
  for (const g of groups) {
    const inner = g.slice(1, -1);
    for (const c of ['W', 'U', 'B', 'R', 'G']) {
      if (inner.includes(c)) out[c] += 1;
    }
  }
  return out;
}

/**
 * Does this card produce mana of `color`? Counted as a source if any of:
 *   - It's a land with the relevant basic-land subtype (Plains / Island / …)
 *   - Oracle says "Add {<color>}"
 *   - Oracle says "add one mana of any color" / "add mana of any color"
 *   - It's a land that fetches the relevant basic
 *
 * This is the same heuristic Karsten's article uses — it treats fetch
 * lands as sources for whichever colors their target basics produce,
 * and any-color rocks (Chromatic Lantern, Prismatic Geoscope) as
 * sources for every color.
 */
export function producesColor(card, color) {
  if (!card) return false;
  const tl = card.type_line || '';
  const oracle = card.oracle_text || '';
  const sub = COLOR_TO_SUBTYPE[color];
  if (tl.includes('Land') && sub && new RegExp(`\\b${sub}\\b`).test(tl)) return true;
  if (new RegExp(`add[^.]{0,40}\\{${color}\\}`, 'i').test(oracle)) return true;
  if (/add (one |two |x |\d+ )?mana of any (one )?color/i.test(oracle)) return true;
  if (sub && new RegExp(`search[^.]*${sub}`, 'i').test(oracle)) return true;
  return false;
}

/**
 * Tally actual color sources across the deck (counted, so 8 Plains = 8 W).
 */
export function actualSourcesByColor(deck) {
  const out = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of deck.cards || []) {
    if (!c.scryfall) continue;
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      if (producesColor(c.scryfall, color)) out[color] += c.count;
    }
  }
  return out;
}

/**
 * For every spell in the deck, compute the per-color source requirement
 * via the Karsten table and report deficits.
 *
 * Returns an array — one row per color the deck cares about — with
 *   { color, requiredSources, actualSources, deficit, exampleSpells }.
 * `exampleSpells` cites up to three of the spells driving the
 * requirement (the ones that hit the highest Karsten row for that color).
 */
export function analyzeColorSources(deck) {
  const actual = actualSourcesByColor(deck);
  const reqByColor = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const examples = { W: [], U: [], B: [], R: [], G: [] };

  for (const c of deck.cards || []) {
    if (!c.scryfall) continue;
    const sf = c.scryfall;
    if (sf.type_line?.includes('Land')) continue;
    const pips = spellPipsByColor(sf);
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      if (pips[color] === 0) continue;
      const req = requiredSourcesFor(sf.cmc || 0, pips[color]);
      if (req === 0) continue;
      const entry = { name: sf.name, cmc: sf.cmc || 0, pips: pips[color], required: req };
      if (req > reqByColor[color]) {
        reqByColor[color] = req;
        examples[color] = [entry];
      } else if (req === reqByColor[color]) {
        examples[color].push(entry);
      }
    }
  }

  const out = [];
  for (const color of ['W', 'U', 'B', 'R', 'G']) {
    if (reqByColor[color] === 0) continue;
    out.push({
      color,
      requiredSources: reqByColor[color],
      actualSources: actual[color],
      deficit: Math.max(0, reqByColor[color] - actual[color]),
      exampleSpells: examples[color].slice(0, 3),
    });
  }
  return out;
}
