/**
 * Tip-jar helpers — PayPal.Me link construction + preset amounts.
 *
 * Phase 2b uses PayPal.Me only: zero PayPal-dashboard setup, no SDK to load,
 * no CSP changes (the current production CSP blocks paypalobjects.com). Tips
 * land in Steve's PayPal account; the supporter badge is flipped manually
 * for now. Phase 2c will add the PayPal Donate SDK + webhook so the badge
 * gets attributed automatically — at that point the SDK script gets allow-
 * listed in CSP and we replace the link with the in-page button.
 */

const PAYPAL_ME_BASE = (import.meta?.env?.VITE_PAYPAL_ME_URL || '').trim();

export const TIP_PRESETS = [3, 5, 10];

/** True when the build has a PayPal.Me URL configured. */
export function hasTipJar() {
  return !!PAYPAL_ME_BASE;
}

/**
 * Returns the PayPal.Me URL with an optional amount appended.
 * `amount` is a USD integer (PayPal.Me defaults to USD when no currency
 * code is present). Returns null when no PayPal.Me URL is configured.
 */
export function paypalMeUrl(amount) {
  if (!PAYPAL_ME_BASE) return null;
  const base = PAYPAL_ME_BASE.replace(/\/+$/, '');
  if (amount != null && Number.isFinite(amount) && amount > 0) {
    return `${base}/${Math.floor(amount)}`;
  }
  return base;
}
