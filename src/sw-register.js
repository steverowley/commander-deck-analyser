/**
 * Register the service worker in production builds.
 *
 * Dev mode is skipped because Vite serves modules via /@vite/client +
 * HMR — a SW intercepting those breaks hot reload. The browser also
 * needs a stable origin/path to scope the SW, so the registration URL
 * is anchored to the deployed base path.
 */

import { toast } from './lib/toast.js';

export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  // Use the same base path Vite was configured with. Falls back to '/'
  // when base is unset (custom-domain deploy).
  const base = import.meta.env.BASE_URL || '/';
  const swUrl = `${base.replace(/\/$/, '')}/sw.js`;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope: base }).then((reg) => {
      // New deploy detection: a fresh worker installing while an old one
      // controls the page means a new version shipped. The SW uses
      // skipWaiting, so one refresh picks it up — tell the user instead
      // of leaving them on a stale build indefinitely.
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Vault has been updated — refresh to get the latest version.', { duration: 12000 });
          }
        });
      });
    }).catch((err) => {
      console.warn('Vault: service worker registration failed', err);
    });
  });
}
