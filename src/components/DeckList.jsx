import React, { useState, useMemo, useEffect } from 'react';
import { Trash2, Crown, Copy, Upload, Calculator, Dices, Search } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, ACCENT } from '../theme.js';
import { pad } from '../lib/utils.js';
import { cardImageUrl, resolveScryfallUrl, extractDroppedScryfallUrl } from '../lib/scryfall.js';
import { assessBracket } from '../lib/analyzers.js';
import { computeHealth } from '../lib/health.js';
import { deckTotalPrice, formatPrice, isConverted } from '../lib/pricing.js';
import { loadSettings } from '../lib/settings.js';
import { aggregateStats } from '../lib/stats.js';
import { ManaSymbol } from './ManaCost.jsx';
import { VersionChip } from './UI.jsx';
import { ImportDeckModal, RandomDeckModal } from './Modals.jsx';
import { GalleryView } from './GalleryView.jsx';
import { RandomRollsView } from './RandomRollsView.jsx';
import { loadCollection, addToCollection } from '../lib/collection.js';
import { ScryfallSearchPanel, SCRYFALL_DRAG_MIME } from './ScryfallSearchPanel.jsx';

export function DeckListView({ decks, onSelect, onCreate, onDelete, onDuplicate, onImport, onBackup, onSettings, onProfile, onCollection, user, cloudEnabled, onSignIn, onSignOut, onImportFromGallery, onViewGalleryDeck, onRandomBuild }) {
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showRandom, setShowRandom] = useState(false);
  const [showScryfall, setShowScryfall] = useState(false);
  const [collection, setCollection] = useState(null);

  useEffect(() => {
    loadCollection().then(setCollection);
  }, [user?.id]);
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
      {/* Top nav — separate mobile + desktop branches. Mobile uses a
          vertical stack (logo + chip, then a stats row, then an auth
          row) with explicit borders. Desktop keeps the 5-col grid. */}
      <nav className="border-b mt-6" style={{ borderColor: CREAM_FAINT }}>
        {/* Mobile */}
        <div className="md:hidden">
          <div className="flex items-start justify-between p-5">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="text-left hover:opacity-80 transition"
              title="Vault — home"
            >
              <div className="font-serif text-3xl font-black leading-[0.9] tracking-wider" style={{ color: CREAM }}>
                VAULT
              </div>
              <div className="font-serif text-[10px] tracking-[0.35em] uppercase mt-1.5" style={{ color: CREAM_DIM }}>
                Deck · Builder
              </div>
            </button>
            <VersionChip version={__APP_VERSION__} align="right" />
          </div>
          <div
            className="border-t flex items-center justify-between px-5 py-3 text-[10px] tracking-[0.3em] uppercase font-serif"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            <span>Decks · {pad(decks.length)}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Cards · {pad(totalCards, 4)}</span>
          </div>
          <div
            className="border-t flex items-center justify-between px-5 py-3 text-[10px] tracking-[0.3em] uppercase font-serif"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            {user ? (
              <>
                <button
                  onClick={onProfile}
                  className="truncate min-w-0 hover:opacity-100 text-left"
                  style={{ color: CREAM_DIM }}
                  title="View profile"
                >
                  Cloud · <span style={{ color: CREAM }}>{user.email?.split('@')[0]}</span>
                </button>
                <button onClick={onSignOut} className="hover:opacity-100 shrink-0 ml-3" style={{ color: CREAM_DIM }}>
                  Sign out
                </button>
              </>
            ) : cloudEnabled ? (
              <button onClick={onSignIn} className="hover:opacity-100 mx-auto" style={{ color: CREAM_DIM }}>
                Sign in →
              </button>
            ) : (
              <span className="mx-auto">Local</span>
            )}
          </div>
        </div>

        {/* Desktop */}
        <div className="hidden md:grid md:grid-cols-5">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="p-5 border-r text-left hover:opacity-80 transition"
            style={{ borderColor: CREAM_FAINT }}
            title="Vault — home"
          >
            <div className="font-serif text-3xl font-black leading-[0.9] tracking-wider" style={{ color: CREAM }}>
              VAULT
            </div>
            <div className="font-serif text-[10px] tracking-[0.35em] uppercase mt-1.5" style={{ color: CREAM_DIM }}>
              Deck · Builder
            </div>
          </button>
          <div
            className="flex items-center px-5 border-r text-[11px] tracking-[0.3em] uppercase font-serif"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            Decks · {pad(decks.length)}
          </div>
          <div
            className="flex items-center px-5 border-r text-[11px] tracking-[0.3em] uppercase font-serif"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            Cards · {pad(totalCards, 4)}
          </div>
          <div
            className="flex items-center px-5 border-r text-[11px] tracking-[0.3em] uppercase font-serif min-w-0"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            {user ? (
              <button
                onClick={onProfile}
                className="truncate hover:opacity-100 text-left"
                style={{ color: CREAM_DIM }}
                title="View profile"
              >
                Cloud · <span style={{ color: CREAM }}>{user.email?.split('@')[0]}</span>
              </button>
            ) : cloudEnabled ? (
              <button onClick={onSignIn} className="hover:opacity-100" style={{ color: CREAM_DIM }}>
                Sign in →
              </button>
            ) : (
              <span>Local</span>
            )}
          </div>
          <div
            className="flex items-center justify-end px-5 text-[11px] tracking-[0.3em] uppercase font-serif gap-4"
            style={{ color: CREAM_DIM }}
          >
            {user && (
              <>
                <button onClick={onSignOut} className="hover:opacity-100" style={{ color: CREAM_DIM }}>
                  Sign out
                </button>
                <span style={{ opacity: 0.4 }}>·</span>
              </>
            )}
            <VersionChip version={__APP_VERSION__} align="right" />
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="text-center py-20 md:py-32 fade-up">
        <div className="text-[10px] md:text-[11px] tracking-[0.45em] uppercase mb-8 font-serif" style={{ color: CREAM_DIM }}>
          For Commander · Open Source
        </div>
        <h1
          className="font-serif font-black uppercase leading-[0.92] tracking-tight"
          style={{ color: CREAM, fontSize: 'clamp(2.5rem, 7vw, 5rem)' }}
        >
          From 200 maybes
          <br />
          to 99 keepers.
        </h1>
        <p className="max-w-xl mx-auto mt-10 font-serif text-base md:text-lg leading-relaxed" style={{ color: CREAM_DIM }}>
          Every card auto-tagged. Every deck archetype-classified, bracket-scored, and playtested before you sleeve it. Recommends what to add, flags what to cut, simulates 1,000 openings so you know your odds.
        </p>
      </div>

      {/* Numbered create / import / roll / search section */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-t border-l fade-up"
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
        <div className="border-r border-b p-6 md:p-8" style={{ borderColor: CREAM_FAINT }}>
          <div className="flex items-baseline justify-between mb-4">
            <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
              <span style={{ color: CREAM_DIM }}>3.</span> Roll a deck
            </div>
            <button
              onClick={() => setShowRandom(true)}
              className="font-serif text-[10px] tracking-[0.35em] uppercase hover:opacity-100 transition"
              style={{ color: CREAM_DIM }}
            >
              Roll →
            </button>
          </div>
          <button
            onClick={() => setShowRandom(true)}
            className="w-full border px-4 py-3 text-left flex items-center gap-3"
            style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.03)' }}
          >
            <Dices className="w-4 h-4" style={{ color: CREAM_DIM }} />
            <span className="font-mono text-sm" style={{ color: CREAM_DIM }}>
              random commander + auto-build...
            </span>
          </button>
        </div>
        <div className="border-r border-b p-6 md:p-8" style={{ borderColor: CREAM_FAINT }}>
          <div className="flex items-baseline justify-between mb-4">
            <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
              <span style={{ color: CREAM_DIM }}>4.</span> Search Scryfall
            </div>
            <button
              onClick={() => setShowScryfall(true)}
              className="font-serif text-[10px] tracking-[0.35em] uppercase hover:opacity-100 transition"
              style={{ color: CREAM_DIM }}
            >
              Open →
            </button>
          </div>
          <button
            onClick={() => setShowScryfall(true)}
            className="w-full border px-4 py-3 text-left flex items-center gap-3"
            style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.03)' }}
          >
            <Search className="w-4 h-4" style={{ color: CREAM_DIM }} />
            <span className="font-mono text-sm" style={{ color: CREAM_DIM }}>
              find a card · drag to Vault or deck...
            </span>
          </button>
        </div>
      </div>

      {/* Archive — sign-in gated. When signed out, show a CTA strip
          instead of the dashboard + deck grid so the landing reads as
          marketing until the user has an account. */}
      {!user && cloudEnabled && (
        <div
          className="mt-12 border p-8 md:p-10 text-center fade-up"
          style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)', animationDelay: '180ms' }}
        >
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold mb-2" style={{ color: CREAM }}>
            Sign in to keep your archive
          </div>
          <p className="font-serif text-sm italic max-w-md mx-auto mb-5" style={{ color: CREAM_DIM }}>
            Your decks, stats, and history sync to your account and follow you across devices. Google sign-in or magic link — no password.
          </p>
          <button
            onClick={onSignIn}
            className="font-serif text-[11px] tracking-[0.3em] uppercase border px-5 py-2 hover:opacity-100"
            style={{ borderColor: CREAM_FAINT, color: CREAM }}
          >
            Sign in →
          </button>
        </div>
      )}

      {user && decks.length >= 2 && <ArchiveDashboard decks={decks} collection={collection} />}

      {/* Stored decks — only shown when signed in. */}
      {user && (
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
                  <DeckCardMeta deck={d} searchMatch={cardMatchFor(d, search)} collection={collection} />
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
      )}

      <VaultSection
        collection={collection || {}}
        onOpen={onCollection}
        onSearch={() => setShowScryfall(true)}
        onAddCard={async (card) => {
          await addToCollection(card.name, 1);
          loadCollection().then(setCollection);
        }}
      />

      {showScryfall && (
        <ScryfallSearchPanel
          open={showScryfall}
          onClose={() => setShowScryfall(false)}
          addLabel="Add to Vault"
          onAdd={async (card) => {
            await addToCollection(card.name, 1);
            loadCollection().then(setCollection);
          }}
        />
      )}

      {cloudEnabled && <RandomRollsView onImportFromGallery={onImportFromGallery} onViewDeck={onViewGalleryDeck} />}
      {cloudEnabled && <GalleryView onImportFromGallery={onImportFromGallery} onViewDeck={onViewGalleryDeck} />}

      {/* Footer — stacks on mobile so the version chip + Backup + Settings
          don't overflow into a single squashed row. */}
      <div
        className="border-t mt-20 py-6 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 font-serif text-[10px] tracking-[0.4em] uppercase"
        style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
      >
        <span className="flex items-center gap-2">
          <span>Vault ·</span>
          <VersionChip version={__APP_VERSION__} align="left" />
          <span>· MIT</span>
        </span>
        <div className="flex items-center gap-3">
          {onBackup && (
            <button onClick={onBackup} className="hover:opacity-100 transition" style={{ color: CREAM_DIM }}>
              Backup ↓
            </button>
          )}
          {onBackup && onSettings && <span style={{ opacity: 0.4 }}>·</span>}
          {onSettings && (
            <button onClick={onSettings} className="hover:opacity-100 transition" style={{ color: CREAM_DIM }}>
              Settings
            </button>
          )}
          {user && onProfile && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <button onClick={onProfile} className="hover:opacity-100 transition" style={{ color: CREAM_DIM }}>
                Profile
              </button>
            </>
          )}
          {onCollection && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <button onClick={onCollection} className="hover:opacity-100 transition" style={{ color: CREAM_DIM }}>
                Vault
              </button>
            </>
          )}
        </div>
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
      {showRandom && (
        <RandomDeckModal
          onClose={() => setShowRandom(false)}
          canShare={!!user}
          onBuild={(payload) => {
            onRandomBuild?.(payload);
            setShowRandom(false);
          }}
        />
      )}
    </div>
  );
}

