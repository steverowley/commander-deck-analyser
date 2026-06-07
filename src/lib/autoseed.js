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
import { cardPrice, activePriceSource } from './pricing.js';
import { archetypeById, tagsMatchArchetype, archetypeBuildProfile } from './archetypes.js';
import { BANNED_CARDS } from './constants.js';
import { utilityReserve, pipDistribution } from './landbase.js';
import { lc } from './utils.js';

// Larger pool when filters are in play so we still hit 99 after
// pruning expensive cards / off-bracket cards.
const POOL_SIZE = 180;
const POOL_SIZE_FILTERED = 260;
// Role targets (draw / removal / wipes / protection / recursion / wincon)
// come from the per-archetype build profile in archetypes.js, which is
// anchored on the Command Zone "New Era" template (Ep. 658) + Kristen
// Gregory's Four Pillars. Lands + ramp still scale with the curve. The
// goal: a rolled deck that scores high on its own Health check out of the
// gate, shaped to the requested archetype.
const DECK_TOTAL = 99;

// Tags that signal a card is too high-power for casual / precon
// brackets. Filtering these out of the pool when targeting low
// brackets keeps the auto-seed appropriate for the requested table.
const HIGH_POWER_TAGS = new Set([
  'Game Changer',
  'Combo piece',
  'Mass Land Destruction',
  'Extra Turn',
  'Stax piece',
]);
// Mass Land Destruction is socially toxic at all but the top bracket,
// so it stays excluded one bracket higher than the rest.
const BRACKET3_BAN = new Set(['Mass Land Destruction']);

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
  // 'Card draw' only — tutors are NOT card draw (health.js counts draw the
  // same way), so they fall through to the synergy pool rather than
  // padding the draw count.
  if (tags.has('Card draw')) return 'draw';
  // Wipes checked before spot removal so a card with both tags (e.g.
  // overload spells in their bigger mode) lands in the right bucket
  // for the post-Ep. 658 split targets.
  if (tags.has('Board wipe')) return 'wipe';
  if (tags.has('Targeted removal')) return 'removal';
  if (tags.has('Protection')) return 'protection';
  if (tags.has('Recursion') || tags.has('Reanimation')) return 'recursion';
  // Win-con last before the generic pool so a finisher that's also a
  // pillar (e.g. a board wipe that ends games) counts toward the pillar.
  if (tags.has('Win condition') || tags.has('Combo piece')) return 'wincon';
  return 'other';
}

// Recognises plain and Snow-Covered basics. Used by the budget swap
// and safety-trim loops to (a) skip basics as swap candidates and
// (b) decrement summary.basics when a basic is removed.
function isBasicLandName(name) {
  return /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest)$|^Wastes$/.test(name || '');
}

