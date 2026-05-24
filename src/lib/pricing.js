/**
 * Deck pricing math.
 *
 * Scryfall returns prices as string-encoded decimals ("1.50") inside the
 * `prices` object — null when a price isn't known. We sum per-card prices
 * multiplied by deck count.
 */

export function cardPrice(card, currency = 'usd') {
  const raw = card?.prices?.[currency];
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
  const sym = currency === 'eur' ? '€' : '$';
  if (amount == null || !Number.isFinite(amount)) return `${sym}—`;
  if (amount >= 1000) return `${sym}${Math.round(amount).toLocaleString()}`;
  if (amount >= 100) return `${sym}${amount.toFixed(0)}`;
  return `${sym}${amount.toFixed(2)}`;
}
