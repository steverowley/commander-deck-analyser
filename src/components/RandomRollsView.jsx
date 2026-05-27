/**
 * Latest random rolls — landing-page section showing recent decks
 * generated via the Roll-a-deck flow. Lives in its own area so the
 * curated Public Gallery isn't drowned in auto-output.
 *
 * Each tile shows the rolled commander, the settings used (bracket /
 * budget / archetype), and the same View / Copy affordances as the
 * regular gallery.
 */

import React, { useEffect, useState } from 'react';
import { Dices, Loader2 } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT } from '../theme.js';
import { pad } from '../lib/utils.js';
import { cardImageUrl } from '../lib/scryfall.js';
import { loadRandomRolls } from '../lib/storage-supabase.js';
import { formatPrice, isConverted } from '../lib/pricing.js';
import { archetypeById } from '../lib/archetypes.js';
import { ManaSymbol } from './ManaCost.jsx';
import { SupporterBadge } from './UI.jsx';

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

export function RandomRollsView({ onImportFromGallery, onViewDeck }) {
  const [decks, setDecks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadRandomRolls(12)
      .then(setDecks)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return null;
  if (decks === null) {
    return (
      <Header>
        <div className="border p-8 flex items-center justify-center gap-3" style={{ borderColor: CREAM_FAINT }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: CREAM_DIM }} />
          <span className="font-mono text-xs" style={{ color: CREAM_DIM }}>Loading recent rolls...</span>
        </div>
      </Header>
    );
  }
  if (decks.length === 0) {
    return (
      <Header>
        <div className="border border-dashed p-8 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          No rolls shared yet. Hit Roll a deck above — your build can be the first.
        </div>
      </Header>
    );
  }

  return (
    <Header count={decks.length}>
      <div className="grid grid-cols-1 md:grid-cols-3 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
        {decks.map((d) => (
          <RollCard key={d.id} deck={d} onImport={onImportFromGallery} onView={onViewDeck} />
        ))}
      </div>
    </Header>
  );
}

function Header({ children, count }) {
  return (
    <div className="mt-12 fade-up" style={{ animationDelay: '270ms' }}>
      <div className="flex items-baseline gap-4 mb-3">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          <Dices className="w-3.5 h-3.5 inline mr-2" style={{ verticalAlign: 'baseline' }} />
          Latest random rolls
        </div>
        <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
        {count != null && (
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            {pad(count)} on file
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function RollCard({ deck, onImport, onView }) {
  const meta = deck.seedMeta || {};
  const archetype = archetypeById(meta.archetype);
  const identity = deck.commander?.color_identity || [];
  const total = deck.cards?.reduce((s, c) => s + c.count, 0) || 0;
  const rolledAt = meta.rolledAt || deck.created;

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
          {deck.commander?.name || deck.name}
        </h3>
        <div className="flex items-center gap-1.5" style={{ fontSize: '0.8rem' }}>
          {identity.length > 0
            ? identity.map((c) => <ManaSymbol key={c} sym={c} size="0.8em" />)
            : <ManaSymbol sym="C" size="0.8em" />}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          <Badge>B{meta.bracket ?? 3}</Badge>
          {meta.budget != null && (
            <Badge>{isConverted(meta.currency || 'usd') ? '~' : ''}{formatPrice(meta.budget, meta.currency || 'usd')}</Badge>
          )}
          {archetype.id !== 'any' && <Badge>{archetype.label}</Badge>}
        </div>
        <div className="font-mono text-[10px] tracking-wider mt-auto flex items-center gap-1 flex-wrap" style={{ color: CREAM_DIM }}>
          <span>{pad(total)} cards · @{deck.ownerUsername}</span>
          {deck.ownerSupporter && <SupporterBadge />}
          <span>· {relativeTime(rolledAt)}</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-1">
          {onView && (
            <button
              onClick={() => onView(deck)}
              className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1"
              style={{ borderColor: CREAM_FAINT, color: CREAM }}
              title="Open the rolled deck in the read-only viewer"
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
