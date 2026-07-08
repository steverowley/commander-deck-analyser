import { describe, it, expect, afterEach } from 'vitest';
import { authRedirectUrl } from './supabase.js';

describe('authRedirectUrl', () => {
  const original = globalThis.window;
  afterEach(() => { globalThis.window = original; });

  it('drops the hash-router fragment, returning only origin + path', () => {
    // Regression: hash routing made window.location.href carry '#/', which
    // broke Supabase's magic-link / OAuth redirect after moving to Vault.
    globalThis.window = {
      location: {
        origin: 'https://vault.example',
        pathname: '/',
        hash: '#/vault',
        href: 'https://vault.example/#/vault',
      },
    };
    expect(authRedirectUrl()).toBe('https://vault.example/');
  });

  it('keeps a project sub-path (GitHub Pages)', () => {
    globalThis.window = {
      location: {
        origin: 'https://steverowley.github.io',
        pathname: '/commander-deck-analyser/',
        hash: '#/',
        href: 'https://steverowley.github.io/commander-deck-analyser/#/',
      },
    };
    expect(authRedirectUrl()).toBe('https://steverowley.github.io/commander-deck-analyser/');
  });

  it('returns undefined without a window (SSR / node safety)', () => {
    globalThis.window = undefined;
    expect(authRedirectUrl()).toBeUndefined();
  });
});
