/**
 * Tip-jar helpers — PayPal.Me link construction + Donate SDK loader.
 *
 * Two tipping paths:
 *
 * 1. **PayPal.Me** (Phase 2b) — preset $ buttons open paypal.me/<handle>/N
 *    in a new tab. Zero PayPal-dashboard setup, no SDK, no CSP changes.
 *    Tips land in Steve's PayPal account; the supporter badge is flipped
 *    manually for now.
 *
 * 2. **PayPal Donate SDK** (Phase 2c) — in-page Donate button that
 *    passes the tipper's Supabase user_id as `custom`. PayPal posts to
 *    the paypal-webhook edge function on PAYMENT.SALE.COMPLETED, which
 *    flips supporter=true automatically.
 *
 * The modal chooses the SDK path when a hosted button ID is configured
 * AND the user is signed in (so we have a user_id to attribute). Otherwise
 * falls back to PayPal.Me.
 */

const PAYPAL_ME_BASE = (import.meta?.env?.VITE_PAYPAL_ME_URL || '').trim();
const PAYPAL_DONATE_BUTTON_ID = (import.meta?.env?.VITE_PAYPAL_BUTTON_ID || '').trim();
const PAYPAL_ENV = (import.meta?.env?.VITE_PAYPAL_ENV || 'sandbox').trim().toLowerCase();
const DONATE_SDK_URL = 'https://www.paypalobjects.com/donate/sdk/donate-sdk.js';

export const TIP_PRESETS = [3, 5, 10];

/** True when the build has a PayPal.Me URL configured. */
export function hasTipJar() {
  return !!PAYPAL_ME_BASE;
}

/** True when the build has a PayPal Donate hosted button ID configured. */
export function hasDonateButton() {
  return !!PAYPAL_DONATE_BUTTON_ID;
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

let sdkLoadPromise = null;

/**
 * Lazy-loads the PayPal Donate SDK. Resolves once `window.PayPal.Donation`
 * is available. Reused across calls (the SDK is a one-shot script tag).
 * Throws if loading fails — usually a CSP miss or offline.
 */
export function loadDonateSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.PayPal?.Donation) return Promise.resolve(window.PayPal.Donation);
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = DONATE_SDK_URL;
    script.async = true;
    script.onload = () => {
      if (window.PayPal?.Donation) {
        resolve(window.PayPal.Donation);
      } else {
        reject(new Error('Donate SDK loaded but window.PayPal.Donation missing'));
      }
    };
    script.onerror = () => {
      sdkLoadPromise = null; // allow retry
      reject(new Error('Failed to load PayPal Donate SDK (CSP or network)'));
    };
    document.body.appendChild(script);
  });
  return sdkLoadPromise;
}

/**
 * Render the Donate button into `container`. `userId` is passed through
 * as PayPal's `custom` field so the webhook can flip the supporter flag.
 * If `userId` is null the button still renders but no auto-attribution
 * happens — caller should show a "sign in first" hint in that case.
 */
export async function renderDonateButton(container, { userId } = {}) {
  if (!container || !hasDonateButton()) return;
  const Donation = await loadDonateSdk();
  // Wipe any previous render — Donation.Button mounts new DOM on each call.
  container.innerHTML = '';
  const config = {
    env: PAYPAL_ENV === 'live' ? 'production' : 'sandbox',
    hosted_button_id: PAYPAL_DONATE_BUTTON_ID,
    image: {
      src: 'https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif',
      alt: 'Donate with PayPal',
      title: 'Tip Vault via PayPal',
    },
  };
  if (userId) {
    config.custom = userId;
  }
  Donation.Button(config).render(container);
}

