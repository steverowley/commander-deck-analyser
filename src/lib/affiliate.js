/**
 * Affiliate buy-link builders.
 *
 * Three retailers supported:
 *   - cardkingdom: simple `?partner=<code>` URL parameter on a search-by-name page.
 *     Pattern matches verified Archidekt deep links.
 *   - tcgplayer: search-by-name URL wrapped in an Impact deep-link prefix
 *     (Impact handles attribution + redirects to the real product page).
 *   - cardmarket: plain search URL — no per-URL affiliate. Cardmarket's
 *     refer-a-friend program attributes at signup only (see
 *     `cardmarketReferralUrl` below).
 *
 * If env vars are absent the URLs still resolve, just without affiliate
 * attribution. That keeps local dev / contributor builds usable.
 */
import { loadSettings } from './settings.js';

export const RETAILERS = ['cardkingdom', 'tcgplayer', 'cardmarket'];

export const RETAILER_LABEL = {
  cardkingdom: 'Card Kingdom',
  tcgplayer: 'TCGplayer',
  cardmarket: 'Cardmarket',
};

const CARDKINGDOM_PARTNER = (import.meta?.env?.VITE_CARDKINGDOM_PARTNER || '').trim();
const TCGPLAYER_IMPACT_PREFIX = (import.meta?.env?.VITE_TCGPLAYER_IMPACT_PREFIX || '').trim();
const CARDMARKET_REFERRER = (import.meta?.env?.VITE_CARDMARKET_REFERRER_USERNAME || '').trim();

function safeName(card) {
  return (card?.name || '').split('//')[0].trim();
}

function tcgplayerSearchUrl(name) {
  const q = encodeURIComponent(name);
  return `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${q}`;
}

function wrapImpact(url) {
  if (!TCGPLAYER_IMPACT_PREFIX) return url;
  const sep = TCGPLAYER_IMPACT_PREFIX.includes('?') ? '&' : '?';
  return `${TCGPLAYER_IMPACT_PREFIX}${sep}u=${encodeURIComponent(url)}`;
}

function cardKingdomUrl(name) {
  const params = new URLSearchParams({
    search: 'header',
    'filter[name]': name,
  });
  if (CARDKINGDOM_PARTNER) {
    params.set('partner', CARDKINGDOM_PARTNER);
    params.set('partner_args', 'single');
  }
  return `https://www.cardkingdom.com/catalog/search?${params.toString()}`;
}

function cardmarketUrl(name) {
  const q = encodeURIComponent(name);
  return `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${q}`;
}

export function buyUrlFor(card, retailer) {
  const name = safeName(card);
  if (!name) return null;
  const r = retailer || defaultRetailer();
  switch (r) {
    case 'tcgplayer':
      return wrapImpact(tcgplayerSearchUrl(name));
    case 'cardmarket':
      return cardmarketUrl(name);
    case 'cardkingdom':
    default:
      return cardKingdomUrl(name);
  }
}

export function defaultRetailer() {
  const s = loadSettings();
  const r = s?.prefRetailer;
  return RETAILERS.includes(r) ? r : 'cardkingdom';
}

export function cardmarketReferralUrl() {
  return 'https://www.cardmarket.com/en/Magic/Users/Refer';
}

export function cardmarketReferrerUsername() {
  return CARDMARKET_REFERRER || null;
}

export function openExternal(url) {
  if (!url || typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function hasAffiliateProgram(retailer) {
  if (retailer === 'cardkingdom') return !!CARDKINGDOM_PARTNER;
  if (retailer === 'tcgplayer') return !!TCGPLAYER_IMPACT_PREFIX;
  return false;
}
