/**
 * Public deck gallery — landing-page section shown beneath the user's
 * own archive. Reads from supabase via the `is_public = true` RLS
 * policy so it works for signed-out visitors too.
 */

import React, { useEffect, useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT } from '../theme.js';
import { pad } from '../lib/utils.js';
import { cardImageUrl } from '../lib/scryfall.js';
import { loadPublicDecks, loadDeckById } from '../lib/storage-supabase.js';
import { ManaSymbol } from './ManaCost.jsx';
import { SupporterBadge } from './UI.jsx';

export function GalleryView({ onImportFromGallery, onViewDeck, onViewAll, limit = 6 }) {
  const [decks, setDecks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPublicDecks(limit)
      .then(setDecks)
      .catch((e) => setError(e.message));
  }, [limit]);

  if (error) return null; // silent on error — gallery is optional
  if (decks === null) {
    return (
      <Header onViewAll={null}>
        <div className="border p-8 flex items-center justify-center gap-3" style={{ borderColor: CREAM_FAINT }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: CREAM_DIM }} />
          <span className="font-mono text-xs" style={{ color: CREAM_DIM }}>Loading public decks...</span>
        </div>
      </Header>
    );
  }
  if (decks.length === 0) {
    return (
      <Header onViewAll={null}>
        <div className="border border-dashed p-8 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          No public decks yet. Sign in and toggle a deck public to seed the gallery.
        </div>
      </Header>
    );
  }

  return (
    <Header onViewAll={onViewAll}>
      <div className="grid grid-cols-1 md:grid-cols-3 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
        {decks.map((d) => (
          <GalleryCard key={d.id} deck={d} onImport={onImportFromGallery} onView={onViewDeck} />
        ))}
      </div>
    </Header>
  );
}

function Header({ children, onViewAll }) {
  return (
    <div className="mt-12 fade-up" style={{ animationDelay: '300ms' }}>
      <div className="flex items-baseline gap-4 mb-3">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          <Globe className="w-3.5 h-3.5 inline mr-2" style={{ verticalAlign: 'baseline' }} />
          Public Gallery
        </div>
        <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100 transition"
            style={{ color: CREAM_DIM }}
            title="Browse, search, and sort every public deck"
          >
            View all →
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function relativeTime(ms) {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function GalleryCard({ deck, onImport, onView }) {
  const [busy, setBusy] = useState(null); // null | 'view' | 'import'
  const bracket = deck.bracket ?? null;
  const healthScore = deck.health_score ?? null;
  const total = deck.card_count ?? 0;
  const identity = deck.commander?.color_identity || [];
  const updatedAt = deck.updated || Date.now();

  // Gallery rows arrive slim — no `cards` array. Lazy-fetch the full
  // deck on click so View / Copy hand off a complete object.
  async function hydrate() {
    const full = await loadDeckById(deck.id);
    if (!full) return null;
    return { ...full, ownerUsername: deck.ownerUsername, ownerSupporter: deck.ownerSupporter };
  }

  async function handleView() {
    if (busy) return;
    setBusy('view');
    try {
      const full = await hydrate();
      if (full) onView(full);
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (busy) return;
    setBusy('import');
    try {
      const full = await hydrate();
      if (full) await onImport(full);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="border-r border-b p-4 flex gap-3 transition"
      style={{ borderColor: CREAM_FAINT }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(var(--ink-rgb),0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {deck.commander && (
        <img
          src={cardImageUrl(deck.commander, 'small')}
          alt={deck.commander.name}
          className="w-14 h-20 object-cover shrink-0"
          style={{ borderColor: CREAM_FAINT, borderWidth: 1 }}
          onError={(e) => (e.target.style.display = 'none')}
        />
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <h3 className="font-serif font-bold uppercase tracking-tight truncate" style={{ color: CREAM, fontSize: '0.95rem' }}>
          {deck.name}
        </h3>
        <div className="font-serif text-xs italic truncate" style={{ color: CREAM_DIM }}>
          {deck.commander?.name || 'No commander'}
        </div>
        <div className="flex items-center gap-1.5" style={{ fontSize: '0.8rem' }}>
          {identity.length > 0
            ? identity.map((c) => <ManaSymbol key={c} sym={c} size="0.8em" />)
            : <ManaSymbol sym="C" size="0.8em" />}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {bracket != null && <Badge>B{bracket}</Badge>}
          {healthScore != null && <Badge>Health {healthScore}</Badge>}
        </div>
        <div className="font-mono text-[10px] tracking-wider mt-auto flex items-center gap-1 flex-wrap" style={{ color: CREAM_DIM }}>
          <span>{pad(total)} cards · @{deck.ownerUsername}</span>
          {deck.ownerSupporter && <SupporterBadge />}
          <span>· {relativeTime(updatedAt)}</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-1">
          {onView && (
            <button
              onClick={handleView}
              disabled={busy != null}
              className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1"
              style={{ borderColor: CREAM_FAINT, color: CREAM, opacity: busy ? 0.6 : 1 }}
              title="Open this deck in the read-only viewer"
            >
              {busy === 'view' ? 'Loading…' : 'View →'}
            </button>
          )}
          {onImport && (
            <button
              onClick={handleImport}
              disabled={busy != null}
              className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1"
              style={{ borderColor: CREAM_FAINT, color: CREAM_DIM, opacity: busy ? 0.6 : 1 }}
              title="Copy a private editable version into your archive"
            >
              {busy === 'import' ? 'Copying…' : 'Copy → mine'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ children }) {
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border"
      style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
    >
      {children}
    </span>
  );
}
