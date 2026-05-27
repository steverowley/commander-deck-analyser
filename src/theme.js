// Theme tokens. The actual colors live in :root CSS variables in
// index.css; these exports hand React inline-style code a reference to
// those variables so a single document-level data-theme flip restyles
// the whole app. See src/lib/themeMode.js for the read/write helpers.
export const CREAM = 'var(--ink)';
export const CREAM_DIM = 'rgba(var(--ink-rgb), 0.55)';
export const CREAM_FAINT = 'rgba(var(--ink-rgb), 0.12)';
export const BG = 'var(--bg)';
export const ACCENT = 'var(--accent)';
