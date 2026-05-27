/**
 * Deck pricing math.
 *
 * Prices come from Scryfall as string-encoded decimals on the card's
 * `prices` object — null when a price isn't known. Which Scryfall field
 * we read depends on the vendor the user picked under Settings → Buy
 * links, so the displayed total reflects what they'd actually pay at
 * the store they buy from:
 *
 *   - tcgplayer:  `prices.usd` / `usd_foil` / `usd_etched` (TCGplayer Mid). Exact.
 *   - cardmarket: `prices.eur` / `eur_foil`              (Cardmarket Trend). Exact.
 *   - cardkingdom: no Scryfall feed exists — we fall back to TCGplayer
 *     USD as an approximation and surface the caveat in the tooltip.
 *
 * Display currency is independent of vendor. USD/EUR show native; GBP
 * converts client-side from USD. When the source currency differs from
 * the display currency we convert at the FX rate below (intentionally
 * approximate — "$40 jank vs $400 monster" precision, not to-the-penny).
 *
 * Foil pricing follows the same vendor mapping. If the requested
 * variant is missing we fall back to the other variant and flag the
 * swap in the tooltip.
 */

import { loadSettings } from './settings.js';

// Conversion rates from USD. Updated manually; bump when materially off.
const FX_FROM_USD = {
  usd: 1,
  eur: 0.92, // approximate, mid-2026
  gbp: 0.79,
};

const SYMBOLS = { usd: '$', eur: '€', gbp: '£' };

/**
 * Vendor → Scryfall price field map.
 *
 *   - field/foilField/etchedField: which `prices.*` key holds the value
 *     for this vendor (null when the vendor doesn't publish it).
 *   - currency: source currency the field is denominated in.
 *   - exact: false means we're proxying from another vendor's feed
 *     (Card Kingdom has no Scryfall feed; we use TCGplayer Mid).
 *   - label: human-readable name shown in tooltips.
 */
const VENDOR_PRICE = {
  tcgplayer: {
    field: 'usd', foilField: 'usd_foil', etchedField: 'usd_etched',
    currency: 'usd', exact: true,
    label: 'TCGplayer (Mid)',
  },
  cardmarket: {
    field: 'eur', foilField: 'eur_foil', etchedField: null,
    currency: 'eur', exact: true,
    label: 'Cardmarket (Trend)',
  },
  cardkingdom: {
    field: 'usd', foilField: 'usd_foil', etchedField: 'usd_etched',
    currency: 'usd', exact: false,
    label: 'Card Kingdom',
    proxiedFrom: 'TCGplayer Mid',
  },
};

export const PRICE_VENDORS = Object.keys(VENDOR_PRICE);

/**
 * Vendor currently active for pricing. Reads `prefRetailer` from
 * settings so the buy-link vendor and the price-feed vendor stay in
 * lockstep (the SettingsModal copy makes this explicit).
 */
export function activeVendor() {
  const v = loadSettings()?.prefRetailer;
  return VENDOR_PRICE[v] ? v : 'tcgplayer';
}

export function vendorLabel(vendor) {
  return VENDOR_PRICE[vendor]?.label || 'Unknown vendor';
}

export function vendorMeta(vendor) {
  return VENDOR_PRICE[vendor] || null;
}

function convertFx(value, from, to) {
  if (from === to) return value;
  // Pivot through USD — covers all supported pairs without a full matrix.
  const usd = from === 'usd' ? value : value / (FX_FROM_USD[from] || 1);
  return to === 'usd' ? usd : usd * (FX_FROM_USD[to] || 1);
}

/**
 * Look up the raw price string for `vendor` on `card`. Walks foil /
 * non-foil / etched fields in preference order and returns whichever
 * has data. Returns null when no field has a value.
 */
function rawPrice(card, vendor, { foil = false, etched = false } = {}) {
  const v = VENDOR_PRICE[vendor];
  if (!v || !card?.prices) return null;
  const preferred = etched ? [v.etchedField, v.foilField, v.field]
                  : foil  ? [v.foilField, v.field]
                  :         [v.field, v.foilField];
  for (const f of preferred) {
    if (!f) continue;
    const raw = card.prices[f];
    if (raw == null) continue;
    const num = parseFloat(raw);
    if (Number.isFinite(num)) return { value: num, field: f };
  }
  return null;
}

/**
 * Numeric price for a card in `displayCurrency`. When `vendor` is
 * omitted the active vendor from settings is used. Returns null when
 * no price is known for the vendor.
 */
export function cardPrice(card, displayCurrency = 'usd', vendor = null, opts = {}) {
  const v = vendor || activeVendor();
  const meta = VENDOR_PRICE[v];
  if (!meta) return null;
  const raw = rawPrice(card, v, opts);
  if (!raw) return null;
  return convertFx(raw.value, meta.currency, displayCurrency);
}

/**
 * Rich price descriptor for tooltips and UI affordances. Tells the
 * caller which vendor was used, which Scryfall field the number came
 * from, whether it's an approximation, and whether a foil/non-foil
 * fallback happened.
 *
 * Returns:
 *   {
 *     amount, vendor, vendorLabel,
 *     sourceCurrency, displayCurrency, sourceField,
 *     exact, converted, approximate,
 *     notes: string[]   // human-readable caveats (joined with \n for tooltip)
 *   }
 */
