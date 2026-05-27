/**
 * Decklist import — text paste + URL fetch (Moxfield / Archidekt).
 *
 * `parseTextDecklist(text)` returns `[{ name, count, section }]` where
 * section ∈ { 'commander', 'mainboard', 'maybeboard' }. The parser
 * tracks the active section as it walks the text, so a Moxfield-style
 * export with `Commander` / `Deck` / `Maybeboard` headers round-trips.
 * It also accepts `// Commander`, `SB:` prefixes (→ maybeboard), and
 * MTGA-style trailing set codes (`(NEO) 123`).
 *
 * `fetchDeckFromUrl(url)` dispatches by host:
 *   - Moxfield (`moxfield.com/decks/<id>`)   → api2.moxfield.com/v3/decks/all/<id>
 *   - Archidekt (`archidekt.com/decks/<id>`) → archidekt.com/api/decks/<id>/
 *
 * Both APIs are network-dependent; CORS rejections, 4xx, 5xx, or shape
 * changes all surface as a thrown Error with a user-readable message
 * so the calling modal can fall back to "paste the list instead".
 */

import { ALT_NAMES } from './constants.js';

/* ─── Text parser ──────────────────────────────────────────────────────── */

const SECTION_HEADERS = [
  { re: /^\/\/\s*commander\b/i,                              section: 'commander' },
  { re: /^commander(s)?\b\s*[:\-]?\s*$/i,                    section: 'commander' },
  { re: /^\/\/\s*(maybeboard|wishlist|considering)\b/i,      section: 'maybeboard' },
  { re: /^(maybeboard|wishlist|considering)\b\s*[:\-]?\s*$/i, section: 'maybeboard' },
  { re: /^\/\/\s*(sideboard|tokens?)\b/i,                    section: 'skip' },
  { re: /^(sideboard|tokens?)\b\s*[:\-]?\s*$/i,              section: 'skip' },
  { re: /^\/\/\s*(deck|main(board|deck)?|library)\b/i,       section: 'mainboard' },
  { re: /^(deck|main(board|deck)?|library)\b\s*[:\-]?\s*$/i, section: 'mainboard' },
];

// Detects a "1 Card Name" or "1x Card Name" prefix.
const COUNT_RE = /^(\d+)\s*[xX]?\s+(.+)$/;
// Strip a trailing Moxfield/MTGA printing tag like " (NEO) 123" or " *F*".
const PRINTING_RE = /\s+\([A-Za-z0-9]{2,6}\)(?:\s+[\w-]+)?\s*(\*F\*)?\s*$/;
const FOIL_RE = /\s+\*F\*\s*$/;

function stripPrinting(name) {
  return name.replace(PRINTING_RE, '').replace(FOIL_RE, '').trim();
}

function applyAlias(name) {
  const canonical = ALT_NAMES[name.toLowerCase()];
  return canonical || name;
}

/**
 * Parse a pasted decklist into typed entries. Returns
 * `[{ name, count, section }]`. The section reflects the active
 * `Commander` / `Deck` / `Maybeboard` block — defaults to `mainboard`
 * for a header-less paste so a raw list still imports cleanly.
 */
export function parseTextDecklist(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  const out = [];
  let section = 'mainboard';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Section headers — also handle bare `SB:` prefix lines.
    let matched = false;
    for (const h of SECTION_HEADERS) {
      if (h.re.test(line)) {
        section = h.section;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Skip comments and bare metadata lines we don't recognise.
    if (line.startsWith('#')) continue;
    if (line.startsWith('//')) continue;

    // `SB:` (sideboard / maybeboard) line — strip the prefix and treat
    // as a maybeboard entry.
    let lineForParse = line;
    let lineSection = section;
    const sbMatch = line.match(/^SB:\s*(.+)$/i);
    if (sbMatch) {
      lineForParse = sbMatch[1].trim();
      lineSection = 'maybeboard';
    }

    if (lineSection === 'skip') continue;

    const m = lineForParse.match(COUNT_RE);
    let count = 1;
    let name = lineForParse;
    if (m) {
      count = parseInt(m[1], 10);
      name = m[2];
    }
    name = stripPrinting(name);
    if (!name) continue;
    if (!Number.isFinite(count) || count < 1) count = 1;

    name = applyAlias(name);
    out.push({ name, count, section: lineSection });
  }

  return out;
}

/* ─── URL helpers ──────────────────────────────────────────────────────── */

/**
 * Extract the deck identifier from a Moxfield deck URL.
 * Accepts: `https://www.moxfield.com/decks/<id>` (with or without a slug suffix).
 * Returns `null` if the URL isn't recognised.
 */
export function parseMoxfieldUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

/**
 * Extract the deck ID from an Archidekt deck URL.
 * Accepts: `https://archidekt.com/decks/<id>` or `.../decks/<id>/<slug>`.
 */
export function parseArchidektUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/archidekt\.com\/decks\/(\d+)/i);
  return m ? m[1] : null;
}

