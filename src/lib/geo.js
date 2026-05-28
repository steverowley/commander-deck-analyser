/**
 * Lightweight region detection used to seed sensible currency + buy-link
 * defaults for a first-time visitor.
 *
 * Detection is best-effort and runs once per device (App.jsx gates it
 * behind a `vault:geoApplied` flag and never overrides a user who has
 * already saved settings). Two signals, in order:
 *
 *   1. IP geolocation via a keyless free service (ipapi.co). More
 *      accurate, but a network call — wrapped in a short timeout.
 *   2. Browser timezone + language. Zero network, always available.
 *
 * Functions take injectable inputs (timeZone / language / fetchImpl) so
 * they're testable under the `node` test environment without stubbing
 * globals.
 */

// Map a region key to the settings we want a new user in that region to
// start with. Consumed by `applyRegionDefaults` in settings.js.
export const REGION_DEFAULTS = {
  uk: { currency: 'gbp', prefRetailer: 'cardmarket', prefPriceSource: 'cardmarket' },
  eu: { currency: 'eur', prefRetailer: 'cardmarket', prefPriceSource: 'cardmarket' },
  us: { currency: 'usd', prefRetailer: 'tcgplayer', prefPriceSource: 'tcgplayer' },
};

// EU + EEA + Switzerland — the continental-Europe footprint Cardmarket
// serves. GB is handled separately (→ uk) so it gets GBP display.
const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE', // EU
  'NO', 'IS', 'LI', 'CH', // EEA + Switzerland
]);

const UK_TIMEZONES = new Set([
  'Europe/London', 'Europe/Belfast', 'Europe/Guernsey',
  'Europe/Isle_of_Man', 'Europe/Jersey',
]);

/** ISO 3166-1 alpha-2 country code → region key, or null if unmapped. */
export function regionForCountry(cc) {
  if (!cc) return null;
  const c = String(cc).trim().toUpperCase();
  if (c === 'GB' || c === 'UK') return 'uk';
  if (c === 'US') return 'us';
  if (EU_COUNTRIES.has(c)) return 'eu';
  return null;
}

/**
 * Synchronous fallback: derive a region from the browser timezone, with
 * the locale's country code as a tiebreaker. Returns null when nothing
 * matches (caller leaves defaults untouched).
 */
export function detectRegionFromTimezoneLocale(opts = {}) {
  let { timeZone, language } = opts;
  if (timeZone === undefined) {
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { timeZone = null; }
  }
  if (language === undefined) {
    try { language = typeof navigator !== 'undefined' ? navigator.language : null; } catch { language = null; }
  }

  if (timeZone) {
    if (UK_TIMEZONES.has(timeZone)) return 'uk';
    if (timeZone.startsWith('Europe/')) return 'eu';
    if (timeZone.startsWith('America/')) return 'us';
  }

  // Locale tiebreaker — e.g. 'en-GB' → GB, 'de-DE' → DE.
  if (language) {
    const m = /[-_]([A-Za-z]{2})$/.exec(language);
    if (m) {
      const r = regionForCountry(m[1]);
      if (r) return r;
    }
  }

  return null;
}

/**
 * Best-effort IP geolocation. Resolves to a region key or null on any
 * failure (offline, blocked, timeout, unmapped country).
 */
export async function detectRegionViaIp(opts = {}) {
  const {
    fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
    timeoutMs = 2000,
    url = 'https://ipapi.co/json/',
  } = opts;
  if (!fetchImpl) return null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
    if (!res || !res.ok) return null;
    const data = await res.json();
    return regionForCountry(data?.country_code || data?.country);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** IP first, timezone/locale fallback. Resolves to a region key or null. */
export async function detectRegion(opts = {}) {
  const viaIp = await detectRegionViaIp(opts);
  if (viaIp) return viaIp;
  return detectRegionFromTimezoneLocale(opts);
}
