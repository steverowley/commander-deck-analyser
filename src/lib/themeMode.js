/**
 * Theme mode — light / dark / system.
 *
 * The actual colors are CSS variables defined in src/index.css. This
 * module just owns the user's preference (persisted to localStorage)
 * and applies it as a `data-theme` attribute on <html>. When the user
 * leaves the toggle on "system", the prefers-color-scheme media query
 * in CSS picks the palette automatically; we still listen for system
 * changes so the page-level `color-scheme` (which affects native form
 * controls / scrollbars) re-evaluates without a reload.
 */

export const THEME_MODE_KEY = 'vault:themeMode';

export const MODES = ['system', 'light', 'dark'];

function safeStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Read the persisted choice. Returns 'system' if absent or invalid. */
export function getThemeMode() {
  const store = safeStorage();
  if (!store) return 'system';
  const raw = store.getItem(THEME_MODE_KEY);
  return MODES.includes(raw) ? raw : 'system';
}

/** Persist + apply. Pass 'system' to clear the override and follow OS. */
export function setThemeMode(mode) {
  const next = MODES.includes(mode) ? mode : 'system';
  const store = safeStorage();
  if (store) {
    if (next === 'system') store.removeItem(THEME_MODE_KEY);
    else store.setItem(THEME_MODE_KEY, next);
  }
  applyThemeMode(next);
  return next;
}

/** Cycle system → light → dark → system. */
export function nextThemeMode(current) {
  const idx = MODES.indexOf(current);
  return MODES[(idx + 1) % MODES.length];
}

/**
 * Apply a mode to the document. Mutates <html data-theme="..."> so the
 * CSS variable cascade picks up the right palette. Safe to call before
 * React mounts — index.css already has the defaults.
 */
export function applyThemeMode(mode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') {
    root.dataset.theme = mode;
  } else {
    delete root.dataset.theme;
  }
}

/** True if the OS currently prefers light. Used to label the "system" state. */
export function systemPrefersLight() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}