/**
 * Detect which deckbuilder service the URL points at, if any.
 */
export function detectDeckUrl(url) {
  if (parseMoxfieldUrl(url)) return 'moxfield';
  if (parseArchidektUrl(url)) return 'archidekt';
  return null;
}

/* ─── Remote fetch ─────────────────────────────────────────────────────── */

async function fetchJson(url, { headers } = {}) {
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    throw new Error(`Network error fetching ${url}: ${e.message}`);
  }
  if (!res.ok) {
    throw new Error(`Upstream returned HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Map a Moxfield deck-API response to `{ name, entries }`.
 * Moxfield v3 schema (simplified):
 *   {
 *     name,
 *     boards: {
 *       mainboard: { cards: { <name>: { quantity, card: { name } } } },
 *       commanders: { cards: { ... } },
 *       maybeboard: { cards: { ... } },
 *     }
 *   }
 * Older v2 used flat keys (`main`, `commanders`); we handle both.
 */
export function shapeMoxfieldDeck(payload) {
  if (!payload || typeof payload !== 'object') return { name: '', entries: [] };
  const entries = [];
  const collect = (cards, section) => {
    if (!cards) return;
    for (const key of Object.keys(cards)) {
      const row = cards[key];
      const name = row?.card?.name || row?.name || key;
      const count = row?.quantity ?? 1;
      if (!name || !Number.isFinite(count) || count < 1) continue;
      entries.push({ name: applyAlias(name), count, section });
    }
  };
  const boards = payload.boards;
  if (boards && typeof boards === 'object') {
    collect(boards.mainboard?.cards, 'mainboard');
    collect(boards.commanders?.cards, 'commander');
    collect(boards.companions?.cards, 'commander');
    collect(boards.maybeboard?.cards, 'maybeboard');
  } else {
    collect(payload.mainboard || payload.main, 'mainboard');
    collect(payload.commanders, 'commander');
    collect(payload.companions, 'commander');
    collect(payload.maybeboard, 'maybeboard');
  }
  return { name: payload.name || '', entries };
}

/**
 * Map an Archidekt deck-API response to `{ name, entries }`.
 * Archidekt schema:
 *   {
 *     name,
 *     cards: [{
 *       quantity, categories: ["Commander", "Maybeboard", ...],
 *       card: { oracleCard: { name } } | name
 *     }]
 *   }
 */
export function shapeArchidektDeck(payload) {
  if (!payload || typeof payload !== 'object') return { name: '', entries: [] };
  const entries = [];
  for (const row of payload.cards || []) {
    const name = row?.card?.oracleCard?.name || row?.card?.name || row?.name;
    const count = row?.quantity ?? 1;
    if (!name || !Number.isFinite(count) || count < 1) continue;
    const cats = (row.categories || []).map((c) => String(c).toLowerCase());
    let section = 'mainboard';
    if (cats.includes('commander')) section = 'commander';
    else if (cats.includes('maybeboard')) section = 'maybeboard';
    else if (cats.includes('sideboard') || cats.includes('tokens')) continue;
    entries.push({ name: applyAlias(name), count, section });
  }
  return { name: payload.name || '', entries };
}

export async function fetchMoxfieldDeck(deckId) {
  const id = String(deckId || '').trim();
  if (!id) throw new Error('Missing Moxfield deck id');
  const payload = await fetchJson(
    `https://api2.moxfield.com/v3/decks/all/${encodeURIComponent(id)}`
  );
  return shapeMoxfieldDeck(payload);
}

export async function fetchArchidektDeck(deckId) {
  const id = String(deckId || '').trim();
  if (!id) throw new Error('Missing Archidekt deck id');
  const payload = await fetchJson(
    `https://archidekt.com/api/decks/${encodeURIComponent(id)}/`
  );
  return shapeArchidektDeck(payload);
}

/**
 * Resolve a deck URL to `{ source, name, entries }` where source is
 * `moxfield` or `archidekt`. Throws when the URL isn't recognised or
 * the upstream API rejects the request.
 */
export async function fetchDeckFromUrl(url) {
  const source = detectDeckUrl(url);
  if (!source) {
    throw new Error("URL isn't a recognised Moxfield or Archidekt deck link.");
  }
  if (source === 'moxfield') {
    const id = parseMoxfieldUrl(url);
    const deck = await fetchMoxfieldDeck(id);
    return { source, ...deck };
  }
  const id = parseArchidektUrl(url);
  const deck = await fetchArchidektDeck(id);
  return { source, ...deck };
}
