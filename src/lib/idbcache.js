/**
 * IndexedDB-backed cache for normalised Scryfall card objects.
 *
 * localStorage caps at ~5MB which fills up after ~3-4k cached cards;
 * IndexedDB raises that to 50MB+ (browser-dependent) and is async, so
 * a big card cache doesn't block the main thread on every write.
 *
 * Public API mirrors what scryfall.js needs:
 *   loadCacheFromIDB()  → Promise<{ [lowercaseName]: cardObj }>
 *   saveCacheToIDB(map) → Promise<void>
 *   clearIDBCache()     → Promise<void>
 *
 * All functions resolve gracefully (returning empty / undefined) when
 * IndexedDB is unavailable, so the rest of the app can stay sync.
 *
 * Migration: loadCacheFromIDB also reads the legacy localStorage cache
 * once on first run and writes it into IDB, then clears localStorage so
 * the same data isn't double-stored.
 */

const DB_NAME = 'vault-cache';
const DB_VERSION = 1;
const STORE = 'cards';
const LEGACY_KEY = 'vault:card-cache-v1';

let dbPromise = null;

function openDB() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('Vault: IDB open failed, falling back to localStorage', req.error);
      resolve(null);
    };
  });
  return dbPromise;
}

function withStore(mode, fn) {
  return openDB().then((db) => {
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try {
        result = fn(store);
      } catch (e) {
        reject(e);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IDB transaction aborted'));
    });
  });
}

/**
 * Migrate the legacy localStorage cache into IDB once. Returns true if
 * any cards were migrated.
 */
async function migrateLegacy() {
  if (typeof localStorage === 'undefined') return false;
  let legacy;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return false;
    legacy = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!legacy || typeof legacy !== 'object' || Object.keys(legacy).length === 0) {
    try { localStorage.removeItem(LEGACY_KEY); } catch {}
    return false;
  }
  await saveCacheToIDB(legacy);
  try { localStorage.removeItem(LEGACY_KEY); } catch {}
  return true;
}

/**
 * Read every cached card into an in-memory map keyed by lowercase name.
 * Performs the one-time localStorage migration on first call.
 */
export async function loadCacheFromIDB() {
  await migrateLegacy();
  const out = {};
  const result = await withStore('readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          out[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => resolve(out);
    });
  });
  return result || out;
}

/**
 * Persist the whole in-memory cache map. Implementation strategy:
 * batch put one row per card name, no overall clear (so concurrent
 * cards added while we're writing aren't lost).
 */
export async function saveCacheToIDB(map) {
  return withStore('readwrite', (store) => {
    for (const [key, value] of Object.entries(map || {})) {
      store.put(value, key);
    }
  });
}

export async function clearIDBCache() {
  return withStore('readwrite', (store) => store.clear());
}

/**
 * Best-effort cache size — number of cards currently stored.
 */
export async function cacheSize() {
  const result = await withStore('readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  });
  return result || 0;
}

/**
 * Detect whether IDB is actually usable in the current environment.
 * Useful for tests + fallbacks.
 */
export function idbAvailable() {
  return typeof indexedDB !== 'undefined';
}
