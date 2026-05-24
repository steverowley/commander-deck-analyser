/**
 * Card lookup via the Scryfall API.
 *
 * Endpoints used:
 *   GET  /cards/named?exact=...   → single card by exact name
 *   GET  /cards/named?fuzzy=...   → single card by fuzzy match
 *   POST /cards/collection        → batch lookup, up to 75 identifiers per request
 *   GET  /cards/autocomplete?q=.. → name autocomplete suggestions
 *
 * Scryfall is free, no API key required. They request rate limiting
 * of 50-100ms between requests; we use 100ms to stay polite.
 */

import { lc } from './utils.js';

const SCRYFALL = 'https://api.scryfall.com';
const CACHE_KEY = 'vault:card-cache-v1';
const REQUEST_DELAY_MS = 100;

const cardCache = {};
let saveTimer = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Strip Scryfall's full card object down to the fields the app actually uses.
 * Keeps the cache small enough to fit in localStorage.
 */
function normalize(card) {
  return {
    name: card.name,
    mana_cost: card.mana_cost || card.card_faces?.[0]?.mana_cost || '',
    cmc: card.cmc ?? 0,
    type_line: card.type_line || '',
    oracle_text:
      card.oracle_text ||
      (card.card_faces || []).map((f) => f.oracle_text).filter(Boolean).join('\n//\n') ||
      '',
    colors: card.colors || card.card_faces?.[0]?.colors || [],
    color_identity: card.color_identity || [],
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    image_uris: card.image_uris
      ? { small: card.image_uris.small, normal: card.image_uris.normal }
      : undefined,
    card_faces: card.card_faces
      ? card.card_faces.map((f) => ({
          oracle_text: f.oracle_text,
          image_uris: f.image_uris
            ? { small: f.image_uris.small, normal: f.image_uris.normal }
            : undefined,
        }))
      : undefined,
  };
}

export async function loadCardCache() {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) Object.assign(cardCache, JSON.parse(stored));
  } catch {}
}

function persistCacheSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cardCache));
    } catch (e) {
      // Most likely cause: localStorage quota exceeded.
      // Drop half the cache and try again so we don't permanently fail to cache.
      const keys = Object.keys(cardCache);
      const drop = Math.floor(keys.length / 2);
      for (let i = 0; i < drop; i++) delete cardCache[keys[i]];
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cardCache));
      } catch {
        console.warn('Vault: card cache save failed', e);
      }
    }
  }, 1000);
}

function cacheCard(card, alias) {
  const norm = normalize(card);
  cardCache[lc(card.name)] = norm;
  if (alias && lc(alias) !== lc(card.name)) cardCache[lc(alias)] = norm;
  persistCacheSoon();
  return norm;
}

/**
 * Batch-fetch cards by name. Returns { results, notFound, errors }
 * where results is keyed by lowercased input name AND lowercased canonical name.
 */
