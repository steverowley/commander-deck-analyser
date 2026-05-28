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
import { loadCacheFromIDB, saveCacheToIDB, idbAvailable } from './idbcache.js';

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
    // Keep every Scryfall price field we know how to consume — vendor-
    // aware pricing reads `usd*` (TCGplayer) or `eur*` (Cardmarket)
    // depending on Settings → Buy links. Null fields stay null so the
    // tooltip can say "no price available" accurately.
    prices: card.prices ? {
      usd: card.prices.usd,
      usd_foil: card.prices.usd_foil,
      usd_etched: card.prices.usd_etched,
      eur: card.prices.eur,
      eur_foil: card.prices.eur_foil,
      tix: card.prices.tix,
    } : undefined,
    image_uris: card.image_uris
      ? {
          small: card.image_uris.small,
          normal: card.image_uris.normal,
          // png has transparent rounded corners — perfect for the
          // commander panel and lets us drop the ugly white border
          // baked into older printings.
          png: card.image_uris.png,
          border_crop: card.image_uris.border_crop,
        }
      : undefined,
    card_faces: card.card_faces
      ? card.card_faces.map((f) => ({
          oracle_text: f.oracle_text,
          image_uris: f.image_uris
            ? {
                small: f.image_uris.small,
                normal: f.image_uris.normal,
                png: f.image_uris.png,
                border_crop: f.image_uris.border_crop,
              }
            : undefined,
        }))
      : undefined,
    // Printing identity — keeps the chosen art / set / collector number
    // so the UI can show which printing is in use and the printing
    // picker can highlight the active selection.
    id: card.id,
    oracle_id: card.oracle_id,
    set: card.set,
    set_name: card.set_name,
    collector_number: card.collector_number,
    rarity: card.rarity,
  };
}

export async function loadCardCache() {
  // Prefer IndexedDB (50MB+ quota, async). Falls back to localStorage if
  // IDB isn't available. idbcache.loadCacheFromIDB also migrates the
  // legacy localStorage cache on first run.
  if (idbAvailable()) {
    try {
      const fromIdb = await loadCacheFromIDB();
      Object.assign(cardCache, fromIdb);
      return;
    } catch (e) {
      console.warn('Vault: IDB load failed, falling back to localStorage', e);
    }
  }
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) Object.assign(cardCache, JSON.parse(stored));
  } catch {}
}

// Track cards added since the last save so we only put delta-rows
// rather than rewriting the whole cache on every fetch.
const pendingWrites = {};

function persistCacheSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const writes = { ...pendingWrites };
    for (const k of Object.keys(pendingWrites)) delete pendingWrites[k];
    if (Object.keys(writes).length === 0) return;
    if (idbAvailable()) {
      try {
        await saveCacheToIDB(writes);
        return;
      } catch (e) {
        console.warn('Vault: IDB save failed, falling back to localStorage', e);
      }
    }
    // localStorage fallback path — same eviction-on-quota logic as before.
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cardCache));
    } catch (e) {
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
  const canonical = lc(card.name);
  cardCache[canonical] = norm;
  pendingWrites[canonical] = norm;
  if (alias && lc(alias) !== canonical) {
    cardCache[lc(alias)] = norm;
    pendingWrites[lc(alias)] = norm;
  }
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
            pendingWrites[key] = match;
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
 * Fetch every printing of a card so the UI can let the user pick a
 * specific art. Walks Scryfall's `/cards/search?unique=prints` results
 * across pages (Scryfall paginates at 175). Returns an array of
 * normalized cards — the same shape used everywhere else, so the chosen
 * printing can drop straight into the deck slot.
 *
 * Doesn't write to the long-term cache: printings are per-deck overrides,
 * not the canonical lookup result for a name.
 */
export async function fetchPrintings(card) {
  if (!card?.name) return [];
  // Prefer oracle_id when available — it's unambiguous even for cards
  // that share a name (e.g. tokens vs the real card). Fall back to
  // exact-name search otherwise.
  const query = card.oracle_id
    ? `oracleid:${card.oracle_id}`
    : `!"${card.name}" include:extras`;
  const printings = [];
  let url = `${SCRYFALL}/cards/search?order=released&unique=prints&q=${encodeURIComponent(query)}`;
  // Safety cap so a 5,000-printing edge case can't run away.
  for (let page = 0; page < 10 && url; page++) {
    try {
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      for (const p of data.data || []) printings.push(normalize(p));
      url = data.has_more ? data.next_page : null;
      if (url) await sleep(REQUEST_DELAY_MS);
    } catch {
      break;
    }
  }
  return printings;
}

/**
 * Pull a random legendary creature commander from Scryfall. Optional
 * `colors` is an array like ['W','U','B'] meaning "color identity is
 * exactly these"; an empty array means any identity. `partner` includes
 * partner / background commanders in the pool (off by default).
 *
 * Returns a normalized card or null on failure.
 */
export async function fetchRandomCommander({ colors = [], partner = false } = {}) {
  const parts = ['is:commander'];
  if (colors.length > 0) {
    parts.push(`id=${colors.join('').toLowerCase()}`);
  }
  if (!partner) {
    // Exclude oddballs that need a partner / friend / background to play
    // — they aren't satisfying as a solo-roll result.
    parts.push('-o:"partner with"', '-o:"choose a background"');
  }
  const q = parts.join(' ');
  try {
    const res = await fetch(`${SCRYFALL}/cards/random?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const card = await res.json();
    return cacheCard(card);
  } catch {
    return null;
  }
}

/**
 * Pick a random commander from the user's vault. Uses the same
 * "Legendary Creature" rule the Vault page applies (vaultStats.js)
 * so the candidate pool matches what users see listed as buildable
 * commanders. Returns null when nothing in the vault matches.
 *
 * `collection` is the map returned by `loadCollection()` —
 * keyed by lowercased card name, values include `.name`.
 *
 * `colors` matches `fetchRandomCommander`'s semantic: an empty
 * array means any identity; a non-empty array means the card's
 * color identity must be exactly those colors.
 */
export async function pickRandomCommanderFromCollection({ collection, colors = [], partner = false } = {}) {
  const entries = Object.values(collection || {});
  if (entries.length === 0) return null;

  const names = entries.map((e) => e.name).filter(Boolean);
  if (names.length === 0) return null;
  const { results } = await fetchCardsByName(names);

  const wantIdentity = colors.length > 0 ? [...colors].sort().join('') : null;

  const candidates = [];
  for (const entry of entries) {
    const card = results[lc(entry.name)];
    const typeLine = card?.type_line || '';
    if (!/Legendary/i.test(typeLine)) continue;
    if (!/Creature/i.test(typeLine)) continue;

    if (wantIdentity !== null) {
      const ci = [...(card.color_identity || [])].sort().join('');
      if (ci !== wantIdentity) continue;
    }

    if (!partner) {
      const oracle = (card.oracle_text || '').toLowerCase();
      if (oracle.includes('partner with')) continue;
      if (oracle.includes('choose a background')) continue;
    }

    candidates.push(card);
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Build a card image URL. Uses Scryfall's hosted images, proxied through
 * weserv.nl to avoid hot-linking issues and provide some caching.
 */
/**
 * Resolve a Scryfall URL (image CDN, card page, or API endpoint)
 * into a normalised card object. Used by the drag-and-drop drop
 * zones — when a user drags a card image from scryfall.com onto
 * Vault or a deck, the drop handler hands the URL to this and we
 * fetch the actual card data.
 *
 * Supported shapes:
 *   - https://cards.scryfall.io/<size>/<face>/<a>/<b>/<uuid>.<ext>
 *     → looks up /cards/<uuid>
 *   - https://scryfall.com/card/<set>/<collector>[/<slug>]
 *     → looks up /cards/<set>/<collector>
 *   - https://api.scryfall.com/cards/<uuid>
 *   - https://api.scryfall.com/cards/<set>/<collector>
 *
 * Returns the normalised card on success, null otherwise. Caches
 * the result so subsequent lookups are instant.
 */
/**
 * Pull a Scryfall URL out of a DataTransfer the browser handed us on
 * drop. External drags from scryfall.com tabs land in different
 * data-transfer slots across browsers — uri-list in Chrome, html
 * in some Firefox builds, plain in Safari. Try them all.
 */
export function extractDroppedScryfallUrl(dt) {
  if (!dt) return null;
  // text/uri-list — most common, often multi-line w/ comments.
  const uriList = dt.getData('text/uri-list');
  if (uriList) {
    const line = uriList.split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('#'));
    if (line && looksLikeScryfall(line)) return line;
  }
  // text/plain — Safari + many other browsers use this.
  const plain = dt.getData('text/plain');
  if (plain && looksLikeScryfall(plain.trim())) return plain.trim();
  // text/html — when dragging an image, often contains <img src="..."> or <a href="...">.
  const html = dt.getData('text/html');
  if (html) {
    const srcMatch = html.match(/src="([^"]+)"/i);
    if (srcMatch && looksLikeScryfall(srcMatch[1])) return srcMatch[1];
    const hrefMatch = html.match(/href="([^"]+)"/i);
    if (hrefMatch && looksLikeScryfall(hrefMatch[1])) return hrefMatch[1];
  }
  return null;
}

function looksLikeScryfall(url) {
  return /scryfall\.io|scryfall\.com/i.test(url);
}

export async function resolveScryfallUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let endpoint = null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    if (host === 'cards.scryfall.io' || host === 'img.scryfall.com') {
      // .../<a>/<b>/<uuid>.jpg or .png — pluck the uuid out of the path.
      const m = u.pathname.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m) endpoint = `${SCRYFALL}/cards/${m[1]}`;
    } else if (host === 'scryfall.com' || host === 'www.scryfall.com') {
      // /card/<set>/<collector>[/<slug>]
      const m = u.pathname.match(/\/card\/([^/]+)\/([^/]+)/i);
      if (m) endpoint = `${SCRYFALL}/cards/${m[1]}/${encodeURIComponent(m[2])}`;
    } else if (host === 'api.scryfall.com') {
      // Trust the URL as an API endpoint as-is if it's a /cards/ path.
      if (u.pathname.startsWith('/cards/')) endpoint = `${SCRYFALL}${u.pathname}`;
    }
  } catch {
    return null;
  }
  if (!endpoint) return null;
  try {
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const card = await res.json();
    return cacheCard(card);
  } catch {
    return null;
  }
}

/**
 * Fetch + normalise a single Scryfall card by its uuid. Caches the
 * result. Used by the Vault to render a specific printing chosen
 * via the printing picker (stored as meta.printing_id on each
 * collection entry).
 */
export async function fetchCardById(id) {
  if (!id) return null;
  try {
    const res = await fetch(`${SCRYFALL}/cards/${id}`);
    if (!res.ok) return null;
    const card = await res.json();
    return cacheCard(card);
  } catch {
    return null;
  }
}

export function cardImageUrl(card, version = 'small') {
  if (!card?.name) return null;
  const direct =
    card.image_uris?.[version] ||
    card.card_faces?.[0]?.image_uris?.[version] ||
    `${SCRYFALL}/cards/named?exact=${encodeURIComponent(
      card.name
    )}&format=image&version=${version}`;
  // For the PNG variant we need to keep alpha (rounded transparent
  // corners). Weserv defaults to JPEG output which strips it, so opt
  // into PNG output for that case. Other variants stay JPEG for size.
  const params = `url=${encodeURIComponent(direct)}${version === 'png' ? '&output=png' : ''}`;
  return `https://images.weserv.nl/?${params}`;
}

/**
 * Find deck cards whose `scryfall.oracle_text` is missing or empty,
 * re-fetch them from Scryfall (bypassing the cache), and return a new
 * cards array with `oracle_text` (and `card_faces`, `type_line`) merged
 * back into each card's `scryfall` object. Other fields — image_uris,
 * id, set, etc. — are preserved so a manually-chosen printing isn't
 * clobbered.
 *
 * This is the recovery path behind the Packages tab's "Re-detect tags"
 * empty-state button: if a deck was tagged once with empty oracle text
 * (stale cache, partial autoseed fetch, very old Supabase row), this
 * pulls the missing text so a subsequent `retag()` can populate tags.
 *
 * Reports per-batch progress via onProgress({ done, total }). Returns
 * { cards, rehydrated, failed } — `rehydrated` is the number of cards
 * whose scryfall object was updated, `failed` is the number Scryfall
 * could not resolve.
 */
export async function rehydrateMissingOracleText(cards, onProgress) {
  const needsRefresh = (cards || []).filter((c) => {
    if (!c?.scryfall) return false;
    const text =
      (c.scryfall.oracle_text || '') +
      (c.scryfall.card_faces || []).map((f) => f?.oracle_text || '').join('');
    return !text.trim();
  });

  if (needsRefresh.length === 0) {
    onProgress?.({ done: 0, total: 0 });
    return { cards, rehydrated: 0, failed: 0 };
  }

  const names = [...new Set(needsRefresh.map((c) => c.name))];
  const byName = {};
  let failed = 0;

  const BATCH = 75;
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    onProgress?.({ done: i, total: names.length });
    try {
      const res = await fetch(`${SCRYFALL}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
      });
      if (!res.ok) {
        failed += batch.length;
        continue;
      }
      const data = await res.json();
      for (const card of data.data || []) {
        const norm = cacheCard(card);
        byName[lc(norm.name)] = norm;
      }
      failed += (data.not_found || []).length;
    } catch {
      failed += batch.length;
    }
    if (i + BATCH < names.length) await sleep(REQUEST_DELAY_MS);
  }

  onProgress?.({ done: names.length, total: names.length });

  let rehydrated = 0;
  const updatedCards = cards.map((c) => {
    const fresh = c?.name ? byName[lc(c.name)] : null;
    if (!fresh || !c.scryfall) return c;
    const oldText = (c.scryfall.oracle_text || '').trim();
    const newText = (fresh.oracle_text || '').trim();
    // Only touch the card when fresh data actually adds oracle text we
    // didn't have. Preserve every other field (image_uris, id, set,
    // collector_number) so a user-chosen printing override survives.
    if (!newText || newText === oldText) return c;
    rehydrated++;
    return {
      ...c,
      scryfall: {
        ...c.scryfall,
        oracle_text: newText,
        card_faces: c.scryfall.card_faces || fresh.card_faces,
        type_line: c.scryfall.type_line || fresh.type_line,
      },
    };
  });

  return { cards: updatedCards, rehydrated, failed };
}

/**
 * Re-fetch every card currently in the cache from Scryfall and overwrite
 * the cached entry. Useful for refreshing prices + oracle text after a
 * Scryfall update without rebuilding the cache from zero.
 *
 * Reports per-batch progress via onProgress({ done, total }). Returns
 * { updated, failed } counts when complete.
 */
export async function refreshCachedCards(onProgress) {
  // Distinct canonical names — the cache also stores aliases that map to
  // the same canonical card; we only need to re-fetch each canonical once.
  const seenName = new Set();
  for (const card of Object.values(cardCache)) {
    if (card?.name) seenName.add(card.name);
  }
  const names = Array.from(seenName);
  if (names.length === 0) {
    onProgress?.({ done: 0, total: 0 });
    return { updated: 0, failed: 0 };
  }

  const BATCH = 75;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    onProgress?.({ done: i, total: names.length });

    try {
      const res = await fetch(`${SCRYFALL}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
      });
      if (!res.ok) {
        failed += batch.length;
        continue;
      }
      const data = await res.json();
      for (const card of data.data || []) {
        cacheCard(card); // overwrites the existing entry + queues persist
        updated++;
      }
      failed += (data.not_found || []).length;
    } catch {
      failed += batch.length;
    }

    if (i + BATCH < names.length) await sleep(REQUEST_DELAY_MS);
  }

  onProgress?.({ done: names.length, total: names.length });
  return { updated, failed };
}
