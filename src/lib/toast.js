/**
 * Global toast bus — the app-wide "it worked / it failed" voice.
 *
 * Deliberately tiny: a pub/sub with no DOM knowledge so libs and
 * components can both emit. <ToastHost/> (mounted once in App.jsx)
 * subscribes and renders the stack.
 *
 *   toast('Added Sol Ring to your Vault')            // info
 *   toast.success('Saved to your archive')
 *   toast.error("Couldn't save — check your connection")
 *
 * Errors default to a longer duration since they carry consequences.
 */

let seq = 0;
const listeners = new Set();

export const TOAST_DURATION_MS = 4000;
export const TOAST_ERROR_DURATION_MS = 8000;

export function onToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toast(message, { kind = 'info', duration, action } = {}) {
  if (!message) return null;
  const t = {
    id: ++seq,
    message: String(message),
    kind,
    duration: duration ?? (kind === 'error' ? TOAST_ERROR_DURATION_MS : TOAST_DURATION_MS),
    // Optional { label, onClick } — rendered as an inline button
    // (e.g. "Removed Sol Ring — Undo").
    action: action || null,
  };
  for (const fn of listeners) fn(t);
  return t.id;
}

toast.success = (message, opts = {}) => toast(message, { ...opts, kind: 'success' });
toast.error = (message, opts = {}) => toast(message, { ...opts, kind: 'error' });
