import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('VITE_CARDKINGDOM_PARTNER', 'vault');
vi.stubEnv('VITE_TCGPLAYER_IMPACT_PREFIX', 'https://impact.example/click?irgwc=1');
vi.stubEnv('VITE_CARDMARKET_REFERRER_USERNAME', 'vaultmtg');

const { buyUrlFor, defaultRetailer, RETAILERS, RETAILER_LABEL, hasAffiliateProgram, cardmarketReferralUrl, cardmarketReferrerUsername } = await import('./affiliate.js');
const { saveSettings, SETTING_DEFAULTS } = await import('./settings.js');

const SOL_RING = { name: 'Sol Ring', set: 'lea', collector_number: '270' };

beforeEach(() => {
  saveSettings(SETTING_DEFAULTS);
});

describe('affiliate URLs', () => {
  it('Card Kingdom URL contains partner code and partner_args=single', () => {
    const url = buyUrlFor(SOL_RING, 'cardkingdom');
    expect(url).toContain('cardkingdom.com/catalog/search');
    expect(url).toContain('partner=vault');
    expect(url).toContain('partner_args=single');
    expect(url).toMatch(/filter%5Bname%5D=Sol\+Ring/);
  });

  it('TCGplayer URL wraps in the Impact prefix when set', () => {
    const url = buyUrlFor(SOL_RING, 'tcgplayer');
    expect(url.startsWith('https://impact.example/click?irgwc=1&u=')).toBe(true);
    const inner = decodeURIComponent(url.split('&u=')[1]);
    expect(inner).toContain('tcgplayer.com/search/magic/product');
    expect(inner).toContain('q=Sol%20Ring');
  });

  it('Cardmarket URL is plain — no affiliate code', () => {
    const url = buyUrlFor(SOL_RING, 'cardmarket');
    expect(url).toContain('cardmarket.com/en/Magic/Products/Search');
    expect(url).toContain('searchString=Sol%20Ring');
    expect(url).not.toContain('partner');
    expect(url).not.toContain('affiliate');
  });

  it('split-card names use only the first face', () => {
    const split = { name: 'Fire // Ice' };
    const url = buyUrlFor(split, 'cardkingdom');
    expect(url).toMatch(/filter%5Bname%5D=Fire/);
    expect(url).not.toContain('Ice');
  });

  it('returns null for cards with no name', () => {
    expect(buyUrlFor({}, 'cardkingdom')).toBe(null);
    expect(buyUrlFor(null, 'cardkingdom')).toBe(null);
  });
});

describe('defaultRetailer', () => {
  it("falls back to Card Kingdom when nothing is saved", () => {
    expect(defaultRetailer()).toBe('cardkingdom');
  });

  it('honors the saved preference', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'tcgplayer' });
    expect(defaultRetailer()).toBe('tcgplayer');
  });

  it("ignores garbage values and falls back", () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'ebay' });
    expect(defaultRetailer()).toBe('cardkingdom');
  });
});

describe('retailer metadata', () => {
  it('RETAILERS has the three known entries with labels', () => {
    expect(RETAILERS).toEqual(['cardkingdom', 'tcgplayer', 'cardmarket']);
    for (const r of RETAILERS) {
      expect(RETAILER_LABEL[r]).toBeTruthy();
    }
  });

  it('hasAffiliateProgram reflects which retailers earn revenue per URL', () => {
    expect(hasAffiliateProgram('cardkingdom')).toBe(true);
    expect(hasAffiliateProgram('tcgplayer')).toBe(true);
    expect(hasAffiliateProgram('cardmarket')).toBe(false);
  });
});

describe('Cardmarket referral', () => {
  it('exposes the referral page URL', () => {
    expect(cardmarketReferralUrl()).toBe('https://www.cardmarket.com/en/Magic/Users/Refer');
  });

  it('returns the configured referrer username', () => {
    expect(cardmarketReferrerUsername()).toBe('vaultmtg');
  });
});
