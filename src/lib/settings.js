/**
 * App-wide settings persisted to localStorage.
 *
 * Settings are intentionally limited to preferences that affect the
 * whole app (defaults for new decks, display tweaks). Per-deck state
 * lives on the deck itself.
 */

const KEY = 'vault:settings-v1';

const DEFAULTS = {
  strictIdentityDefault: false, // turn strict mode on automatically for new decks
  currency: 'usd',              // 'usd' | 'eur' | 'gbp' — affects price display
  prefRetailer: 'cardkingdom',  // 'cardkingdom' | 'tcgplayer' | 'cardmarket' — affiliate buy links / cart icon
  prefPriceSource: 'tcgplayer', // 'tcgplayer' | 'cardmarket' — where displayed prices come from
};

let cache = null;

// `prefPriceSource` was added after `prefRetailer`. Existing users who
// had Card Kingdom selected (the previous default) carry a stale value
// of `undefined` here — fall back to TCGplayer for them (matches what
// the CK proxy used to read, just without the misleading "CK price"
// label). Users who had TCG/CM selected get migrated to that source so
// the displayed numbers don't shift on them.
function migrate(stored) {
  if (stored.prefPriceSource) return stored;
  const r = stored.prefRetailer;
  return { ...stored, prefPriceSource: r === 'cardmarket' ? 'cardmarket' : 'tcgplayer' };
}

export function loadSettings() {
  if (cache) return cache;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    cache = migrate({ ...DEFAULTS, ...stored });
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function saveSettings(next) {
  cache = { ...DEFAULTS, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
  return cache;
}

export function updateSetting(key, value) {
  const settings = loadSettings();
  return saveSettings({ ...settings, [key]: value });
}

export const SETTING_DEFAULTS = DEFAULTS;
