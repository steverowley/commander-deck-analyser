import { ALT_NAMES } from './constants.js';

export const lc = (s) => (s || '').toLowerCase().trim();
export const pad = (n, w = 2) => String(n).padStart(w, '0');

/**
 * Hypergeometric: P(at least x successes in n draws, from population N with K successes).
 */
export function hypergeom(N, K, n, x) {
  function binom(a, b) {
    if (b < 0 || b > a) return 0;
    if (b === 0 || b === a) return 1;
    b = Math.min(b, a - b);
    let r = 1;
    for (let i = 0; i < b; i++) r = (r * (a - i)) / (i + 1);
    return r;
  }
  let p = 0;
  for (let k = x; k <= Math.min(n, K); k++) {
    p += (binom(K, k) * binom(N - K, n - k)) / binom(N, n);
  }
  return p;
}

/**
 * Parse a decklist text block into [{ count, name }, ...].
 * Handles "1 Card Name", "1x Card Name", and trailing set codes "(SET) 123".
 */
export function parseDecklist(text) {
  const lines = text.split('\n');
  const entries = [];
  for (let line of lines) {
    line = line.trim();
    if (
      !line ||
      line.startsWith('//') ||
      line.startsWith('#') ||
      line.startsWith('SB:') ||
      /^(deck|sideboard|commander|maybeboard)$/i.test(line)
    ) continue;
    const m =
      line.match(/^(\d+)x?\s+(.+?)(?:\s+\([A-Z0-9]+\)\s+[\w-]+)?$/i) ||
      line.match(/^(.+?)(?:\s+\([A-Z0-9]+\)\s+[\w-]+)?$/);
    if (!m) continue;
    let count, name;
    if (m.length === 3 && /^\d+/.test(m[1])) {
      count = parseInt(m[1]);
      name = m[2].trim();
    } else {
      count = 1;
      name = m[m.length - 1].trim();
    }
    const canonical = ALT_NAMES[name.toLowerCase()];
    if (canonical) name = canonical;
    entries.push({ count, name });
  }
  return entries;
}