// Distribute `count` basic lands across the commander's colour identity,
// weighted by the deck's actual coloured-pip demand (Karsten / Salubrious
// Snail: run more of the colour you cast more of). Falls back to an even
// split when no pips are known. Colourless identity gets Wastes. Uses
// largest-remainder rounding so the parts sum to exactly `count`.
function weightedBasicDistribution(count, identity, pips) {
  const dist = {};
  if (count <= 0) return dist;
  if (identity.length === 0) {
    dist[BASIC_BY_COLOR.C] = count;
    return dist;
  }
  const totalPips = identity.reduce((s, c) => s + (pips?.[c] || 0), 0);
  if (totalPips === 0) {
    for (let i = 0; i < count; i++) {
      const name = BASIC_BY_COLOR[identity[i % identity.length]];
      dist[name] = (dist[name] || 0) + 1;
    }
    return dist;
  }
  const prov = identity.map((c) => {
    const exact = (pips[c] / totalPips) * count;
    return { name: BASIC_BY_COLOR[c], floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let leftover = count - prov.reduce((s, p) => s + p.floor, 0);
  prov.sort((a, b) => b.frac - a.frac);
  for (const p of prov) {
    const give = leftover > 0 ? 1 : 0;
    dist[p.name] = (dist[p.name] || 0) + p.floor + give;
    leftover -= give;
  }
  return dist;
}

// Check whether the user's collection contains a card. Falls back to
// the front-face name for split / adventure / DFC cards — Scryfall's
// canonical name is "Front // Back" but Moxfield CSV imports and
// hand-typed Vault entries often store just the front face, so a
// strict canonical-name match would wrongly mark owned cards as
// missing. Returns the collection key that matched, or null.
function ownedKey(collection, cardName) {
  if (!collection || !cardName) return null;
  const key = lc(cardName);
  if (collection[key]) return key;
  if (key.includes(' // ')) {
    const front = key.split(' // ')[0].trim();
    if (front && collection[front]) return front;
  }
  return null;
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

export async function buildSeededDeck(commander, opts = {}, onProgress) {
  if (!commander?.name) {
    return { commander: null, cards: [], missing: ['no commander'], summary: null };
  }
  // opts: { bracket?: 1..5, budget?: number, currency?: 'usd'|'eur'|'gbp',
  //         archetype?: id, ownedOnly?: bool, collection?: { 'name': {...} } }
  const bracket = opts.bracket ?? 3;
  const archetype = archetypeById(opts.archetype);
  const ownedOnly = !!opts.ownedOnly;
  const collection = opts.collection || null;
  const filterActive = bracket <= 3 || opts.budget != null || (archetype && archetype.id !== 'any') || ownedOnly;
  const poolSize = filterActive ? POOL_SIZE_FILTERED : POOL_SIZE;
  // Per-card price cap derived from total budget. Rough heuristic:
  // ~12% of budget for the single most expensive card lets a few
  // chase pieces (signets, dual lands) slip in without one card
  // eating the whole budget.
  const currency = opts.currency || 'usd';
  // Snapshot the price source at build start. Budget math has to stay
  // consistent across the whole pipeline (pool prune → swap loop → final
  // sweep) — if the user opened Settings mid-build and flipped the source,
  // a re-read on each cardPrice call would mix TCG and Cardmarket numbers.
  const priceVendor = opts.priceVendor || activePriceSource();
  const maxPerCard = opts.budget != null
    ? Math.max(1, opts.budget * 0.12)
    : Infinity;

  onProgress?.(`Fetching EDHREC recs for ${commander.name}...`);
  const recs = await fetchRecommendations(commander.name);
  if (!recs) {
    return { commander, cards: [], missing: ['EDHREC has no page for this commander'], summary: null };
  }
  // Pull a bigger pool than 99 so we have spares to fill each category.
  const top = topRecommendations(recs, new Set([commander.name.toLowerCase()]), poolSize);
  const names = top.map((r) => r.name);
  if (names.length === 0) {
    return { commander, cards: [], missing: ['no recommendations'], summary: null };
  }
  onProgress?.(`Fetching ${names.length} cards from Scryfall...`);
  const { results, notFound } = await fetchCardsByName(names, onProgress);
  // Preserve EDHREC's synergy ordering — `names` is already sorted.
  let pool = names
    .map((n) => results[n.toLowerCase()])
    .filter(Boolean);

  // Always drop format-banned cards. Even at bracket 5 we don't want
  // the auto-seed offering up a card you literally can't play. The
  // EDHREC cache sometimes still returns recently-banned staples.
  pool = pool.filter((c) => !BANNED_CARDS.has(lc(c.name)));

  // Apply bracket-based exclusions.
  if (bracket <= 2) {
    pool = pool.filter((c) => {
      const tags = detectTags(c);
      return !tags.some((t) => HIGH_POWER_TAGS.has(t));
    });
  } else if (bracket === 3) {
    pool = pool.filter((c) => {
      const tags = detectTags(c);
      return !tags.some((t) => BRACKET3_BAN.has(t));
    });
  }

  // Apply per-card budget cap. Cards with no listed price pass
  // through — better to include them than to skip silently, and the
  // total-price tile will flag them as 'unpriced' for the user.
  // Owned-collection cards also bypass the cap: they're free for
  // the user even if Scryfall lists them at $50, so excluding them
  // would be a worse seed.
  if (Number.isFinite(maxPerCard)) {
    pool = pool.filter((c) => {
      if (ownedKey(collection, c.name)) return true;
      const p = cardPrice(c, currency, priceVendor);
      return p == null || p <= maxPerCard;
    });
  }

  // Collection-aware build — when ownedOnly is true, drop every
  // non-basic card the user doesn't have in their collection. Basics
  // pass through unconditionally since we may pad them in below.
  if (ownedOnly) {
    if (!collection || Object.keys(collection).length === 0) {
      console.warn('[autoseed] ownedOnly requested but collection is empty/missing — the deck will be all basics.');
    }
    const before = pool.length;
    pool = pool.filter((c) => {
      if (/^Basic Land/i.test(c.type_line || '')) return true;
      return !!ownedKey(collection, c.name);
    });
    console.log(`[autoseed] ownedOnly filter: ${before} → ${pool.length} cards (${Object.keys(collection || {}).length} in Vault).`);
  }

  // Archetype boost — partition matching cards to the front of the
  // pool. Preserves relative synergy order inside each partition.
  if (archetype.id !== 'any') {
    const matches = [];
    const rest = [];
    for (const c of pool) {
      if (tagsMatchArchetype(detectTags(c), archetype)) matches.push(c);
      else rest.push(c);
    }
    pool = [...matches, ...rest];
  }

  // Bucket by role. Each bucket stays in (possibly archetype-promoted)
  // synergy order so `.shift()` picks the most relevant candidate first.
  const buckets = { land: [], ramp: [], draw: [], removal: [], wipe: [], protection: [], recursion: [], wincon: [], other: [] };
  for (const card of pool) buckets[categorize(card)].push(card);

  // Curve-aware land + ramp targets; the rest of the role split comes
  // from the archetype build profile so a rolled deck matches the model
  // the Health score grades against (incl. protection + recursion, which
  // the old template ignored even though Health docks you for missing).
  const sample = pool.slice(0, 60);
  const avgCmc = avgCmcOf(sample);
  const curve = recommendByCurve(avgCmc);
  const profile = archetypeBuildProfile(archetype.id);
  const targets = {
    lands: Math.max(30, curve.land.ideal[1] + profile.landDelta),
    ramp: Math.max(5, curve.ramp.ideal[1] + profile.rampDelta),
    draw: profile.draw,
    removal: profile.removal,
    wipe: profile.wipe,
    protection: profile.protection,
    recursion: profile.recursion,
    wincon: profile.wincon,
  };

  onProgress?.(`Balancing — target ${targets.lands} lands, ${targets.ramp} ramp, ${targets.draw} draw, ${targets.removal} removal, ${targets.wipe} wipes, ${targets.protection} protection, ${targets.recursion} recursion...`);

  const entries = [];
  // Summary keys deliberately match the bucket keys so `summary[key]`
  // works inside the priority-fill loop. `basics` is separate because
  // basics are distributed below; the modal sums lands + basics for the
  // display. ownedPool surfaces how many cards survived the ownedOnly
  // filter so the UI can warn when the Vault overlap is too thin.
  const summary = {
    land: 0, ramp: 0, draw: 0, removal: 0, wipe: 0,
    protection: 0, recursion: 0, wincon: 0, other: 0, basics: 0,
    ownedPool: ownedOnly ? pool.length : null,
    vaultSize: collection ? Object.keys(collection).length : 0,
  };

  // Fill priority buckets in order. Each `add` consumes a slot from
  // the 99-card budget, so check the budget before grabbing.
  const addFromBucket = (key, target) => {
    while (totalSlots(entries) < DECK_TOTAL && buckets[key].length > 0 && summary[key] < target) {
      entries.push(entryFor(buckets[key].shift()));
      summary[key]++;
    }
  };
  // Lands: cap nonbasic / utility lands at the reserve appropriate
  // for the commander's colour identity. Real EDH decks are mostly
  // basics with a handful of utility / dual / fixing lands — the
  // EDHREC pool tends to be top-heavy on flashy utility, so without
  // the cap the auto-seed produces 36 utility lands and zero basics,
  // which is jank. Anything beyond the cap gets filled by the
  // dedicated basic-land padding below.
  const identityCount = (commander.color_identity || []).filter((c) => 'WUBRG'.includes(c)).length;
  const utilityCap = utilityReserve(identityCount);
  addFromBucket('land', Math.min(targets.lands, utilityCap));
  addFromBucket('ramp', targets.ramp);
  addFromBucket('removal', targets.removal);
  addFromBucket('draw', targets.draw);
  addFromBucket('wipe', targets.wipe);
  addFromBucket('protection', targets.protection);
  addFromBucket('recursion', targets.recursion);
  addFromBucket('wincon', targets.wincon);

  // Fill remaining slots with synergy / strategy cards. Pull from
  // `other` first (the actual strategy fillers), then dip into the
  // category overflows in case the user rolled a commander whose
  // top picks are mostly utility. Lands deliberately excluded — we
  // capped non-basics above and the rest gets padded with basics
  // below; including lands here would bypass the cap.
  const overflow = [
    ...buckets.other,
    ...buckets.ramp,
    ...buckets.draw,
    ...buckets.removal,
    ...buckets.wipe,
    ...buckets.protection,
    ...buckets.recursion,
    ...buckets.wincon,
  ];
  while (totalSlots(entries) < DECK_TOTAL && overflow.length > 0) {
    const card = overflow.shift();
    entries.push(entryFor(card));
    // Bump the bucket the card actually belongs to, not always
    // `other` — a ramp piece pulled from overflow is still ramp.
    const cat = categorize(card);
    if (cat !== 'land' && summary[cat] !== undefined) summary[cat]++;
    else summary.other++;
  }

  // Pad lands with basics if EDHREC didn't deliver enough lands.
  // Distributed round-robin across the commander's color identity so
  // pip ratios stay roughly even — good enough for an auto-seed
  // starting point that the user can tune. CRITICAL: we MUST stay at
  // or below 99 cards; previous version blew through because the
  // make-room loop only dropped one filler.
  const landSlots = totalLandSlots(entries);
  if (landSlots < targets.lands) {
    const wanted = targets.lands - landSlots;
    onProgress?.(`Padding ${wanted} basic lands...`);
    // Only drop fillers when there isn't already room. With existing
    // room R and wanted W, we need max(0, W - R) drops.
    const roomBefore = DECK_TOTAL - totalSlots(entries);
    const needToDrop = Math.max(0, wanted - roomBefore);
    let dropped = 0;
    for (let i = entries.length - 1; i >= 0 && dropped < needToDrop; i--) {
      if (categorize(entries[i].scryfall) === 'other') {
        entries.splice(i, 1);
        summary.other--;
        dropped++;
      }
    }
    const room = DECK_TOTAL - totalSlots(entries);
    const padCount = Math.min(wanted, room);
    if (padCount > 0) {
      const identity = (commander.color_identity || []).filter((c) => 'WUBRG'.includes(c));
      const basicNames = identity.length === 0
        ? [BASIC_BY_COLOR.C]
        : identity.map((c) => BASIC_BY_COLOR[c]);
      const { results: basicResults } = await fetchCardsByName(basicNames);
      // Weight basics by the deck's coloured-pip demand so a deck that
      // casts mostly blue gets mostly Islands, not an even split.
      const pips = pipDistribution({ cards: entries });
      const distribution = weightedBasicDistribution(padCount, identity, pips);
      for (const [name, count] of Object.entries(distribution)) {
        const card = basicResults[name.toLowerCase()];
        if (!card) continue;
        entries.push(entryFor(card, count));
        summary.basics += count;
      }
    }
  }

  // Budget enforcement — the per-card cap on its own isn't enough.
  // 99 cards at the cap can still overshoot the total (e.g. a $50
  // budget at 12% per-card = $6 per card × 99 ≈ $594). Sweep the
  // built deck and swap out the most-expensive non-basic non-owned
  // cards for basic lands until the total fits the budget.
  if (Number.isFinite(opts.budget) && opts.budget > 0) {
    const computeTotal = () => entries.reduce((s, e) => {
      const p = cardPrice(e.scryfall, currency, priceVendor) || 0;
      return s + p * e.count;
    }, 0);
    const identity = (commander.color_identity || []).filter((c) => 'WUBRG'.includes(c));
    const basicNames = identity.length === 0
      ? [BASIC_BY_COLOR.C]
      : identity.map((c) => BASIC_BY_COLOR[c]);
    let basicResults = null;
    let total = computeTotal();
    let safety = 60;
    while (total > opts.budget && safety-- > 0) {
      // Find the most expensive entry that isn't already a basic and
      // isn't in the user's owned collection (owned = free for them).
      let worstIdx = -1;
      let worstPrice = 0;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (isBasicLandName(e.name)) continue;
        if (ownedKey(collection, e.name)) continue;
        const p = cardPrice(e.scryfall, currency, priceVendor) || 0;
        if (p > worstPrice) {
          worstPrice = p;
          worstIdx = i;
        }
      }
      // Don't bother swapping cards under 50¢ — they barely move the
      // total and the swap loop should converge before this.
      if (worstIdx < 0 || worstPrice < 0.5) break;

      const removed = entries.splice(worstIdx, 1)[0];
      const cat = categorize(removed.scryfall);
      if (cat === 'land') summary.land = Math.max(0, summary.land - 1);
      else if (summary[cat] !== undefined) summary[cat] = Math.max(0, summary[cat] - 1);

      // Replace with a basic land so the deck stays at 99 cards.
      if (!basicResults) {
        const fetched = await fetchCardsByName(basicNames);
        basicResults = fetched.results;
      }
      const pickIndex = summary.basics % basicNames.length;
      const basicName = basicNames[pickIndex];
      const basicCard = basicResults?.[basicName.toLowerCase()];
      if (basicCard) {
        const existing = entries.find((e) => e.name === basicName);
        if (existing) existing.count++;
        else entries.push(entryFor(basicCard, 1));
        summary.basics++;
      }
      total = computeTotal();
    }
  }

  // Belt-and-braces safety: never return a deck over 99 cards.
  // Trim from the tail if some prior step miscounted.
  while (totalSlots(entries) > DECK_TOTAL) {
    const last = entries[entries.length - 1];
    if (last.count > 1) {
      last.count--;
      if (last.scryfall && categorize(last.scryfall) === 'land' && isBasicLandName(last.name)) {
        summary.basics--;
      }
    } else {
      const removed = entries.pop();
      const cat = categorize(removed.scryfall);
      if (cat === 'land' && isBasicLandName(removed.name)) summary.basics--;
      else if (summary[cat] !== undefined) summary[cat]--;
    }
  }

  return { commander, cards: entries, missing: notFound, summary };
}
