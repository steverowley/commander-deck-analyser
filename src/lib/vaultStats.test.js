import { describe, test, expect } from 'vitest';
import { computeVaultStats } from './vaultStats.js';

const card = (name, overrides = {}) => ({
  name,
  type_line: 'Creature',
  cmc: 2,
  colors: ['R'],
  color_identity: ['R'],
  rarity: 'rare',
  set: 'lea',
  set_name: 'Limited Edition Alpha',
  prices: { usd: '1.00' },
  image_uris: { normal: 'https://example/x.png' },
  ...overrides,
});

const entry = (name, quantity = 1, meta = {}, added_at = Date.now()) => ({
  name,
  quantity,
  added_at,
  meta,
});

describe('computeVaultStats', () => {
  test('empty collection returns zeroes, not crashes', () => {
    const stats = computeVaultStats({}, {}, []);
    expect(stats.unique).toBe(0);
    expect(stats.total).toBe(0);
    expect(stats.totalValue).toBe(0);
    expect(stats.deckCoverage).toEqual([]);
    expect(stats.buildableCommanders).toEqual([]);
  });

  test('counts unique vs total quantity correctly', () => {
    const collection = {
      'sol ring':       entry('Sol Ring', 2),
      'lightning bolt': entry('Lightning Bolt', 4),
    };
    const cardData = {
      'sol ring':       card('Sol Ring', { colors: [], color_identity: [], type_line: 'Artifact' }),
      'lightning bolt': card('Lightning Bolt', { cmc: 1, type_line: 'Instant' }),
    };
    const stats = computeVaultStats(collection, cardData, []);
    expect(stats.unique).toBe(2);
    expect(stats.total).toBe(6);
    expect(stats.totalValue).toBe(6);
  });

  test('tracks foil count and foil value separately', () => {
    const collection = {
      'sol ring':       entry('Sol Ring', 1, { foil: 'rainbow' }),
      'lightning bolt': entry('Lightning Bolt', 2),
    };
    const cardData = {
      'sol ring':       card('Sol Ring', { type_line: 'Artifact', prices: { usd: '5.00' } }),
      'lightning bolt': card('Lightning Bolt', { type_line: 'Instant', prices: { usd: '1.00' } }),
    };
    const stats = computeVaultStats(collection, cardData, []);
    expect(stats.foilCount).toBe(1);
    expect(stats.foilUnique).toBe(1);
    expect(stats.foilValue).toBe(5);
  });

  test('deck coverage reports owned vs missing slots correctly', () => {
    const collection = {
      'sol ring':       entry('Sol Ring', 1),
      'lightning bolt': entry('Lightning Bolt', 1),
    };
    const cardData = {
      'sol ring':       card('Sol Ring'),
      'lightning bolt': card('Lightning Bolt'),
    };
    const decks = [{
      id: 'd1',
      name: 'Burn',
      commander: { name: 'Krenko', color_identity: ['R'] },
      cards: [
        { name: 'Sol Ring',       count: 1 },
        { name: 'Lightning Bolt', count: 4 },
        { name: 'Mountain',       count: 30 },
      ],
    }];
    const stats = computeVaultStats(collection, cardData, decks);
    expect(stats.deckCoverage).toHaveLength(1);
    expect(stats.deckCoverage[0].total).toBe(36); // 1 + 4 + 30 + commander
    expect(stats.deckCoverage[0].owned).toBe(2); // 1 Sol Ring, 1 Bolt
  });

  test('unused cards excludes basics and excludes cards in any deck', () => {
    const collection = {
      'sol ring':  entry('Sol Ring', 1),
      'forest':    entry('Forest', 20),
      'unused':    entry('Unused Card', 1),
    };
    const cardData = {
      'sol ring':   card('Sol Ring', { type_line: 'Artifact' }),
      'forest':     card('Forest', { type_line: 'Basic Land — Forest', cmc: 0 }),
      'unused':     card('Unused Card', { type_line: 'Creature' }),
    };
    const decks = [{
      id: 'd1',
      name: 'X',
      commander: null,
      cards: [{ name: 'Sol Ring', count: 1 }],
    }];
    const stats = computeVaultStats(collection, cardData, decks);
    // Forest is a basic so excluded; Sol Ring is in the deck so excluded.
    expect(stats.unusedCards.map((c) => c.name)).toEqual(['Unused Card']);
  });

  test('buildable commanders surfaces legendary creatures only', () => {
    const collection = {
      'krenko, mob boss': entry('Krenko, Mob Boss', 1),
      'sol ring':         entry('Sol Ring', 1),
    };
    const cardData = {
      'krenko, mob boss': card('Krenko, Mob Boss', { type_line: 'Legendary Creature — Goblin Warrior' }),
      'sol ring':         card('Sol Ring', { type_line: 'Artifact' }),
    };
    const stats = computeVaultStats(collection, cardData, []);
    expect(stats.buildableCommanders.map((c) => c.name)).toEqual(['Krenko, Mob Boss']);
  });

  test('lands are excluded from CMC histogram', () => {
    const collection = { 'forest': entry('Forest', 30) };
    const cardData = {
      'forest': card('Forest', { type_line: 'Basic Land — Forest', cmc: 0 }),
    };
    const stats = computeVaultStats(collection, cardData, []);
    expect(stats.cmcHistogram[0]).toBe(0);
  });

  test('multicolor cards bucket as M, colourless as C', () => {
    const collection = {
      'atraxa':   entry('Atraxa', 1),
      'sol ring': entry('Sol Ring', 1),
    };
    const cardData = {
      'atraxa':   card('Atraxa', { type_line: 'Legendary Creature', colors: ['W', 'U', 'B', 'G'] }),
      'sol ring': card('Sol Ring', { type_line: 'Artifact', colors: [] }),
    };
    const stats = computeVaultStats(collection, cardData, []);
    expect(stats.colorHistogram.M).toBe(1);
    expect(stats.colorHistogram.C).toBe(1);
  });
});
