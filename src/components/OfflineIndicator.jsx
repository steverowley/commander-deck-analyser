/**
 * Tiny pill that appears at the bottom of the viewport when the browser
 * reports offline. The app itself keeps working — deck CRUD is local,
 * card cache is in IDB — but Scryfall lookups will fail, so it's worth
 * surfacing the state.
 */

import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { CREAM, CREAM_FAINT, ACCENT } from '../theme.js';

export function OfflineIndicator() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 border px-4 py-2 flex items-center gap-2 font-mono text-[11px] tracking-wider"
      style={{
        borderColor: ACCENT,
        background: 'rgba(var(--bg-rgb),0.95)',
        backdropFilter: 'blur(6px)',
        color: CREAM,
      }}
    >
      <WifiOff className="w-3.5 h-3.5" style={{ color: ACCENT }} />
      OFFLINE — app shell + cached cards still work; new Scryfall lookups will fail
    </div>
  );
}
