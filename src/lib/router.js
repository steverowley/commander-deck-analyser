/**
 * Hash router (#195) — tiny, dependency-free.
 *
 * Routes (all start with '#/' so they can never collide with the
 * legacy '#d=' share-link encoding, which decodeDeckUrl handles first):
 *
 *   #/              landing
 *   #/deck/:id      a deck in the user's archive (local 'deck_*' id or cloud uuid)
 *   #/vault         collection page
 *   #/pods          pods page
 *   #/gallery       browse-all public gallery
 *   #/gallery/:id   a public gallery deck, opened read-only (permalink)
 *   #/rolls         browse-all random rolls
 *   #/roll/:id      a shared random roll, opened read-only (permalink)
 *
 * parseRoute(hash)  → { view, id } | null  (null = not a route, e.g. '#d=...')
 * formatRoute(view, id) → '#/...' string
 *
 * Transient in-memory decks (ids 'roll:<ts>' minted by the roller and
 * 'view:<id>' viewer wrappers) are NOT routable — they can't be
 * rehydrated after a refresh, so they stay state-only.
 */

export function parseRoute(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h.startsWith('/')) return null;
  const parts = h.slice(1).split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { view: 'landing', id: null };
  const [head, id = null] = parts;
  switch (head) {
    case 'deck':    return id ? { view: 'deck', id } : { view: 'landing', id: null };
    case 'vault':   return { view: 'vault', id: null };
    case 'pods':    return { view: 'pods', id: null };
    case 'gallery': return id ? { view: 'gallery-deck', id } : { view: 'gallery-all', id: null };
    case 'rolls':   return { view: 'rolls-all', id: null };
    case 'roll':    return id ? { view: 'roll', id } : { view: 'rolls-all', id: null };
    default:        return { view: 'landing', id: null };
  }
}

export function formatRoute(view, id = null) {
  switch (view) {
    case 'deck':         return id ? `#/deck/${encodeURIComponent(id)}` : '#/';
    case 'vault':        return '#/vault';
    case 'pods':         return '#/pods';
    case 'gallery-all':  return '#/gallery';
    case 'gallery-deck': return id ? `#/gallery/${encodeURIComponent(id)}` : '#/gallery';
    case 'rolls-all':    return '#/rolls';
    case 'roll':         return id ? `#/roll/${encodeURIComponent(id)}` : '#/rolls';
    default:             return '#/';
  }
}

/**
 * True for deck ids that survive a refresh (archive decks), false for
 * the transient in-memory ids the roller / gallery viewer mint.
 */
export function isRoutableDeckId(id) {
  const s = String(id || '');
  if (!s) return false;
  return !s.startsWith('roll:') && !s.startsWith('view:');
}
