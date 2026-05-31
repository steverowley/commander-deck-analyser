import { describe, it, expect } from 'vitest';
import {
  missingCards, cheapestCart, singleCartTotals, toTcgplayerCsv,
  BUYLIST_VENDORS,
} from './buylist.js';

const card = (name, usd, eur, count = 1) => ({
  count,
  name,
  scryfall: {
    name,
    type_line: 'Creature',
    oracle_text: '',
    cmc: 2,
    prices: { usd: usd != null ? String(usd) : null, eur: eur != null ? String(eur) : null },
  },
});

function collectionMap(entries) {
  const out = {};
  for (const e of entries) out[e.name.toLowerCase()] = { quantity: e.quantity };
  return out;
}

describe('missingCards', () => {
  it('returns 12 rows when 12 cards are not in Vault (the acceptance case)', () => {
    const cards = [];
    for (let i = 0; i < 12; i++) cards.push(card(`New Card ${i}`, 5, 4));
    const owned = [];
    for (let i = 0; i < 5; i++) owned.push({ name: `Owned ${i}`, quantity: 1 });
    const rows = missingCards({ cards, commander: null }, collectionMap(owned));
    expect(rows.length).toBe(12);
    expect(rows.every((r) => r.count === 1)).toBe(true);
  });

  it('subtracts Vault quantity from required count', () => {
    const deck = {
      cards: [card('Sol Ring', 1.5, 1.2, 1), card('Forest', 0.1, 0.08, 3)],
      commander: null,
    };
    const collection = collectionMap([
      { name: 'Sol Ring', quantity: 5 },
      { name: 'Forest', quantity: 1 },
    ]);
    const rows = missingCards(deck, collection);
    expect(rows.find((r) => r.name === 'Sol Ring')).toBeUndefined();
    const forest = rows.find((r) => r.name === 'Forest');
    expect(forest.count).toBe(2);
  });

  it('includes the commander when missing', () => {
    const commander = card('Edgar Markov', 10, 8).scryfall;
    const rows = missingCards({ cards: [], commander }, {});
    expect(rows[0].name).toBe('Edgar Markov');
    expect(rows[0].prices.tcgplayer).toBe(10);
  });

  it('sorts most expensive first', () => {
    const deck = {
      cards: [
        card('Cheap', 0.50, 0.40),
        card('Pricey', 50, 45),
        card('Mid', 5, 4),
      ],
      commander: null,
    };
    const rows = missingCards(deck, {});
    expect(rows.map((r) => r.name)).toEqual(['Pricey', 'Mid', 'Cheap']);
  });

  it('handles a null collection (nothing owned)', () => {
    const rows = missingCards({ cards: [card('Sol Ring', 1, 1)], commander: null }, null);
    expect(rows.length).toBe(1);
  });

  it('returns rows with both vendor prices in their source currencies', () => {
    const rows = missingCards({ cards: [card('Sol Ring', 1.5, 1.2)], commander: null }, {});
    expect(rows[0].prices).toEqual({ tcgplayer: 1.5, cardmarket: 1.2 });
  });

  it('returns null prices when Scryfall has none for the vendor', () => {
    const c = card('Obscure', null, null);
    const rows = missingCards({ cards: [c], commander: null }, {});
    expect(rows[0].prices).toEqual({ tcgplayer: null, cardmarket: null });
  });
});

describe('cheapestCart', () => {
  it('picks the lower-priced vendor per row (in USD-equivalent terms)', () => {
    const buylist = missingCards({
      cards: [
        card('Cheaper-on-TCG', 5, 6),    // 5 USD vs ~6.5 USD-equiv → TCG
        card('Cheaper-on-CM', 10, 6),    // 10 USD vs ~6.5 USD-equiv → CM
      ],
      commander: null,
    }, {});
    const out = cheapestCart(buylist);
    const a = out.rows.find((r) => r.name === 'Cheaper-on-TCG');
    const b = out.rows.find((r) => r.name === 'Cheaper-on-CM');
    expect(a.chosenVendor).toBe('tcgplayer');
    expect(b.chosenVendor).toBe('cardmarket');
    expect(out.tcgplayerTotal).toBe(5);
    expect(out.cardmarketTotal).toBe(6);
  });

  it('falls back to the only priced vendor when one is missing', () => {
    const buylist = missingCards({
      cards: [card('Only-EUR', null, 7)],
      commander: null,
    }, {});
    const out = cheapestCart(buylist);
    expect(out.rows[0].chosenVendor).toBe('cardmarket');
    expect(out.cardmarketTotal).toBe(7);
  });

  it('flags rows with no prices on either vendor', () => {
    const buylist = missingCards({
      cards: [card('Mystery', null, null)],
      commander: null,
    }, {});
    const out = cheapestCart(buylist);
    expect(out.unpriced).toBe(1);
    expect(out.tcgplayerTotal + out.cardmarketTotal).toBe(0);
  });

  it('multiplies per-card price by count', () => {
    // USD cheaper than EUR-equiv (0.20 < 0.25 × 1.09 = 0.27) → TCGplayer wins.
    const buylist = missingCards({
      cards: [card('Forest', 0.20, 0.25, 5)],
      commander: null,
    }, {});
    const out = cheapestCart(buylist);
    expect(out.tcgplayerTotal).toBeCloseTo(1.00);
  });
});

describe('singleCartTotals', () => {
  it('totals each vendor independently', () => {
    const buylist = missingCards({
      cards: [
        card('A', 5, 4),
        card('B', 10, 8),
      ],
      commander: null,
    }, {});
    const totals = singleCartTotals(buylist);
    expect(totals.tcgplayer.total).toBe(15);
    expect(totals.cardmarket.total).toBe(12);
  });

  it('reports unpriced counts per vendor', () => {
    const buylist = missingCards({
      cards: [
        card('Priced-on-TCG', 5, null, 2),
        card('Priced-on-CM', null, 4, 1),
      ],
      commander: null,
    }, {});
    const totals = singleCartTotals(buylist);
    expect(totals.tcgplayer.unpriced).toBe(1);
    expect(totals.tcgplayer.priced).toBe(2);
    expect(totals.cardmarket.unpriced).toBe(2);
    expect(totals.cardmarket.priced).toBe(1);
  });

  it('covers both vendors in BUYLIST_VENDORS', () => {
    expect(BUYLIST_VENDORS).toEqual(['tcgplayer', 'cardmarket']);
  });
});

describe('toTcgplayerCsv', () => {
  it('emits Quantity,Name with a header row', () => {
    const buylist = missingCards({
      cards: [card('Sol Ring', 1.5, 1.2, 2)],
      commander: null,
    }, {});
    const csv = toTcgplayerCsv(buylist);
    expect(csv.split('\n')[0]).toBe('Quantity,Name');
    expect(csv).toMatch(/^2,Sol Ring$/m);
  });

  it('quotes names containing commas', () => {
    const buylist = missingCards({
      cards: [card('Edgar, Markov', 5, 4)],
      commander: null,
    }, {});
    const csv = toTcgplayerCsv(buylist);
    expect(csv).toMatch(/^1,"Edgar, Markov"$/m);
  });

  it('escapes embedded quotes by doubling them', () => {
    const buylist = missingCards({
      cards: [card('Yawgmoth, Thran "Physician"', 5, 4)],
      commander: null,
    }, {});
    const csv = toTcgplayerCsv(buylist);
    expect(csv).toMatch(/^1,"Yawgmoth, Thran ""Physician"""$/m);
  });
});