export function cardPriceDetails(card, displayCurrency = 'usd', vendor = null, opts = {}) {
  const v = vendor || activeVendor();
  const meta = VENDOR_PRICE[v] || VENDOR_PRICE.tcgplayer;
  const raw = rawPrice(card, v, opts);
  const amount = raw ? convertFx(raw.value, meta.currency, displayCurrency) : null;
  const notes = [];
  if (!raw) {
    notes.push(`No ${meta.label} price on Scryfall for this card.`);
  } else {
    notes.push(`Source: ${meta.label}.`);
    if (!meta.exact) {
      notes.push(`${meta.label} prices aren't published on Scryfall — showing ${meta.proxiedFrom} as an estimate.`);
    }
    if (meta.currency !== displayCurrency) {
      notes.push(`Converted ${meta.currency.toUpperCase()} → ${displayCurrency.toUpperCase()} at an approximate FX rate.`);
    }
    const want = opts.foil ? meta.foilField : meta.field;
    if (want && raw.field !== want) {
      notes.push(opts.foil
        ? 'No foil price available — showing non-foil.'
        : 'No non-foil price available — showing foil.');
    }
  }
  return {
    amount,
    vendor: v,
    vendorLabel: meta.label,
    sourceCurrency: meta.currency,
    displayCurrency,
    sourceField: raw?.field || null,
    exact: meta.exact,
    converted: meta.currency !== displayCurrency,
    approximate: !raw || !meta.exact || meta.currency !== displayCurrency,
    notes,
  };
}

/**
 * Multiline tooltip text for a price details object. The native `title`
 * attribute renders `\n` as a line break in every browser we care about.
 */
export function priceTooltip(details) {
  if (!details) return '';
  return details.notes.join('\n');
}

/**
 * Total deck price in the given display currency. Includes the commander.
 * Returns rich shape so the UI can render an accurate tooltip:
 *   { total, priced, unpriced, ownedTotal, toBuy, ownedCount,
 *     vendor, vendorLabel, sourceCurrency, displayCurrency,
 *     exact, converted, approximate }
 *
 * `collection` (optional) is the user's owned-card map keyed by
 * lowercased name: { 'sol ring': { quantity: 2 }, ... }. When passed,
 * owned-card prices subtract from `toBuy` (per-copy, capped at the
 * count in the deck so 4x in the collection doesn't refund 4x of a
 * 1-of in the deck).
 */
export function deckTotalPrice(deck, displayCurrency = 'usd', collection = null, vendor = null) {
  const v = vendor || activeVendor();
  const meta = VENDOR_PRICE[v] || VENDOR_PRICE.tcgplayer;
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  let ownedTotal = 0;
  let ownedCount = 0;
  const ownedFor = (name) => {
    if (!collection || !name) return 0;
    return collection[name.toLowerCase()]?.quantity || 0;
  };
  for (const c of deck.cards) {
    if (!c.scryfall) continue;
    const p = cardPrice(c.scryfall, displayCurrency, v);
    if (p == null) {
      unpriced += c.count;
    } else {
      total += p * c.count;
      priced += c.count;
    }
    if (collection) {
      const have = Math.min(c.count, ownedFor(c.name));
      if (have > 0 && p != null) ownedTotal += p * have;
      ownedCount += have;
    }
  }
  if (deck.commander) {
    const p = cardPrice(deck.commander, displayCurrency, v);
    if (p == null) unpriced += 1;
    else { total += p; priced += 1; }
    if (collection && ownedFor(deck.commander.name) > 0 && p != null) {
      ownedTotal += p;
      ownedCount += 1;
    }
  }
  return {
    total,
    priced,
    unpriced,
    ownedTotal,
    ownedCount,
    toBuy: Math.max(0, total - ownedTotal),
    vendor: v,
    vendorLabel: meta.label,
    sourceCurrency: meta.currency,
    displayCurrency,
    exact: meta.exact,
    converted: meta.currency !== displayCurrency,
    approximate: !meta.exact || meta.currency !== displayCurrency || unpriced > 0,
  };
}

/**
 * Tooltip text for a deck-total price. Combines the vendor caveat
 * (CK proxy, FX conversion) with the unpriced-card count so the user
 * sees the full picture in one hover.
 */
export function deckPriceTooltip(price) {
  if (!price) return '';
  const lines = [`Source: ${price.vendorLabel}.`];
  if (!price.exact) {
    lines.push(`Card Kingdom prices aren't on Scryfall — showing TCGplayer Mid as an estimate.`);
  }
  if (price.converted) {
    lines.push(`Converted ${price.sourceCurrency.toUpperCase()} → ${price.displayCurrency.toUpperCase()} at an approximate FX rate.`);
  }
  if (price.unpriced > 0) {
    lines.push(`${price.unpriced} card${price.unpriced === 1 ? '' : 's'} have no ${price.vendorLabel} price — excluded from the total.`);
  }
  if (price.ownedTotal > 0) {
    lines.push(`${price.ownedCount} card${price.ownedCount === 1 ? '' : 's'} already in your Vault subtract from the "to buy" total.`);
  }
  lines.push('Change the vendor under Settings → Buy links.');
  return lines.join('\n');
}

export function formatPrice(amount, currency = 'usd') {
  const sym = SYMBOLS[currency] || '$';
  if (amount == null || !Number.isFinite(amount)) return `${sym}—`;
  if (amount >= 1000) return `${sym}${Math.round(amount).toLocaleString()}`;
  if (amount >= 100) return `${sym}${amount.toFixed(0)}`;
  return `${sym}${amount.toFixed(2)}`;
}

/**
 * Whether the displayed price is approximate — either client-side
 * currency-converted or proxied from another vendor's feed (Card
 * Kingdom). The UI uses this to decide whether to prefix the number
 * with `~`.
 *
 * `vendor` is optional; when omitted only currency-conversion is
 * considered. Pass `activeVendor()` for the fully-accurate answer.
 */
export function isConverted(displayCurrency, vendor = null) {
  if (vendor) {
    const meta = VENDOR_PRICE[vendor];
    if (meta && (!meta.exact || meta.currency !== displayCurrency)) return true;
  }
  return displayCurrency === 'gbp';
}
