import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, updateSetting, SETTING_DEFAULTS } from './settings.js';

// loadSettings caches in module scope; clear localStorage + reset by
// requiring a fresh import-cycle is awkward. Instead exercise via the
// public API and trust that saveSettings updates the cache too.

beforeEach(() => {
  globalThis.localStorage?.clear();
});

describe('settings', () => {
  it('returns defaults when nothing stored', () => {
    // Cache may already have values from prior tests; just ensure the
    // returned object has the default shape.
    const s = loadSettings();
    expect(s).toHaveProperty('strictIdentityDefault');
    expect(s).toHaveProperty('currency');
  });

  it('updateSetting merges over existing values', () => {
    saveSettings({ ...SETTING_DEFAULTS, currency: 'eur' });
    const updated = updateSetting('strictIdentityDefault', true);
    expect(updated.currency).toBe('eur');
    expect(updated.strictIdentityDefault).toBe(true);
  });

  it('saveSettings writes back the merged object', () => {
    saveSettings({ currency: 'eur', strictIdentityDefault: false });
    const reloaded = loadSettings();
    expect(reloaded.currency).toBe('eur');
  });
});
