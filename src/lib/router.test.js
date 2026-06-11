import { describe, it, expect } from 'vitest';
import { parseRoute, formatRoute, isRoutableDeckId } from './router.js';

describe('parseRoute', () => {
  it('ignores non-route hashes (share links, empty)', () => {
    expect(parseRoute('#d=eyJ...')).toBeNull();
    expect(parseRoute('')).toBeNull();
    expect(parseRoute('#')).toBeNull();
  });

  it('parses every view', () => {
    expect(parseRoute('#/')).toEqual({ view: 'landing', id: null });
    expect(parseRoute('#/vault')).toEqual({ view: 'vault', id: null });
    expect(parseRoute('#/pods')).toEqual({ view: 'pods', id: null });
    expect(parseRoute('#/gallery')).toEqual({ view: 'gallery-all', id: null });
    expect(parseRoute('#/rolls')).toEqual({ view: 'rolls-all', id: null });
  });

  it('parses ids, decoding URI components', () => {
    expect(parseRoute('#/deck/deck_123')).toEqual({ view: 'deck', id: 'deck_123' });
    expect(parseRoute('#/gallery/ab-cd')).toEqual({ view: 'gallery-deck', id: 'ab-cd' });
    expect(parseRoute('#/roll/uu%3Aid')).toEqual({ view: 'roll', id: 'uu:id' });
  });

  it('falls back gracefully on unknown or incomplete routes', () => {
    expect(parseRoute('#/nonsense')).toEqual({ view: 'landing', id: null });
    expect(parseRoute('#/deck')).toEqual({ view: 'landing', id: null });
    expect(parseRoute('#/roll')).toEqual({ view: 'rolls-all', id: null });
  });
});

describe('formatRoute', () => {
  it('round-trips through parseRoute', () => {
    for (const [view, id] of [
      ['landing', null], ['vault', null], ['pods', null],
      ['gallery-all', null], ['rolls-all', null],
      ['deck', 'deck_42'], ['gallery-deck', 'uuid-1'], ['roll', 'uuid-2'],
    ]) {
      expect(parseRoute(formatRoute(view, id))).toEqual({ view, id });
    }
  });

  it('encodes ids', () => {
    expect(formatRoute('deck', 'a/b')).toBe('#/deck/a%2Fb');
  });
});

describe('isRoutableDeckId', () => {
  it('accepts archive ids, rejects transient ones', () => {
    expect(isRoutableDeckId('deck_123')).toBe(true);
    expect(isRoutableDeckId('0b2e2a44-1111-2222-3333-444455556666')).toBe(true);
    expect(isRoutableDeckId('roll:1700000000')).toBe(false);
    expect(isRoutableDeckId('view:abc')).toBe(false);
    expect(isRoutableDeckId('')).toBe(false);
  });
});
