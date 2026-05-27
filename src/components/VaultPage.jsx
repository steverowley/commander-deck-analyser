/**
 * VaultPage — full-page view of the user's owned-card inventory.
 *
 * Replaces the old CollectionModal. Carries the same add / paste /
 * scan / search affordances, plus a stats dashboard, a top-valuable
 * list, deck-coverage table, buildable-commander gallery and an
 * "unused cards" surface.
 *
 * Rendered by App.jsx when view === 'vault'.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, Loader2, Library, Camera, ClipboardPaste, Trash2, Plus, Minus, X,
  Crown, BarChart3, Coins, Layers,
} from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { pad, parseDecklist, lc } from '../lib/utils.js';
import { fetchCardsByName } from '../lib/scryfall.js';
import { CardSearchBar, VersionChip } from './UI.jsx';
import { VaultCard } from './VaultCard.jsx';
import { ManaSymbol } from './ManaCost.jsx';
import {
  loadCollection,
  setCardQuantity,
  bulkAddToCollection,
  bulkImportVault,
  clearCollection,
  uniqueCount,
  totalCount,
} from '../lib/collection.js';
import { detectMoxfieldCsv, parseMoxfieldCsv } from '../lib/csvImport.js';
import { CardScanner } from './CardScanner.jsx';
import { computeVaultStats } from '../lib/vaultStats.js';
import { cardPrice, formatPrice, activePriceSource, vendorLabel, vendorMeta } from '../lib/pricing.js';
import { loadSettings } from '../lib/settings.js';

const COLOR_LABELS = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', M: 'Multicolor', C: 'Colorless' };

export function VaultPage({ onBack, signedIn, decks = [], onSelectDeck, onCollectionChanged }) {
  const [collection, setCollection] = useState(null);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);
  const [colorFilter, setColorFilter] = useState(null);
  const [sort, setSort] = useState('recent'); // recent | name | value | quantity
  const [showOnlyUnused, setShowOnlyUnused] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [view, setView] = useState('grid');
  const [cardData, setCardData] = useState({});

  const settings = loadSettings();
  const currency = settings.currency || 'usd';
  const vendor = activePriceSource();

  useEffect(() => { loadCollection().then(setCollection); }, []);

  // Fetch Scryfall data for every card in the collection — needed for
  // the dashboard math (types, CMC, prices). Batched at 75 per request.
  useEffect(() => {
    if (!collection) return;
    const names = Object.values(collection).map((c) => c.name);
    if (names.length === 0) return;
    const missing = names.filter((n) => !cardData[lc(n)]);
    if (missing.length === 0) return;
    fetchCardsByName(missing).then(({ results }) => {
      setCardData((cur) => ({ ...cur, ...results }));
    });
  }, [collection]);

  const refresh = async () => {
    setCollection(await loadCollection());
    onCollectionChanged?.();
  };

  const stats = useMemo(
    () => collection ? computeVaultStats(collection, cardData, decks, currency, vendor) : null,
    [collection, cardData, decks, currency, vendor]
  );

  // Names already in a deck (set form for the unused filter).
  const usedNames = useMemo(() => {
    const set = new Set();
    for (const d of decks) {
      for (const c of d.cards || []) set.add(lc(c.name));
      if (d.commander) set.add(lc(d.commander.name));
    }
    return set;
  }, [decks]);

  const filteredEntries = useMemo(() => {
    if (!collection) return [];
    const list = Object.values(collection);
    const q = filter.trim().toLowerCase();
    let out = list.filter((entry) => {
      if (q && !entry.name.toLowerCase().includes(q)) return false;
      const card = cardData[lc(entry.name)];
      if (typeFilter) {
        if (!card?.type_line) return false;
        if (typeFilter === 'Land' && !/Land/i.test(card.type_line)) return false;
        if (typeFilter !== 'Land' && /Land/i.test(card.type_line)) return false;
        if (typeFilter !== 'Land' && !new RegExp(typeFilter, 'i').test(card.type_line)) return false;
      }
      if (colorFilter) {
        if (!card) return false;
        const colors = card.colors || [];
        if (colorFilter === 'C' && colors.length !== 0) return false;
        if (colorFilter === 'M' && colors.length < 2) return false;
        if (['W', 'U', 'B', 'R', 'G'].includes(colorFilter)) {
          if (colors.length !== 1 || colors[0] !== colorFilter) return false;
        }
      }
      if (showOnlyUnused) {
        if (usedNames.has(lc(entry.name))) return false;
        if (card && /Basic Land/i.test(card.type_line || '')) return false;
      }
      return true;
    });
    if (sort === 'name') out = out.slice().sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'quantity') out = out.slice().sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
    else if (sort === 'value') {
      out = out.slice().sort((a, b) => {
        const ca = cardData[lc(a.name)];
        const cb = cardData[lc(b.name)];
        const pa = cardPrice(ca, currency, vendor) || 0;
        const pb = cardPrice(cb, currency, vendor) || 0;
        return pb - pa;
      });
    } else {
      out = out.slice().sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
    }
    return out;
  }, [collection, cardData, filter, typeFilter, colorFilter, showOnlyUnused, usedNames, sort, currency, vendor]);

  const hasFilter = !!(filter.trim() || typeFilter || colorFilter || showOnlyUnused);

  const handleAddFromSearch = async (cards) => {
    // bulkAddToCollection batches: one read + one upsert covering all
    // cards, instead of an addToCollection round-trip per card.
    await bulkAddToCollection(cards.map((c) => ({ name: c.name, quantity: 1 })));
    await refresh();
  };

  const handleBulkSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (detectMoxfieldCsv(bulkText)) {
        const rows = parseMoxfieldCsv(bulkText);
        if (!rows.length) {
          setError("Looks like a Moxfield CSV but I couldn't parse any rows.");
          return;
        }
        const { added, failed, error: importError } = await bulkImportVault(rows);
        await refresh();
        if (failed > 0) {
          setError(`Imported ${added} of ${rows.length}; ${failed} failed${importError ? `: ${importError}` : ''}.`);
          setTimeout(() => setError(null), 10000);
        } else {
          setBulkText('');
          setShowBulk(false);
        }
        return;
      }
      const lines = parseDecklist(bulkText);
      if (!lines.length) {
        setError('No card lines found. Paste a Moxfield CSV, or a list with one card per line ("Nx" prefix optional).');
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
    await setCardQuantity(entry.name, (entry.quantity || 0) + delta);
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

  const vMeta = vendorMeta(vendor);
  const vendorApprox = !!(vMeta && vMeta.currency !== currency);
  const approx = (n) => (stats && (vendorApprox || stats.knownCount < stats.unique) ? '~' : '') + formatPrice(n, currency);
  const priceSourceTip = (() => {
    const lines = [`Source: ${vendorLabel(vendor)}.`];
    if (vMeta && vMeta.currency !== currency) lines.push(`Converted ${vMeta.currency.toUpperCase()} → ${currency.toUpperCase()} at an approximate FX rate.`);
    if (stats && stats.knownCount < stats.unique) lines.push(`${stats.unique - stats.knownCount} card(s) have no ${vendorLabel(vendor)} price.`);
    lines.push('Change the source under Settings → Price source.');
    return lines.join('\n');
  })();

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 pb-20">
      {/* Top nav — mirrors DeckListView so the page feels native. */}
      <nav className="border-b mt-6" style={{ borderColor: CREAM_FAINT }}>
        <div className="grid grid-cols-1 md:grid-cols-4">
          <div className="p-5 md:border-r flex items-center gap-3 min-w-0" style={{ borderColor: CREAM_FAINT }}>
            <button onClick={onBack} className="hover:opacity-100 transition shrink-0" style={{ color: CREAM_DIM }} title="Back to Vault home">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0 overflow-hidden">
              <button
                onClick={onBack}
                className="font-serif text-xl font-black leading-none tracking-wider uppercase text-left hover:opacity-80 transition w-full"
                style={{ color: CREAM }}
                title="Back to Vault home"
              >
                Vault
              </button>
              <div className="font-serif text-[10px] tracking-[0.3em] uppercase mt-1" style={{ color: CREAM_DIM }}>
                Your Collection
              </div>
            </div>
          </div>
          <div className="flex items-center px-5 py-3 md:py-0 border-t md:border-t-0 md:border-r font-serif text-[11px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            {collection ? `Unique · ${pad(uniqueCount(collection), 4)}` : 'Loading…'}
          </div>
          <div className="flex items-center px-5 py-3 md:py-0 border-t md:border-t-0 md:border-r font-serif text-[11px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            {collection ? `Total · ${pad(totalCount(collection), 4)}` : '—'}
          </div>
          <div className="flex items-center justify-end px-5 py-3 md:py-0 border-t md:border-t-0 text-[11px] tracking-[0.3em] uppercase font-serif gap-4" style={{ color: CREAM_DIM }}>
            {!signedIn && <span className="italic normal-case tracking-normal text-xs" style={{ color: CREAM_DIM }}>Local-only</span>}
            <VersionChip version={__APP_VERSION__} align="right" />
          </div>
        </div>
      </nav>

      {/* Add-cards action strip. Three equal slots: scan / paste / search. */}
      <div className="grid grid-cols-1 md:grid-cols-3 border-l border-t mt-6" style={{ borderColor: CREAM_FAINT }}>
        <button
          onClick={() => setShowScanner(true)}
          className="border-r border-b p-5 text-left flex items-start gap-4 hover:opacity-100"
          style={{ borderColor: CREAM_FAINT }}
        >
          <Camera className="w-5 h-5 shrink-0 mt-0.5" style={{ color: CREAM_DIM }} />
          <div className="min-w-0">
            <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
              Scan with camera
            </div>
            <div className="font-serif text-xs italic mt-1" style={{ color: CREAM_DIM }}>
              Point your camera at a card; auto-recognised via OCR.
            </div>
          </div>
        </button>
        <button
          onClick={() => setShowBulk(true)}
          className="border-r border-b p-5 text-left flex items-start gap-4 hover:opacity-100"
          style={{ borderColor: CREAM_FAINT }}
        >
          <ClipboardPaste className="w-5 h-5 shrink-0 mt-0.5" style={{ color: CREAM_DIM }} />
          <div className="min-w-0">
            <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
              Bulk paste
            </div>
            <div className="font-serif text-xs italic mt-1" style={{ color: CREAM_DIM }}>
              Paste a Moxfield CSV export, or a "Nx card" decklist.
            </div>
          </div>
        </button>
        <div className="border-r border-b p-5" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold mb-2" style={{ color: CREAM }}>
            Add by name
          </div>
          <CardSearchBar onAdd={handleAddFromSearch} />
          <div className="font-serif text-[10px] italic mt-2" style={{ color: CREAM_DIM }}>
            Or drag any card from Scryfall straight onto this page.
          </div>
        </div>
      </div>

      {error && (
        <div className="border border-l-4 mt-4 p-3" style={{ borderColor: ACCENT, background: 'rgba(var(--accent-rgb),0.06)' }}>
          <div className="font-mono text-xs" style={{ color: CREAM }}>{error}</div>
        </div>
      )}

      {collection === null ? (
        <div className="p-16 flex items-center justify-center gap-3 mt-8 border" style={{ borderColor: CREAM_FAINT }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: CREAM_DIM }} />
          <span className="font-mono text-xs" style={{ color: CREAM_DIM }}>Loading Vault…</span>
        </div>
      ) : Object.keys(collection).length === 0 ? (
        <EmptyVault onScan={() => setShowScanner(true)} onPaste={() => setShowBulk(true)} />
      ) : (
        <>
          <StatsDashboard stats={stats} currency={currency} approx={approx} priceSourceTip={priceSourceTip} />
          <ValuablesAndCoverage stats={stats} currency={currency} approx={approx} onSelectDeck={onSelectDeck} priceSourceTip={priceSourceTip} />
          <BuildableSection stats={stats} />
          <UnusedSection stats={stats} approx={approx} onShowUnused={() => setShowOnlyUnused(true)} priceSourceTip={priceSourceTip} />
          <InventorySection
            entries={filteredEntries}
            cardData={cardData}
            collection={collection}
            view={view} setView={setView}
            filter={filter} setFilter={setFilter}
            typeFilter={typeFilter} setTypeFilter={setTypeFilter}
            colorFilter={colorFilter} setColorFilter={setColorFilter}
            sort={sort} setSort={setSort}
            showOnlyUnused={showOnlyUnused} setShowOnlyUnused={setShowOnlyUnused}
            hasFilter={hasFilter}
            confirmClear={confirmClear} setConfirmClear={setConfirmClear}
            clearAll={clearAll} busy={busy}
            adjust={adjust} remove={remove}
            refresh={refresh}
          />
        </>
      )}

      {showBulk && (
        <BulkPasteModal
          bulkText={bulkText} setBulkText={setBulkText}
          busy={busy} onClose={() => setShowBulk(false)}
          onSubmit={handleBulkSubmit}
        />
      )}
      {showScanner && (
        <CardScanner onClose={() => setShowScanner(false)} onAdded={refresh} />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

function StatsDashboard({ stats, currency, approx, priceSourceTip }) {
  if (!stats) return null;
  const maxColor = Math.max(...Object.values(stats.colorHistogram), 1);
  const maxType = Math.max(...stats.typeHistogram.map((t) => t.count), 1);
  const maxCmc = Math.max(...stats.cmcHistogram, 1);
  const maxRarity = Math.max(...stats.rarityHistogram.map((r) => r.count), 1);

  return (
    <div className="mt-10 fade-up">
      <div className="flex items-baseline gap-4 mb-3">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
          <BarChart3 className="w-3.5 h-3.5" /> Stats
        </div>
        <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
        {stats.knownCount < stats.unique && (
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Loading {stats.knownCount} of {stats.unique}…
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
        <DashStat label="Unique cards" value={stats.unique} />
        <DashStat label="Total cards" value={stats.total} />
        <DashStat label="Total value" value={approx(stats.totalValue)} sub={stats.knownCount < stats.unique ? `${stats.unique - stats.knownCount} unpriced` : null} tip={priceSourceTip} />
        <DashStat
          label="Foils"
          value={stats.foilUnique > 0 ? `${stats.foilUnique}` : '—'}
          sub={stats.foilValue > 0 ? `${approx(stats.foilValue)} foil value` : 'tag foils via the chip'}
          tip={priceSourceTip}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        {/* Color distribution */}
        <div className="border" style={{ borderColor: CREAM_FAINT }}>
          <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            Color distribution
          </div>
          <div className="p-4 space-y-2">
            {['W', 'U', 'B', 'R', 'G', 'M', 'C'].map((c) => {
              const n = stats.colorHistogram[c];
              const pct = (n / maxColor) * 100;
              return (
                <div key={c} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    {c === 'M' ? (
                      <span className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>≥2</span>
                    ) : (
                      <ManaSymbol sym={c} size="0.85em" />
                    )}
                    <span className="font-serif text-xs truncate" style={{ color: CREAM }}>{COLOR_LABELS[c]}</span>
                  </div>
                  <div className="col-span-6 h-2" style={{ background: 'rgba(var(--ink-rgb),0.08)' }}>
                    <div className="h-full" style={{ background: CREAM, opacity: n > 0 ? 0.7 : 0, width: `${pct}%` }} />
                  </div>
                  <div className="col-span-2 text-right font-mono text-[10px]" style={{ color: CREAM }}>{n}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Type distribution */}
        <div className="border" style={{ borderColor: CREAM_FAINT }}>
          <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            Type distribution
          </div>
          <div className="p-4 space-y-2">
            {stats.typeHistogram.map((t) => (
              <div key={t.name} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4 font-serif text-xs truncate" style={{ color: CREAM }}>{t.name}</div>
                <div className="col-span-6 h-2" style={{ background: 'rgba(var(--ink-rgb),0.08)' }}>
                  <div className="h-full" style={{ background: CREAM, opacity: t.count > 0 ? 0.7 : 0, width: `${(t.count / maxType) * 100}%` }} />
                </div>
                <div className="col-span-2 text-right font-mono text-[10px]" style={{ color: CREAM }}>{t.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        {/* CMC histogram — spells only, lands excluded */}
        <div className="border" style={{ borderColor: CREAM_FAINT }}>
          <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            Mana curve (spells only)
          </div>
          <div className="p-4 flex items-end gap-2" style={{ height: '120px' }}>
            {stats.cmcHistogram.map((n, i) => {
              const h = n > 0 ? Math.max((n / maxCmc) * 90, 4) : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="font-mono text-[10px] mb-1" style={{ color: CREAM_DIM, opacity: n === 0 ? 0.4 : 1 }}>{n}</span>
                  <div className="w-full" style={{ background: CREAM, opacity: 0.7, height: `${h}px` }} />
                  <span className="font-mono text-[10px] mt-1.5" style={{ color: CREAM_DIM }}>{i === 7 ? '7+' : i}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rarity */}
        <div className="border" style={{ borderColor: CREAM_FAINT }}>
          <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            Rarity
          </div>
          <div className="p-4 space-y-2">
            {stats.rarityHistogram.filter((r) => r.count > 0).map((r) => (
              <div key={r.name} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4 font-serif text-xs capitalize" style={{ color: CREAM }}>{r.name}</div>
                <div className="col-span-6 h-2" style={{ background: 'rgba(var(--ink-rgb),0.08)' }}>
                  <div className="h-full" style={{ background: CREAM, opacity: 0.7, width: `${(r.count / maxRarity) * 100}%` }} />
                </div>
                <div className="col-span-2 text-right font-mono text-[10px]" style={{ color: CREAM }}>{r.count}</div>
              </div>
            ))}
            {stats.rarityHistogram.every((r) => r.count === 0) && (
              <div className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
                Rarity data fills in as Scryfall resolves your cards.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top sets */}
      {stats.topSets.length > 0 && (
        <div className="border mt-3" style={{ borderColor: CREAM_FAINT }}>
          <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            Top sets
          </div>
          <div className="p-4 flex flex-wrap gap-x-5 gap-y-1.5">
            {stats.topSets.map((s) => (
              <div key={s.code} className="flex items-baseline gap-1.5">
                <span className="font-serif text-sm" style={{ color: CREAM }}>{s.name}</span>
                <span className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>×{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ValuablesAndCoverage({ stats, currency, approx, onSelectDeck, priceSourceTip }) {
  if (!stats) return null;
  const showValuables = stats.topValuable.length > 0;
  const showCoverage = stats.deckCoverage.length > 0;
  if (!showValuables && !showCoverage) return null;

  return (
    <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3 fade-up">
      {showValuables && (
        <div className="border" style={{ borderColor: CREAM_FAINT }} title={priceSourceTip}>
          <div className="px-4 py-2 border-b flex items-center gap-2 font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            <Coins className="w-3 h-3" /> Most valuable
          </div>
          <div className="divide-y" style={{ borderColor: CREAM_FAINT }}>
            {stats.topValuable.map((c, i) => (
              <div key={c.name} className="px-4 py-2 flex items-center gap-3 border-b" style={{ borderColor: CREAM_FAINT }}>
                <span className="font-mono text-[10px] w-5 text-right" style={{ color: CREAM_DIM }}>{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-sm truncate" style={{ color: CREAM }} title={c.name}>{c.name}</div>
                  <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
                    {c.set || ''} {c.quantity > 1 && `· ×${c.quantity}`} {c.foil && '· foil'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-serif text-sm" style={{ color: CREAM }}>{formatPrice(c.unitValue, currency)}</div>
                  {c.quantity > 1 && <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>{approx(c.value)} total</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCoverage && (
        <div className="border" style={{ borderColor: CREAM_FAINT }}>
          <div className="px-4 py-2 border-b flex items-center gap-2 font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            <Layers className="w-3 h-3" /> Deck coverage
          </div>
          <div>
            {stats.deckCoverage.slice(0, 8).map((d) => (
              <button
                key={d.id}
                onClick={() => onSelectDeck?.(d.id)}
                className="w-full px-4 py-2.5 text-left border-b hover:bg-white/5 transition"
                style={{ borderColor: CREAM_FAINT }}
                title="Open in editor"
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-serif text-sm truncate flex-1 min-w-0" style={{ color: CREAM }}>{d.name}</span>
                  <span className="font-mono text-[10px] shrink-0" style={{ color: CREAM }}>
                    {d.owned} / {d.total}
                  </span>
                  <span className="font-serif text-[10px] tracking-wider shrink-0" style={{ color: coverageColor(d.percent) }}>
                    {d.percent}%
                  </span>
                </div>
                <div className="h-1.5" style={{ background: 'rgba(var(--ink-rgb),0.08)' }}>
                  <div className="h-full" style={{ background: coverageColor(d.percent), opacity: 0.8, width: `${d.percent}%` }} />
                </div>
              </button>
            ))}
            {stats.deckCoverage.length > 8 && (
              <div className="px-4 py-2 font-mono text-[10px]" style={{ color: CREAM_DIM }}>
                + {stats.deckCoverage.length - 8} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BuildableSection({ stats }) {
  if (!stats || stats.buildableCommanders.length === 0) return null;
  return (
    <div className="mt-10 fade-up">
      <div className="flex items-baseline gap-4 mb-3">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
          <Crown className="w-3.5 h-3.5" /> Buildable commanders
        </div>
        <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          {pad(stats.buildableCommanders.length)} legendary creatures in Vault
        </div>
      </div>
      <p className="font-serif text-xs italic mb-3 max-w-2xl" style={{ color: CREAM_DIM }}>
        Every legendary creature you own — each one could lead a deck. The deck roller's "Vault-only" toggle picks from these.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 border-l border-t" style={{ borderColor: CREAM_FAINT }}>
        {stats.buildableCommanders.slice(0, 24).map((c) => (
          <div key={c.name} className="border-r border-b p-2" style={{ borderColor: CREAM_FAINT }}>
            {c.image ? (
              <img src={c.image} alt={c.name} className="w-full object-cover" style={{ aspectRatio: '5/7', borderRadius: '5%' }} />
            ) : (
              <div className="w-full flex items-center justify-center" style={{ aspectRatio: '5/7', background: 'rgba(var(--ink-rgb),0.04)' }}>
                <Crown className="w-4 h-4" style={{ color: CREAM_DIM }} />
              </div>
            )}
            <div className="mt-2 font-serif text-[10px] uppercase font-bold truncate" style={{ color: CREAM }} title={c.name}>{c.name}</div>
            <div className="mt-1 flex items-center gap-0.5" style={{ fontSize: '0.65rem' }}>
              {c.colors.length === 0
                ? <ManaSymbol sym="C" size="0.7em" />
                : c.colors.map((col) => <ManaSymbol key={col} sym={col} size="0.7em" />)}
            </div>
          </div>
        ))}
      </div>
      {stats.buildableCommanders.length > 24 && (
        <div className="mt-2 font-mono text-[10px] text-right" style={{ color: CREAM_DIM }}>
          + {stats.buildableCommanders.length - 24} more
        </div>
      )}
    </div>
  );
}

function UnusedSection({ stats, approx, onShowUnused, priceSourceTip }) {
  if (!stats || stats.unusedCards.length === 0) return null;
  return (
    <div className="mt-10 border p-5 fade-up" style={{ borderColor: CREAM_FAINT, background: 'rgba(var(--ink-rgb),0.02)' }}>
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            Cards on the shelf
          </div>
          <p className="font-serif text-xs italic mt-1" style={{ color: CREAM_DIM }}>
            {stats.unusedCards.length} unique cards in your Vault aren't in any saved deck
            {stats.unusedValue > 0 && <> — <span title={priceSourceTip}>{approx(stats.unusedValue)}</span> of unplayed value</>}.
            {' '}Filter the inventory grid below to see them.
          </p>
        </div>
        <button
          onClick={onShowUnused}
          className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 shrink-0"
          style={{ borderColor: CREAM_FAINT, color: CREAM }}
        >
          Show me →
        </button>
      </div>
    </div>
  );
}

function InventorySection({
  entries, cardData, collection, view, setView,
  filter, setFilter, typeFilter, setTypeFilter, colorFilter, setColorFilter,
  sort, setSort, showOnlyUnused, setShowOnlyUnused, hasFilter,
  confirmClear, setConfirmClear, clearAll, busy,
  adjust, remove, refresh,
}) {
  const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land'];
  const COLORS = ['W', 'U', 'B', 'R', 'G', 'M', 'C'];

  const clearFilters = () => {
    setFilter('');
    setTypeFilter(null);
    setColorFilter(null);
    setShowOnlyUnused(false);
  };

  return (
    <div className="mt-10 fade-up">
      <div className="flex items-baseline gap-4 mb-3">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
          <Library className="w-3.5 h-3.5" /> Inventory
        </div>
        <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          {hasFilter ? `${pad(entries.length, 4)} matched` : `${pad(entries.length, 4)} cards`}
        </div>
      </div>

      <div className="border p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center" style={{ borderColor: CREAM_FAINT, background: 'rgba(var(--ink-rgb),0.02)' }}>
        <div className="md:col-span-5">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by name…"
            className="w-full bg-transparent border px-3 py-2 focus:outline-none font-mono text-xs"
            style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--ink-rgb),0.02)' }}
          />
        </div>
        <div className="md:col-span-4 flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[9px] tracking-wider shrink-0" style={{ color: CREAM_DIM }}>COLOR</span>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColorFilter(colorFilter === c ? null : c)}
              className="w-5 h-5 border transition flex items-center justify-center"
              style={{
                borderColor: colorFilter === c ? CREAM : CREAM_FAINT,
                background: colorFilter === c ? 'rgba(var(--ink-rgb),0.08)' : 'transparent',
              }}
              title={COLOR_LABELS[c]}
            >
              {c === 'M' ? <span className="font-mono text-[8px]" style={{ color: CREAM_DIM }}>M</span> : <ManaSymbol sym={c} size="0.7em" />}
            </button>
          ))}
        </div>
        <div className="md:col-span-3 flex items-center justify-end gap-2">
          <div className="flex border" style={{ borderColor: CREAM_FAINT }}>
            {['grid', 'list'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="font-mono text-[9px] uppercase tracking-wider px-2 py-1"
                style={{
                  color: view === v ? CREAM : CREAM_DIM,
                  background: view === v ? 'rgba(var(--ink-rgb),0.08)' : 'transparent',
                }}
                title={`Switch to ${v} view`}
              >
                {v}
              </button>
            ))}
          </div>
          {collection && Object.keys(collection).length > 0 && (
            confirmClear ? (
              <span className="font-serif text-[10px] tracking-[0.3em] uppercase flex items-center gap-2">
                <button onClick={clearAll} disabled={busy} style={{ color: ACCENT }}>Clear</button>
                <span style={{ color: CREAM_DIM }}>·</span>
                <button onClick={() => setConfirmClear(false)} style={{ color: CREAM_DIM }}>Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmClear(true)} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }} title="Remove all cards">
                Clear all
              </button>
            )
          )}
        </div>

        <div className="md:col-span-12 flex items-center gap-3 flex-wrap pt-2 border-t" style={{ borderColor: CREAM_FAINT }}>
          <span className="font-mono text-[9px] tracking-wider" style={{ color: CREAM_DIM }}>TYPE</span>
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              className="font-mono text-[10px] px-2 py-0.5 border transition"
              style={{
                borderColor: typeFilter === t ? CREAM : CREAM_FAINT,
                color: typeFilter === t ? CREAM : CREAM_DIM,
              }}
            >
              {t.toLowerCase()}
            </button>
          ))}
          <span className="font-mono text-[9px] tracking-wider ml-3" style={{ color: CREAM_DIM }}>SORT</span>
          {[{ id: 'recent', label: 'recent' }, { id: 'name', label: 'name' }, { id: 'value', label: 'value' }, { id: 'quantity', label: 'qty' }].map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className="font-mono text-[10px] px-2 py-0.5 border transition"
              style={{ borderColor: sort === s.id ? CREAM : CREAM_FAINT, color: sort === s.id ? CREAM : CREAM_DIM }}
            >
              {s.label}
            </button>
          ))}
          <label className="flex items-center gap-1.5 ml-3 cursor-pointer" title="Only show cards not in any saved deck">
            <input type="checkbox" checked={showOnlyUnused} onChange={(e) => setShowOnlyUnused(e.target.checked)} />
            <span className="font-mono text-[10px]" style={{ color: showOnlyUnused ? CREAM : CREAM_DIM }}>unused only</span>
          </label>
          {hasFilter && (
            <button onClick={clearFilters} className="font-serif text-[10px] tracking-[0.3em] uppercase ml-auto" style={{ color: CREAM_DIM }}>
              Clear ×
            </button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="border border-dashed p-16 text-center font-serif text-sm italic mt-3" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          {hasFilter ? 'No cards match those filters.' : 'No cards in the Vault yet.'}
        </div>
      ) : view === 'grid' ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {entries.map((entry) => {
            const card = cardData[lc(entry.name)];
            return (
              <div key={entry.name} className="flex flex-col gap-2">
                <VaultCard entry={entry} card={card} onChanged={refresh} />
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-serif text-[10px] uppercase font-bold truncate flex-1" style={{ color: CREAM }} title={entry.name}>
                    {entry.name}
                  </span>
                  <div className="flex items-center gap-px border shrink-0" style={{ borderColor: CREAM_FAINT }}>
                    <button onClick={() => adjust(entry, -1)} className="w-6 h-6" style={{ color: CREAM_DIM }} aria-label="Decrease">
                      <Minus className="w-2.5 h-2.5 mx-auto" />
                    </button>
                    <span className="w-6 text-center font-mono text-[10px]" style={{ color: CREAM }}>{entry.quantity}</span>
                    <button onClick={() => adjust(entry, +1)} className="w-6 h-6" style={{ color: CREAM_DIM }} aria-label="Increase">
                      <Plus className="w-2.5 h-2.5 mx-auto" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 border" style={{ borderColor: CREAM_FAINT }}>
          {entries.map((entry) => (
            <div key={entry.name} className="px-5 py-2.5 border-b flex items-center gap-3" style={{ borderColor: CREAM_FAINT }}>
              <div className="flex-1 min-w-0">
                <div className="font-serif font-bold uppercase tracking-tight truncate text-sm" style={{ color: CREAM }}>
                  {entry.name}
                </div>
              </div>
              <div className="flex items-center gap-px border shrink-0" style={{ borderColor: CREAM_FAINT }}>
                <button onClick={() => adjust(entry, -1)} className="w-7 h-7" style={{ color: CREAM_DIM }} aria-label="Decrease">
                  <Minus className="w-3 h-3 mx-auto" />
                </button>
                <span className="w-8 text-center font-mono text-sm" style={{ color: CREAM }}>{entry.quantity}</span>
                <button onClick={() => adjust(entry, +1)} className="w-7 h-7" style={{ color: CREAM_DIM }} aria-label="Increase">
                  <Plus className="w-3 h-3 mx-auto" />
                </button>
              </div>
              <button onClick={() => remove(entry)} className="hover:text-red-400 shrink-0" style={{ color: CREAM_DIM }} title="Remove from Vault">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkPasteModal({ bulkText, setBulkText, busy, onClose, onSubmit }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(var(--bg-rgb),0.94)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div className="border w-full max-w-lg flex flex-col" style={{ background: BG, borderColor: CREAM_FAINT }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-baseline justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            Bulk paste
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
            Two formats accepted: <span style={{ color: CREAM }}>Moxfield collection CSV export</span> (auto-detected — replaces quantities, captures foil flags), or a decklist with one card per line + optional <code style={{ color: CREAM }}>Nx</code> prefix.
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
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={busy || !bulkText.trim()}
            className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 disabled:opacity-30"
            style={{ borderColor: CREAM, color: CREAM, background: 'rgba(var(--ink-rgb),0.06)' }}
          >
            {busy ? 'Adding…' : 'Add to Vault →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyVault({ onScan, onPaste }) {
  return (
    <div className="border border-dashed p-10 md:p-16 text-center mt-8" style={{ borderColor: CREAM_FAINT }}>
      <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
        Your Vault is empty
      </div>
      <p className="font-serif text-sm italic mt-2 max-w-lg mx-auto" style={{ color: CREAM_DIM }}>
        Scan paper cards with your camera, paste a Moxfield CSV export, drag any card image from Scryfall onto this page, or search by name above.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button onClick={onScan} className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 flex items-center gap-1.5" style={{ borderColor: CREAM_FAINT, color: CREAM }}>
          <Camera className="w-3 h-3" /> Scan
        </button>
        <button onClick={onPaste} className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 flex items-center gap-1.5" style={{ borderColor: CREAM_FAINT, color: CREAM }}>
          <ClipboardPaste className="w-3 h-3" /> Paste
        </button>
      </div>
    </div>
  );
}

function DashStat({ label, value, sub, tip }) {
  return (
    <div className="border-r border-b p-4" style={{ borderColor: CREAM_FAINT }} title={tip || undefined}>
      <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>{label}</div>
      <div className="font-serif font-black mt-1" style={{ color: CREAM, fontSize: '1.6rem' }}>{value}</div>
      {sub && <div className="font-mono text-[10px] mt-1" style={{ color: CREAM_DIM }}>{sub}</div>}
    </div>
  );
}

function coverageColor(pct) {
  if (pct >= 80) return '#a3c98a';
  if (pct >= 50) return CREAM;
  if (pct >= 25) return '#d8b35a';
  return ACCENT;
}
