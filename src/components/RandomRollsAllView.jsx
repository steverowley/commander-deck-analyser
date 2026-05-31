/**
 * Full Latest Random Rolls — click-through page reached from the
 * "View all →" link on the landing-page Latest random rolls section.
 * Loads up to 200 rolls and gives the user search + bracket / color /
 * archetype / budget / sort filters to find a specific roll.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Dices, Loader2 } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT } from '../theme.js';
import { pad } from '../lib/utils.js';
import { loadRandomRolls } from '../lib/storage-supabase.js';
import { ARCHETYPES, archetypeById } from '../lib/archetypes.js';
import { RollCard } from './RandomRollsView.jsx';
import { ManaSymbol } from './ManaCost.jsx';
import { VersionChip } from './UI.jsx';

const PAGE_LIMIT = 200;

// Currency-agnostic buckets — applied to seedMeta.budget regardless of
// currency. Bucket boundaries are wide enough that USD / GBP / EUR all
// land in the same tier for any realistic roll.
const BUDGET_TIERS = [
  { id: 'le50', label: '≤ 50', test: (n) => n <= 50 },
  { id: '50-200', label: '50–200', test: (n) => n > 50 && n <= 200 },
  { id: '200-500', label: '200–500', test: (n) => n > 200 && n <= 500 },
  { id: '500plus', label: '500+', test: (n) => n > 500 },
];

export function RandomRollsAllView({ onBack, onImportFromGallery, onViewDeck }) {
  const [decks, setDecks] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [bracketFilter, setBracketFilter] = useState(null);   // 1..5
  const [colorFilter, setColorFilter] = useState(null);       // 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
  const [archetypeFilter, setArchetypeFilter] = useState('any'); // ARCHETYPES[i].id
  const [budgetFilter, setBudgetFilter] = useState(null);     // BUDGET_TIERS[i].id
  const [sort, setSort] = useState('recent'); // recent | commander | bracket | budget-low | budget-high | archetype

  useEffect(() => {
    loadRandomRolls(PAGE_LIMIT)
      .then(setDecks)
      .catch((e) => setError(e.message));
  }, []);

  const visible = useMemo(() => {
    if (!decks) return [];
    const q = search.trim().toLowerCase();
    const budgetTier = budgetFilter ? BUDGET_TIERS.find((t) => t.id === budgetFilter) : null;
    let list = decks.filter((d) => {
      if (q) {
        const name = d.name?.toLowerCase() || '';
        const cmdr = d.commander?.name?.toLowerCase() || '';
        const owner = d.ownerUsername?.toLowerCase() || '';
        const arch = archetypeById(d.seedMeta?.archetype).label?.toLowerCase() || '';
        if (!name.includes(q) && !cmdr.includes(q) && !owner.includes(q) && !arch.includes(q)) return false;
      }
      // Rolls always have a bracket — RollCard shows ?? 3 fallback for
      // ancient rows missing the meta; match that here so the filter
      // doesn't silently hide legacy rolls.
      if (bracketFilter != null && (d.seedMeta?.bracket ?? 3) !== bracketFilter) return false;
      if (colorFilter) {
        const id = d.commander?.color_identity || [];
        if (colorFilter === 'C') {
          if (id.length !== 0) return false;
        } else if (!id.includes(colorFilter)) {
          return false;
        }
      }
      if (archetypeFilter !== 'any' && (d.seedMeta?.archetype || 'any') !== archetypeFilter) return false;
      if (budgetTier) {
        const b = d.seedMeta?.budget;
        if (b == null || !budgetTier.test(b)) return false;
      }
      return true;
    });
    if (sort === 'commander') list = list.slice().sort((a, b) => (a.commander?.name || '').localeCompare(b.commander?.name || ''));
    else if (sort === 'bracket') list = list.slice().sort((a, b) => (b.seedMeta?.bracket ?? 0) - (a.seedMeta?.bracket ?? 0));
    else if (sort === 'budget-low') list = list.slice().sort((a, b) => (a.seedMeta?.budget ?? Infinity) - (b.seedMeta?.budget ?? Infinity));
    else if (sort === 'budget-high') list = list.slice().sort((a, b) => (b.seedMeta?.budget ?? -1) - (a.seedMeta?.budget ?? -1));
    else if (sort === 'archetype') list = list.slice().sort((a, b) => archetypeById(a.seedMeta?.archetype).label.localeCompare(archetypeById(b.seedMeta?.archetype).label));
    // 'recent' is the backend default (created_at desc) — no resort.
    return list;
  }, [decks, search, bracketFilter, colorFilter, archetypeFilter, budgetFilter, sort]);

  const hasFilter = !!(search.trim() || bracketFilter != null || colorFilter || archetypeFilter !== 'any' || budgetFilter);
  const clearAll = () => {
    setSearch(''); setBracketFilter(null); setColorFilter(null);
    setArchetypeFilter('any'); setBudgetFilter(null); setSort('recent');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 pb-20">
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
                <Dices className="w-3 h-3 inline mr-1.5" style={{ verticalAlign: 'baseline' }} />
                Random rolls
              </div>
            </div>
          </div>
          <div className="flex items-center px-5 py-3 md:py-0 border-t md:border-t-0 md:border-r font-serif text-[11px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            {decks === null ? 'Loading…' : `Total · ${pad(decks.length, 3)}`}
          </div>
          <div className="flex items-center px-5 py-3 md:py-0 border-t md:border-t-0 md:border-r font-serif text-[11px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            {decks === null ? '—' : `Shown · ${pad(visible.length, 3)}`}
          </div>
          <div className="flex items-center justify-end px-5 py-3 md:py-0 border-t md:border-t-0 text-[11px] tracking-[0.3em] uppercase font-serif gap-4" style={{ color: CREAM_DIM }}>
            <VersionChip version={__APP_VERSION__} align="right" />
          </div>
        </div>
      </nav>

      <FilterBar
        search={search} setSearch={setSearch}
        bracketFilter={bracketFilter} setBracketFilter={setBracketFilter}
        colorFilter={colorFilter} setColorFilter={setColorFilter}
        archetypeFilter={archetypeFilter} setArchetypeFilter={setArchetypeFilter}
        budgetFilter={budgetFilter} setBudgetFilter={setBudgetFilter}
        sort={sort} setSort={setSort}
        hasFilter={hasFilter} onClear={clearAll}
      />

      {error ? (
        <div className="border p-8 mt-6 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          Couldn't load random rolls — try again in a moment.
        </div>
      ) : decks === null ? (
        <div className="border p-12 mt-6 flex items-center justify-center gap-3" style={{ borderColor: CREAM_FAINT }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: CREAM_DIM }} />
          <span className="font-mono text-xs" style={{ color: CREAM_DIM }}>Loading random rolls…</span>
        </div>
      ) : decks.length === 0 ? (
        <div className="border border-dashed p-12 mt-6 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          No rolls shared yet. Hit Roll a deck on the home page — your build can be the first.
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-dashed p-12 mt-6 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          No rolls match your filters. <button onClick={clearAll} className="underline hover:opacity-100" style={{ color: CREAM }}>Clear all →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l mt-6" style={{ borderColor: CREAM_FAINT }}>
          {visible.map((d) => (
            <RollCard key={d.id} deck={d} onImport={onImportFromGallery} onView={onViewDeck} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  search, setSearch,
  bracketFilter, setBracketFilter,
  colorFilter, setColorFilter,
  archetypeFilter, setArchetypeFilter,
  budgetFilter, setBudgetFilter,
  sort, setSort,
  hasFilter, onClear,
}) {
  return (
    <div className="border mt-6 p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center" style={{ borderColor: CREAM_FAINT, background: 'rgba(var(--ink-rgb),0.02)' }}>
      <div className="md:col-span-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search commander, @owner, or archetype..."
          className="w-full bg-transparent border px-3 py-2 focus:outline-none font-mono text-xs"
          style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--ink-rgb),0.02)' }}
        />
      </div>
      <div className="md:col-span-4 flex items-center gap-1.5">
        <span className="font-mono text-[9px] tracking-wider shrink-0" style={{ color: CREAM_DIM }}>BRACKET</span>
        {[1, 2, 3, 4, 5].map((b) => (
          <button
            key={b}
            onClick={() => setBracketFilter(bracketFilter === b ? null : b)}
            className="font-mono text-[10px] w-6 h-6 border transition"
            style={{
              borderColor: bracketFilter === b ? CREAM : CREAM_FAINT,
              color: bracketFilter === b ? CREAM : CREAM_DIM,
              background: bracketFilter === b ? 'rgba(var(--ink-rgb),0.08)' : 'transparent',
            }}
            title={`Bracket ${b}`}
          >
            {b}
          </button>
        ))}
      </div>
      <div className="md:col-span-3 flex items-center gap-1.5 justify-end">
        <span className="font-mono text-[9px] tracking-wider shrink-0" style={{ color: CREAM_DIM }}>COLOR</span>
        {['W', 'U', 'B', 'R', 'G', 'C'].map((c) => (
          <button
            key={c}
            onClick={() => setColorFilter(colorFilter === c ? null : c)}
            className="w-5 h-5 border transition flex items-center justify-center"
            style={{
              borderColor: colorFilter === c ? CREAM : CREAM_FAINT,
              background: colorFilter === c ? 'rgba(var(--ink-rgb),0.08)' : 'transparent',
            }}
            title={c === 'C' ? 'Colorless' : c}
          >
            <ManaSymbol sym={c} size="0.7em" />
          </button>
        ))}
      </div>
      <div className="md:col-span-6 flex items-center gap-2">
        <span className="font-mono text-[9px] tracking-wider shrink-0" style={{ color: CREAM_DIM }}>ARCHETYPE</span>
        <select
          value={archetypeFilter}
          onChange={(e) => setArchetypeFilter(e.target.value)}
          className="flex-1 bg-transparent border px-2 py-1.5 focus:outline-none font-mono text-xs"
          style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--ink-rgb),0.02)' }}
        >
          {ARCHETYPES.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </div>
      <div className="md:col-span-6 flex items-center gap-1.5" title="Budget tier in the roll's own currency">
        <span className="font-mono text-[9px] tracking-wider shrink-0" style={{ color: CREAM_DIM }}>BUDGET</span>
        <button
          onClick={() => setBudgetFilter(null)}
          className="font-mono text-[10px] px-2 py-0.5 border transition"
          style={{
            borderColor: budgetFilter == null ? CREAM : CREAM_FAINT,
            color: budgetFilter == null ? CREAM : CREAM_DIM,
            background: budgetFilter == null ? 'rgba(var(--ink-rgb),0.08)' : 'transparent',
          }}
        >
          any
        </button>
        {BUDGET_TIERS.map((t) => (
          <button
            key={t.id}
            onClick={() => setBudgetFilter(budgetFilter === t.id ? null : t.id)}
            className="font-mono text-[10px] px-2 py-0.5 border transition"
            style={{
              borderColor: budgetFilter === t.id ? CREAM : CREAM_FAINT,
              color: budgetFilter === t.id ? CREAM : CREAM_DIM,
              background: budgetFilter === t.id ? 'rgba(var(--ink-rgb),0.08)' : 'transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="md:col-span-12 flex items-center justify-between flex-wrap gap-2 pt-1 border-t mt-1" style={{ borderColor: CREAM_FAINT }}>
        <div className="flex items-center flex-wrap gap-2">
          <span className="font-mono text-[9px] tracking-wider" style={{ color: CREAM_DIM }}>SORT</span>
          {[
            { id: 'recent', label: 'recent' },
            { id: 'commander', label: 'commander' },
            { id: 'bracket', label: 'bracket' },
            { id: 'budget-low', label: 'budget ↑' },
            { id: 'budget-high', label: 'budget ↓' },
            { id: 'archetype', label: 'archetype' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className="font-mono text-[10px] px-2 py-0.5 border transition"
              style={{
                borderColor: sort === s.id ? CREAM : CREAM_FAINT,
                color: sort === s.id ? CREAM : CREAM_DIM,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        {hasFilter && (
          <button
            onClick={onClear}
            className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100 transition"
            style={{ color: CREAM_DIM }}
          >
            Clear ×
          </button>
        )}
      </div>
    </div>
  );
}
