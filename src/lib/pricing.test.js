import { describe, it, expect, beforeEach } from 'vitest';
import { cardPrice, cardPriceDetails, deckTotalPrice, deckPriceTooltip, formatPrice, isConverted, activePriceSource, activeVendor, vendorLabel, priceTooltip, PRICE_VENDORS } from './pricing.js';
import { saveSettings, SETTING_DEFAULTS } from './settings.js';

// Each test resets settings to the defaults so the active price source
// is deterministic. Tests that need a specific source flip
// prefPriceSource (and prefRetailer for buy-link assertions).
beforeEach(() => {
  saveSettings(SETTING_DEFAULTS);
});

const fullPrices = (overrides = {}) => ({
  usd: '1.50', usd_foil: '5.00', usd_etched: '8.00',
  eur: '1.20', eur_foil: '4.00',
  tix: '0.05',
  ...overrides,
});

const priced = (name, prices, count = 1) => ({
  count, name,
  scryfall: { name, prices: typeof prices === 'string' ? { usd: prices } : prices },
});

describe('cardPrice', () => {
  it('parses Scryfall string prices (USD default)', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefPriceSource: 'tcgplayer' });
    expect(cardPrice({ prices: { usd: '1.50' } })).toBe(1.5);
  });

  it('returns null for missing or non-numeric prices', () => {
    expect(cardPrice({ prices: { usd: null } })).toBeNull();
    expect(cardPrice({ prices: {} })).toBeNull();
    expect(cardPrice({})).toBeNull();
    expect(cardPrice(null)).toBeNull();
  });

  it('Cardmarket vendor pulls the EUR field instead of USD', () => {
    const card = { prices: fullPrices() };
    expect(cardPrice(card, 'eur', 'cardmarket')).toBeCloseTo(1.2);
  });

  it('TCGplayer vendor with EUR display converts USD → EUR', () => {
    const card = { prices: { usd: '10.00' } };
    // 10 USD * 0.92 ≈ 9.20 EUR
    expect(cardPrice(card, 'eur', 'tcgplayer')).toBeCloseTo(9.2);
  });

  it('Card Kingdom is not a valid price source — returns null', () => {
    // CK was previously proxied from TCGplayer Mid; that proxy is gone
    // because the displayed numbers didn't match what users saw at the
    // CK store. CK lives on as a buy-link vendor only.
    const card = { prices: { usd: '3.00', eur: '2.50' } };
    expect(cardPrice(card, 'usd', 'cardkingdom')).toBeNull();
  });

  it('exposes only TCGplayer and Cardmarket as price-source vendors', () => {
    expect(PRICE_VENDORS).toEqual(['tcgplayer', 'cardmarket']);
  });

  it('Cardmarket with no EUR price returns null even if USD is present', () => {
    const card = { prices: { usd: '10.00', eur: null } };
    expect(cardPrice(card, 'eur', 'cardmarket')).toBeNull();
  });

  it('foil opt prefers the foil price field', () => {
    const card = { prices: fullPrices() };
    expect(cardPrice(card, 'usd', 'tcgplayer', { foil: true })).toBe(5);
    expect(cardPrice(card, 'eur', 'cardmarket', { foil: true })).toBeCloseTo(4);
  });

  it('foil falls back to non-foil when foil is missing', () => {
    const card = { prices: { usd: '1.50' } }; // no foil price
    expect(cardPrice(card, 'usd', 'tcgplayer', { foil: true })).toBe(1.5);
  });
});

describe('cardPriceDetails', () => {
  it('reports the source label and an exact flag for TCGplayer USD', () => {
    const d = cardPriceDetails({ prices: fullPrices() }, 'usd', 'tcgplayer');
    expect(d.amount).toBe(1.5);
    expect(d.vendor).toBe('tcgplayer');
    expect(d.vendorLabel).toContain('TCGplayer');
    expect(d.exact).toBe(true);
    expect(d.converted).toBe(false);
    expect(d.approximate).toBe(false);
    expect(d.notes.join(' ')).toContain('TCGplayer');
  });

  it('notes the buy-link vendor when it differs from the price source', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'cardkingdom', prefPriceSource: 'tcgplayer' });
    const d = cardPriceDetails({ prices: fullPrices() }, 'usd');
    expect(d.amount).toBe(1.5);
    expect(d.vendor).toBe('tcgplayer');
    expect(d.notes.some((n) => /Card Kingdom/.test(n) && /Cart icon/i.test(n))).toBe(true);
  });

  it('omits the buy-link note when buy-link and price source match', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'tcgplayer', prefPriceSource: 'tcgplayer' });
    const d = cardPriceDetails({ prices: fullPrices() }, 'usd');
    expect(d.notes.some((n) => /Cart icon/i.test(n))).toBe(false);
  });

  it('flags FX conversion when source and display currencies differ', () => {
    const d = cardPriceDetails({ prices: fullPrices() }, 'usd', 'cardmarket');
    expect(d.converted).toBe(true);
    expect(d.approximate).toBe(true);
    expect(d.notes.some((n) => /EUR.*USD/i.test(n))).toBe(true);
  });

  it('explains a foil → non-foil fallback', () => {
    const d = cardPriceDetails({ prices: { usd: '1.50' } }, 'usd', 'tcgplayer', { foil: true });
    expect(d.amount).toBe(1.5); // non-foil fallback price
    expect(d.notes.some((n) => /non-foil/i.test(n))).toBe(true);
  });

  it('returns a "no price" note when the card is unpriced for the vendor', () => {
    const d = cardPriceDetails({ prices: { usd: null } }, 'usd', 'tcgplayer');
    expect(d.amount).toBeNull();
    expect(d.notes[0]).toMatch(/No.*TCGplayer/i);
  });
});

