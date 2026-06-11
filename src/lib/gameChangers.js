/**
 * Game Changers — dynamic sync from Scryfall (#125).
 *
 * WotC's list has changed three times in twelve months; the hardcoded
 * copy in constants.js goes stale silently. Scryfall tags the official
 * list as `is:gamechanger`, so we fetch it, cache for 24h, and fall
 * back to the constant when offline / the API breaks / the payload
 * looks bogus.
 *
 * The bracket assessor is synchronous, so the API here is a module-
 * level Set with a sync membership check:
 *   isGameChanger(name)   — read against the current set
 *   loadGameChangers()    — async refresh (App boot, fire-and-forget)
 * Until/unless a fetch succeeds, the current set IS the constant.
 */

import { GAME_CHANGERS } from './constants.js';

const LS_KEY = 'vault:gameChangers:v1';
const TTL_MS = 24 * 60 * 60 * 1000;
// A real list is ~50 cards; refuse to replace the set with anything
// suspiciously small (truncated response, API hiccup, schema change).
const MIN_PLAUSIBLE = 20;

const SEARCH_URL = 'https://api.scryfall.com/cards/search?q=is%3Agamechanger&unique=cards';

let current = new Set(GAME_CHANGERS);

export function isGameChanger(name) {
  return current.has(String(name || '').toLowerCase());
}

export function gameChangerCount() {
  return current.size;
}

function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { at, names } = JSON.parse(raw);
    if (!Number.isFinite(at) || !Array.isArray(names) || names.length < MIN_PLAUSIBLE) return null;
    return { at, names };
  } catch {
    return null;
  }
}

function writeCache(names) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), names }));
  } catch {}
}

/**
 * Refresh the set: cache first (applies even when stale, so a failed
 * network refresh still uses the last good sync), then Scryfall with
 * pagination. Never throws — the fallback constant always stands.
 */
export async function loadGameChangers({ force = false, fetcher } = {}) {
  const doFetch = fetcher || (typeof fetch !== 'undefined' ? fetch : null);
  const cached = readCache();
  if (cached) {
    current = new Set(cached.names);
    if (!force && Date.now() - cached.at < TTL_MS) return current;
  }
  if (!doFetch) return current;
  try {
    const names = [];
    let url = SEARCH_URL;
    while (url) {
      const res = await doFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = await res.json();
      for (const card of page.data || []) {
        if (card?.name) names.push(card.name.toLowerCase());
        // DFCs: deck entries usually carry the front-face name.
        const front = card?.card_faces?.[0]?.name;
        if (front) names.push(front.toLowerCase());
      }
      url = page.has_more ? page.next_page : null;
    }
    if (names.length >= MIN_PLAUSIBLE) {
      current = new Set(names);
      writeCache([...current]);
    }
  } catch (e) {
    console.warn('Vault: Game Changers sync failed — using fallback list', e);
  }
  return current;
}

/** Test hook — reset to the hardcoded fallback. */
export function resetGameChangers() {
  current = new Set(GAME_CHANGERS);
}
