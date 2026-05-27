import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isPromptEligible,
  dismissTipPrompt,
  remindLater,
  markPromptShown,
  clearTipPrompt,
  PROMPT_DISMISSED_KEY,
  PROMPT_REMIND_AFTER_KEY,
  PROMPT_SHOWN_AT_KEY,
  REMIND_LATER_DAYS,
} from './tipPrompt.js';

// Vitest runs under the `node` environment for this project — no
// `window` / `localStorage`. Stand up a tiny in-memory shim so the
// storage paths in tipPrompt.js actually get exercised.
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

describe('isPromptEligible', () => {
  it('returns true by default when tips are configured and the user is not a supporter', () => {
    expect(isPromptEligible({ supporter: false, tipsConfigured: true })).toBe(true);
  });

  it('returns false when the build has no tip jar configured', () => {
    expect(isPromptEligible({ supporter: false, tipsConfigured: false })).toBe(false);
  });

  it('returns false when the user is already a supporter', () => {
    expect(isPromptEligible({ supporter: true, tipsConfigured: true })).toBe(false);
  });

  it('returns false once the user has dismissed forever', () => {
    dismissTipPrompt();
    expect(isPromptEligible({})).toBe(false);
  });

  it('returns false while a future remind-after timestamp is set', () => {
    const now = Date.now();
    remindLater(30, now);
    expect(isPromptEligible({ now: now + 1000 })).toBe(false);
  });

  it('returns true once the remind-after timestamp is in the past', () => {
    const now = Date.now();
    remindLater(30, now);
    const future = now + (REMIND_LATER_DAYS + 1) * 24 * 60 * 60 * 1000;
    expect(isPromptEligible({ now: future })).toBe(true);
  });

  it('ignores a malformed remind-after value', () => {
    storage().setItem(PROMPT_REMIND_AFTER_KEY, 'not-a-date');
    expect(isPromptEligible({})).toBe(true);
  });
});

describe('dismissTipPrompt', () => {
  it('sets the dismissed flag and clears any pending remind-later', () => {
    remindLater(30);
    dismissTipPrompt();
    expect(storage().getItem(PROMPT_DISMISSED_KEY)).toBe('1');
    expect(storage().getItem(PROMPT_REMIND_AFTER_KEY)).toBeNull();
  });
});

describe('remindLater', () => {
  it('writes a future ISO timestamp and clears any prior dismissal', () => {
    dismissTipPrompt();
    const now = Date.parse('2026-01-01T00:00:00Z');
    remindLater(30, now);
    expect(storage().getItem(PROMPT_DISMISSED_KEY)).toBeNull();
    const stored = storage().getItem(PROMPT_REMIND_AFTER_KEY);
    expect(stored).toBe('2026-01-31T00:00:00.000Z');
  });
});

describe('markPromptShown / clearTipPrompt', () => {
  it('records the shown-at timestamp and clears all keys on reset', () => {
    markPromptShown(Date.parse('2026-01-01T00:00:00Z'));
    expect(storage().getItem(PROMPT_SHOWN_AT_KEY)).toBe('2026-01-01T00:00:00.000Z');
    remindLater(30);
    clearTipPrompt();
    expect(storage().getItem(PROMPT_DISMISSED_KEY)).toBeNull();
    expect(storage().getItem(PROMPT_REMIND_AFTER_KEY)).toBeNull();
    expect(storage().getItem(PROMPT_SHOWN_AT_KEY)).toBeNull();
  });
});
