import { describe, it, expect } from 'vitest';
import { lc, pad, hypergeom, parseDecklist } from './utils.js';

describe('lc', () => {
  it('lowercases and trims', () => {
    expect(lc('  Sol Ring  ')).toBe('sol ring');
    expect(lc('Edgar Markov')).toBe('edgar markov');
  });

  it('handles null/undefined', () => {
    expect(lc(null)).toBe('');
    expect(lc(undefined)).toBe('');
  });
});

describe('pad', () => {
  it('pads to width 2 by default', () => {
    expect(pad(3)).toBe('03');
    expect(pad(10)).toBe('10');
    expect(pad(100)).toBe('100');
  });

  it('honors custom width', () => {
    expect(pad(3, 4)).toBe('0003');
  });
});

describe('hypergeom', () => {
  // P(≥1 success drawing 7 from 99 with 10 successes) ≈ 0.537
  // = 1 - C(89,7)/C(99,7)
  it('matches known values for opening-hand draws', () => {
    const p = hypergeom(99, 10, 7, 1);
    expect(p).toBeCloseTo(0.5372, 3);
  });

  it('returns 0 when needing more successes than exist', () => {
    expect(hypergeom(99, 5, 7, 6)).toBe(0);
  });

  it('returns ~1 when needing 0 successes', () => {
    expect(hypergeom(99, 10, 7, 0)).toBeCloseTo(1, 5);
  });

  it('P(≥k) is monotonic decreasing in k', () => {
    const p1 = hypergeom(99, 10, 7, 1);
    const p2 = hypergeom(99, 10, 7, 2);
    const p3 = hypergeom(99, 10, 7, 3);
    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p3);
  });
});

describe('parseDecklist', () => {
  it('parses "1 Card Name" lines', () => {
    expect(parseDecklist('1 Sol Ring\n1 Arcane Signet')).toEqual([
      { count: 1, name: 'Sol Ring' },
      { count: 1, name: 'Arcane Signet' },
    ]);
  });

  it('parses "Nx" prefix', () => {
    expect(parseDecklist('3x Forest')).toEqual([{ count: 3, name: 'Forest' }]);
  });

  it('strips trailing set codes', () => {
    expect(parseDecklist('1 Sol Ring (CMM) 408')).toEqual([
      { count: 1, name: 'Sol Ring' },
    ]);
  });

  it('skips blanks, comments, and section headers', () => {
    const text = `// my deck\n\nCommander\n1 Edgar Markov\n\nDeck\n1 Sol Ring`;
    const parsed = parseDecklist(text);
    expect(parsed).toEqual([
      { count: 1, name: 'Edgar Markov' },
      { count: 1, name: 'Sol Ring' },
    ]);
  });

  it('falls back to count=1 when no number prefix', () => {
    expect(parseDecklist('Sol Ring')).toEqual([{ count: 1, name: 'Sol Ring' }]);
  });
});
