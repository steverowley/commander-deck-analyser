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
import { Library, Layers, Loader2, FileSpreadsheet } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT } from '../theme.js';
import { resolveScryfallUrl, extractDroppedScryfallUrl } from '../lib/scryfall.js';
import { detectMoxfieldCsv, parseMoxfieldCsv } from '../lib/csvImport.js';
import { bulkImportVault } from '../lib/collection.js';
import { SCRYFALL_DRAG_MIME } from './ScryfallSearchPanel.jsx';

export function GlobalDropOverlay({ onAddToVault, onAddToDeck, activeDeckName, onVaultChanged }) {
  const [active, setActive] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null); // success toast
  const depthRef = useRef(0);

  const handleCsvFile = async (file) => {
    setResolving(true);
    setError(null);
    setNotice(null);
    try {
      const text = await file.text();
      if (!detectMoxfieldCsv(text)) {
        setError(`"${file.name}" doesn't look like a Moxfield collection CSV (expected a Count, Tradelist Count, Name, ... header).`);
        setTimeout(() => setError(null), 8000);
        return;
      }
      const rows = parseMoxfieldCsv(text);
      if (!rows.length) {
        setError(`Parsed 0 rows from "${file.name}".`);
        setTimeout(() => setError(null), 6000);
        return;
      }
      const { added, failed, error: importError } = await bulkImportVault(rows);
      onVaultChanged?.();
      if (failed > 0) {
        setError(`Imported ${added} of ${rows.length}; ${failed} failed${importError ? `: ${importError}` : ''}. (Check the browser console.)`);
        setTimeout(() => setError(null), 10000);
      } else {
        setNotice(`Imported ${added} cards from ${file.name} into your Vault.`);
        setTimeout(() => setNotice(null), 5000);
      }
    } catch (err) {
      console.error('[Vault] CSV file import failed', err);
      setError(err.message || String(err));
      setTimeout(() => setError(null), 8000);
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    // Cross-origin drag security: browsers hide most of the
    // dataTransfer types on dragenter / dragover — you only see
    // 'Files' or the full type list once the drop actually fires.
    // So we can't reliably type-check on enter. Activate the
    // overlay on ANY drag that enters the window; the drop handler
    // sorts out whether it's actually a Scryfall card.

    const onDragEnter = (e) => {
      if (!e.dataTransfer) return;
      depthRef.current += 1;
      setActive(true);
    };
    const onDragLeave = (e) => {
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setActive(false);
    };
    const onDragOver = (e) => {
      // Always preventDefault so the browser doesn't run its default
      // 'navigate to URL' behaviour when the drop lands.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDropDoc = (e) => {
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

  // Factory: takes the add-target function (vault or deck), returns
  // an actual event handler. Critical: outer function is sync — must
  // RETURN a function, not a Promise — otherwise React's onDrop never
  // sees a real handler and the drop silently no-ops.
  const handleZoneDrop = (target) => async (e) => {
    e.preventDefault();
    e.stopPropagation();
    depthRef.current = 0;
    setActive(false);
    setError(null);
    // Log so users can diagnose if a drop doesn't resolve.
    const types = Array.from(e.dataTransfer?.types || []);
    console.log('[Vault] Drop received. Available types:', types);
    // Internal panel drag — fast path.
    const raw = e.dataTransfer.getData(SCRYFALL_DRAG_MIME);
    if (raw) {
      try {
        const payload = JSON.parse(raw);
        if (payload?.kind === 'vault:card' && payload.card?.scryfall) {
          await target(payload.card.scryfall);
          return;
        }
      } catch {}
    }
    const url = extractDroppedScryfallUrl(e.dataTransfer);
    console.log('[Vault] Extracted URL from drop:', url);
    if (!url) {
      const sample = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
      setError(sample
        ? `No Scryfall URL in drop — got "${sample.slice(0, 80)}". Drag the card image itself.`
        : 'No data in that drop. Try dragging the card image directly.');
      setTimeout(() => setError(null), 6000);
      return;
    }
    setResolving(true);
    try {
      const card = await resolveScryfallUrl(url);
      console.log('[Vault] Resolved card:', card?.name || '(null)');
      if (!card) {
        setError(`Scryfall didn't recognise that URL. Try dragging the card image itself.`);
        setTimeout(() => setError(null), 6000);
        return;
      }
      await target(card);
    } catch (err) {
      console.error('[Vault] Drop handler error:', err);
      setError(`Failed to add card: ${err.message || err}`);
      setTimeout(() => setError(null), 6000);
    } finally {
      setResolving(false);
    }
  };

  if (!active && !resolving && !error && !notice) return null;

  // Wrap the Scryfall-card drop with a file-drop fallback so users
  // can drop a Moxfield CSV onto either zone (we'll detect the file
  // and route to handleCsvFile instead of trying to parse it as a
  // card URL).
  const dropOrCsv = (cardHandler) => async (e) => {
    e.preventDefault();
    e.stopPropagation();
    depthRef.current = 0;
    setActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    const csv = files.find((f) => /\.csv$/i.test(f.name) || f.type === 'text/csv');
    if (csv) {
      await handleCsvFile(csv);
      return;
    }
    return cardHandler(e);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-stretch pointer-events-none"
      style={{ background: 'rgba(var(--bg-rgb),0.55)', backdropFilter: 'blur(4px)' }}
    >
      <div className="flex-1 flex items-stretch">
        <Zone
          title="Add to Vault"
          sub="Drop a Scryfall card or a Moxfield CSV file."
          icon={Library}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={dropOrCsv(handleZoneDrop((c) => onAddToVault?.(c)))}
        />
        {onAddToDeck && (
          <Zone
            title={activeDeckName ? `Add to ${activeDeckName}` : 'Add to active deck'}
            sub="Drop a Scryfall card to add it to the deck you have open."
            icon={Layers}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={dropOrCsv(handleZoneDrop((c) => onAddToDeck?.(c)))}
          />
        )}
      </div>
      <div className="px-6 pb-3 pointer-events-none">
        <div className="font-serif text-xs italic text-center" style={{ color: CREAM_DIM }}>
          <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1.5" style={{ verticalAlign: '-2px' }} />
          Dropping a <span style={{ color: CREAM }}>.csv</span> file (Moxfield export) imports the whole inventory into your Vault.
        </div>
      </div>
      {resolving && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-3 border font-mono text-xs flex items-center gap-2" style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--bg-rgb),0.92)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Working...
          </div>
        </div>
      )}
      {error && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-3 border font-mono text-xs max-w-lg text-center pointer-events-none" style={{ borderColor: 'rgb(196,74,63)', color: CREAM, background: 'rgba(var(--bg-rgb),0.94)' }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-3 border font-mono text-xs pointer-events-none" style={{ borderColor: '#a3c98a', color: CREAM, background: 'rgba(var(--bg-rgb),0.94)' }}>
          {notice}
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
      style={{ borderColor: CREAM, color: CREAM, background: 'rgba(var(--ink-rgb),0.06)' }}
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
