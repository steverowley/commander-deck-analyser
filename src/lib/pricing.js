/**
 * Deck pricing math.
 *
 * Scryfall returns prices as string-encoded decimals ("1.50") inside the
 * `prices` object — null when a price isn't known. We sum per-card prices
 * multiplied by deck count.
 *
 * Native currencies (Scryfall returns these directly): USD, EUR.
 * Derived currencies (we convert from USD client-side): GBP. The FX
 * rate is approximate and intentionally hardcoded — keep it good
 * enough for "is this deck a $40 jank pile or a $400 monster?" rather
 * than to-the-penny accuracy.
 */

// Conversion rates from USD. Updated manually; bump when materially off.
const FX_FROM_USD = {
  usd: 1,
  eur: 0.92, // approximate, mid-2026
  gbp: 0.79,
};

const SYMBOLS = { usd: '$', eur: '€', gbp: '£' };

/**
 * Cards keep `prices: { usd, eur }` from Scryfall. For GBP we read USD
 * and convert. Returns null when there's no underlying USD/EUR price.
 */
export function cardPrice(card, currency = 'usd') {
  if (!card?.prices) return null;
  if (currency === 'gbp') {
    const raw = card.prices.usd;
    if (!raw) return null;
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num * FX_FROM_USD.gbp : null;
  }
  const raw = card.prices[currency];
  if (!raw) return null;
  const num = parseFloat(raw);
  return Number.isFinite(num) ? num : null;
}

/**
 * Total deck price in the given currency. Includes the commander.
 * Returns { total, priced, unpriced } so the UI can show how confident
 * the number is (unpriced cards mean Scryfall has no listed price).
 */
export function deckTotalPrice(deck, currency = 'usd') {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  for (const c of deck.cards) {
    if (!c.scryfall) continue;
    const p = cardPrice(c.scryfall, currency);
    if (p == null) {
      unpriced += c.count;
    } else {
      total += p * c.count;
      priced += c.count;
    }
  }
  if (deck.commander) {
    const p = cardPrice(deck.commander, currency);
    if (p == null) unpriced += 1;
    else { total += p; priced += 1; }
  }
  return { total, priced, unpriced };
}

export function formatPrice(amount, currency = 'usd') {
  const sym = SYMBOLS[currency] || '$';
  if (amount == null || !Number.isFinite(amount)) return `${sym}—`;
  if (amount >= 1000) return `${sym}${Math.round(amount).toLocaleString()}`;
  if (amount >= 100) return `${sym}${amount.toFixed(0)}`;
  return `${sym}${amount.toFixed(2)}`;
}

/**
 * Whether the currency is a client-side conversion from USD (and so
 * the displayed number should be prefixed with ~ to indicate approx).
 */
export function isConverted(currency) {
  return currency === 'gbp';
}
