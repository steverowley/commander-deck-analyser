/**
 * Public deck gallery — landing-page section shown beneath the user's
 * own archive. Reads from supabase via the `is_public = true` RLS
 * policy so it works for signed-out visitors too.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT } from '../theme.js';
import { pad } from '../lib/utils.js';
import { cardImageUrl } from '../lib/scryfall.js';
import { loadPublicDecks } from '../lib/storage-supabase.js';
import { assessBracket } from '../lib/analyzers.js';
import { computeHealth } from '../lib/health.js';
import { ManaSymbol } from './ManaCost.jsx';

export function GalleryView({ onImportFromGallery, onViewDeck }) {
  const [decks, setDecks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPublicDecks(18)
      .then(setDecks)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return null; // silent on error — gallery is optional
  if (decks === null) {
    return (
      <div className="mt-12 fade-up" style={{ animationDelay: '300ms' }}>
        <div className="flex items-baseline gap-4 mb-3">
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            <Globe className="w-3.5 h-3.5 inline mr-2" style={{ verticalAlign: 'baseline' }} />
            Public Gallery
          </div>
          <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
        </div>
        <div className="border p-8 flex items-center justify-center gap-3" style={{ borderColor: CREAM_FAINT }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: CREAM_DIM }} />
          <span className="font-mono text-xs" style={{ color: CREAM_DIM }}>Loading public decks...</span>
        </div>
      </div>
    );
  }
  if (decks.length === 0) {
    return (
      <div className="mt-12 fade-up" style={{ animationDelay: '300ms' }}>
        <div className="flex items-baseline gap-4 mb-3">
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            <Globe className="w-3.5 h-3.5 inline mr-2" style={{ verticalAlign: 'baseline' }} />
            Public Gallery
          </div>
          <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
        </div>
        <div className="border border-dashed p-8 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          No public decks yet. Sign in and toggle a deck public to seed the gallery.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-12 fade-up" style={{ animationDelay: '300ms' }}>
      <div className="flex items-baseline gap-4 mb-3">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          <Globe className="w-3.5 h-3.5 inline mr-2" style={{ verticalAlign: 'baseline' }} />
          Public Gallery
        </div>
        <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          {pad(decks.length)} on file
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
        {decks.map((d) => (
          <GalleryCard key={d.id} deck={d} onImport={onImportFromGallery} onView={onViewDeck} />
        ))}
      </div>
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

function GalleryCard({ deck, onImport, onView }) {
  const bracket = useMemo(() => deck.cards?.length ? assessBracket(deck).bracket : null, [deck]);
  const health = useMemo(() => deck.cards?.length ? computeHealth(deck) : null, [deck]);
  const total = deck.cards?.reduce((s, c) => s + c.count, 0) || 0;
  const identity = deck.commander?.color_identity || [];
  const updatedAt = deck.updated || Date.now();

  return (
    <div
      className="border-r border-b p-4 flex gap-3 transition"
      style={{ borderColor: CREAM_FAINT }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.04)')}
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
          {bracket && <Badge>B{bracket}</Badge>}
          {health && !health.empty && <Badge>Health {health.score}</Badge>}
        </div>
        <div className="font-mono text-[10px] tracking-wider mt-auto" style={{ color: CREAM_DIM }}>
          {pad(total)} cards · @{deck.ownerUsername} · {relativeTime(updatedAt)}
        </div>
        <div className="flex flex-wrap gap-2 mt-1">
          {onView && (
            <button
              onClick={() => onView(deck)}
              className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1"
              style={{ borderColor: CREAM_FAINT, color: CREAM }}
              title="Open this deck in the read-only viewer"
            >
              View →
            </button>
          )}
          {onImport && (
            <button
              onClick={() => onImport(deck)}
              className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1"
              style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
              title="Copy a private editable version into your archive"
            >
              Copy → mine
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