describe('priceTooltip', () => {
  it('joins notes with newlines and lists every caveat (FX + buy-link)', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'cardkingdom', prefPriceSource: 'tcgplayer' });
    const d = cardPriceDetails({ prices: fullPrices() }, 'gbp');
    const tip = priceTooltip(d);
    expect(tip.split('\n').length).toBeGreaterThan(1);
    expect(tip).toContain('TCGplayer');
    expect(tip).toContain('GBP');
    expect(tip).toContain('Card Kingdom'); // buy-link note
  });
});

describe('deckTotalPrice', () => {
  it('sums prices × count and tracks unpriced cards (default vendor)', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefPriceSource: 'tcgplayer' });
    const deck = {
      cards: [
        priced('Sol Ring', '2.00'),
        priced('Bloodghast', '5.00', 1),
        { count: 1, name: 'Random Bear', scryfall: { name: 'Random Bear' } }, // unpriced
      ],
      commander: { name: 'Edgar', prices: { usd: '10.00' } },
    };
    const r = deckTotalPrice(deck);
    expect(r.total).toBeCloseTo(17.0);
    expect(r.priced).toBe(3);
    expect(r.unpriced).toBe(1);
    expect(r.vendor).toBe('tcgplayer');
    expect(r.approximate).toBe(true); // unpriced > 0
  });

  it('multiplies by card count (basics)', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefPriceSource: 'tcgplayer' });
    const deck = {
      cards: [priced('Forest', '0.10', 30)],
      commander: null,
    };
    expect(deckTotalPrice(deck).total).toBeCloseTo(3.0);
  });

  it('subtracts owned-collection cards from `toBuy`', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefPriceSource: 'tcgplayer' });
    const deck = {
      cards: [
        priced('Sol Ring', '2.00', 1),
        priced('Cyclonic Rift', '20.00', 1),
        priced('Mountain', '0.10', 10),
      ],
      commander: { name: 'Edgar', prices: { usd: '10.00' } },
    };
    const collection = {
      'sol ring': { name: 'Sol Ring', quantity: 1 },
      'mountain': { name: 'Mountain', quantity: 100 },
      'edgar': { name: 'Edgar', quantity: 1 },
    };
    const r = deckTotalPrice(deck, 'usd', collection);
    expect(r.total).toBeCloseTo(33.0);
    expect(r.ownedTotal).toBeCloseTo(13.0);
    expect(r.toBuy).toBeCloseTo(20.0);
    expect(r.ownedCount).toBe(12);
  });

  it('caps owned quantity at the deck count (4 in collection, 1 in deck = 1 counted)', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefPriceSource: 'tcgplayer' });
    const deck = { cards: [priced('Lightning Bolt', '0.50', 1)], commander: null };
    const r = deckTotalPrice(deck, 'usd', { 'lightning bolt': { quantity: 4 } });
    expect(r.ownedTotal).toBeCloseTo(0.5);
    expect(r.toBuy).toBeCloseTo(0);
    expect(r.ownedCount).toBe(1);
  });

  it('honours an explicit vendor argument over the active setting', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefPriceSource: 'tcgplayer' });
    const deck = {
      cards: [priced('Sol Ring', { usd: '2.00', eur: '1.50' })],
      commander: null,
    };
    const tcg = deckTotalPrice(deck, 'usd', null, 'tcgplayer');
    const cm = deckTotalPrice(deck, 'eur', null, 'cardmarket');
    expect(tcg.total).toBeCloseTo(2.0);
    expect(cm.total).toBeCloseTo(1.5);
  });

  it('reports the buy-link vendor alongside the price source', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'cardkingdom', prefPriceSource: 'tcgplayer' });
    const deck = { cards: [priced('Sol Ring', '2.00')], commander: null };
    const r = deckTotalPrice(deck);
    expect(r.vendor).toBe('tcgplayer');
    expect(r.buyLink).toBe('cardkingdom');
    expect(r.buyLinkLabel).toBe('Card Kingdom');
  });

  it('no longer marks fully-priced USD totals approximate when CK is the buy-link', () => {
    // Regression: pre-v0.20 this returned exact:false because CK was the
    // price source proxy. After decoupling, the price source is TCG so the
    // number is exact in USD — only the cart icon points at CK.
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'cardkingdom', prefPriceSource: 'tcgplayer' });
    const deck = { cards: [priced('Sol Ring', '2.00')], commander: null };
    const r = deckTotalPrice(deck);
    expect(r.exact).toBe(true);
    expect(r.approximate).toBe(false);
  });
});

