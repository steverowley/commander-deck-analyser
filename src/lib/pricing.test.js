import { describe, it, expect } from 'vitest';
import { cardPrice, deckTotalPrice, formatPrice } from './pricing.js';

const priced = (name, usd, count = 1) => ({
  count, name,
  scryfall: { name, prices: { usd } },
});

describe('cardPrice', () => {
  it('parses Scryfall string prices', () => {
    expect(cardPrice({ prices: { usd: '1.50' } })).toBe(1.5);
  });
  it('returns null for missing or non-numeric prices', () => {
    expect(cardPrice({ prices: { usd: null } })).toBeNull();
    expect(cardPrice({ prices: {} })).toBeNull();
    expect(cardPrice({})).toBeNull();
    expect(cardPrice(null)).toBeNull();
  });
});

describe('deckTotalPrice', () => {
  it('sums prices × count and tracks unpriced cards', () => {
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
  });

  it('multiplies by card count (basics)', () => {
    const deck = {
      cards: [priced('Forest', '0.10', 30)],
      commander: null,
    };
    expect(deckTotalPrice(deck).total).toBeCloseTo(3.0);
  });

  it('subtracts owned-collection cards from `toBuy`', () => {
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
      'mountain': { name: 'Mountain', quantity: 100 }, // way more than needed
      'edgar': { name: 'Edgar', quantity: 1 },
    };
    const r = deckTotalPrice(deck, 'usd', collection);
    // total stays the same — that's what the deck would cost cold.
    expect(r.total).toBeCloseTo(33.0);
    // owned: Sol Ring 2.00 + 10 Mountain × 0.10 (capped at deck count) + 10.00 commander = 13.00
    expect(r.ownedTotal).toBeCloseTo(13.0);
    // toBuy = Cyclonic Rift only
    expect(r.toBuy).toBeCloseTo(20.0);
    expect(r.ownedCount).toBe(12); // 1 + 10 + 1
  });

  it('caps owned quantity at the deck count (4 in collection, 1 in deck = 1 counted)', () => {
    const deck = { cards: [priced('Lightning Bolt', '0.50', 1)], commander: null };
    const r = deckTotalPrice(deck, 'usd', { 'lightning bolt': { quantity: 4 } });
    expect(r.ownedTotal).toBeCloseTo(0.5);
    expect(r.toBuy).toBeCloseTo(0);
    expect(r.ownedCount).toBe(1);
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
