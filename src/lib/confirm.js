/**
 * In-app confirmation dialog — themed replacement for window.confirm.
 *
 *   if (!(await confirmDialog('Delete this pod and all its games?', { confirmLabel: 'Delete' }))) return;
 *
 * Same bus pattern as lib/toast.js: <ConfirmHost/> (mounted once in
 * App.jsx) subscribes and renders the pending request as a modal.
 * Resolves true on confirm, false on cancel / Esc / backdrop click.
 *
 * If no host is mounted (tests, SSR), falls back to window.confirm
 * when available, otherwise resolves false — destructive actions
 * default to NOT happening.
 */

let listener = null;

export function onConfirmRequest(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function confirmDialog(message, { confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
  if (!listener) {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return Promise.resolve(window.confirm(message));
    }
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    listener({ message, confirmLabel, cancelLabel, resolve });
  });
}
