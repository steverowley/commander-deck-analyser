/**
 * Scryfall search panel — slide-out from the right edge.
 *
 * Search powered by the existing Scryfall autocomplete + fetch
 * helpers. Each result renders as a card thumbnail that you can:
 *   - Click → adds to the active context (default: the user's Vault)
 *   - Drag onto a drop zone (the Vault section, a deck's card list)
 *     → drop handler reads the JSON payload and adds the card.
 *
 * The panel doesn't own the 'where to add' logic — drop zones (and
 * the click handler) decide. dataTransfer payload shape:
 *   { kind: 'vault:card', card: { name, scryfall:{...} } }
 */

import React, { useEffect, useState } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG } from '../theme.js';
import { searchCardAutocomplete, fetchCardByExactName, cardImageUrl } from '../lib/scryfall.js';

export const SCRYFALL_DRAG_MIME = 'application/x-vault-card+json';

export function ScryfallSearchPanel({ open, onClose, onAdd, addLabel = 'Add' }) {
  const [q, setQ] = useState('');
  const [names, setNames] = useState([]);
  const [cards, setCards] = useState({}); // name → resolved Scryfall card (cached)
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q || q.length < 2) {
      setNames([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchCardAutocomplete(q);
      if (!alive) return;
      setNames(r.slice(0, 18));
      setLoading(false);
      // Fetch full card data for any new names in the background.
      for (const n of r.slice(0, 18)) {
        if (!cards[n.toLowerCase()]) {
          fetchCardByExactName(n).then((card) => {
            if (!alive || !card) return;
            setCards((cur) => ({ ...cur, [n.toLowerCase()]: card }));
          });
        }
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  if (!open) return null;

  return (
    <div
      className="fixed top-0 right-0 bottom-0 z-40 flex flex-col border-l shadow-2xl"
      style={{
        background: BG,
        borderColor: CREAM_FAINT,
        width: 'min(92vw, 380px)',
      }}
    >
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM_DIM }}>
          <Search className="w-3 h-3" /> Search Scryfall
        </div>
        <button onClick={onClose} style={{ color: CREAM_DIM }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 border-b" style={{ borderColor: CREAM_FAINT }}>
        <div className="flex gap-2 items-center border px-3 py-2" style={{ borderColor: CREAM_FAINT, background: 'rgba(var(--ink-rgb),0.02)' }}>
          <Search className="w-3.5 h-3.5" style={{ color: CREAM_DIM }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search by name..."
            autoFocus
            className="flex-1 bg-transparent focus:outline-none font-mono text-sm"
            style={{ color: CREAM }}
          />
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: CREAM_DIM }} />}
        </div>
        <div className="font-serif text-[10px] italic mt-2" style={{ color: CREAM_DIM }}>
          Drag a card onto Vault or your deck's card list — or tap a result to {addLabel.toLowerCase()}.
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {names.length === 0 ? (
          <div className="font-serif text-sm italic text-center mt-8" style={{ color: CREAM_DIM }}>
            {q.length < 2 ? 'Type 2+ characters to search.' : 'No matches yet — keep typing.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {names.map((n) => {
              const card = cards[n.toLowerCase()];
              return (
                <ResultCard
                  key={n}
                  name={n}
                  card={card}
                  onClick={() => card && onAdd?.(card)}
                  addLabel={addLabel}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({ name, card, onClick, addLabel }) {
  const draggable = !!card;
  const handleDragStart = (e) => {
    if (!card) return;
    const payload = JSON.stringify({ kind: 'vault:card', card: { name: card.name, scryfall: card } });
    try {
      e.dataTransfer.setData(SCRYFALL_DRAG_MIME, payload);
      e.dataTransfer.setData('text/plain', card.name);
      e.dataTransfer.effectAllowed = 'copy';
    } catch {}
  };
  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={handleDragStart}
      className="border flex flex-col items-stretch text-left transition cursor-grab active:cursor-grabbing"
      style={{ borderColor: CREAM_FAINT, background: 'rgba(var(--ink-rgb),0.02)' }}
      title={`${addLabel}: ${name}`}
    >
      {card ? (
        <img
          src={cardImageUrl(card, 'small')}
          alt={card.name}
          className="w-full aspect-[5/7] object-cover pointer-events-none"
          loading="lazy"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      ) : (
        <div className="w-full aspect-[5/7] flex items-center justify-center" style={{ color: CREAM_DIM }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        </div>
      )}
      <div className="px-2 py-1.5 border-t" style={{ borderColor: CREAM_FAINT }}>
        <div className="font-serif text-[11px] font-bold uppercase truncate" style={{ color: CREAM }}>
          {name}
        </div>
      </div>
    </button>
  );
}
