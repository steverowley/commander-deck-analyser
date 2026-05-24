/**
 * EDHREC integration — fetch "people who play this commander also play..."
 * data from the public JSON endpoint at https://json.edhrec.com.
 *
 * No auth required. CORS is open. Responses cached in localStorage for
 * 24h to stay polite and to make the Recs tab feel instant on re-visit.
 *
 * Endpoint shape:
 *   https://json.edhrec.com/pages/commanders/<slug>.json
 *   → container.json_dict.cardlists = [{ header, tag, cardviews: [...] }, ...]
 *
 * Card entry shape (per cardview):
 *   { name, sanitized, url, num_decks, potential_decks, synergy,
 *     image_uris, label, ... }
 */

const EDHREC = 'https://json.edhrec.com';
const CACHE_KEY = 'vault:edhrec-cache-v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Build EDHREC's commander slug from a display name.
 * Rules approximated from observed URLs on edhrec.com:
 *   - lowercase
 *   - strip diacritics
 *   - replace "&" with "and"
 *   - drop ',  ', ', ', other punctuation
 *   - collapse whitespace to single hyphens
 *   - drop trailing/leading hyphens
 */
export function commanderSlug(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.:;!?"`/\\()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(map) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // Quota — drop the cache entirely; it'll repopulate.
    try { localStorage.removeItem(CACHE_KEY); } catch {}
  }
}

/**
 * Fetch and normalise EDHREC recommendations for a commander.
 * Returns { themes: [{ header, tag, cards: [...] }], fetched: ts }
 * or null if EDHREC has no page for the commander.
 *
 * Cards are normalised to:
 *   { name, sanitized, synergy, numDecks, potentialDecks, inclusion, label, imageUrl }
 * sorted by synergy descending within each theme.
 */
export async function fetchRecommendations(commanderName) {
  const slug = commanderSlug(commanderName);
  if (!slug) return null;

  const cache = readCache();
  const cached = cache[slug];
  if (cached && Date.now() - cached.fetched < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`${EDHREC}/pages/commanders/${slug}.json`);
    if (!res.ok) return null;
    const json = await res.json();
    const data = normalise(json);
    cache[slug] = { fetched: Date.now(), data };
    writeCache(cache);
    return data;
  } catch (e) {
    console.warn('EDHREC fetch failed', e);
    return null;
  }
}

function normalise(json) {
  const cardlists = json?.container?.json_dict?.cardlists || [];
  const themes = cardlists
    .map((list) => ({
      header: list.header || list.tag || 'Other',
      tag: list.tag,
      cards: (list.cardviews || []).map((cv) => ({
        name: cv.name,
        sanitized: cv.sanitized,
        synergy: typeof cv.synergy === 'number' ? cv.synergy : 0,
        numDecks: cv.num_decks || 0,
        potentialDecks: cv.potential_decks || 0,
        inclusion: cv.potential_decks > 0 ? cv.num_decks / cv.potential_decks : 0,
        label: cv.label || '',
        imageUrl: cv.image_uris?.[0]?.normal || cv.image_uris?.[0]?.small || null,
      })),
    }))
    .filter((t) => t.cards.length > 0);
  return { themes, fetched: Date.now() };
}

/**
 * Flatten themes into a single ranked list of distinct cards,
 * deduplicated across themes (a card showing up in multiple themes
 * keeps only its highest-synergy appearance).
 *
 * Excludes anything in the `excludeNames` set (lowercase card names).
 * Returns up to `limit` results, sorted by synergy then inclusion.
 */
export function topRecommendations(recommendations, excludeNames, limit = 60) {
  if (!recommendations?.themes) return [];
  const byName = new Map();
  for (const theme of recommendations.themes) {
    for (const card of theme.cards) {
      const key = card.name.toLowerCase();
      if (excludeNames.has(key)) continue;
      const existing = byName.get(key);
      if (!existing || card.synergy > existing.synergy) {
        byName.set(key, { ...card, themes: [theme.header] });
      } else if (!existing.themes.includes(theme.header)) {
        existing.themes.push(theme.header);
      }
    }
  }
  return Array.from(byName.values())
    .sort((a, b) => b.synergy - a.synergy || b.inclusion - a.inclusion)
    .slice(0, limit);
}

/**
 * Group recommendations by theme, excluding cards already in the deck.
 * Returns the themes from the original payload but with filtered card lists.
 */
export function recommendationsByTheme(recommendations, excludeNames, perTheme = 8) {
  if (!recommendations?.themes) return [];
  return recommendations.themes
    .map((theme) => ({
      ...theme,
      cards: theme.cards
        .filter((c) => !excludeNames.has(c.name.toLowerCase()))
        .sort((a, b) => b.synergy - a.synergy)
        .slice(0, perTheme),
    }))
    .filter((t) => t.cards.length > 0);
}
