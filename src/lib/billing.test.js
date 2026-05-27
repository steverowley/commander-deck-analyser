import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('VITE_PAYPAL_ME_URL', 'https://paypal.me/vaultmtg');
vi.stubEnv('VITE_PAYPAL_BUTTON_ID', 'ABCDEF1234567');
vi.stubEnv('VITE_PAYPAL_ENV', 'sandbox');

const { paypalMeUrl, hasTipJar, hasDonateButton, TIP_PRESETS } = await import('./billing.js');

describe('paypalMeUrl', () => {
  it('returns the base URL when no amount is given', () => {
    expect(paypalMeUrl()).toBe('https://paypal.me/vaultmtg');
  });

  it('appends a positive integer amount', () => {
    expect(paypalMeUrl(5)).toBe('https://paypal.me/vaultmtg/5');
    expect(paypalMeUrl(10)).toBe('https://paypal.me/vaultmtg/10');
  });

  it('floors fractional amounts (PayPal.Me only accepts integers in the URL path)', () => {
    expect(paypalMeUrl(3.99)).toBe('https://paypal.me/vaultmtg/3');
  });

  it('strips trailing slashes on the base URL', () => {
    vi.resetModules();
    vi.stubEnv('VITE_PAYPAL_ME_URL', 'https://paypal.me/vaultmtg/');
    return import('./billing.js').then((m) => {
      expect(m.paypalMeUrl(5)).toBe('https://paypal.me/vaultmtg/5');
    });
  });

  it('rejects non-positive / non-finite amounts and falls back to the base URL', () => {
    expect(paypalMeUrl(0)).toBe('https://paypal.me/vaultmtg');
    expect(paypalMeUrl(-5)).toBe('https://paypal.me/vaultmtg');
    expect(paypalMeUrl(NaN)).toBe('https://paypal.me/vaultmtg');
    expect(paypalMeUrl(null)).toBe('https://paypal.me/vaultmtg');
  });
});

describe('hasTipJar', () => {
  it('is true when VITE_PAYPAL_ME_URL is set', () => {
    expect(hasTipJar()).toBe(true);
  });
});

describe('TIP_PRESETS', () => {
  it('exposes preset USD amounts', () => {
    expect(TIP_PRESETS).toEqual([3, 5, 10]);
  });
});

describe('hasDonateButton', () => {
  it('is true when VITE_PAYPAL_BUTTON_ID is set', () => {
    expect(hasDonateButton()).toBe(true);
  });
});

describe('unconfigured build', () => {
  it('hasTipJar is false and paypalMeUrl returns null when env var is empty', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PAYPAL_ME_URL', '');
    const m = await import('./billing.js');
    expect(m.hasTipJar()).toBe(false);
    expect(m.paypalMeUrl(5)).toBeNull();
  });

  it('hasDonateButton is false when VITE_PAYPAL_BUTTON_ID is empty', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PAYPAL_BUTTON_ID', '');
    const m = await import('./billing.js');
    expect(m.hasDonateButton()).toBe(false);
  });
});
