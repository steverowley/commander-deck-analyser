/**
 * Cloudflare Web Analytics — privacy-first, cookieless page-view tracking.
 *
 * Activated only when VITE_CF_ANALYTICS_TOKEN is set at build time (added as a
 * GitHub Actions repo variable for production; absent in local dev + PR
 * previews, so analytics stays inert there). The token is public by design —
 * it's the beacon site tag that ships in the page, not a secret.
 */
const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

export function initAnalytics() {
  const token = import.meta.env.VITE_CF_ANALYTICS_TOKEN;
  if (!token) return; // not configured — stay inert
  if (typeof document === 'undefined') return;
  if (document.querySelector(`script[src="${BEACON_SRC}"]`)) return; // load once
  const s = document.createElement('script');
  s.defer = true;
  s.src = BEACON_SRC;
  s.setAttribute('data-cf-beacon', JSON.stringify({ token }));
  document.head.appendChild(s);
}
