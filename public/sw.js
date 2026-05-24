/* eslint-env serviceworker */
/**
 * Vault service worker.
 *
 * Two caches:
 *   - vault-shell-v1   — index.html + the hashed Vite bundle for the
 *     current deploy. Hashed file names mean a new deploy populates a
 *     new cache, so we just blow away old ones on activation
 *   - vault-assets-v1  — long-lived immutable assets (Scryfall mana SVGs,
 *     weserv card images). Cache-first with no expiry
 *
 * Scryfall API calls intentionally pass through to the network — IndexedDB
 * already caches normalised card payloads in the app, no need for a
 * second layer here.
 *
 * Versioned cache names so future SW versions can clean up cleanly.
 */

const SHELL_CACHE = 'vault-shell-v1';
const ASSETS_CACHE = 'vault-assets-v1';

self.addEventListener('install', (event) => {
  // Skip waiting so a returning user picks up the new SW on next reload.
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add('./'))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSETS_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isShellRequest(url) {
  // Same-origin HTML/JS/CSS — the app shell.
  return (
    url.origin === self.location.origin &&
    /\.(html|js|css|svg|woff2?|ttf|otf)$/i.test(url.pathname) === false
      ? url.pathname === '/' || url.pathname.endsWith('/')
      : true
  );
}

function isImmutableAsset(url) {
  // Card-symbol SVGs (Scryfall CDN) and weserv-proxied card images are
  // safe to cache aggressively — they don't change once published.
  return (
    /svgs\.scryfall\.io\/card-symbols/.test(url.href) ||
    /images\.weserv\.nl/.test(url.href)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pass through Scryfall API + EDHREC calls — the app caches them itself
  // and we don't want stale data papering over a real API failure.
  if (url.hostname === 'api.scryfall.com' || url.hostname === 'json.edhrec.com') {
    return;
  }

  // Long-lived immutable assets: cache-first.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          // Offline + not cached — let the browser show its own failure.
          throw e;
        }
      })
    );
    return;
  }

  // App shell: network-first, fall back to cached index for navigation.
  if (req.mode === 'navigate' || (url.origin === self.location.origin && isShellRequest(url))) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          // Network failed — return the cached app shell so the SPA boots
          // offline and uses its IDB-cached data.
          const cache = await caches.open(SHELL_CACHE);
          const hit = await cache.match(req) || await cache.match('./');
          if (hit) return hit;
          throw e;
        }
      })()
    );
  }
});
