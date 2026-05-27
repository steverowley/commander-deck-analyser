import { describe, it, expect, beforeEach } from 'vitest';
import { cardPrice, cardPriceDetails, deckTotalPrice, deckPriceTooltip, formatPrice, isConverted, activeVendor, vendorLabel, priceTooltip } from './pricing.js';
import { saveSettings, SETTING_DEFAULTS } from './settings.js';

// Each test resets settings to the defaults so the active vendor is
// deterministic. Tests that need a specific vendor flip prefRetailer.
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
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'tcgplayer' });
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

  it('Card Kingdom vendor falls back to the USD field (no Scryfall feed)', () => {
    const card = { prices: { usd: '3.00', eur: '2.50' } };
    expect(cardPrice(card, 'usd', 'cardkingdom')).toBe(3);
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

  it('flags Card Kingdom as proxied', () => {
    const d = cardPriceDetails({ prices: fullPrices() }, 'usd', 'cardkingdom');
    expect(d.exact).toBe(false);
    expect(d.approximate).toBe(true);
    expect(d.notes.some((n) => /TCGplayer/i.test(n) && /estimate/i.test(n))).toBe(true);
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
  it('joins notes with newlines', () => {
    const d = cardPriceDetails({ prices: fullPrices() }, 'gbp', 'cardkingdom');
    const tip = priceTooltip(d);
    expect(tip.split('\n').length).toBeGreaterThan(1);
    expect(tip).toContain('Card Kingdom');
    expect(tip).toContain('GBP');
  });
});

describe('deckTotalPrice', () => {
  it('sums prices × count and tracks unpriced cards (default vendor)', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'tcgplayer' });
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
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'tcgplayer' });
    const deck = {
      cards: [priced('Forest', '0.10', 30)],
      commander: null,
    };
    expect(deckTotalPrice(deck).total).toBeCloseTo(3.0);
  });

  it('subtracts owned-collection cards from `toBuy`', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'tcgplayer' });
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
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'tcgplayer' });
    const deck = { cards: [priced('Lightning Bolt', '0.50', 1)], commander: null };
    const r = deckTotalPrice(deck, 'usd', { 'lightning bolt': { quantity: 4 } });
    expect(r.ownedTotal).toBeCloseTo(0.5);
    expect(r.toBuy).toBeCloseTo(0);
    expect(r.ownedCount).toBe(1);
  });

  it('honours an explicit vendor argument over the active setting', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'tcgplayer' });
    const deck = {
      cards: [priced('Sol Ring', { usd: '2.00', eur: '1.50' })],
      commander: null,
    };
    const tcg = deckTotalPrice(deck, 'usd', null, 'tcgplayer');
    const cm = deckTotalPrice(deck, 'eur', null, 'cardmarket');
    expect(tcg.total).toBeCloseTo(2.0);
    expect(cm.total).toBeCloseTo(1.5);
  });

  it('marks Card Kingdom deck totals as approximate even when fully priced', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'cardkingdom' });
    const deck = {
      cards: [priced('Sol Ring', '2.00')],
      commander: null,
    };
    const r = deckTotalPrice(deck);
    expect(r.exact).toBe(false);
    expect(r.approximate).toBe(true);
  });
});

describe('deckPriceTooltip', () => {
  it('mentions the vendor, unpriced count, and an FX caveat when relevant', () => {
    const tip = deckPriceTooltip({
      vendorLabel: 'Cardmarket (Trend)',
      sourceCurrency: 'eur',
      displayCurrency: 'usd',
      exact: true,
      converted: true,
      unpriced: 2,
      ownedTotal: 0,
      ownedCount: 0,
    });
    expect(tip).toContain('Cardmarket');
    expect(tip).toContain('2 cards');
    expect(tip).toContain('EUR');
  });

  it('mentions the CK proxy when exact is false', () => {
    const tip = deckPriceTooltip({
      vendorLabel: 'Card Kingdom',
      sourceCurrency: 'usd',
      displayCurrency: 'usd',
      exact: false,
      converted: false,
      unpriced: 0,
      ownedTotal: 0,
      ownedCount: 0,
    });
    expect(tip).toContain("aren't on Scryfall");
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

  it('returns true for Card Kingdom (proxied) even on USD display', () => {
    expect(isConverted('usd', 'cardkingdom')).toBe(true);
  });

  it('returns false when vendor and currency line up exactly', () => {
    expect(isConverted('usd', 'tcgplayer')).toBe(false);
    expect(isConverted('eur', 'cardmarket')).toBe(false);
  });
});

describe('activeVendor', () => {
  it('reads prefRetailer from settings', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'cardmarket' });
    expect(activeVendor()).toBe('cardmarket');
  });

  it('falls back to tcgplayer when prefRetailer is unknown', () => {
    saveSettings({ ...SETTING_DEFAULTS, prefRetailer: 'ebay' });
    expect(activeVendor()).toBe('tcgplayer');
  });
});

describe('vendorLabel', () => {
  it('returns a friendly label per vendor', () => {
    expect(vendorLabel('tcgplayer')).toContain('TCGplayer');
    expect(vendorLabel('cardmarket')).toContain('Cardmarket');
    expect(vendorLabel('cardkingdom')).toContain('Card Kingdom');
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
