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

const TARGET_LANDS = 37;

function utilityReserve(colorCount) {
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

  // Recommended basic counts proportional to colored pips.
  const utility = utilityReserve(colorCount);
  const basicSlots = Math.max(0, TARGET_LANDS - utility);
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
    targetLands: TARGET_LANDS,
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
