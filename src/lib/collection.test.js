import { describe, it, expect } from 'vitest';
import { mergeVaultQuantities } from './collection.js';

describe('mergeVaultQuantities (sign-in Vault migration)', () => {
  it('takes max(local, cloud) so a retried migration never double-counts', () => {
    const local = [{ name: 'Sol Ring', quantity: 3, meta: {} }];
    const cloud = [{ card_name: 'Sol Ring', quantity: 5, meta: null }];
    expect(mergeVaultQuantities(local, cloud)).toEqual([
      { card_name: 'Sol Ring', quantity: 5, meta: null },
    ]);
  });

  it('uploads local quantity when it exceeds the cloud copy', () => {
    const local = [{ name: 'Sol Ring', quantity: 4, meta: {} }];
    const cloud = [{ card_name: 'Sol Ring', quantity: 1, meta: null }];
    expect(mergeVaultQuantities(local, cloud)[0].quantity).toBe(4);
  });

  it('passes brand-new local cards straight through', () => {
    const out = mergeVaultQuantities(
      [{ name: 'Arcane Signet', quantity: 2, meta: { foil: 'rainbow' } }],
      []
    );
    expect(out).toEqual([
      { card_name: 'Arcane Signet', quantity: 2, meta: { foil: 'rainbow' } },
    ]);
  });

  it('cloud meta wins over local meta; local meta fills a cloud gap', () => {
    const local = [
      { name: 'Sol Ring', quantity: 1, meta: { foil: 'gilded' } },
      { name: 'Arcane Signet', quantity: 1, meta: { foil: 'etched' } },
    ];
    const cloud = [
      { card_name: 'Sol Ring', quantity: 1, meta: { foil: 'rainbow' } },
      { card_name: 'Arcane Signet', quantity: 1, meta: null },
    ];
    const out = mergeVaultQuantities(local, cloud);
    expect(out.find((r) => r.card_name === 'Sol Ring').meta).toEqual({ foil: 'rainbow' });
    expect(out.find((r) => r.card_name === 'Arcane Signet').meta).toEqual({ foil: 'etched' });
  });

  it('matches case-insensitively and keeps the cloud casing', () => {
    const local = [{ name: 'sol ring', quantity: 2, meta: {} }];
    const cloud = [{ card_name: 'Sol Ring', quantity: 1, meta: null }];
    const out = mergeVaultQuantities(local, cloud);
    expect(out[0].card_name).toBe('Sol Ring');
    expect(out[0].quantity).toBe(2);
  });

  it('clamps corrupted local quantities to at least 1 and skips nameless rows', () => {
    const out = mergeVaultQuantities(
      [{ name: 'Sol Ring', quantity: -3, meta: {} }, { quantity: 4 }, null],
      []
    );
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(1);
  });
});
