/**
 * Full-window drop overlay for external Scryfall drags.
 *
 * Listens to document-level dragenter/dragover/drop events. When the
 * user drags a card image / link from a scryfall.com or
 * cards.scryfall.io tab over our window, we:
 *   - Snap up an overlay showing big drop zones (Vault + optional
 *     active deck), so the user can't miss the target.
 *   - PreventDefault on dragover so the browser doesn't navigate
 *     to the image URL when the drop lands.
 *   - On drop: extract the URL, resolve via /cards/<id> or
 *     /cards/<set>/<num>, and hand the card to the caller's
 *     onAddToVault / onAddToDeck.
 *
 * Tracks dragenter / dragleave with a depth counter to handle the
 * Chrome quirk where dragenter fires on every child element.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Library, Layers, Loader2 } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT } from '../theme.js';
import { resolveScryfallUrl, extractDroppedScryfallUrl } from '../lib/scryfall.js';
import { SCRYFALL_DRAG_MIME } from './ScryfallSearchPanel.jsx';

export function GlobalDropOverlay({ onAddToVault, onAddToDeck, activeDeckName }) {
  const [active, setActive] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState(null);
  const depthRef = useRef(0);

  useEffect(() => {
    function isCardDrag(dt) {
      if (!dt) return false;
      const types = Array.from(dt.types || []);
      return (
        types.includes(SCRYFALL_DRAG_MIME) ||
        types.includes('text/uri-list') ||
        types.includes('text/html') ||
        types.includes('text/plain')
      );
    }

    const onDragEnter = (e) => {
      if (!isCardDrag(e.dataTransfer)) return;
      depthRef.current += 1;
      setActive(true);
    };
    const onDragLeave = (e) => {
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setActive(false);
    };
    const onDragOver = (e) => {
      if (!isCardDrag(e.dataTransfer)) return;
      // Critical: prevent the browser's default of navigating to the
      // image URL when the user drops anywhere on the window.
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDropDoc = (e) => {
      if (!isCardDrag(e.dataTransfer)) return;
      // Drop hit document (not one of our zones) — still prevent the
      // navigation so the page doesn't disappear.
      e.preventDefault();
      depthRef.current = 0;
      setActive(false);
    };

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDropDoc);
    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDropDoc);
    };
  }, []);

  const handleZoneDrop = async (target) => async (e) => {
    e.preventDefault();
    e.stopPropagation();
    depthRef.current = 0;
    setActive(false);
    setError(null);
    // Internal panel drag — fast path.
    const raw = e.dataTransfer.getData(SCRYFALL_DRAG_MIME);
    if (raw) {
      try {
        const payload = JSON.parse(raw);
        if (payload?.kind === 'vault:card' && payload.card?.scryfall) {
          target(payload.card.scryfall);
          return;
        }
      } catch {}
    }
    const url = extractDroppedScryfallUrl(e.dataTransfer);
    if (!url) {
      setError('Could not find a Scryfall card URL in that drag.');
      setTimeout(() => setError(null), 4000);
      return;
    }
    setResolving(true);
    try {
      const card = await resolveScryfallUrl(url);
      if (!card) {
        setError('Scryfall didn\'t recognise that URL. Try dragging the card image itself.');
        setTimeout(() => setError(null), 4000);
        return;
      }
      target(card);
    } finally {
      setResolving(false);
    }
  };

  if (!active && !resolving && !error) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch pointer-events-none"
      style={{ background: 'rgba(13,22,20,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <Zone
        title="Add to Vault"
        sub="Drop here to add the card to your owned collection."
        icon={Library}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={handleZoneDrop((c) => onAddToVault?.(c))}
      />
      {onAddToDeck && (
        <Zone
          title={activeDeckName ? `Add to ${activeDeckName}` : 'Add to active deck'}
          sub="Drop here to add the card to the deck you have open."
          icon={Layers}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={handleZoneDrop((c) => onAddToDeck?.(c))}
        />
      )}
      {resolving && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-3 border font-mono text-xs flex items-center gap-2" style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(13,22,20,0.92)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolving card...
          </div>
        </div>
      )}
      {error && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-3 border font-mono text-xs pointer-events-none" style={{ borderColor: 'rgb(196,74,63)', color: CREAM, background: 'rgba(13,22,20,0.92)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Zone({ title, sub, icon: Icon, onDragOver, onDrop }) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="flex-1 m-6 border-2 border-dashed flex flex-col items-center justify-center gap-3 transition pointer-events-auto"
      style={{ borderColor: CREAM, color: CREAM, background: 'rgba(243,231,201,0.06)' }}
    >
      <Icon className="w-8 h-8" />
      <div className="font-serif text-base tracking-[0.3em] uppercase font-bold text-center px-4">
        {title}
      </div>
      <div className="font-serif text-xs italic max-w-xs text-center px-4" style={{ color: CREAM_DIM }}>
        {sub}
      </div>
    </div>
  );
}
