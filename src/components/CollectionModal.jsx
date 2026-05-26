/**
 * Collection inventory modal. Lists every card the user owns with
 * its quantity, lets them add cards via autocomplete or bulk paste,
 * launches the webcam scanner, and tweaks counts inline.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Library, Camera, ClipboardPaste, Trash2, Plus, Minus } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { pad, parseDecklist, lc } from '../lib/utils.js';
import { fetchCardsByName, cardImageUrl } from '../lib/scryfall.js';
import { CardSearchBar } from './UI.jsx';
import {
  loadCollection,
  addToCollection,
  setCardQuantity,
  bulkAddToCollection,
  clearCollection,
  uniqueCount,
  totalCount,
} from '../lib/collection.js';
import { CardScanner } from './CardScanner.jsx';

export function CollectionModal({ onClose, signedIn }) {
  const [collection, setCollection] = useState(null);
  const [filter, setFilter] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [view, setView] = useState('grid'); // 'grid' | 'list'
  const [cardData, setCardData] = useState({});  // name → scryfall card

  useEffect(() => {
    loadCollection().then(setCollection);
  }, []);

  // Fetch Scryfall data for every card in the collection so we can
  // render thumbnails. Batched (75 names per request) via the existing
  // collection endpoint helper; results are memo-cached by name.
  useEffect(() => {
    if (!collection) return;
    const names = Object.values(collection).map((c) => c.name);
    if (names.length === 0) return;
    const missing = names.filter((n) => !cardData[n.toLowerCase()]);
    if (missing.length === 0) return;
    fetchCardsByName(missing).then(({ results }) => {
      setCardData((cur) => ({ ...cur, ...results }));
    });
  }, [collection]);

  const refresh = async () => setCollection(await loadCollection());

  const entries = useMemo(() => {
    if (!collection) return [];
    const list = Object.values(collection);
    if (!filter.trim()) return list.sort((a, b) => b.added_at - a.added_at);
    const q = filter.trim().toLowerCase();
    return list
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [collection, filter]);

  const handleAddFromSearch = async (cards) => {
    for (const c of cards) await addToCollection(c.name, 1);
    await refresh();
  };

  const handleScannedAdded = async () => {
    // Scanner already wrote to backend; just refresh state.
    await refresh();
  };

  const handleBulkSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const lines = parseDecklist(bulkText);
      if (!lines.length) {
        setError('No card lines found. Paste a Moxfield-style list (one card per line, optional "Nx" prefix).');
        return;
      }
      await bulkAddToCollection(lines);
      await refresh();
      setBulkText('');
      setShowBulk(false);
    } finally {
      setBusy(false);
    }
  };

  const adjust = async (entry, delta) => {
    const next = (entry.quantity || 0) + delta;
    await setCardQuantity(entry.name, next);
    await refresh();
  };

  const remove = async (entry) => {
    await setCardQuantity(entry.name, 0);
    await refresh();
  };

  const clearAll = async () => {
    setBusy(true);
    await clearCollection();
    await refresh();
    setConfirmClear(false);
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="border w-full max-w-3xl max-h-[92vh] flex flex-col"
        style={{ background: BG, borderColor: CREAM_FAINT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-baseline justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM_DIM }}>
              <Library className="w-3 h-3" /> Your Vault
            </div>
            <div className="font-serif text-lg font-black uppercase mt-1" style={{ color: CREAM }}>
              {collection ? `${uniqueCount(collection)} unique · ${totalCount(collection)} total` : '—'}
            </div>
            {!signedIn && (
              <div className="font-serif text-xs italic mt-1" style={{ color: CREAM_DIM }}>
                Local-only. Sign in to sync your Vault across devices.
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b grid grid-cols-1 md:grid-cols-3 gap-2" style={{ borderColor: CREAM_FAINT }}>
          <button
            onClick={() => setShowScanner(true)}
            className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-2 flex items-center justify-center gap-1.5 hover:opacity-100"
            style={{ borderColor: CREAM_FAINT, color: CREAM }}
          >
            <Camera className="w-3 h-3" /> Scan with camera
          </button>
          <button
            onClick={() => setShowBulk(true)}
            className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-2 flex items-center justify-center gap-1.5 hover:opacity-100"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            <ClipboardPaste className="w-3 h-3" /> Bulk paste
          </button>
          <div className="md:col-span-1">
            <CardSearchBar onAdd={handleAddFromSearch} />
          </div>
        </div>

        <div className="px-5 py-2 border-b flex items-center gap-3" style={{ borderColor: CREAM_FAINT }}>
          <div className="flex border shrink-0" style={{ borderColor: CREAM_FAINT }}>
            {['grid', 'list'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="font-mono text-[9px] uppercase tracking-wider px-2 py-1"
                style={{
                  color: view === v ? CREAM : CREAM_DIM,
                  background: view === v ? 'rgba(243,231,201,0.08)' : 'transparent',
                }}
                title={`Switch to ${v} view`}
              >
                {v}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter your collection..."
            className="flex-1 bg-transparent border px-3 py-1.5 focus:outline-none font-mono text-xs"
            style={{ borderColor: CREAM_FAINT, color: CREAM }}
          />
          {collection && Object.keys(collection).length > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase font-serif">
                <button onClick={clearAll} className="hover:opacity-100" style={{ color: ACCENT }} disabled={busy}>
                  Confirm clear
                </button>
                <span style={{ color: CREAM_DIM }}>·</span>
                <button onClick={() => setConfirmClear(false)} className="hover:opacity-100" style={{ color: CREAM_DIM }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100"
                style={{ color: CREAM_DIM }}
              >
                Clear all
              </button>
            )
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {error && (
            <div className="px-5 py-3 border-b" style={{ borderColor: ACCENT, background: 'rgba(196,74,63,0.06)' }}>
              <div className="font-mono text-xs" style={{ color: CREAM }}>{error}</div>
            </div>
          )}
          {collection === null ? (
            <div className="p-8 flex items-center justify-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: CREAM_DIM }} />
              <span className="font-mono text-xs" style={{ color: CREAM_DIM }}>Loading collection...</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="p-10 text-center font-serif text-sm italic" style={{ color: CREAM_DIM }}>
              {filter ? 'No cards match that filter.' : 'No cards yet. Scan with the camera, paste a list, or search to add one.'}
            </div>
          ) : view === 'grid' ? (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {entries.map((entry) => {
                const card = cardData[entry.name.toLowerCase()];
                return (
                  <div
                    key={entry.name}
                    className="border flex flex-col"
                    style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
                  >
                    {card ? (
                      <img
                        src={cardImageUrl(card, 'small')}
                        alt={entry.name}
                        className="w-full aspect-[5/7] object-cover"
                        loading="lazy"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    ) : (
                      <div className="w-full aspect-[5/7] flex items-center justify-center" style={{ color: CREAM_DIM }}>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      </div>
                    )}
                    <div className="px-2 py-1.5 border-t flex items-center justify-between gap-1.5" style={{ borderColor: CREAM_FAINT }}>
                      <span className="font-serif text-[10px] uppercase font-bold truncate flex-1" style={{ color: CREAM }} title={entry.name}>
                        {entry.name}
                      </span>
                    </div>
                    <div className="px-2 pb-2 flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-px border" style={{ borderColor: CREAM_FAINT }}>
                        <button onClick={() => adjust(entry, -1)} className="w-6 h-6 font-mono" style={{ color: CREAM_DIM }} aria-label="Decrease">
                          <Minus className="w-2.5 h-2.5 mx-auto" />
                        </button>
                        <span className="w-6 text-center font-mono text-[10px]" style={{ color: CREAM }}>{entry.quantity}</span>
                        <button onClick={() => adjust(entry, +1)} className="w-6 h-6 font-mono" style={{ color: CREAM_DIM }} aria-label="Increase">
                          <Plus className="w-2.5 h-2.5 mx-auto" />
                        </button>
                      </div>
                      <button onClick={() => remove(entry)} className="hover:text-red-400 shrink-0" style={{ color: CREAM_DIM }} title="Remove from Vault">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {entries.map((entry) => (
                <div
                  key={entry.name}
                  className="px-5 py-2.5 border-b flex items-center gap-3"
                  style={{ borderColor: CREAM_FAINT }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-serif font-bold uppercase tracking-tight truncate text-sm" style={{ color: CREAM }}>
                      {entry.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-px border shrink-0" style={{ borderColor: CREAM_FAINT }}>
                    <button onClick={() => adjust(entry, -1)} className="w-7 h-7 font-mono text-sm" style={{ color: CREAM_DIM }} aria-label="Decrease">
                      <Minus className="w-3 h-3 mx-auto" />
                    </button>
                    <span className="w-8 text-center font-mono text-sm" style={{ color: CREAM }}>{entry.quantity}</span>
                    <button onClick={() => adjust(entry, +1)} className="w-7 h-7 font-mono text-sm" style={{ color: CREAM_DIM }} aria-label="Increase">
                      <Plus className="w-3 h-3 mx-auto" />
                    </button>
                  </div>
                  <button onClick={() => remove(entry)} className="hover:text-red-400 shrink-0" style={{ color: CREAM_DIM }} title="Remove from collection">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {showBulk && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: 'rgba(13,22,20,0.94)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowBulk(false)}
          >
            <div
              className="border w-full max-w-lg flex flex-col"
              style={{ background: BG, borderColor: CREAM_FAINT }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b flex items-baseline justify-between" style={{ borderColor: CREAM_FAINT }}>
                <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
                  Bulk paste
                </div>
                <button onClick={() => setShowBulk(false)} style={{ color: CREAM_DIM }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <p className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
                  One card per line. Optional "Nx" or "N " prefix for quantity. Example: <code style={{ color: CREAM }}>4x Lightning Bolt</code>
                </p>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={10}
                  placeholder={"1 Sol Ring\n4x Lightning Bolt\n1 Cyclonic Rift"}
                  className="w-full bg-transparent border px-3 py-2 focus:outline-none font-mono text-xs"
                  style={{ borderColor: CREAM_FAINT, color: CREAM }}
                />
              </div>
              <div className="px-5 py-3 border-t flex justify-end gap-3" style={{ borderColor: CREAM_FAINT }}>
                <button onClick={() => setShowBulk(false)} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
                  Cancel
                </button>
                <button
                  onClick={handleBulkSubmit}
                  disabled={busy || !bulkText.trim()}
                  className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 disabled:opacity-30"
                  style={{ borderColor: CREAM, color: CREAM, background: 'rgba(243,231,201,0.06)' }}
                >
                  {busy ? 'Adding...' : 'Add to collection →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showScanner && (
          <CardScanner
            onClose={() => setShowScanner(false)}
            onAdded={handleScannedAdded}
          />
        )}
      </div>
    </div>
  );
}