describe('deckPriceTooltip', () => {
  it('mentions the vendor, unpriced count, and an FX caveat when relevant', () => {
    const tip = deckPriceTooltip({
      vendor: 'cardmarket',
      vendorLabel: 'Cardmarket (Trend)',
      sourceCurrency: 'eur',
      displayCurrency: 'usd',
      exact: true,
      converted: true,
      unpriced: 2,
      ownedTotal: 0,
      ownedCount: 0,
      buyLink: 'cardmarket',
      buyLinkLabel: 'Cardmarket',
    });
    expect(tip).toContain('Cardmarket');
    expect(tip).toContain('2 cards');
    expect(tip).toContain('EUR');
  });

  it('notes the buy-link target when it differs from the price source', () => {
    const tip = deckPriceTooltip({
      vendor: 'tcgplayer',
      vendorLabel: 'TCGplayer (Mid)',
      sourceCurrency: 'usd',
      displayCurrency: 'usd',
      exact: true,
      converted: false,
      unpriced: 0,
      ownedTotal: 0,
      ownedCount: 0,
      buyLink: 'cardkingdom',
      buyLinkLabel: 'Card Kingdom',
    });
    expect(tip).toContain('TCGplayer');
    expect(tip).toContain('Card Kingdom');
    expect(tip).toMatch(/actual price.*may differ/i);
  });
});

describe('isConverted', () => {
  it('returns true for GBP regardless of vendor', () => {
    expect(isConverted('gbp')).toBe(true);
    expect(isConverted('gbp', 'tcgplayer')).toBe(true);
  });

  it('returns true when vendor source currency differs from display', () => {
    expect(isConverted('usd', 'cardmarket')).toBe(true);
    expect(isConverted('eur', 'tcgplayer')).toBe(true);
  });

  it('returns false when vendor and currency line up exactly', () => {
    expect(isConverted('usd', 'tcgplayer')).toBe(false);
    expect(isConverted('eur', 'cardmarket')).toBe(false);
  });
});

describe('activePriceSource', () => {
  it('reads prefPriceSource from settings', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefPriceSource: 'cardmarket' });
    expect(activePriceSource()).toBe('cardmarket');
  });

  it('falls back to tcgplayer when prefPriceSource is unknown', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefPriceSource: 'cardkingdom' });
    expect(activePriceSource()).toBe('tcgplayer');
  });

  it('back-compat alias `activeVendor` matches `activePriceSource`', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefPriceSource: 'cardmarket' });
    expect(activeVendor()).toBe('cardmarket');
  });

  it('is independent of prefRetailer (buy-link vendor)', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'cardkingdom', prefPriceSource: 'cardmarket' });
    expect(activePriceSource()).toBe('cardmarket');
  });
});

describe('vendorLabel', () => {
  it('returns a friendly label for every supported price source', () => {
    expect(vendorLabel('tcgplayer')).toContain('TCGplayer');
    expect(vendorLabel('cardmarket')).toContain('Cardmarket');
  });

  it('returns an unknown placeholder for non-source vendors', () => {
    expect(vendorLabel('cardkingdom')).toContain('Unknown');
  });
});

describe('formatPrice', () => {
  it('formats < $100 with cents', () => {
    expect(formatPrice(15.5)).toBe('$15.50');
    expect(formatPrice(0.99)).toBe('$0.99');
  });
  it('formats 100-999 without cents', () => {
    expect(formatPrice(150)).toBe('$150');
  });
  it('formats >= 1000 with commas', () => {
    expect(formatPrice(1234.5)).toBe('$1,235');
  });
  it('falls back for missing/invalid values', () => {
    expect(formatPrice(null)).toBe('$—');
    expect(formatPrice(NaN)).toBe('$—');
  });
});
