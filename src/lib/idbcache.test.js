import { describe, it, expect, beforeEach } from 'vitest';
// fake-indexeddb provides a Node-compatible IndexedDB implementation,
// patched onto globalThis so the production code can use it unchanged.
import 'fake-indexeddb/auto';
import { loadCacheFromIDB, saveCacheToIDB, clearIDBCache, cacheSize, idbAvailable } from './idbcache.js';

const card = (name) => ({ name, type_line: 'Creature', cmc: 3 });

beforeEach(async () => {
  await clearIDBCache();
});

describe('IndexedDB card cache', () => {
  it('reports IDB available in the test env', () => {
    expect(idbAvailable()).toBe(true);
  });

  it('round-trips a saved map', async () => {
    await saveCacheToIDB({ 'sol ring': card('Sol Ring'), 'bloodghast': card('Bloodghast') });
    const loaded = await loadCacheFromIDB();
    expect(loaded['sol ring']?.name).toBe('Sol Ring');
    expect(loaded['bloodghast']?.name).toBe('Bloodghast');
  });

  it('returns an empty map after clear', async () => {
    await saveCacheToIDB({ 'sol ring': card('Sol Ring') });
    await clearIDBCache();
    const loaded = await loadCacheFromIDB();
    expect(Object.keys(loaded).length).toBe(0);
  });

  it('counts cached cards', async () => {
    expect(await cacheSize()).toBe(0);
    await saveCacheToIDB({ a: card('A'), b: card('B'), c: card('C') });
    expect(await cacheSize()).toBe(3);
  });

  it('save is additive — multiple saves accumulate', async () => {
    await saveCacheToIDB({ a: card('A') });
    await saveCacheToIDB({ b: card('B') });
    const loaded = await loadCacheFromIDB();
    expect(Object.keys(loaded).sort()).toEqual(['a', 'b']);
  });
});
