/**
 * Shareable deck URLs.
 *
 * Encodes the minimum needed to reconstruct a deck — name, commander name,
 * and (count, name) pairs — into a URL hash. The receiver re-fetches every
 * card from Scryfall on import, so encoded URLs stay small (~150 chars for
 * a 99-card deck after base64).
 *
 * Format: `#d=<base64url(JSON({n, cn, c:[[count,name],...]}))>`
 *
 * On app load, App.jsx checks window.location.hash; if a `d=` payload is
 * present, it offers to import.
 */

function base64UrlEncode(str) {
  // btoa works on Latin-1; UTF-8-safe encode via encodeURIComponent first
  const utf8 = unescape(encodeURIComponent(str));
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let padded = str.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) padded += '=';
  try {
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    return null;
  }
}

/**
 * Build the share URL fragment for a deck. The caller prepends the
 * origin + path if they want an absolute link.
 */
export function encodeDeckUrl(deck) {
  const payload = {
    n: deck.name || 'Shared deck',
    cn: deck.commander?.name || null,
    c: deck.cards
      .filter((c) => c.scryfall)
      .map((c) => [c.count, c.scryfall.name]),
  };
  return '#d=' + base64UrlEncode(JSON.stringify(payload));
}

/**
 * Try to decode a hash fragment ("#d=...", "?d=...", or just "d=...")
 * into a deck payload { name, commanderName, cards: [{count, name}] }.
 * Returns null on any decoding failure — the caller should treat null
 * as "no shared deck in URL, carry on".
 */
export function decodeDeckUrl(fragment) {
  if (!fragment) return null;
  const cleaned = fragment.replace(/^[#?]/, '');
  const match = cleaned.match(/(?:^|&)d=([^&]+)/);
  if (!match) return null;
  const json = base64UrlDecode(match[1]);
  if (!json) return null;
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data?.c)) return null;
    return {
      name: typeof data.n === 'string' ? data.n : 'Shared deck',
      commanderName: typeof data.cn === 'string' ? data.cn : null,
      cards: data.c
        .filter((p) => Array.isArray(p) && p.length === 2 && typeof p[1] === 'string')
        .map(([count, name]) => ({
          count: Math.max(1, Math.min(99, parseInt(count) || 1)),
          name,
        })),
    };
  } catch {
    return null;
  }
}

/**
 * Build the full absolute share URL using the current page origin.
 */
export function buildShareUrl(deck) {
  if (typeof window === 'undefined') return null;
  const base = window.location.origin + window.location.pathname;
  return base + encodeDeckUrl(deck);
}
