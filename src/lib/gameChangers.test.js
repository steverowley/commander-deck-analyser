import { describe, it, expect, afterEach, vi } from 'vitest';
import { isGameChanger, gameChangerCount, loadGameChangers, resetGameChangers } from './gameChangers.js';
import { GAME_CHANGERS } from './constants.js';

const page = (names, next = null) => ({
  ok: true,
  json: async () => ({
    data: names.map((n) => ({ name: n })),
    has_more: !!next,
    ...(next ? { next_page: next } : {}),
  }),
});

const manyNames = (n, prefix = 'Card') => Array.from({ length: n }, (_, i) => `${prefix} ${i}`);

afterEach(() => {
  resetGameChangers();
  delete globalThis.localStorage;
});

describe('gameChangers', () => {
  it('starts on the hardcoded fallback', () => {
    expect(isGameChanger('Demonic Tutor')).toBe(true);
    expect(isGameChanger('Llanowar Elves')).toBe(false);
    expect(gameChangerCount()).toBe(GAME_CHANGERS.size);
  });

  it('replaces the set from a paginated Scryfall fetch', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page(manyNames(15, 'A'), 'page2'))
      .mockResolvedValueOnce(page(manyNames(15, 'B')));
    await loadGameChangers({ fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(isGameChanger('a 3')).toBe(true);
    expect(isGameChanger('b 14')).toBe(true);
    expect(isGameChanger('demonic tutor')).toBe(false); // fully replaced
    expect(gameChangerCount()).toBe(30);
  });

  it('keeps the fallback when the fetch fails', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    await loadGameChangers({ fetcher });
    expect(isGameChanger('demonic tutor')).toBe(true);
    expect(gameChangerCount()).toBe(GAME_CHANGERS.size);
  });

  it('rejects an implausibly small payload', async () => {
    const fetcher = vi.fn().mockResolvedValue(page(['Sol Ring']));
    await loadGameChangers({ fetcher });
    expect(isGameChanger('sol ring')).toBe(false);
    expect(gameChangerCount()).toBe(GAME_CHANGERS.size);
  });

  it('writes the cache and serves a fresh cache without refetching', async () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    const fetcher = vi.fn().mockResolvedValue(page(manyNames(25)));
    await loadGameChangers({ fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(1);

    resetGameChangers();
    const fetcher2 = vi.fn();
    await loadGameChangers({ fetcher: fetcher2 });
    expect(fetcher2).not.toHaveBeenCalled(); // fresh cache wins
    expect(isGameChanger('card 7')).toBe(true);
  });

  it('applies a stale cache even when the refresh then fails', async () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    store.set('vault:gameChangers:v1', JSON.stringify({
      at: Date.now() - 48 * 60 * 60 * 1000, // 2 days old
      names: manyNames(25, 'Stale').map((n) => n.toLowerCase()),
    }));
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    await loadGameChangers({ fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1); // stale → tried to refresh
    expect(isGameChanger('stale 3')).toBe(true); // last good sync still applies
  });

  it('indexes DFC front faces', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          ...manyNames(24).map((n) => ({ name: n })),
          { name: 'Front // Back', card_faces: [{ name: 'Front' }, { name: 'Back' }] },
        ],
        has_more: false,
      }),
    });
    await loadGameChangers({ fetcher });
    expect(isGameChanger('front // back')).toBe(true);
    expect(isGameChanger('front')).toBe(true);
  });
});