function ArchiveDashboard({ decks, collection }) {
  const currency = loadSettings().currency || 'usd';
  const stats = useMemo(() => aggregateStats(decks, currency, collection), [decks, currency, collection]);
  const maxBracket = Math.max(...stats.bracketHistogram, 1);
  const maxIdentity = Math.max(...stats.identityHistogram.map((x) => x.count), 1);
  const approx = stats.totalPriceUnpriced > 0 || isConverted(currency) ? '~' : '';
  const priceLabel = `${approx}${formatPrice(stats.totalPrice, currency)}`;
  const hasOwned = stats.totalOwned > 0;
  const priceSubParts = [];
  if (stats.totalPriceUnpriced > 0) priceSubParts.push(`${stats.totalPriceUnpriced} unpriced`);
  if (hasOwned) priceSubParts.push(`${approx}${formatPrice(stats.totalToBuy, currency)} to buy`);

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
        <DashStat label="Total value" value={priceLabel} sub={priceSubParts.length > 0 ? priceSubParts.join(' · ') : null} />
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

        {/* Identity combos (Mardu, Esper, Mono-Black etc.) — actually
            distinguishes a Mardu deck from an Esper deck instead of just
            counting individual colours across the whole archive. */}
        <div className="border" style={{ borderColor: CREAM_FAINT }}>
          <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            Color identities
          </div>
          <div className="p-4 space-y-2">
            {stats.identityHistogram.length === 0 ? (
              <div className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
                Set commanders to populate this chart.
              </div>
            ) : stats.identityHistogram.map((item) => {
              const pct = (item.count / maxIdentity) * 100;
              return (
                <div key={item.key} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4 flex items-center gap-1.5 min-w-0" style={{ fontSize: '0.85rem' }}>
                    <span className="flex items-center gap-1 shrink-0">
                      {item.colors.length > 0
                        ? item.colors.map((c) => <ManaSymbol key={c} sym={c} size="0.85em" />)
                        : <ManaSymbol sym="C" size="0.85em" />}
                    </span>
                    <span className="font-serif text-xs truncate" style={{ color: CREAM }}>
                      {item.name}
                    </span>
                  </div>
                  <div className="col-span-6 h-2" style={{ background: 'rgba(243,231,201,0.08)' }}>
                    <div className="h-full" style={{ background: CREAM, opacity: 0.7, width: `${pct}%` }} />
                  </div>
                  <div className="col-span-2 text-right font-mono text-[10px]" style={{ color: CREAM }}>
                    {item.count}
                  </div>
                </div>
              );
            })}
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

function DeckCardMeta({ deck, searchMatch, collection }) {
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
        const currency = loadSettings().currency || 'usd';
        const price = deckTotalPrice(deck, currency, collection);
        if (price.priced === 0) return null;
        // ~ means either some cards are unpriced OR the currency is
        // client-side converted (GBP from USD).
        const approx = price.unpriced > 0 || isConverted(currency) ? '~' : '';
        const showOwnedSplit = price.ownedTotal > 0;
        return (
          <>
            <span>·</span>
            <span title={price.unpriced > 0 ? `${price.unpriced} card(s) unpriced` : 'All cards priced'}>
              {approx}{formatPrice(price.total, currency)}
              {showOwnedSplit && (
                <span style={{ color: '#a3c98a' }} title={`${price.ownedCount} card(s) already in your collection`}>
                  {' '}({formatPrice(price.toBuy, currency)} to buy)
                </span>
              )}
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

/**
 * Vault section on the landing page. Summarises the user's owned-
 * card inventory, opens the search panel, and acts as a drop zone
 * for the Scryfall drag-and-drop flow. Full management still lives
 * in the CollectionModal opened via 'Manage Vault →'.
 */
function VaultSection({ collection, onOpen, onSearch, onAddCard }) {
  const [dragOver, setDragOver] = useState(false);
  const entries = Object.values(collection || {});
  const unique = entries.length;
  const total = entries.reduce((s, e) => s + (e.quantity || 0), 0);
  const recent = entries
    .slice()
    .sort((a, b) => (b.added_at || 0) - (a.added_at || 0))
    .slice(0, 8);

  // Accept any external drag — we'll figure out at drop time whether
  // we can resolve it to a card. Some browsers (Safari, Firefox in
  // some configs) hide the data types from dragover for cross-origin
  // drags so checking types here can silently reject valid drops.
  // Always preventDefault and read the payload on drop.
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    // 1. Internal drag from our search panel — fastest path.
    const raw = e.dataTransfer.getData(SCRYFALL_DRAG_MIME);
    if (raw) {
      try {
        const payload = JSON.parse(raw);
        if (payload?.kind === 'vault:card' && payload.card?.scryfall) {
          onAddCard?.(payload.card.scryfall);
          return;
        }
      } catch {}
    }
    // 2. External drag from scryfall.com — try every data source
    //    the browser might have stashed the URL in.
    const url = extractDroppedScryfallUrl(e.dataTransfer);
    if (!url) return;
    const card = await resolveScryfallUrl(url);
    if (card) onAddCard?.(card);
  };

  return (
    <div className="mt-12 fade-up" style={{ animationDelay: '260ms' }}>
      <div className="flex items-baseline gap-4 mb-3">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          Your Vault
        </div>
        <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          {pad(unique)} unique · {pad(total)} total
        </div>
      </div>
      <div
        className="border p-5 flex flex-col md:flex-row gap-4 md:items-center transition-all"
        style={{
          borderColor: dragOver ? CREAM : CREAM_FAINT,
          background: dragOver ? 'rgba(243,231,201,0.08)' : 'rgba(243,231,201,0.02)',
          borderStyle: dragOver ? 'dashed' : 'solid',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex-1 min-w-0">
          <p className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
            {dragOver
              ? 'Drop to add this card to your Vault.'
              : (unique === 0
                  ? 'Cards you actually own. Drag a card image straight from a scryfall.com tab onto this box, search via the panel, scan with the webcam, or paste a list. The deck roller can then build only from cards you own.'
                  : 'Cards you actually own. Drag in cards from scryfall.com (just drop the image onto this box) or open Manage Vault to scan / paste / edit.')}
          </p>
          {recent.length > 0 && (
            <div className="font-mono text-[10px] mt-3 truncate" style={{ color: CREAM_DIM }}>
              Recently added: <span style={{ color: CREAM }}>{recent.map((e) => e.name).join(', ')}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0 self-start md:self-auto">
          {onSearch && (
            <button
              onClick={onSearch}
              className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2"
              style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
              title="Search Scryfall — drag results to add"
            >
              Search →
            </button>
          )}
          <button
            onClick={onOpen}
            className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2"
            style={{ borderColor: CREAM, color: CREAM, background: 'rgba(243,231,201,0.06)' }}
          >
            Manage Vault →
          </button>
        </div>
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
