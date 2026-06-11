/**
 * ToastHost — renders the global toast bus (lib/toast.js).
 *
 * Mounted once at the app root. Bottom-center stack, mirrors the
 * GlobalDropOverlay notice styling so feedback looks the same whether
 * it came from a drop, a tap, or a background save failure.
 */

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT } from '../theme.js';
import { onToast } from '../lib/toast.js';

const KIND_BORDER = {
  info: CREAM_FAINT,
  success: '#a3c98a',
  error: 'rgb(196,74,63)',
};

export function ToastHost() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  useEffect(() => {
    const off = onToast((t) => {
      setToasts((cur) => [...cur.slice(-3), t]); // cap the stack at 4
      const id = setTimeout(() => dismiss(t.id), t.duration);
      timers.current.set(t.id, id);
    });
    return () => {
      off();
      for (const id of timers.current.values()) clearTimeout(id);
      timers.current.clear();
    };
  }, []);

  const dismiss = (id) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 px-4 w-full max-w-lg pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="border px-4 py-3 font-mono text-xs flex items-start gap-3 w-full pointer-events-auto"
          style={{ borderColor: KIND_BORDER[t.kind] || CREAM_FAINT, color: CREAM, background: 'rgba(var(--bg-rgb),0.94)', backdropFilter: 'blur(6px)' }}
        >
          <span className="flex-1 min-w-0 break-words">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="shrink-0 hover:opacity-100" style={{ color: CREAM_DIM }} aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