export async function fetchCardsByName(names, onProgress) {
  const results = {};
  const notFound = [];
  const errors = [];

  const unique = [...new Set(names)];
  const uncached = [];
  for (const name of unique) {
    const cached = cardCache[lc(name)];
    if (cached) results[lc(name)] = cached;
    else uncached.push(name);
  }

  if (uncached.length === 0) {
    onProgress?.(`All ${unique.length} cards loaded from cache`);
    return { results, notFound, errors };
  }
  onProgress?.(`${unique.length - uncached.length} cached, fetching ${uncached.length}...`);

  // Scryfall /cards/collection accepts up to 75 identifiers per request
  const BATCH = 75;
  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const batchTotal = Math.ceil(uncached.length / BATCH);
    onProgress?.(`Batch ${batchNum}/${batchTotal} — ${batch.length} cards`);

    try {
      const res = await fetch(`${SCRYFALL}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
      });

      if (!res.ok) {
        errors.push(`Scryfall ${res.status}`);
        notFound.push(...batch);
        continue;
      }

      const data = await res.json();

      // Map each batch input to a result. Scryfall returns successful cards
      // in `data` (in same order as found) and unmatched identifiers in `not_found`.
      const foundByNorm = {};
      for (const card of data.data || []) {
        const norm = cacheCard(card);
        foundByNorm[lc(card.name)] = norm;
        results[lc(card.name)] = norm;
      }

      // For each input name, link it to the canonical match if we got one.
      const notFoundSet = new Set(
        (data.not_found || []).map((id) => lc(id.name || ''))
      );
      for (const inputName of batch) {
        const key = lc(inputName);
        if (notFoundSet.has(key)) {
          notFound.push(inputName);
        } else if (foundByNorm[key]) {
          results[key] = foundByNorm[key];
        } else {
          // Scryfall normalized the name (e.g. case-insensitive match).
          // Find the closest result by checking each found card.
          const match = Object.values(foundByNorm).find(
            (c) => lc(c.name) === key || lc(c.name).includes(key)
          );
          if (match) {
            results[key] = match;
            cardCache[key] = match;
          } else {
            notFound.push(inputName);
          }
        }
      }
    } catch (e) {
      errors.push(e.message);
      notFound.push(...batch);
    }

    if (i + BATCH < uncached.length) await sleep(REQUEST_DELAY_MS);
  }

  // Retry remaining misses with fuzzy lookup (handles typos and alt names).
  if (notFound.length > 0 && notFound.length <= 30) {
    const stillMissing = [];
    onProgress?.(`Fuzzy-matching ${notFound.length} unresolved...`);
    for (const name of notFound) {
      try {
        const res = await fetch(
          `${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(name)}`
        );
        if (res.ok) {
          const card = await res.json();
          const norm = cacheCard(card, name);
          results[lc(name)] = norm;
        } else {
          stillMissing.push(name);
        }
      } catch {
        stillMissing.push(name);
      }
      await sleep(REQUEST_DELAY_MS);
    }
    notFound.length = 0;
    notFound.push(...stillMissing);
  }

  persistCacheSoon();
  return { results, notFound, errors };
}

/**
 * Card name autocomplete. Returns up to 8 names matching the query.
 * Combines local cache hits with live Scryfall suggestions.
 */
export async function searchCardAutocomplete(query) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();

  const fromCache = Object.values(cardCache)
    .filter((c) => c.name?.toLowerCase().includes(q))
    .map((c) => c.name)
    .sort(
      (a, b) =>
        a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q)
    )
    .slice(0, 8);

  if (fromCache.length >= 5) return fromCache;

  try {
    const res = await fetch(
      `${SCRYFALL}/cards/autocomplete?q=${encodeURIComponent(query)}`
    );
    if (!res.ok) return fromCache;
    const data = await res.json();
    return [...new Set([...fromCache, ...(data.data || [])])].slice(0, 8);
  } catch {
    return fromCache;
  }
}

/**
 * Fetch a single card by name. Tries exact first, falls back to fuzzy.
 */
export async function fetchCardByExactName(name) {
  const cached = cardCache[lc(name)];
  if (cached) return cached;

  try {
    let res = await fetch(
      `${SCRYFALL}/cards/named?exact=${encodeURIComponent(name)}`
    );
    if (!res.ok) {
      res = await fetch(
        `${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(name)}`
      );
    }
    if (res.ok) {
      const card = await res.json();
      return cacheCard(card, name);
    }
  } catch {}
  return null;
}

/**
 * Build a card image URL. Uses Scryfall's hosted images, proxied through
 * weserv.nl to avoid hot-linking issues and provide some caching.
 */
export function cardImageUrl(card, version = 'small') {
  if (!card?.name) return null;
  const direct =
    card.image_uris?.[version] ||
    card.card_faces?.[0]?.image_uris?.[version] ||
    `${SCRYFALL}/cards/named?exact=${encodeURIComponent(
      card.name
    )}&format=image&version=${version}`;
  return `https://images.weserv.nl/?url=${encodeURIComponent(direct)}`;
}
