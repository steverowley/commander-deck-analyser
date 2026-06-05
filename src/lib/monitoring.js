/**
 * Sentry error tracking — initialised only when VITE_SENTRY_DSN is set.
 *
 * @sentry/react is loaded with a dynamic import() so the SDK lands in its own
 * chunk and never enters the main bundle unless monitoring is configured. Stays
 * fully inert (no network, no chunk fetched) in local dev and unconfigured
 * builds. Errors here are swallowed — monitoring must never break the app.
 */

let sentry = null;

export async function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      // Error tracking only — no performance tracing, to stay light and
      // comfortably inside the free tier.
      tracesSampleRate: 0,
    });
    sentry = Sentry;
  } catch {
    /* never let monitoring break the app */
  }
}

/**
 * Report a caught error (e.g. from the React ErrorBoundary, which Sentry's
 * global handlers don't see). No-op until Sentry is configured + loaded.
 */
export function captureError(error, context) {
  if (!sentry) return;
  try {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* ignore */
  }
}
