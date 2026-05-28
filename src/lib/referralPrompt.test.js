import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isReferralEligible,
  dismissReferralPrompt,
  referralRemindLater,
  markReferralShown,
  clearReferralPrompt,
  REFERRAL_DISMISSED_KEY,
  REFERRAL_REMIND_AFTER_KEY,
  REFERRAL_SHOWN_AT_KEY,
  REFERRAL_REMIND_LATER_DAYS,
} from './referralPrompt.js';

// `node` test environment — no window/localStorage. In-memory shim so the
// storage paths actually run (mirrors tipPrompt.test.js).
function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

let originalWindow;
beforeEach(() => {
  originalWindow = globalThis.window;
  globalThis.window = { localStorage: createMemoryStorage() };
});
afterEach(() => {
  globalThis.window = originalWindow;
});

const storage = () => globalThis.window.localStorage;
const eligible = (over = {}) =>
  isReferralEligible({ region: 'uk', referrerConfigured: true, ...over });

describe('isReferralEligible', () => {
  it('is eligible for UK and EU when a referrer is configured', () => {
    expect(eligible({ region: 'uk' })).toBe(true);
    expect(eligible({ region: 'eu' })).toBe(true);
  });

  it('is not eligible for the US or an unknown region', () => {
    expect(eligible({ region: 'us' })).toBe(false);
    expect(eligible({ region: null })).toBe(false);
  });

  it('is not eligible when no referrer username is configured', () => {
    expect(eligible({ referrerConfigured: false })).toBe(false);
  });

  it('is not eligible once permanently dismissed', () => {
    storage().setItem(REFERRAL_DISMISSED_KEY, '1');
    expect(eligible()).toBe(false);
  });

  it('respects an active remind-after window, then frees up after it', () => {
    const now = Date.now();
    storage().setItem(REFERRAL_REMIND_AFTER_KEY, new Date(now + 10_000).toISOString());
    expect(eligible({ now })).toBe(false);
    expect(eligible({ now: now + 20_000 })).toBe(true);
  });
});

describe('dismiss / remind / shown writers', () => {
  it('dismissReferralPrompt sets the dismissed flag and clears any remind-after', () => {
    storage().setItem(REFERRAL_REMIND_AFTER_KEY, new Date().toISOString());
    dismissReferralPrompt();
    expect(storage().getItem(REFERRAL_DISMISSED_KEY)).toBe('1');
    expect(storage().getItem(REFERRAL_REMIND_AFTER_KEY)).toBe(null);
  });

  it('referralRemindLater sets a future remind-after and clears dismissed', () => {
    storage().setItem(REFERRAL_DISMISSED_KEY, '1');
    const now = Date.now();
    referralRemindLater(REFERRAL_REMIND_LATER_DAYS, now);
    const ts = Date.parse(storage().getItem(REFERRAL_REMIND_AFTER_KEY));
    expect(ts).toBeGreaterThan(now);
    expect(storage().getItem(REFERRAL_DISMISSED_KEY)).toBe(null);
  });

  it('markReferralShown records a timestamp; clearReferralPrompt wipes all keys', () => {
    markReferralShown();
    expect(storage().getItem(REFERRAL_SHOWN_AT_KEY)).toBeTruthy();
    dismissReferralPrompt();
    clearReferralPrompt();
    expect(storage().getItem(REFERRAL_SHOWN_AT_KEY)).toBe(null);
    expect(storage().getItem(REFERRAL_DISMISSED_KEY)).toBe(null);
  });
});
