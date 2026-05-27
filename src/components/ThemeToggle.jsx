import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { CREAM, CREAM_DIM } from '../theme.js';
import {
  getThemeMode,
  setThemeMode,
  nextThemeMode,
  applyThemeMode,
  systemPrefersLight,
} from '../lib/themeMode.js';

const ICONS = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const LABELS = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * Small icon button that cycles through system → light → dark on
 * click. Persists the choice; while on "system" we still listen to the
 * OS preference so a toggle in macOS / Windows live-updates the page.
 */
export function ThemeToggle({ compact = false }) {
  const [mode, setMode] = useState(() => getThemeMode());

  // Re-apply when the OS preference flips while we're on "system" — the
  // CSS variables flip via the @media query, but `color-scheme` for
  // native controls needs the data-theme path to re-evaluate.
  useEffect(() => {
    if (mode !== 'system') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyThemeMode('system');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [mode]);

  const onClick = () => {
    const next = nextThemeMode(mode);
    setThemeMode(next);
    setMode(next);
  };

  const Icon = ICONS[mode];
  const effective = mode === 'system' ? (systemPrefersLight() ? 'light' : 'dark') : mode;
  const title =
    mode === 'system'
      ? `Theme · System (${LABELS[effective]}). Click for Light.`
      : `Theme · ${LABELS[mode]}. Click for ${LABELS[nextThemeMode(mode)]}.`;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="hover:opacity-100 transition shrink-0"
        style={{ color: CREAM_DIM }}
        title={title}
        aria-label={title}
      >
        <Icon className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100 transition inline-flex items-center gap-1.5"
      style={{ color: CREAM_DIM }}
      title={title}
      aria-label={title}
    >
      <Icon className="w-3 h-3" />
      <span style={{ color: mode === 'system' ? CREAM_DIM : CREAM }}>{LABELS[mode]}</span>
    </button>
  );
}
