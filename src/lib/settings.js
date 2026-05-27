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
  currency: 'usd',              // 'usd' | 'eur' — affects price display
  prefRetailer: 'cardkingdom',  // 'cardkingdom' | 'tcgplayer' | 'cardmarket' — affiliate buy links
};

let cache = null;

export function loadSettings() {
  if (cache) return cache;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    cache = { ...DEFAULTS, ...stored };
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
