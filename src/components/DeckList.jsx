import React, { useState, useMemo } from 'react';
import { Trash2, Crown, Copy, Upload, Calculator } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, ACCENT } from '../theme.js';
import { pad } from '../lib/utils.js';
import { cardImageUrl } from '../lib/scryfall.js';
import { assessBracket } from '../lib/analyzers.js';
import { computeHealth } from '../lib/health.js';
import { deckTotalPrice, formatPrice } from '../lib/pricing.js';
import { aggregateStats } from '../lib/stats.js';
import { ManaSymbol } from './ManaCost.jsx';
import { ImportDeckModal } from './Modals.jsx';
import { GalleryView } from './GalleryView.jsx';

export function DeckListView({ decks, onSelect, onCreate, onDelete, onDuplicate, onImport, onBackup, onSettings, user, cloudEnabled, onSignIn, onSignOut, onImportFromGallery }) {
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [bracketFilter, setBracketFilter] = useState(null); // 1..5
  const [colorFilter, setColorFilter] = useState(null);     // 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
  const [sortBy, setSortBy] = useState('recent');           // recent | name | bracket | health

  // Compute filtered + sorted deck list. Memoised on inputs so editing
  // unrelated state doesn't recompute.
  const visibleDecks = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = decks.filter((d) => {
      if (q) {
        const nameHit = d.name.toLowerCase().includes(q);
        const cmdrHit = d.commander?.name?.toLowerCase().includes(q);
        // Card-content match: q of 3+ chars also matches card names within
        // the deck. Short queries (<3 chars) skip this to keep results
        // sane on common substrings like "or", "an", etc.
        const cardHit = q.length >= 3 && d.cards.some((c) => c.name?.toLowerCase().includes(q));
        if (!nameHit && !cmdrHit && !cardHit) return false;
      }
      if (bracketFilter && d.cards.length > 0) {
        if (assessBracket(d).bracket !== bracketFilter) return false;
      }
      if (colorFilter) {
        const id = d.commander?.color_identity || [];
        if (colorFilter === 'C') {
          if (id.length !== 0) return false;
        } else if (!id.includes(colorFilter)) {
          return false;
        }
      }
      return true;
    });
    if (sortBy === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'bracket') {
      list = list.slice().sort((a, b) => {
        const ab = a.cards.length ? assessBracket(a).bracket : 0;
        const bb = b.cards.length ? assessBracket(b).bracket : 0;
        return bb - ab;
      });
    }
    else if (sortBy === 'health') {
      list = list.slice().sort((a, b) => {
        const ah = a.cards.length ? computeHealth(a).score : 0;
        const bh = b.cards.length ? computeHealth(b).score : 0;
        return bh - ah;
      });
    }
    // 'recent' is the default storage order — already sorted by updated desc.
    return list;
  }, [decks, search, bracketFilter, colorFilter, sortBy]);

  const hasFilter = !!(search.trim() || bracketFilter || colorFilter);

  const totalCards = decks.reduce((s, d) => s + d.cards.reduce((a, c) => a + c.count, 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8">
      {/* Top nav grid */}
      <nav className="grid grid-cols-2 md:grid-cols-5 border-b mt-6" style={{ borderColor: CREAM_FAINT }}>
        <div className="p-5 md:border-r" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-3xl font-black leading-[0.9] tracking-wider" style={{ color: CREAM }}>
            VAULT
          </div>
          <div className="font-serif text-[10px] tracking-[0.35em] uppercase mt-1.5" style={{ color: CREAM_DIM }}>
            Deck · Builder
          </div>
        </div>
        <div
          className="hidden md:flex items-center px-5 border-r text-[11px] tracking-[0.3em] uppercase font-serif"
          style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
        >
          Decks · {pad(decks.length)}
        </div>
        <div
          className="hidden md:flex items-center px-5 border-r text-[11px] tracking-[0.3em] uppercase font-serif"
          style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
        >
          Cards · {pad(totalCards, 4)}
        </div>
        <div
          className="hidden md:flex items-center px-5 border-r text-[11px] tracking-[0.3em] uppercase font-serif"
          style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
        >
          {user ? (
            <span className="truncate">
              Cloud · <span style={{ color: CREAM }} title={user.email}>{user.email?.split('@')[0]}</span>
            </span>
          ) : cloudEnabled ? (
            <button
              onClick={onSignIn}
              className="hover:opacity-100"
              style={{ color: CREAM_DIM }}
            >
              Sign in →
            </button>
          ) : (
            <span>Local</span>
          )}
        </div>
        <div
          className="hidden md:flex items-center justify-end px-5 text-[11px] tracking-[0.3em] uppercase font-serif gap-3"
          style={{ color: CREAM_DIM }}
        >
          {user && (
            <button onClick={onSignOut} className="hover:opacity-100" style={{ color: CREAM_DIM }}>
              Sign out
            </button>
          )}
          <span>v{__APP_VERSION__}</span>
        </div>
      </nav>

      {/* Hero */}
      <div className="text-center py-20 md:py-32 fade-up">
        <div className="text-[10px] md:text-[11px] tracking-[0.45em] uppercase mb-8 font-serif" style={{ color: CREAM_DIM }}>
          Open Source · Auto-Tag Engine
        </div>
        <h1
          className="font-serif font-black uppercase leading-[0.92] tracking-tight"
          style={{ color: CREAM, fontSize: 'clamp(2.5rem, 7vw, 5rem)' }}
        >
          A deck builder
          <br />
          that remembers
          <br />
          every card.
        </h1>
        <p className="max-w-xl mx-auto mt-10 font-serif text-base md:text-lg leading-relaxed" style={{ color: CREAM_DIM }}>
          Auto-tagged synergy packages, bracket assessment, game-stage analysis, and hypergeometric probability — for the decks you actually play.
        </p>
      </div>

      {/* Numbered create / import section */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 border-t border-l fade-up"
        style={{ borderColor: CREAM_FAINT, animationDelay: '120ms' }}
      >
        <div className="border-r border-b p-6 md:p-8" style={{ borderColor: CREAM_FAINT }}>
          <div className="flex items-baseline justify-between mb-4">
            <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
              <span style={{ color: CREAM_DIM }}>1.</span> New deck
            </div>
            <button
              onClick={() => {
                if (name.trim()) {
                  onCreate(name);
                  setName('');
                }
              }}
              disabled={!name.trim()}
              className="font-serif text-[10px] tracking-[0.35em] uppercase hover:opacity-100 transition disabled:opacity-30"
              style={{ color: CREAM_DIM }}
            >
              Create →
            </button>
          </div>
          <div className="border px-4 py-3" style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.03)' }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="enter deck name..."
              className="w-full bg-transparent border-none focus:outline-none font-mono text-sm"
              style={{ color: CREAM }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) {
                  onCreate(name);
                  setName('');
                }
              }}
            />
          </div>
        </div>
        <div className="border-r border-b p-6 md:p-8" style={{ borderColor: CREAM_FAINT }}>
          <div className="flex items-baseline justify-between mb-4">
            <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
              <span style={{ color: CREAM_DIM }}>2.</span> Import existing
            </div>
            <button
              onClick={() => setShowImport(true)}
              className="font-serif text-[10px] tracking-[0.35em] uppercase hover:opacity-100 transition"
              style={{ color: CREAM_DIM }}
            >
              Paste →
            </button>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="w-full border px-4 py-3 text-left flex items-center gap-3"
            style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.03)' }}
          >
            <Upload className="w-4 h-4" style={{ color: CREAM_DIM }} />
            <span className="font-mono text-sm" style={{ color: CREAM_DIM }}>
              paste a Moxfield-format decklist...
            </span>
          </button>
        </div>
      </div>

      {decks.length >= 2 && <ArchiveDashboard decks={decks} />}

      {/* Stored decks */}
      <div className="mt-12 fade-up" style={{ animationDelay: '240ms' }}>
        <div className="flex items-baseline gap-4 mb-3">
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            <span style={{ color: CREAM_DIM }}>3.</span> Archive
          </div>
          <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }}></div>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            {hasFilter ? `${pad(visibleDecks.length)} of ${pad(decks.length)}` : `${pad(decks.length)} on file`}
          </div>
        </div>

        {decks.length >= 3 && (
          <div className="border mb-4 p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center" style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}>
            <div className="md:col-span-5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search deck, commander, or card..."
                className="w-full bg-transparent border px-3 py-2 focus:outline-none font-mono text-xs"
                style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
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
                    background: bracketFilter === b ? 'rgba(243,231,201,0.08)' : 'transparent',
                  }}
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
                    background: colorFilter === c ? 'rgba(243,231,201,0.08)' : 'transparent',
                  }}
                  title={c}
                >
                  <ManaSymbol sym={c} size="0.7em" />
                </button>
              ))}
            </div>
            <div className="md:col-span-12 flex items-center justify-between pt-1 border-t mt-1" style={{ borderColor: CREAM_FAINT }}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] tracking-wider" style={{ color: CREAM_DIM }}>SORT</span>
                {[
                  { id: 'recent', label: 'recent' },
                  { id: 'name', label: 'name' },
                  { id: 'bracket', label: 'bracket' },
                  { id: 'health', label: 'health' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSortBy(s.id)}
                    className="font-mono text-[10px] px-2 py-0.5 border transition"
                    style={{
                      borderColor: sortBy === s.id ? CREAM : CREAM_FAINT,
                      color: sortBy === s.id ? CREAM : CREAM_DIM,
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {hasFilter && (
                <button
                  onClick={() => { setSearch(''); setBracketFilter(null); setColorFilter(null); }}
                  className="font-serif text-[10px] tracking-[0.3em] uppercase"
                  style={{ color: CREAM_DIM }}
                >
                  Clear ×
                </button>
              )}
            </div>
          </div>
        )}

        {decks.length === 0 ? (
          <EmptyArchive onCreate={onCreate} onImport={() => setShowImport(true)} />
        ) : visibleDecks.length === 0 ? (
          <div
            className="border border-dashed p-16 text-center font-serif text-sm"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            No decks match those filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
            {visibleDecks.map((d, idx) => (
              <div
                key={d.id}
                className="group border-r border-b p-6 cursor-pointer transition fade-up flex items-start gap-5"
                style={{ borderColor: CREAM_FAINT, animationDelay: `${300 + idx * 40}ms` }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => onSelect(d.id)}
              >
                {d.commander ? (
                  <img
                    src={cardImageUrl(d.commander, 'small')}
                    className="w-14 h-20 object-cover shrink-0"
                    style={{ borderColor: CREAM_FAINT, borderWidth: 1 }}
                    onError={(e) => (e.target.style.display = 'none')}
                  />
                ) : (
                  <div
                    className="w-14 h-20 flex items-center justify-center shrink-0"
                    style={{ borderColor: CREAM_FAINT, borderWidth: 1 }}
                  >
                    <Crown className="w-4 h-4" style={{ color: CREAM_DIM }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
                      № {pad(idx + 1)}
                    </div>
                    {confirmDelete === d.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            onDelete(d.id);
                            setConfirmDelete(null);
                          }}
                          className="text-[10px] tracking-[0.3em] uppercase font-serif"
                          style={{ color: ACCENT }}
                        >
                          Confirm
                        </button>
                        <span style={{ color: CREAM_DIM }}>·</span>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-[10px] tracking-[0.3em] uppercase font-serif"
                          style={{ color: CREAM_DIM }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition">
                        {d.cards.length >= 7 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(d.id, 'probs');
                            }}
                            style={{ color: CREAM_DIM }}
                            title="Test opening hand → opens Probability tab"
                          >
                            <Calculator className="w-3.5 h-3.5 hover:opacity-100" />
                          </button>
                        )}
                        {onDuplicate && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicate(d);
                            }}
                            style={{ color: CREAM_DIM }}
                            title="Duplicate"
                          >
                            <Copy className="w-3.5 h-3.5 hover:opacity-100" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(d.id);
                          }}
                          style={{ color: CREAM_DIM }}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5 hover:text-red-400" />
                        </button>
                      </div>
                    )}
                  </div>
                  <h3
                    className="font-serif text-xl md:text-2xl font-bold uppercase tracking-tight mt-1 leading-tight"
                    style={{ color: CREAM }}
                  >
                    {d.name}
                  </h3>
                  <div className="font-serif text-sm mt-2 italic" style={{ color: CREAM_DIM }}>
                    {d.commander?.name || 'No commander set'}
                  </div>
                  <DeckCardMeta deck={d} searchMatch={cardMatchFor(d, search)} />
                  {d.commander?.color_identity?.length > 0 && (
                    <div className="mt-2 flex items-center gap-1" style={{ fontSize: '0.9rem' }}>
                      {d.commander.color_identity.map((c) => (
                        <ManaSymbol key={c} sym={c} size="0.9em" title={c} />
                      ))}
                      {d.commander.color_identity.length === 0 && (
                        <ManaSymbol sym="C" size="0.9em" title="Colorless" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {cloudEnabled && <GalleryView onImportFromGallery={onImportFromGallery} />}

      <div
        className="border-t mt-20 py-6 flex items-center justify-center gap-4 font-serif text-[10px] tracking-[0.4em] uppercase"
        style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
      >
        <span>Vault · v{__APP_VERSION__} · MIT</span>
        {onBackup && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <button onClick={onBackup} className="hover:opacity-100 transition" style={{ color: CREAM_DIM }}>
              Backup ↓
            </button>
          </>
        )}
        {onSettings && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <button onClick={onSettings} className="hover:opacity-100 transition" style={{ color: CREAM_DIM }}>
              Settings
            </button>
          </>
        )}
      </div>

      {showImport && (
        <ImportDeckModal
          onClose={() => setShowImport(false)}
          onImport={(payload) => {
            onImport(payload);
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}

function ArchiveDashboard({ decks }) {
  const stats = useMemo(() => aggregateStats(decks), [decks]);
  const maxBracket = Math.max(...stats.bracketHistogram, 1);
  const totalColors = Object.values(stats.colorHistogram).reduce((s, n) => s + n, 0);
  const priceLabel = stats.totalPriceUnpriced > 0 ? `~${formatPrice(stats.totalPrice)}` : formatPrice(stats.totalPrice);

  return (
    <div className="mt-12 fade-up" style={{ animationDelay: '180ms' }}>
      <div className="flex items-baseline gap-4 mb-3">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          Archive Stats
        </div>
        <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }}></div>
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          across {pad(stats.deckCount)} decks
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
        <DashStat label="Decks" value={stats.deckCount} />
        <DashStat label="Cards" value={stats.cardCount} />
        <DashStat label="Total value" value={priceLabel} sub={stats.totalPriceUnpriced > 0 ? `${stats.totalPriceUnpriced} unpriced` : null} />
        <DashStat label="Avg health" value={stats.avgHealth || '—'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        {/* Bracket distribution */}
        <div className="border" style={{ borderColor: CREAM_FAINT }}>
          <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            Bracket distribution
          </div>
          <div className="p-4 flex items-end gap-2" style={{ height: '110px' }}>
            {stats.bracketHistogram.map((n, i) => {
              const h = n > 0 ? Math.max((n / maxBracket) * 80, 4) : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="font-mono text-[10px] mb-1" style={{ color: CREAM_DIM }}>{n}</span>
                  <div className="w-full" style={{ background: CREAM, opacity: 0.75, height: `${h}px` }}></div>
                  <span className="font-mono text-[10px] mt-1.5" style={{ color: CREAM_DIM }}>{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Color usage */}
        <div className="border" style={{ borderColor: CREAM_FAINT }}>
          <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            Colors played
          </div>
          <div className="p-4 space-y-2">
            {['W', 'U', 'B', 'R', 'G', 'C'].filter((c) => stats.colorHistogram[c] > 0).map((c) => {
              const n = stats.colorHistogram[c];
              const pct = totalColors > 0 ? (n / totalColors) * 100 : 0;
              return (
                <div key={c} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-1 flex items-center" style={{ fontSize: '1rem' }}>
                    <ManaSymbol sym={c} size="1em" />
                  </div>
                  <div className="col-span-9 h-1.5 border" style={{ borderColor: CREAM_FAINT }}>
                    <div className="h-full" style={{ background: CREAM, opacity: 0.7, width: `${pct}%` }}></div>
                  </div>
                  <div className="col-span-2 text-right font-mono text-[10px]" style={{ color: CREAM }}>
                    {n} deck{n === 1 ? '' : 's'}
                  </div>
                </div>
              );
            })}
            {totalColors === 0 && (
              <div className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
                Set commanders to populate this chart.
              </div>
            )}
          </div>
        </div>
      </div>

      {stats.archetypeHistogram.length > 0 && (
        <div className="border mt-3" style={{ borderColor: CREAM_FAINT }}>
          <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            Top archetypes
          </div>
          <div className="p-4 flex flex-wrap gap-x-5 gap-y-1.5">
            {stats.archetypeHistogram.slice(0, 8).map((a) => (
              <div key={a.name} className="flex items-baseline gap-1.5">
                <span className="font-serif text-sm" style={{ color: CREAM }}>{a.name}</span>
                <span className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>×{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DashStat({ label, value, sub }) {
  return (
    <div className="border-r border-b p-4" style={{ borderColor: CREAM_FAINT }}>
      <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
        {label}
      </div>
      <div className="font-serif font-black mt-1" style={{ color: CREAM, fontSize: '1.6rem' }}>
        {value}
      </div>
      {sub && (
        <div className="font-mono text-[10px] mt-1" style={{ color: CREAM_DIM }}>{sub}</div>
      )}
    </div>
  );
}

/**
 * Find the first card in the deck whose name matches the search query.
 * Returns null when no search is active, the search is too short, or the
 * match is on the deck name / commander (no card-content hit to surface).
 */
function cardMatchFor(deck, search) {
  const q = (search || '').trim().toLowerCase();
  if (q.length < 3) return null;
  if (deck.name?.toLowerCase().includes(q)) return null;
  if (deck.commander?.name?.toLowerCase().includes(q)) return null;
  return deck.cards.find((c) => c.name?.toLowerCase().includes(q))?.name || null;
}

function DeckCardMeta({ deck, searchMatch }) {
  const total = deck.cards.reduce((s, c) => s + c.count, 0);
  const tagCount = Object.keys(
    deck.cards.reduce((m, c) => {
      (c.tags || []).forEach((t) => (m[t] = 1));
      return m;
    }, {})
  ).length;
  const hasCards = deck.cards.length > 0;
  const bracket = hasCards ? assessBracket(deck).bracket : null;
  const health = hasCards ? computeHealth(deck) : null;
  return (
    <div className="font-mono text-[10px] mt-3 tracking-wider flex items-center gap-3 flex-wrap" style={{ color: CREAM_DIM }}>
      <span>{pad(total)} cards</span>
      <span>·</span>
      <span>{tagCount} tags</span>
      {bracket && (
        <>
          <span>·</span>
          <span style={{ color: CREAM }}>Bracket {bracket}</span>
        </>
      )}
      {health && !health.empty && (
        <>
          <span>·</span>
          <span style={{ color: healthColor(health.score) }} title={`Grade ${health.grade}`}>
            Health {health.score}
          </span>
        </>
      )}
      {hasCards && (() => {
        const price = deckTotalPrice(deck);
        if (price.priced === 0) return null;
        const approx = price.unpriced > 0 ? '~' : '';
        return (
          <>
            <span>·</span>
            <span title={price.unpriced > 0 ? `${price.unpriced} card(s) unpriced` : 'All cards priced'}>
              {approx}{formatPrice(price.total)}
            </span>
          </>
        );
      })()}
      {searchMatch && (
        <>
          <span>·</span>
          <span style={{ color: CREAM }} title={`Match from search: ${searchMatch}`}>
            ⇢ {searchMatch}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * First-time-user onboarding. Shown when the archive is empty —
 * pitches three example commanders covering different archetypes
 * so a new user can click one and immediately see the tools work.
 */
function EmptyArchive({ onCreate, onImport }) {
  const examples = [
    { name: 'Edgar Markov',     archetype: 'Tribal · WBR · Vampires going wide' },
    { name: 'Atraxa, Praetors\' Voice', archetype: 'Counters · WUBG · Proliferate engine' },
    { name: 'Krenko, Mob Boss', archetype: 'Tribal · R · Goblin token swarm' },
  ];
  return (
    <div className="border border-dashed p-8 md:p-12" style={{ borderColor: CREAM_FAINT }}>
      <div className="text-center mb-8">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          Welcome to Vault
        </div>
        <p className="font-serif text-sm italic mt-2 max-w-lg mx-auto" style={{ color: CREAM_DIM }}>
          A deck builder for Magic Commander. Auto-tags every card by role, classifies your archetype, surfaces synergy hubs, recommends cuts and adds, simulates openers, and assesses bracket.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {examples.map((ex) => (
          <button
            key={ex.name}
            onClick={() => onCreate(ex.name)}
            className="border p-4 text-left transition"
            style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.06)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.02)')}
          >
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
              Start with
            </div>
            <div className="font-serif font-bold mt-1" style={{ color: CREAM, fontSize: '0.95rem' }}>
              {ex.name}
            </div>
            <div className="font-serif text-xs italic mt-1" style={{ color: CREAM_DIM }}>
              {ex.archetype}
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
        <div>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>1 · Pick a commander</div>
          <div className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
            Above, or in the editor.
          </div>
        </div>
        <div>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>2 · Add 99 cards</div>
          <div className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
            Bulk-paste a list, or let the Recs tab seed one from EDHREC.
          </div>
        </div>
        <div>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>3 · Analyse</div>
          <div className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
            Packages, Stages, Bracket, Probability — seven tabs of tools.
          </div>
        </div>
      </div>

      <div className="text-center mt-6">
        <button
          onClick={onImport}
          className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2"
          style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
        >
          or import an existing list →
        </button>
      </div>
    </div>
  );
}

function healthColor(score) {
  if (score >= 80) return '#a3c98a';
  if (score >= 65) return CREAM;
  if (score >= 50) return '#d8b35a';
  return ACCENT;
}
