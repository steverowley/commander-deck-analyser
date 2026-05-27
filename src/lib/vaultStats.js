/**
 * Vault stats — what the new Vault page summarises.
 *
 * Input: collection (map keyed by lowercased name, from lib/collection.js),
 * cardData (map keyed by lowercased name, Scryfall normalized cards),
 * decks (array), currency.
 *
 * All math runs locally. Missing Scryfall data is tolerated — a card we
 * own but haven't resolved yet just doesn't contribute to type/colour/CMC
 * breakdowns but still counts toward the unique/total totals.
 */

import { cardPrice } from './pricing.js';
import { identityName } from './stats.js';
import { lc } from './utils.js';

const WUBRG = ['W', 'U', 'B', 'R', 'G'];
const TYPE_ORDER = ['Creature', 'Land', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Planeswalker', 'Battle'];
const RARITY_ORDER = ['mythic', 'rare', 'uncommon', 'common', 'special', 'bonus'];

/**
 * Pull the primary type from a Scryfall type_line. Order matters:
 * "Artifact Creature — Golem" reads as Creature. Lands win over
 * everything because they're the most useful bucket for "is this a
 * mana piece?"
 */
function primaryType(typeLine) {
  if (!typeLine) return 'Other';
  if (/Land/i.test(typeLine)) return 'Land';
  if (/Creature/i.test(typeLine)) return 'Creature';
  if (/Planeswalker/i.test(typeLine)) return 'Planeswalker';
  if (/Battle/i.test(typeLine)) return 'Battle';
  if (/Enchantment/i.test(typeLine)) return 'Enchantment';
  if (/Artifact/i.test(typeLine)) return 'Artifact';
  if (/Instant/i.test(typeLine)) return 'Instant';
  if (/Sorcery/i.test(typeLine)) return 'Sorcery';
  return 'Other';
}

function isLegendaryCreature(card) {
  return !!card?.type_line && /Legendary/i.test(card.type_line) && /Creature/i.test(card.type_line);
}

/**
 * Bucket CMC into the standard histogram the rest of the app uses.
 * Lands and basics are filtered out by the caller — they'd dominate
 * the 0-cost bucket otherwise.
 */
function cmcBucket(cmc) {
  if (cmc == null) return 0;
  if (cmc >= 7) return 7;
  return Math.floor(cmc);
}

/**
 * Categorise a single card's colour against the WUBRG axis, with
 * special "Multicolor" and "Colorless" buckets for the colour pie.
 * Lands are ignored — the user usually wants to know about spells.
 */
function colorBucket(card) {
  const colors = card.colors || [];
  if (colors.length === 0) return 'C';
  if (colors.length > 1) return 'M';
  return colors[0];
}

export function computeVaultStats(collection, cardData, decks = [], currency = 'usd') {
  const entries = Object.values(collection || {});
  const out = {
    unique: entries.length,
    total: entries.reduce((s, e) => s + (e.quantity || 0), 0),
    foilCount: 0,
    foilUnique: 0,
    knownCount: 0,
    pricedCount: 0,
    totalValue: 0,
    foilValue: 0,
    avgValue: 0,
    typeHistogram: TYPE_ORDER.map((name) => ({ name, count: 0 })),
    cmcHistogram: [0, 0, 0, 0, 0, 0, 0, 0],
    colorHistogram: { W: 0, U: 0, B: 0, R: 0, G: 0, M: 0, C: 0 },
    identityHistogram: [], // [{ key, name, colors, count }]
    rarityHistogram: RARITY_ORDER.map((name) => ({ name, count: 0 })),
    topSets: [], // [{ code, name, count }]
    topValuable: [], // [{ name, quantity, value, image, set }]
    deckCoverage: [], // [{ id, name, commander, total, owned, percent }]
    buildableCommanders: [], // [{ name, image, colors }]
    unusedCards: [], // entries in vault but not in any saved deck
    unusedCount: 0,
    unusedValue: 0,
    addedTimeline: [], // [{ date, count }] — last 30 days
  };
  if (entries.length === 0) return out;

  // First pass: per-card breakdowns.
  const identityCounts = new Map();
  const setCounts = new Map();
  const valued = []; // for topValuable sort
  for (const entry of entries) {
    if (entry.meta?.foil) {
      out.foilUnique += 1;
      out.foilCount += entry.quantity || 0;
    }
    const card = cardData?.[lc(entry.name)];
    if (!card) continue;
    out.knownCount += 1;

    const t = primaryType(card.type_line);
    const tBucket = out.typeHistogram.find((x) => x.name === t);
    if (tBucket) tBucket.count += entry.quantity || 0;

    const c = colorBucket(card);
    if (c in out.colorHistogram) out.colorHistogram[c] += entry.quantity || 0;

    // CMC histogram excludes lands (they're cmc=0 and would dwarf
    // the 0-cost spell column).
    if (!/Land/i.test(card.type_line || '')) {
      out.cmcHistogram[cmcBucket(card.cmc)] += entry.quantity || 0;
    }

    if (card.rarity) {
      const r = out.rarityHistogram.find((x) => x.name === card.rarity);
      if (r) r.count += entry.quantity || 0;
    }

    if (card.set) {
      const existing = setCounts.get(card.set);
      if (existing) {
        existing.count += entry.quantity || 0;
      } else {
        setCounts.set(card.set, { code: card.set, name: card.set_name || card.set.toUpperCase(), count: entry.quantity || 0 });
      }
    }

    // Identity combo (only count cards whose color identity is non-
    // trivial — lands and colourless artifacts would all bucket as C
    // and dominate the table).
    const id = (card.color_identity || []).filter((x) => WUBRG.includes(x));
    if (id.length > 0) {
      const key = id.slice().sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b)).join('');
      const cur = identityCounts.get(key);
      if (cur) {
        cur.count += entry.quantity || 0;
      } else {
        identityCounts.set(key, { key, name: identityName(id), colors: id, count: entry.quantity || 0 });
      }
    }

    const price = cardPrice(card, currency);
    if (price != null) {
      const qty = entry.quantity || 0;
      const value = price * qty;
      out.totalValue += value;
      out.pricedCount += qty;
      if (entry.meta?.foil) out.foilValue += value;
      valued.push({
        name: entry.name,
        quantity: qty,
        unitValue: price,
        value,
        image: card.image_uris?.normal || card.image_uris?.small,
        set: card.set_name,
        foil: !!entry.meta?.foil,
      });
    }
  }

  // Denominator must be the number of copies that contributed to
  // totalValue, not every copy in the vault — otherwise avgValue is
  // deflated by unresolved-Scryfall or no-price entries (a half-
  // resolved CSV import would report half the real average).
  out.avgValue = out.pricedCount > 0 ? out.totalValue / out.pricedCount : 0;
  out.typeHistogram.sort((a, b) => b.count - a.count);
  out.identityHistogram = Array.from(identityCounts.values()).sort((a, b) => b.count - a.count);
  out.topSets = Array.from(setCounts.values()).sort((a, b) => b.count - a.count).slice(0, 12);
  out.topValuable = valued.sort((a, b) => b.unitValue - a.unitValue).slice(0, 12);

  // Deck coverage — for each saved deck, how many of its slots are
  // already in the vault. Commander counts as a slot.
  for (const d of decks) {
    if (!d?.cards) continue;
    let total = 0;
    let owned = 0;
    for (const c of d.cards) {
      total += c.count || 0;
      const have = collection[lc(c.name)]?.quantity || 0;
      owned += Math.min(c.count || 0, have);
    }
    if (d.commander) {
      total += 1;
      if (collection[lc(d.commander.name)]?.quantity > 0) owned += 1;
    }
    const percent = total > 0 ? Math.round((owned / total) * 100) : 0;
    out.deckCoverage.push({
      id: d.id,
      name: d.name,
      commander: d.commander,
      total,
      owned,
      percent,
    });
  }
  out.deckCoverage.sort((a, b) => b.percent - a.percent);

  // Buildable commanders — legendary creatures in the vault.
  // Sort by colour-identity size descending so the deepest builds
  // surface first (a 5-colour commander unlocks more decks).
  out.buildableCommanders = entries
    .map((e) => {
      const card = cardData?.[lc(e.name)];
      if (!card || !isLegendaryCreature(card)) return null;
      return {
        name: e.name,
        image: card.image_uris?.normal || card.image_uris?.small,
        colors: card.color_identity || [],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.colors.length - a.colors.length || a.name.localeCompare(b.name));

  // Unused cards — in vault, not in any deck (and not the commander
  // of any deck). Basics never count as "unused" — they're consumable.
  const usedNames = new Set();
  for (const d of decks) {
    for (const c of d.cards || []) usedNames.add(lc(c.name));
    if (d.commander) usedNames.add(lc(d.commander.name));
  }
  for (const entry of entries) {
    const key = lc(entry.name);
    if (usedNames.has(key)) continue;
    const card = cardData?.[key];
    if (card && /Basic Land/i.test(card.type_line || '')) continue;
    out.unusedCount += entry.quantity || 0;
    const price = card ? cardPrice(card, currency) : null;
    if (price != null) out.unusedValue += price * (entry.quantity || 0);
    out.unusedCards.push({
      name: entry.name,
      quantity: entry.quantity || 0,
      value: price != null ? price * (entry.quantity || 0) : null,
      image: card?.image_uris?.normal || card?.image_uris?.small,
    });
  }
  out.unusedCards.sort((a, b) => (b.value || 0) - (a.value || 0));

  // Added timeline — bucket entries by day, last 30 days.
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const dayBuckets = new Map();
  for (const e of entries) {
    if (!e.added_at) continue;
    const ageDays = Math.floor((now - e.added_at) / DAY);
    if (ageDays > 30) continue;
    const date = new Date(now - ageDays * DAY);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    dayBuckets.set(key, (dayBuckets.get(key) || 0) + (e.quantity || 0));
  }
  out.addedTimeline = Array.from(dayBuckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return out;
}
