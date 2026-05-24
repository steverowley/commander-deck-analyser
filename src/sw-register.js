/**
 * Register the service worker in production builds.
 *
 * Dev mode is skipped because Vite serves modules via /@vite/client +
 * HMR — a SW intercepting those breaks hot reload. The browser also
 * needs a stable origin/path to scope the SW, so the registration URL
 * is anchored to the deployed base path.
 */

export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  // Use the same base path Vite was configured with. Falls back to '/'
  // when base is unset (custom-domain deploy).
  const base = import.meta.env.BASE_URL || '/';
  const swUrl = `${base.replace(/\/$/, '')}/sw.js`;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope: base }).catch((err) => {
      console.warn('Vault: service worker registration failed', err);
    });
  });
}
