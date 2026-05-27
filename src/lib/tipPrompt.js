/**
 * Tip-jar prompt state — controls when the engagement-gated CTA modal
 * is allowed to auto-open.
 *
 * The CTA is engagement-gated: App.jsx starts a delay timer when the
 * user does something meaningful (create / roll / save / import a deck)
 * and consults `isPromptEligible()` when the timer fires. The user can
 * dismiss forever (Close →) or defer with "Maybe later" (~30 days).
 *
 * Already-supporters and builds without a tip jar configured are
 * filtered upstream — see `isPromptEligible()`.
 */

export const PROMPT_DISMISSED_KEY = 'vault:tipPrompt:dismissed';
export const PROMPT_REMIND_AFTER_KEY = 'vault:tipPrompt:remindAfter';
export const PROMPT_SHOWN_AT_KEY = 'vault:tipPrompt:shownAt';

export const DEFAULT_ENGAGEMENT_DELAY_MS = 5 * 60 * 1000;
export const REMIND_LATER_DAYS = 30;

function safeStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Should the auto-prompt be allowed to fire right now?
 *
 *   supporter        — the user already tipped; never re-prompt
 *   tipsConfigured   — `hasTipJar()` from billing.js; nothing to show otherwise
 *   now              — injectable clock for tests; defaults to Date.now()
 */
export function isPromptEligible({ supporter = false, tipsConfigured = true, now = Date.now() } = {}) {
  if (!tipsConfigured) return false;
  if (supporter) return false;

  const storage = safeStorage();
  if (!storage) return true;

  if (storage.getItem(PROMPT_DISMISSED_KEY) === '1') return false;

  const remindAfter = storage.getItem(PROMPT_REMIND_AFTER_KEY);
  if (remindAfter) {
    const ts = Date.parse(remindAfter);
    if (Number.isFinite(ts) && ts > now) return false;
  }

  return true;
}

export function dismissTipPrompt() {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(PROMPT_DISMISSED_KEY, '1');
  storage.removeItem(PROMPT_REMIND_AFTER_KEY);
}

export function remindLater(daysFromNow = REMIND_LATER_DAYS, now = Date.now()) {
  const storage = safeStorage();
  if (!storage) return;
  const remindAt = new Date(now + daysFromNow * 24 * 60 * 60 * 1000);
  storage.setItem(PROMPT_REMIND_AFTER_KEY, remindAt.toISOString());
  storage.removeItem(PROMPT_DISMISSED_KEY);
}

export function markPromptShown(now = Date.now()) {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(PROMPT_SHOWN_AT_KEY, new Date(now).toISOString());
}

export function clearTipPrompt() {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(PROMPT_DISMISSED_KEY);
  storage.removeItem(PROMPT_REMIND_AFTER_KEY);
  storage.removeItem(PROMPT_SHOWN_AT_KEY);
}
