/**
 * ConfirmHost — renders confirmDialog() requests (lib/confirm.js) as a
 * themed modal. Mounted once at the app root, above everything
 * (z-[80] — toasts sit at z-[70], modals at z-50/60).
 *
 * Esc and backdrop click both cancel; destructive actions should
 * never be the path of least resistance.
 */

import React, { useEffect, useState } from 'react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { onConfirmRequest } from '../lib/confirm.js';

export function ConfirmHost() {
  const [req, setReq] = useState(null);

  useEffect(() => onConfirmRequest((incoming) => {
    setReq((prev) => {
      // A second request while one is open cancels the first — there is
      // only ever one pending decision.
      if (prev) prev.resolve(false);
      return incoming;
    });
  }), []);

  useEffect(() => {
    if (!req) return;
    // Capture phase + stopImmediatePropagation: when the confirm sits on
    // top of a modal, Esc must cancel ONLY the confirm — not also close
    // the modal underneath via its own useEscapeClose listener.
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.stopPropagation();
        answer(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [req]);

  if (!req) return null;

  const answer = (ok) => {
    req.resolve(ok);
    setReq(null);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(var(--bg-rgb),0.92)', backdropFilter: 'blur(6px)' }}
      onClick={() => answer(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="border w-full max-w-sm"
        style={{ background: BG, borderColor: CREAM_FAINT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="font-serif text-sm leading-snug" style={{ color: CREAM }}>
            {req.message}
          </div>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-3" style={{ borderColor: CREAM_FAINT }}>
          <button
            onClick={() => answer(false)}
            autoFocus
            className="font-serif text-[10px] tracking-[0.3em] uppercase"
            style={{ color: CREAM_DIM }}
          >
            {req.cancelLabel}
          </button>
          <button
            onClick={() => answer(true)}
            className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2"
            style={{ borderColor: ACCENT, color: ACCENT, background: 'rgba(var(--accent-rgb),0.06)' }}
          >
            {req.confirmLabel} →
          </button>
        </div>
      </div>
    </div>
  );
}
