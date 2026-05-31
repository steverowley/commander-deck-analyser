/**
 * Missing-cards buylist — intersects a deck against the user's Vault,
 * surfaces what's still needed, and prices each row across every
 * Scryfall-published vendor so the user can choose the cheapest cart.
 *
 * Scryfall publishes two per-card price feeds:
 *   - TCGplayer Mid (USD)  — `prices.usd`
 *   - Cardmarket Trend (EUR) — `prices.eur`
 *
 * Card Kingdom is intentionally not in the table; CK doesn't publish
 * per-card prices to Scryfall (see `pricing.js` header). The buylist
 * therefore compares TCGplayer vs Cardmarket — the two real, exact
 * sources we already use everywhere else in the app.
 *
 * `missingCards(deck, collection)` returns the rows; `cheapestCart` and
 * `singleCartTotals` aggregate; `toTcgplayerCsv` formats for TCGplayer's
 * mass-entry import box.
 */

import { ownedCount } from './collection.js';
import { cardPrice } from './pricing.js';

export const BUYLIST_VENDORS = ['tcgplayer', 'cardmarket'];

/**
 * Walk the deck (commander + mainboard) and return one row per card
 * the user still needs to buy. Cards already in the Vault subtract
 * from the required count; only the remaining shortfall is returned.
 *
 * Each row carries `prices` — a `{ tcgplayer, cardmarket }` map in
 * the *vendor source currency* (USD / EUR) — plus the Scryfall card
 * for follow-up reads (foil variants, image, etc.).
 */
export function missingCards(deck, collection = null) {
  if (!deck) return [];
  const rows = [];
  const consider = (sf, count) => {
    if (!sf || !count || count < 1) return;
    const owned = ownedCount(collection, sf.name);
    const needed = Math.max(0, count - owned);
    if (needed === 0) return;
    rows.push({
      name: sf.name,
      count: needed,
      scryfall: sf,
      prices: {
        tcgplayer:  cardPrice(sf, 'usd', 'tcgplayer'),
        cardmarket: cardPrice(sf, 'eur', 'cardmarket'),
      },
    });
  };

  if (deck.commander) consider(deck.commander, 1);
  for (const c of deck.cards || []) {
    consider(c.scryfall, c.count);
  }
  // Sort: most expensive (TCGplayer reference) first so the high-impact
  // cards land at the top of the list.
  rows.sort((a, b) => (b.prices.tcgplayer || 0) - (a.prices.tcgplayer || 0));
  return rows;
}

/**
 * "Cheapest cart" — for each row, pick the vendor with the lower price
 * (in its own source currency). Returns the per-row choice plus the
 * total per vendor.
 *
 * When a row has only one vendor with a price, that vendor wins for
 * that row. When neither vendor has a price, the row contributes
 * nothing to either total and is flagged in `unpriced`.
 */
export function cheapestCart(buylist) {
  let tcgplayerTotal = 0;
  let cardmarketTotal = 0;
  let unpriced = 0;
  const rows = [];
  for (const r of buylist) {
    const usd = r.prices.tcgplayer;
    const eur = r.prices.cardmarket;
    let chosen = null;
    if (usd != null && eur != null) {
      // Compare in USD using a fixed 1 EUR ≈ 1.09 USD reference so the
      // choice survives mild FX drift; we still emit the per-vendor
      // amounts so the UI shows the actual prices.
      chosen = (usd <= eur * 1.09) ? 'tcgplayer' : 'cardmarket';
    } else if (usd != null) {
      chosen = 'tcgplayer';
    } else if (eur != null) {
      chosen = 'cardmarket';
    } else {
      unpriced += 1;
    }
    if (chosen === 'tcgplayer') tcgplayerTotal += usd * r.count;
    if (chosen === 'cardmarket') cardmarketTotal += eur * r.count;
    rows.push({ ...r, chosenVendor: chosen });
  }
  return { rows, tcgplayerTotal, cardmarketTotal, unpriced };
}

/**
 * "Single cart" totals — what the buylist would cost if you bought
 * every card from one vendor. Cards with no price at that vendor are
 * counted in `unpriced` so the UI can call them out.
 */
export function singleCartTotals(buylist) {
  const out = {};
  for (const vendor of BUYLIST_VENDORS) {
    let total = 0;
    let unpriced = 0;
    let priced = 0;
    for (const r of buylist) {
      const p = r.prices[vendor];
      if (p == null) unpriced += r.count;
      else { total += p * r.count; priced += r.count; }
    }
    out[vendor] = { total, priced, unpriced };
  }
  return out;
}

/* ─── CSV export ───────────────────────────────────────────────────────── */

function escapeCsvField(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * TCGplayer mass-entry CSV. Their import box accepts a header row of
 * `Quantity,Name` (printing / set columns are optional and ignored
 * if missing). Includes a header row so the user can paste straight
 * in or save to a `.csv`.
 */
export function toTcgplayerCsv(buylist) {
  const lines = ['Quantity,Name'];
  for (const r of buylist) {
    lines.push(`${r.count},${escapeCsvField(r.name)}`);
  }
  return lines.join('\n');
}
