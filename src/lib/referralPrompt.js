/**
 * Cardmarket referral prompt state — controls when the dedicated
 * refer-a-friend pop-up is allowed to auto-open for UK/EU players.
 *
 * Mirrors the tip-jar prompt (`tipPrompt.js`): App.jsx starts a delay
 * timer on the user's first meaningful engagement and consults
 * `isReferralEligible()` when it fires. The two prompts share App.jsx's
 * one-auto-prompt-per-session guard, so a user never sees both at once;
 * the referral takes priority for UK/EU, the tip jar covers everyone
 * else. The user can dismiss forever (Close →) or defer ~30 days
 * ("Maybe later").
 *
 * Only fires when a Cardmarket referrer username is configured
 * (`cardmarketReferrerUsername()`) — without it there's nothing to refer.
 */

export const REFERRAL_DISMISSED_KEY = 'vault:referralPrompt:dismissed';
export const REFERRAL_REMIND_AFTER_KEY = 'vault:referralPrompt:remindAfter';
export const REFERRAL_SHOWN_AT_KEY = 'vault:referralPrompt:shownAt';

export const REFERRAL_REMIND_LATER_DAYS = 30;

function safeStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Should the referral auto-prompt be allowed to fire right now?
 *
 *   region              — only 'uk' / 'eu' players see it
 *   referrerConfigured  — `!!cardmarketReferrerUsername()`; nothing to show otherwise
 *   now                 — injectable clock for tests; defaults to Date.now()
 */
export function isReferralEligible({ region, referrerConfigured = false, now = Date.now() } = {}) {
  if (!referrerConfigured) return false;
  if (region !== 'uk' && region !== 'eu') return false;

  const storage = safeStorage();
  if (!storage) return true;

  if (storage.getItem(REFERRAL_DISMISSED_KEY) === '1') return false;

  const remindAfter = storage.getItem(REFERRAL_REMIND_AFTER_KEY);
  if (remindAfter) {
    const ts = Date.parse(remindAfter);
    if (Number.isFinite(ts) && ts > now) return false;
  }

  return true;
}

export function dismissReferralPrompt() {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(REFERRAL_DISMISSED_KEY, '1');
  storage.removeItem(REFERRAL_REMIND_AFTER_KEY);
}

export function referralRemindLater(daysFromNow = REFERRAL_REMIND_LATER_DAYS, now = Date.now()) {
  const storage = safeStorage();
  if (!storage) return;
  const remindAt = new Date(now + daysFromNow * 24 * 60 * 60 * 1000);
  storage.setItem(REFERRAL_REMIND_AFTER_KEY, remindAt.toISOString());
  storage.removeItem(REFERRAL_DISMISSED_KEY);
}

export function markReferralShown(now = Date.now()) {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(REFERRAL_SHOWN_AT_KEY, new Date(now).toISOString());
}

export function clearReferralPrompt() {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(REFERRAL_DISMISSED_KEY);
  storage.removeItem(REFERRAL_REMIND_AFTER_KEY);
  storage.removeItem(REFERRAL_SHOWN_AT_KEY);
}
