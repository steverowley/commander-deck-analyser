/**
 * VaultCard — single owned-card thumbnail used in both the Vault
 * grid on the homepage and the Manage Vault modal.
 *
 * Adds the same affordances as the commander panel: rounded corners
 * (via Scryfall's PNG-with-alpha variant + a CSS borderRadius
 * backstop), a foil overlay (5 styles, cycled via the chip), and an
 * Art chip that opens the PrintingPickerModal. Persistence routes
 * through setCardMeta in lib/collection.js.
 *
 * `onChanged` is called after any per-card mutation so the parent can
 * bump its refresh counter and re-fetch the collection.
 */

import React, { useEffect, useState } from 'react';
import { Images, Sparkle, Trash2 } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG } from '../theme.js';
import { cardImageUrl } from '../lib/scryfall.js';
import { setCardMeta, setCardQuantity } from '../lib/collection.js';
import { PrintingPickerModal } from './Modals.jsx';

const FOIL_STYLES = ['rainbow', 'galaxy', 'surge', 'etched', 'oil'];
const FOIL_LABELS = {
  rainbow: 'Rainbow',
  galaxy: 'Galaxy',
  surge: 'Surge',
  etched: 'Etched',
  oil: 'Oil slick',
};

function nextFoilStyle(current) {
  if (!current) return FOIL_STYLES[0];
  const idx = FOIL_STYLES.indexOf(current);
  if (idx >= FOIL_STYLES.length - 1) return null;
  return FOIL_STYLES[idx + 1];
}

export function VaultCard({ entry, card, onChanged, size = 'md' }) {
  const [showPrintings, setShowPrintings] = useState(false);
  const [busy, setBusy] = useState(false);
  const meta = entry.meta || {};
  const foilStyle = FOIL_STYLES.includes(meta.foil) ? meta.foil : null;
  const displayCard = card; // parent is responsible for fetching the right printing

  const cycleFoil = async (e) => {
    e?.stopPropagation();
    setBusy(true);
    try {
      const next = nextFoilStyle(foilStyle);
      await setCardMeta(entry.name, { ...meta, foil: next || undefined });
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const pickPrinting = async (printing) => {
    setBusy(true);
    try {
      await setCardMeta(entry.name, { ...meta, printing_id: printing.id });
      setShowPrintings(false);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e) => {
    e?.stopPropagation();
    if (!confirm(`Remove ${entry.name} from your Vault?`)) return;
    setBusy(true);
    try {
      await setCardQuantity(entry.name, 0);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="relative group foil-wrap"
      style={{ borderRadius: '4.75% / 3.5%' }}
    >
      {displayCard ? (
        <img
          src={cardImageUrl(displayCard, 'png')}
          alt={entry.name}
          className="block w-full"
          style={{ borderRadius: '4.75% / 3.5%' }}
          loading="lazy"
          onError={(e) => {
            if (!e.target.dataset.fb) {
              e.target.dataset.fb = '1';
              e.target.src = cardImageUrl(displayCard, 'small');
            } else {
              e.target.style.display = 'none';
            }
          }}
        />
      ) : (
        <div
          className="w-full aspect-[5/7] flex items-center justify-center font-mono text-[10px] px-2 text-center"
          style={{ color: CREAM_DIM, borderRadius: '4.75% / 3.5%', background: 'rgba(243,231,201,0.04)' }}
        >
          {entry.name.slice(0, 18)}
        </div>
      )}
      {foilStyle && (
        <>
          <span className={`foil-tint foil-${foilStyle} pointer-events-none`} style={{ borderRadius: '4.75% / 3.5%' }} />
          <span className={`foil-shine foil-${foilStyle} pointer-events-none`} style={{ borderRadius: '4.75% / 3.5%' }} />
        </>
      )}
      {entry.quantity > 1 && (
        <span
          className="absolute top-1 right-1 font-mono text-[10px] tracking-wider px-1.5 py-0.5 border z-10"
          style={{ background: BG, borderColor: CREAM_FAINT, color: CREAM }}
        >
          ×{entry.quantity}
        </span>
      )}
      {/* Hover action strip — Art / Foil / Remove */}
      <div
        className="absolute left-1 right-1 bottom-1 flex items-center justify-between gap-1 md:opacity-0 md:group-hover:opacity-100 transition z-10"
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowPrintings(true); }}
          disabled={busy}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] tracking-[0.15em] uppercase font-serif border disabled:opacity-30"
          style={{ background: BG, borderColor: CREAM_FAINT, color: CREAM_DIM }}
          title="Pick a different printing"
        >
          <Images className="w-2.5 h-2.5" /> Art
        </button>
        <button
          type="button"
          onClick={cycleFoil}
          disabled={busy}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] tracking-[0.15em] uppercase font-serif border disabled:opacity-30"
          style={{
            background: BG,
            borderColor: foilStyle ? CREAM : CREAM_FAINT,
            color: foilStyle ? CREAM : CREAM_DIM,
          }}
          title={foilStyle
            ? `Foil: ${FOIL_LABELS[foilStyle]} — click to cycle`
            : 'Click to add foil overlay'}
        >
          <Sparkle className="w-2.5 h-2.5" /> {foilStyle ? FOIL_LABELS[foilStyle].slice(0, 4) : 'Foil'}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] tracking-[0.15em] uppercase font-serif border hover:text-red-400 disabled:opacity-30"
          style={{ background: BG, borderColor: CREAM_FAINT, color: CREAM_DIM }}
          title="Remove from Vault"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
      {showPrintings && displayCard && (
        <PrintingPickerModal
          card={displayCard}
          onClose={() => setShowPrintings(false)}
          onPick={pickPrinting}
        />
      )}
    </div>
  );
}
