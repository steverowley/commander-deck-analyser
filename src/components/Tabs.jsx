import React, { useState, useMemo, useEffect } from 'react';
import { Upload, BookOpen } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { pad, hypergeom } from '../lib/utils.js';
import { assessBracket } from '../lib/analyzers.js';
import { computeHealth } from '../lib/health.js';
import { buildStagePlans, synergyHubs, packageWeight, classifyArchetype } from '../lib/strategy.js';
import { BRACKETS } from '../lib/constants.js';
import { addCardsToDeck, safeAddCards, setCardCount, removeCardFromDeck, setCardTags, setCardNote, setStrictIdentity, promoteFromWishlist, demoteToWishlist, removeFromWishlist, addToWishlist } from '../lib/deckops.js';
import { simulateOpeners, simulatePlayout, simulateMulliganTree } from '../lib/goldfish.js';
import { analyzeLandBase } from '../lib/landbase.js';
import { fetchRecommendations, topRecommendations, recommendationsByTheme, themesForArchetype, suggestCuts } from '../lib/edhrec.js';
import { fetchCardByExactName } from '../lib/scryfall.js';
import { checkDeckLegality } from '../lib/legality.js';
import { CardSearchBar, CardRow, TagPill, CardThumb, StatBox, FlagBox, ProbCard, EmptyState, HelpTip } from './UI.jsx';
import { ManaSymbol } from './ManaCost.jsx';
import { BulkAddModal, TagEditModal } from './Modals.jsx';

// ═══════════════════════════════════════════════════════════════════════════════
// LEGALITY BANNER (shared)
// ═══════════════════════════════════════════════════════════════════════════════

function WishlistPanel({ deck, onPromote, onRemove }) {
  const wishlist = deck.wishlist || [];
  const [open, setOpen] = useState(false);
  // Open by default if there's anything to show.
  useEffect(() => {
    if (wishlist.length > 0 && !open) setOpen(true);
  }, [wishlist.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (wishlist.length === 0) return null;

  return (
    <div className="my-3 border" style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 flex items-center justify-between"
        style={{ color: CREAM }}
      >
        <div className="flex items-center gap-3">
          <span className="font-serif text-[10px]" style={{ color: CREAM_DIM }}>{open ? '▾' : '▸'}</span>
          <span className="font-serif text-sm tracking-[0.2em] uppercase font-bold">Wishlist</span>
          <span className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
            {wishlist.length} card{wishlist.length === 1 ? '' : 's'} on hold
          </span>
        </div>
      </button>
      {open && (
        <div className="border-t" style={{ borderColor: CREAM_FAINT }}>
          {wishlist.map((w) => (
            <div
              key={w.name}
              className="border-b last:border-b-0 px-4 py-2 flex items-center gap-3"
              style={{ borderColor: CREAM_FAINT }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-serif font-bold uppercase tracking-tight truncate" style={{ color: CREAM, fontSize: '0.9rem' }}>
                  {w.name}
                </div>
                {w.scryfall && (
                  <div className="font-serif text-xs italic truncate" style={{ color: CREAM_DIM }}>
                    {w.scryfall.type_line} · cmc {w.scryfall.cmc ?? 0}
                  </div>
                )}
              </div>
              <button
                onClick={() => onPromote(w.name)}
                className="font-serif text-[10px] tracking-[0.3em] uppercase px-3 py-1 border shrink-0"
                style={{ borderColor: CREAM_FAINT, color: CREAM }}
                title="Move into the main deck"
              >
                ↑ Promote
              </button>
              <button
                onClick={() => onRemove(w.name)}
                className="font-serif text-[10px] tracking-[0.3em] uppercase px-3 py-1 border shrink-0"
                style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
                title="Remove from wishlist"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Detailed legality panel — used on the Bracket tab as the deeper
 * companion to the compact LegalityBanner. Breaks down each issue
 * type into its own section with per-card lists + cut buttons so
 * users can act on findings directly.
 */
function LegalityPanel({ deck, onUpdate }) {
  const legality = useMemo(() => checkDeckLegality(deck), [deck.cards, deck.commander]);
  const { issues } = legality;
  const cut = (name) => onUpdate(removeCardFromDeck(deck, name));

  const hasAny =
    issues.singleton.length > 0 ||
    issues.offColor.length > 0 ||
    issues.banned.length > 0 ||
    issues.size !== null;

  if (!hasAny) {
    return (
      <div className="border p-5" style={{ borderColor: CREAM_FAINT, background: 'rgba(163,201,138,0.04)' }}>
        <div className="font-serif text-sm tracking-[0.2em] uppercase font-bold" style={{ color: '#a3c98a' }}>
          ✓ Legal
        </div>
        <div className="font-serif text-xs italic mt-1" style={{ color: CREAM_DIM }}>
          No format violations. Deck is at {legality.size}/{legality.target} cards.
        </div>
      </div>
    );
  }

  return (
    <div className="border" style={{ borderColor: CREAM_FAINT }}>
      <div className="px-5 py-3 border-b font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ borderColor: CREAM_FAINT, color: CREAM }}>
        Legality Issues
      </div>
      <div className="divide-y" style={{ borderColor: CREAM_FAINT }}>
        {issues.size && (
          <LegalitySection
            title="Deck size"
            severity={issues.size.over ? 'error' : 'warning'}
            note={issues.size.over
              ? `${issues.size.current}/${issues.size.target} — ${issues.size.current - issues.size.target} over the legal limit.`
              : `${issues.size.current}/${issues.size.target} — short by ${issues.size.target - issues.size.current}.`}
          />
        )}
        {issues.banned.length > 0 && (
          <LegalitySection title="Banned in Commander" severity="error">
            <CardActionList items={issues.banned.map((name) => ({ name }))} onCut={cut} />
          </LegalitySection>
        )}
        {issues.offColor.length > 0 && (
          <LegalitySection title="Color identity violations" severity="error">
            <CardActionList
              items={issues.offColor.map((c) => ({ name: c.name, hint: `pips: ${c.violation.join('')}` }))}
              onCut={cut}
            />
          </LegalitySection>
        )}
        {issues.singleton.length > 0 && (
          <LegalitySection title="Singleton violations" severity="error">
            <CardActionList
              items={issues.singleton.map((d) => ({ name: d.name, hint: `×${d.count}` }))}
              onCut={cut}
            />
          </LegalitySection>
        )}
      </div>
    </div>
  );
}

function LegalitySection({ title, severity, note, children }) {
  const tone = severity === 'error' ? ACCENT : '#d8b35a';
  return (
    <div className="p-4" style={{ borderColor: CREAM_FAINT }}>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold" style={{ color: tone }}>
          {title}
        </span>
        {note && <span className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

function CardActionList({ items, onCut }) {
  return (
    <div className="space-y-1">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-3 border-l-2 pl-3 py-1" style={{ borderColor: CREAM_FAINT }}>
          <span className="font-serif text-sm flex-1 truncate" style={{ color: CREAM }}>{it.name}</span>
          {it.hint && (
            <span className="font-mono text-[10px] shrink-0" style={{ color: CREAM_DIM }}>{it.hint}</span>
          )}
          <button
            onClick={() => onCut(it.name)}
            className="font-serif text-[10px] tracking-[0.3em] uppercase px-2 py-0.5 border shrink-0"
            style={{ borderColor: CREAM_FAINT, color: CREAM }}
            title="Remove from deck"
          >
            Cut
          </button>
        </div>
      ))}
    </div>
  );
}

function LegalityBanner({ legality }) {
  if (legality.errors.length === 0 && legality.warnings.length === 0) return null;
  const hasErrors = legality.errors.length > 0;
  return (
    <div
      className="my-3 border px-4 py-3"
      style={{
        borderColor: hasErrors ? ACCENT : CREAM_FAINT,
        background: hasErrors ? 'rgba(196,74,63,0.06)' : 'rgba(243,231,201,0.025)',
      }}
    >
      <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: hasErrors ? ACCENT : CREAM_DIM }}>
        Legality · {hasErrors ? 'issues' : 'notes'}
      </div>
      <ul className="space-y-1 font-mono text-[11px]" style={{ color: CREAM }}>
        {legality.errors.map((e, i) => (
          <li key={`e${i}`} style={{ color: ACCENT }}>· {e}</li>
        ))}
        {legality.warnings.map((w, i) => (
          <li key={`w${i}`} style={{ color: CREAM_DIM }}>· {w}</li>
        ))}
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH PANEL (shared between Bracket tab and elsewhere)
// ═══════════════════════════════════════════════════════════════════════════════

function HealthPanel({ health }) {
  const tone =
    health.score >= 80 ? '#a3c98a' :
    health.score >= 65 ? CREAM :
    health.score >= 50 ? '#d8b35a' :
    ACCENT;
  return (
    <div className="border" style={{ borderColor: CREAM_FAINT }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
          Deck Health
          <HelpTip>
            0-100 composite of legality + lands (36-38 ideal) + ramp (8-12) + draw (10+) + removal (10+) + curve (2.5-3.5 avg CMC). Each fundamental scores 15-25 points. 100 = textbook deck on paper; doesn't mean the strategy is good.
          </HelpTip>
        </div>
        <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
          fundamentals · 0-100
        </div>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="flex flex-col items-start md:items-center justify-center md:border-r" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif font-black leading-none" style={{ color: tone, fontSize: 'clamp(4rem, 9vw, 6rem)' }}>
            {health.score}
          </div>
          <div className="font-serif text-[10px] tracking-[0.4em] uppercase mt-2" style={{ color: CREAM_DIM }}>
            grade · {health.grade}
          </div>
        </div>
        <div className="md:col-span-3 space-y-2">
          {Object.entries(health.breakdown).map(([key, comp]) => (
            <div key={key} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-3 font-serif text-[11px] tracking-[0.2em] uppercase" style={{ color: CREAM_DIM }}>
                {comp.label}
              </div>
              <div className="col-span-7 h-2" style={{ background: 'rgba(243,231,201,0.08)' }}>
                <div
                  className="h-full"
                  style={{
                    background: comp.points === 0 ? 'transparent' : CREAM,
                    opacity: 0.85,
                    width: `${(comp.points / comp.weight) * 100}%`,
                  }}
                />
              </div>
              <div className="col-span-2 text-right font-mono text-[10px]" style={{ color: CREAM }}>
                {comp.points}/{comp.weight}
              </div>
              <div className="col-span-12 ml-[8.33%] font-serif text-xs italic -mt-1" style={{ color: CREAM_DIM }}>
                {comp.note}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARDS TAB
// ═══════════════════════════════════════════════════════════════════════════════

export function CardsTab({ deck, onUpdate }) {
  const [showBulk, setShowBulk] = useState(false);
  const [editingTags, setEditingTags] = useState(null);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('type');

  const [recentlyRejected, setRecentlyRejected] = useState([]);
  const [searchTarget, setSearchTarget] = useState('deck');
  // The CardSearchBar hands resolved cards back here. We branch on the
  // target toggle: deck (default) routes through safeAddCards; wishlist
  // adds without consuming a slot in the 100-card cap.
  const addFromSearch = (cards) => {
    if (searchTarget === 'wishlist') {
      onUpdate(addToWishlist(deck, cards));
    } else {
      addCards(cards);
    }
  };
  const addCards = (newCards) => {
    const { deck: next, rejected } = safeAddCards(deck, newCards);
    onUpdate(next);
    if (rejected.length > 0) {
      setRecentlyRejected(rejected);
      setTimeout(() => setRecentlyRejected([]), 6000);
    }
  };
  const changeCount = (entry, count) => onUpdate(setCardCount(deck, entry, count));
  const removeCard = (entry) => onUpdate(removeCardFromDeck(deck, entry.name));
  const saveCardDetails = (entry, { tags, note }) => {
    let next = setCardTags(deck, entry, tags);
    const updatedEntry = next.cards.find((c) => c === entry || (c.scryfall && entry.scryfall && c.name === entry.name));
    if (updatedEntry) next = setCardNote(next, updatedEntry, note);
    onUpdate(next);
  };

  const legality = useMemo(() => checkDeckLegality(deck), [deck.cards, deck.commander]);

  const filtered = useMemo(() => {
    let cards = deck.cards.filter((c) => c.scryfall);
    if (filter) {
      cards = cards.filter(
        (c) =>
          c.name.toLowerCase().includes(filter.toLowerCase()) ||
          (c.tags || []).some((t) => t.toLowerCase().includes(filter.toLowerCase()))
      );
    }
    if (sortBy === 'name') cards.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'cmc') cards.sort((a, b) => (a.scryfall.cmc || 0) - (b.scryfall.cmc || 0));
    else if (sortBy === 'type') {
      const typeOrder = ['Creature', 'Planeswalker', 'Battle', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Land'];
      cards.sort((a, b) => {
        const ai = typeOrder.findIndex((t) => a.scryfall.type_line?.includes(t));
        const bi = typeOrder.findIndex((t) => b.scryfall.type_line?.includes(t));
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.name.localeCompare(b.name);
      });
    }
    return cards;
  }, [deck.cards, filter, sortBy]);

  const total = deck.cards.reduce((s, c) => s + c.count, 0);
  const limit = 100 - (deck.commander ? 1 : 0);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="md:col-span-2">
          <CardSearchBar
            onAdd={addFromSearch}
            target={searchTarget}
            onTargetChange={setSearchTarget}
          />
        </div>
        <button
          onClick={() => setShowBulk(true)}
          className="border flex items-center justify-center gap-2 font-serif text-[11px] tracking-[0.3em] uppercase py-3 transition"
          style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.06)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.02)')}
        >
          <Upload className="w-3 h-3" /> Bulk Import
        </button>
      </div>

      <div
        className="flex items-center gap-4 border-t border-b py-2 px-1 font-mono text-[10px] tracking-wider"
        style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
      >
        <span>STATUS</span>
        <span style={{ color: total === limit ? '#a3c98a' : total > limit ? ACCENT : CREAM }}>
          {pad(total)} / {pad(limit)} cards
        </span>
        {deck.commander && <span>+1 commander</span>}
        <span className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }}></span>
        {deck.commander && (
          <button
            onClick={() => onUpdate(setStrictIdentity(deck, !deck.strictIdentity))}
            className="font-mono text-[10px] tracking-wider px-2 py-0.5 border transition"
            style={{
              borderColor: deck.strictIdentity ? CREAM : CREAM_FAINT,
              color: deck.strictIdentity ? CREAM : CREAM_DIM,
              background: deck.strictIdentity ? 'rgba(243,231,201,0.06)' : 'transparent',
            }}
            title={deck.strictIdentity
              ? 'Strict mode: blocks off-color, banned, and duplicate adds. Click to disable.'
              : 'Click to enable strict mode (blocks off-color / banned / duplicates).'}
          >
            {deck.strictIdentity ? 'STRICT · ON' : 'STRICT · OFF'}
          </button>
        )}
        <span>{filtered.length === total ? `${filtered.length} visible` : `${filtered.length} / ${total} visible`}</span>
      </div>

      <LegalityBanner legality={legality} />

      {recentlyRejected.length > 0 && (
        <div className="my-3 border px-4 py-3" style={{ borderColor: ACCENT, background: 'rgba(196,74,63,0.06)' }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: ACCENT }}>
            Blocked by strict mode · {recentlyRejected.length} card{recentlyRejected.length === 1 ? '' : 's'}
          </div>
          <ul className="font-mono text-[11px] space-y-0.5" style={{ color: CREAM }}>
            {recentlyRejected.slice(0, 5).map((r, i) => (
              <li key={i}>· {r.name} <span style={{ color: CREAM_DIM }}>({r.reasons.join(', ')})</span></li>
            ))}
            {recentlyRejected.length > 5 && (
              <li style={{ color: CREAM_DIM }}>+ {recentlyRejected.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      <WishlistPanel
        deck={deck}
        onPromote={(name) => onUpdate(promoteFromWishlist(deck, name))}
        onRemove={(name) => onUpdate(removeFromWishlist(deck, name))}
      />

      <div className="grid grid-cols-3 gap-3 my-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter name or tag..."
          className="col-span-2 border px-3 py-2 bg-transparent focus:outline-none font-mono text-xs"
          style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="border px-3 py-2 font-mono text-xs cursor-pointer"
          style={{ borderColor: CREAM_FAINT, color: CREAM, background: BG }}
        >
          <option value="type">sort · type</option>
          <option value="name">sort · name</option>
          <option value="cmc">sort · cmc</option>
        </select>
      </div>

      <div className="border-t border-l border-r" style={{ borderColor: CREAM_FAINT }}>
        {filtered.length === 0 ? (
          <div
            className="p-12 text-center font-serif text-sm italic border-b"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            No cards loaded.
          </div>
        ) : (
          filtered.map((c, i) => (
            <CardRow
              key={c.name}
              entry={c}
              idx={i}
              onChangeCount={changeCount}
              onRemove={removeCard}
              onDemoteToWishlist={() => onUpdate(demoteToWishlist(deck, c.name))}
              onEditTags={setEditingTags}
              onChangePrinting={(entry, printing) => {
                // Per-deck art override — preserve the entry's count + tags
                // + note, swap scryfall payload only.
                onUpdate({
                  ...deck,
                  cards: deck.cards.map((card) =>
                    card.name === entry.name ? { ...card, scryfall: printing } : card
                  ),
                });
              }}
            />
          ))
        )}
      </div>

      {showBulk && <BulkAddModal onClose={() => setShowBulk(false)} onAdd={addCards} />}
      {editingTags && (
        <TagEditModal
          entry={editingTags}
          onClose={() => setEditingTags(null)}
          onSave={(payload) => saveCardDetails(editingTags, payload)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PACKAGES TAB
// ═══════════════════════════════════════════════════════════════════════════════

export function PackagesTab({ deck }) {
  const [focusTag, setFocusTag] = useState(null);

  const packages = useMemo(() => {
    const map = {};
    for (const c of deck.cards) {
      if (!c.scryfall) continue;
      for (const t of c.tags || []) {
        if (!map[t]) map[t] = [];
        map[t].push(c);
      }
    }
    return Object.entries(map).sort((a, b) => {
      // Strategic weight first; then card count as tiebreaker.
      const wDiff = packageWeight(b[0]) - packageWeight(a[0]);
      if (wDiff !== 0) return wDiff;
      return b[1].length - a[1].length;
    });
  }, [deck.cards]);

  const hubs = useMemo(() => synergyHubs(deck, 3), [deck.cards]);

  if (deck.cards.length === 0) {
    return (
      <EmptyState
        title="No packages yet"
        body="Add cards on the Cards tab. The auto-tag engine detects ~25 strategic roles (Ramp, Card draw, Token producer, etc.) and groups cards by tag."
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Synergy hubs */}
      <div>
        <div className="flex items-baseline gap-4 mb-3">
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
            Synergy Hubs
            <HelpTip>
              Cards that appear in 3+ strategic packages — the load-bearing pieces. Cutting one of these costs you ramp AND draw AND removal in one go. Aim to protect them.
            </HelpTip>
          </div>
          <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }}></div>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            cards in 3+ packages
          </div>
        </div>
        {hubs.length === 0 ? (
          <div className="border p-6 font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            No cards yet appear in 3+ strategic packages. Add more synergistic cards or tag manually to surface hubs.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
            {hubs.slice(0, 12).map(({ card, packages: pkgs }) => (
              <div
                key={card.name}
                className="border-r border-b p-3 flex items-start gap-3"
                style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.025)' }}
              >
                <CardThumb card={card.scryfall} />
                <div className="flex-1 min-w-0">
                  <div className="font-serif font-bold uppercase tracking-tight truncate" style={{ color: CREAM }}>
                    {card.name}
                  </div>
                  <div className="font-mono text-[10px] mt-0.5" style={{ color: CREAM_DIM }}>
                    {pkgs.length} packages · cmc {card.scryfall.cmc ?? 0}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {pkgs.slice(0, 6).map((t) => (
                      <button key={t} onClick={() => setFocusTag(t)}>
                        <TagPill tag={t} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Package focus filter */}
      {focusTag && (
        <div
          className="flex items-center justify-between border px-4 py-3"
          style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.04)' }}
        >
          <div className="flex items-center gap-3">
            <span className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
              Filter
            </span>
            <TagPill tag={focusTag} />
          </div>
          <button
            onClick={() => setFocusTag(null)}
            className="font-serif text-[10px] tracking-[0.3em] uppercase"
            style={{ color: CREAM_DIM }}
          >
            Clear ×
          </button>
        </div>
      )}

      {/* Packages list */}
      <div>
        <div className="flex items-baseline gap-4 mb-3">
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            All Packages
          </div>
          <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }}></div>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            sorted by strategic weight
          </div>
        </div>
        <div className="space-y-2">
          {packages
            .filter(([tag]) => !focusTag || tag === focusTag)
            .map(([tag, cards]) => (
              <PackageBlock
                key={tag}
                tag={tag}
                cards={cards}
                focused={focusTag === tag}
                onFocus={() => setFocusTag(tag === focusTag ? null : tag)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function PackageBlock({ tag, cards, focused, onFocus }) {
  const [expanded, setExpanded] = useState(focused);
  useEffect(() => setExpanded(focused), [focused]);

  return (
    <div className="border" style={{ borderColor: CREAM_FAINT }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 border-b flex items-center justify-between transition"
        style={{
          borderColor: CREAM_FAINT,
          background: expanded ? 'rgba(243,231,201,0.04)' : 'rgba(243,231,201,0.015)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="font-serif text-[10px]" style={{ color: CREAM_DIM }}>{expanded ? '▾' : '▸'}</span>
          <TagPill tag={tag} />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-wider" style={{ color: CREAM_DIM }}>
            {pad(cards.length)} cards
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
            }}
            className="font-serif text-[10px] tracking-[0.3em] uppercase"
            style={{ color: CREAM_DIM }}
            title="Focus this package"
          >
            {focused ? '·focused' : 'focus'}
          </button>
        </div>
      </button>
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2">
          {cards
            .slice()
            .sort((a, b) => (a.scryfall.cmc || 0) - (b.scryfall.cmc || 0))
            .map((c) => (
              <PackageCardRow key={c.name} card={c} currentTag={tag} />
            ))}
        </div>
      )}
    </div>
  );
}

function PackageCardRow({ card, currentTag }) {
  const otherTags = (card.tags || []).filter((t) => t !== currentTag);
  return (
    <div
      className="flex items-start gap-3 px-4 py-2 border-r border-b text-sm"
      style={{ borderColor: CREAM_FAINT }}
    >
      <CardThumb card={card.scryfall} />
      <div className="flex-1 min-w-0">
        <div className="font-serif truncate uppercase tracking-tight" style={{ color: CREAM }}>
          {card.name}
        </div>
        <div className="font-serif text-xs italic truncate" style={{ color: CREAM_DIM }}>
          {card.scryfall.type_line}
        </div>
        {otherTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {otherTags.slice(0, 4).map((t) => (
              <TagPill key={t} tag={t} />
            ))}
            {otherTags.length > 4 && (
              <span className="font-mono text-[9px]" style={{ color: CREAM_DIM }}>
                +{otherTags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
      <span className="font-mono text-[10px] mt-1" style={{ color: CREAM_DIM }}>
        {card.scryfall.cmc ?? 0}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CURVE / STATS TAB
// ═══════════════════════════════════════════════════════════════════════════════

export function CurveTab({ deck }) {
  const stats = useMemo(() => {
    const curve = [0, 0, 0, 0, 0, 0, 0, 0];
    const types = {};
    const colors = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    let totalCmc = 0,
      nonLandCount = 0,
      landCount = 0;
    for (const c of deck.cards) {
      if (!c.scryfall) continue;
      const isLand = c.scryfall.type_line?.includes('Land');
      for (let i = 0; i < c.count; i++) {
        if (isLand) landCount++;
        else {
          const cmc = Math.min(7, Math.floor(c.scryfall.cmc || 0));
          curve[cmc]++;
          totalCmc += c.scryfall.cmc || 0;
          nonLandCount++;
        }
        const mainType =
          ['Creature', 'Planeswalker', 'Battle', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Land'].find(
            (t) => c.scryfall.type_line?.includes(t)
          ) || 'Other';
        types[mainType] = (types[mainType] || 0) + 1;
        const mc = c.scryfall.mana_cost || '';
        for (const sym of ['W', 'U', 'B', 'R', 'G']) {
          const matches = (mc.match(new RegExp(`\\{${sym}\\}`, 'g')) || []).length;
          colors[sym] += matches;
        }
      }
    }
    return {
      curve,
      types,
      colors,
      avgCmc: nonLandCount > 0 ? totalCmc / nonLandCount : 0,
      nonLandCount,
      landCount,
    };
  }, [deck.cards]);

  const maxCurve = Math.max(...stats.curve, 1);
  const curveLabels = ['0', '1', '2', '3', '4', '5', '6', '7+'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4">
        <StatBox label="Avg · CMC" value={stats.avgCmc.toFixed(2)} />
        <StatBox
          label="Lands"
          value={pad(stats.landCount)}
          sub={stats.landCount >= 36 && stats.landCount <= 38 ? 'Within recommended' : 'Rec: 36-38'}
        />
        <StatBox label="Spells" value={pad(stats.nonLandCount)} />
        <div className="border p-4" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: CREAM_DIM }}>
            Pips
          </div>
          <div className="flex gap-3">
            {Object.entries(stats.colors)
              .filter(([_, v]) => v > 0)
              .map(([k, v]) => (
                <div key={k} className="flex flex-col items-center gap-1">
                  <span className="font-serif font-black text-lg" style={{ color: CREAM }}>
                    {v}
                  </span>
                  <span style={{ fontSize: '0.9rem' }}>
                    <ManaSymbol sym={k} size="1em" title={k} />
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="border" style={{ borderColor: CREAM_FAINT }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            Mana Curve
          </div>
          <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
            max · {pad(maxCurve)}
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-end gap-3" style={{ height: '200px' }}>
            {stats.curve.map((n, i) => {
              const barHeight = n > 0 ? Math.max((n / maxCurve) * 150, 3) : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="font-serif font-bold mb-2" style={{ color: CREAM, fontSize: '0.875rem' }}>
                    {pad(n)}
                  </div>
                  <div className="w-full transition-all" style={{ background: CREAM, height: `${barHeight}px`, opacity: 0.85 }}></div>
                  <div className="font-mono text-[10px] mt-2 tracking-wider" style={{ color: CREAM_DIM }}>
                    {curveLabels[i]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border" style={{ borderColor: CREAM_FAINT }}>
        <div
          className="px-5 py-3 border-b font-serif text-sm tracking-[0.3em] uppercase font-bold"
          style={{ borderColor: CREAM_FAINT, color: CREAM }}
        >
          Card Types
        </div>
        <div className="p-5 space-y-2.5">
          {Object.entries(stats.types)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <div key={type} className="flex items-center gap-4">
                <div className="w-32 font-serif text-sm" style={{ color: CREAM }}>
                  {type}
                </div>
                <div className="flex-1 h-2 border" style={{ borderColor: CREAM_FAINT }}>
                  <div
                    className="h-full"
                    style={{
                      background: CREAM,
                      opacity: 0.7,
                      width: `${(count / (stats.nonLandCount + stats.landCount)) * 100}%`,
                    }}
                  ></div>
                </div>
                <div className="w-10 text-right font-mono text-sm" style={{ color: CREAM }}>
                  {pad(count)}
                </div>
              </div>
            ))}
        </div>
      </div>

      <LandBaseSection deck={deck} />
    </div>
  );
}

function LandBaseSection({ deck }) {
  const analysis = useMemo(() => analyzeLandBase(deck), [deck.cards, deck.commander]);
  if (analysis.colorCount === 0 && !deck.commander) {
    return null;
  }

  const recBasicTotal = Object.values(analysis.recommendedBasics).reduce((s, n) => s + n, 0);
  const landShort = analysis.currentLands < analysis.targetLands;

  return (
    <div className="border" style={{ borderColor: CREAM_FAINT }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          Land Base
        </div>
        <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
          target · {analysis.targetLands} lands ({analysis.utilityReserved} utility)
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 border-b" style={{ borderColor: CREAM_FAINT }}>
        <div className="p-4 border-r md:border-b-0" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Current</div>
          <div className="font-serif font-black mt-1" style={{ color: landShort ? ACCENT : CREAM, fontSize: '1.6rem' }}>
            {analysis.currentLands} lands
          </div>
          <div className="font-mono text-[10px] mt-1" style={{ color: CREAM_DIM }}>
            {analysis.currentBasics} basic / {analysis.currentNonbasicLands} nonbasic
          </div>
        </div>
        <div className="p-4 border-r md:border-b-0" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Identity</div>
          <div className="flex items-center gap-2 mt-1" style={{ fontSize: '1.2rem' }}>
            {analysis.commanderIdentity.length === 0
              ? <ManaSymbol sym="C" />
              : analysis.commanderIdentity.map((c) => <ManaSymbol key={c} sym={c} />)}
          </div>
          <div className="font-mono text-[10px] mt-1" style={{ color: CREAM_DIM }}>
            {analysis.colorCount}-color
          </div>
        </div>
        <div className="p-4">
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Pip distribution</div>
          <div className="flex items-baseline gap-3 mt-1 flex-wrap">
            {['W', 'U', 'B', 'R', 'G'].filter((c) => analysis.pipDistribution[c] > 0).map((c) => (
              <div key={c} className="flex items-center gap-1">
                <ManaSymbol sym={c} size="0.85em" />
                <span className="font-mono text-xs" style={{ color: CREAM }}>{analysis.pipDistribution[c]}</span>
              </div>
            ))}
            {analysis.pipDistribution.total === 0 && (
              <span className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>—</span>
            )}
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: CREAM_DIM }}>
          Recommended basics · {recBasicTotal} total
        </div>
        {Object.keys(analysis.recommendedBasics).length === 0 ? (
          <div className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
            Set a commander to compute a land base.
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(analysis.recommendedBasics).map(([name, rec]) => {
              const sym = name === 'Plains' ? 'W'
                : name === 'Island' ? 'U'
                : name === 'Swamp' ? 'B'
                : name === 'Mountain' ? 'R'
                : name === 'Forest' ? 'G' : 'C';
              const have = analysis.diff.find((d) => d.name === name)?.have ?? rec;
              const delta = rec - have;
              return (
                <div key={name} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-1" style={{ fontSize: '1.05rem' }}>
                    <ManaSymbol sym={sym} />
                  </div>
                  <div className="col-span-3 font-serif text-sm" style={{ color: CREAM }}>
                    {name}
                  </div>
                  <div className="col-span-6 h-2" style={{ background: 'rgba(243,231,201,0.08)' }}>
                    <div className="h-full" style={{ background: rec === 0 ? 'transparent' : CREAM, opacity: 0.85, width: `${(rec / 20) * 100}%` }}></div>
                  </div>
                  <div className="col-span-2 text-right font-mono text-xs" style={{ color: CREAM }}>
                    {have} → {rec}
                    {delta !== 0 && (
                      <span className="ml-1" style={{ color: delta > 0 ? '#a3c98a' : ACCENT, fontSize: '0.85em' }}>
                        ({delta > 0 ? '+' : ''}{delta})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {analysis.utilityLands.length > 0 && (
        <div className="border-t p-5" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: CREAM_DIM }}>
            Suggested utility / fixing lands · aim for ~{analysis.utilityReserved}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1.5 gap-x-4">
            {analysis.utilityLands.slice(0, analysis.utilityReserved + 4).map((u) => (
              <div key={u.name} className="flex items-center gap-3 text-sm">
                <span className="font-serif flex-1 truncate" style={{ color: CREAM }}>{u.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
                  {u.tag}
                </span>
              </div>
            ))}
          </div>
          <div className="font-serif text-xs italic mt-3" style={{ color: CREAM_DIM }}>
            Shortlist for {analysis.colorCount}-color identity. Mix and match — these are common picks, not a fixed answer.
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BRACKET TAB
// ═══════════════════════════════════════════════════════════════════════════════

export function BracketTab({ deck, onUpdate }) {
  const assessment = useMemo(() => assessBracket(deck), [deck]);
  const health = useMemo(() => computeHealth(deck), [deck.cards, deck.commander]);

  return (
    <div className="space-y-6">
      {onUpdate && deck.cards.length > 0 && <LegalityPanel deck={deck} onUpdate={onUpdate} />}
      {!health.empty && <HealthPanel health={health} />}
      <div className="border" style={{ borderColor: CREAM_FAINT }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
            Power Assessment
            <HelpTip>
              WotC's bracket ladder (1 Exhibition → 5 cEDH). The scorer flags Game Changers, MLD, fast mana, infinite combos, and tutor density. Bracket 1-2 = casual; 3 = focused builds with 1-3 Game Changers; 4 = optimised; 5 = tournament-grade.
            </HelpTip>
          </div>
          <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
            auto · live
          </div>
        </div>
        <div className="p-8 md:p-12">
          <div className="flex flex-col md:flex-row items-baseline gap-6 md:gap-12">
            <div className="font-serif font-black leading-none" style={{ color: CREAM, fontSize: 'clamp(6rem, 18vw, 12rem)' }}>
              {assessment.bracket}
            </div>
            <div className="flex-1">
              <div className="font-serif text-[10px] tracking-[0.4em] uppercase mb-2" style={{ color: CREAM_DIM }}>
                Bracket · {pad(assessment.bracket)}
              </div>
              <h3
                className="font-serif font-black uppercase tracking-tight"
                style={{ color: CREAM, fontSize: 'clamp(2rem, 5vw, 3rem)', lineHeight: '0.95' }}
              >
                {BRACKETS[assessment.bracket - 1].name}
              </h3>
              <p className="font-serif text-sm md:text-base mt-3 italic" style={{ color: CREAM_DIM }}>
                {BRACKETS[assessment.bracket - 1].desc}
              </p>
            </div>
          </div>
          {assessment.reasons.length > 0 && (
            <div className="border-t mt-8 pt-6" style={{ borderColor: CREAM_FAINT }}>
              <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: CREAM_DIM }}>
                Analysis
              </div>
              <ul className="space-y-1.5 font-serif text-sm" style={{ color: CREAM }}>
                {assessment.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span style={{ color: CREAM_DIM }}>·</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
        <FlagBox title="Game Changers" items={assessment.flags.gameChangers} desc="WotC's curated list. ≤3 fine for Bracket 3." />
        <FlagBox title="Mass Land Destruction" items={assessment.flags.mld} desc="Push to Bracket 4+." />
        <FlagBox title="Extra Turn Spells" items={assessment.flags.extraTurns} desc="Single copies fine; multiples imply higher power." />
        <FlagBox title="Tutors" items={assessment.flags.tutors} desc="≤3 appropriate for Bracket 3." />
        <FlagBox title="Fast Mana" items={assessment.flags.fastMana} desc="Beyond Sol Ring & Arcane Signet — Bracket 4." />
        <FlagBox title="Infinite Combos" items={assessment.flags.combos} desc="Early uninteractive combos push to Bracket 4." />
      </div>

      <div className="border" style={{ borderColor: CREAM_FAINT }}>
        <div
          className="px-5 py-3 border-b font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2"
          style={{ borderColor: CREAM_FAINT, color: CREAM }}
        >
          <BookOpen className="w-3.5 h-3.5" /> Bracket Reference
        </div>
        <div className="p-5 space-y-3 font-serif text-sm" style={{ color: CREAM }}>
          {BRACKETS.map((b) => (
            <div key={b.n} className="flex gap-4">
              <div className="w-6 font-bold shrink-0">{b.n}</div>
              <div>
                <span className="font-bold uppercase tracking-wide">{b.name}</span>
                <span className="italic" style={{ color: CREAM_DIM }}>
                  {' '}
                  — {b.desc}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function StageBlock({ title, code, range, stage }) {
  return (
    <div className="border" style={{ borderColor: CREAM_FAINT }}>
      <div className="px-5 py-3 border-b flex items-baseline justify-between" style={{ borderColor: CREAM_FAINT }}>
        <div>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            {title}
          </div>
          <div className="font-serif italic mt-1" style={{ color: CREAM_DIM, fontSize: '0.95rem' }}>
            {stage.headline}
          </div>
        </div>
        <div className="font-mono text-[10px] shrink-0 ml-4" style={{ color: CREAM_DIM }}>
          {code} · {range}
        </div>
      </div>
      <div className="p-5 space-y-4">
        {stage.bullets.map((b, i) => (
          <div key={i} className="flex gap-3">
            <span className="font-serif font-bold mt-0.5 shrink-0" style={{ color: CREAM_DIM }}>·</span>
            <div className="flex-1">
              <p className="font-serif text-sm leading-relaxed" style={{ color: CREAM }}>
                {b.text}
              </p>
              {b.cards.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {b.cards.map((name) => (
                    <span
                      key={name}
                      className="font-mono text-[10px] px-2 py-0.5 border tracking-wide"
                      style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StagesTab({ deck }) {
  const plans = useMemo(() => buildStagePlans(deck), [deck.cards, deck.commander]);

  if (deck.cards.length === 0) {
    return (
      <EmptyState
        title="No stage plan yet"
        body="Add cards on the Cards tab. The strategy engine classifies the deck into an archetype (Tribal, Combo, Control, Tokens, etc.) and writes turn-by-turn guidance citing your actual cards."
      />
    );
  }

  const primary = plans.archetype;

  return (
    <div className="space-y-6">
      {/* Archetype banner */}
      <div className="border" style={{ borderColor: CREAM_FAINT }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            Archetype
          </div>
          <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
            auto · live
          </div>
        </div>
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-baseline gap-4 md:gap-8">
            <h3
              className="font-serif font-black uppercase tracking-tight leading-none"
              style={{ color: CREAM, fontSize: 'clamp(2rem, 5vw, 3rem)' }}
            >
              {primary?.name || 'Unclassified'}
            </h3>
            <p className="font-serif text-sm md:text-base italic flex-1" style={{ color: CREAM_DIM }}>
              {primary?.description || 'Add more tagged cards to classify the deck.'}
            </p>
          </div>
          {plans.secondary.length > 0 && (
            <div className="mt-5 pt-4 border-t flex flex-wrap items-baseline gap-3" style={{ borderColor: CREAM_FAINT }}>
              <span className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
                also leans
              </span>
              {plans.secondary.map((s) => (
                <span key={s.id} className="font-mono text-xs" style={{ color: CREAM }}>
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
        Action plan generated from the deck's tag profile. Concrete card cites pull from cards already in the list.
      </div>

      <div className="space-y-3">
        <StageBlock title="Early Game" code="T1–3" range="setup & curve" stage={plans.early} />
        <StageBlock title="Mid Game" code="T4–7" range="commit threats" stage={plans.mid} />
        <StageBlock title="Late Game" code="T8+" range="close it out" stage={plans.late} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOLDFISH SECTION (used inside ProbabilitiesTab)
// ═══════════════════════════════════════════════════════════════════════════════

function GoldfishSection({ deck }) {
  const [sim, setSim] = useState(null);
  const [tree, setTree] = useState(null);
  const [playout, setPlayout] = useState(null);
  const [running, setRunning] = useState(false);

  const totalCards = deck.cards.reduce((s, c) => s + c.count, 0);
  const canSim = totalCards >= 7;

  const runOpeners = () => {
    setRunning(true);
    setTimeout(() => {
      // Always compute both opener stats AND the mulligan tree so the
      // user gets the full picture in one click.
      setSim(simulateOpeners(deck, 1000));
      setTree(simulateMulliganTree(deck, 1000));
      setRunning(false);
    }, 10);
  };

  const runPlayout = () => {
    setPlayout(simulatePlayout(deck, 6));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-4">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
          Goldfish
          <HelpTip>
            Solo simulation — shuffle the deck 1,000 times and see what your openers look like. "Keepable" = 2-5 lands AND (3+ lands OR ramp/draw in hand). Sample Playout drops a land + casts the biggest affordable spell each turn for 6 turns. No opponent, no blocking.
          </HelpTip>
        </div>
        <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }}></div>
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          mulligan + curve health
        </div>
      </div>

      <div className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
        Sample 1,000 opening hands and play out a representative 6-turn opening.
        Lands, ramp, draw, and curve come from the cards' detected tags.
      </div>

      {!canSim && (
        <EmptyState
          title="Need cards to simulate"
          body="Add at least 7 cards to the deck — opening-hand size — and the goldfish + mulligan tools light up."
        />
      )}

      {canSim && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={runOpeners}
            disabled={running}
            className="border p-5 text-left transition disabled:opacity-50"
            style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.02)')}
          >
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
              {running ? 'Sampling...' : 'Sample 1,000 hands →'}
            </div>
            <div className="font-serif text-sm mt-1" style={{ color: CREAM }}>
              Opening-hand distribution
            </div>
          </button>
          <button
            onClick={runPlayout}
            className="border p-5 text-left transition"
            style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.02)')}
          >
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
              Play a sample game →
            </div>
            <div className="font-serif text-sm mt-1" style={{ color: CREAM }}>
              6 turns, simple AI
            </div>
          </button>
        </div>
      )}

      {sim && <OpenersResult sim={sim} />}
      {tree && <MulliganTreeResult tree={tree} />}
      {playout && <PlayoutResult log={playout} onReroll={runPlayout} />}
    </div>
  );
}

function MulliganTreeResult({ tree }) {
  const sizes = [7, 6, 5, 4];
  const tone = (rate) =>
    rate >= 0.7 ? '#a3c98a' :
    rate >= 0.5 ? CREAM :
    rate >= 0.3 ? '#d8b35a' : ACCENT;

  return (
    <div className="border" style={{ borderColor: CREAM_FAINT }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          Mulligan Tree
        </div>
        <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
          London model
        </div>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {sizes.map((s) => (
            <div key={s} className="border p-3" style={{ borderColor: CREAM_FAINT }}>
              <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
                Keep {s}
              </div>
              <div className="font-serif font-black leading-none mt-1" style={{ color: tone(tree.keepable[s]), fontSize: '1.5rem' }}>
                {(tree.keepable[s] * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
        <div className="border p-4" style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
            Expected mulligan depth
          </div>
          <div className="space-y-1.5">
            {sizes.map((s) => (
              <div key={s} className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-2 font-serif text-xs" style={{ color: CREAM }}>
                  {s === 7 ? 'No mull' : `Mull to ${s}`}
                </div>
                <div className="col-span-8 h-2" style={{ background: 'rgba(243,231,201,0.08)' }}>
                  <div className="h-full" style={{ background: tree.stop[s] === 0 ? 'transparent' : CREAM, opacity: 0.85, width: `${tree.stop[s] * 100}%` }}></div>
                </div>
                <div className="col-span-2 text-right font-mono text-xs" style={{ color: CREAM }}>
                  {(tree.stop[s] * 100).toFixed(1)}%
                </div>
              </div>
            ))}
            {tree.stop.further > 0.005 && (
              <div className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-2 font-serif text-xs" style={{ color: CREAM_DIM }}>
                  Mull 4 or fewer
                </div>
                <div className="col-span-8 h-2" style={{ background: 'rgba(243,231,201,0.08)' }}>
                  <div className="h-full" style={{ background: tree.stop.further === 0 ? 'transparent' : ACCENT, opacity: 0.85, width: `${tree.stop.further * 100}%` }}></div>
                </div>
                <div className="col-span-2 text-right font-mono text-xs" style={{ color: ACCENT }}>
                  {(tree.stop.further * 100).toFixed(1)}%
                </div>
              </div>
            )}
          </div>
          <div className="font-serif text-xs italic mt-3" style={{ color: CREAM_DIM }}>
            Where you'd stop mulliganing across {tree.samples} simulated openers. Higher concentration on "No mull" is healthier.
          </div>
        </div>
      </div>
    </div>
  );
}

function OpenersResult({ sim }) {
  const maxLand = Math.max(...sim.landDistribution, 1);
  const keepPct = (sim.keepableRate * 100).toFixed(1);
  const keepTone =
    sim.keepableRate >= 0.85 ? '#a3c98a' :
    sim.keepableRate >= 0.7 ? CREAM :
    sim.keepableRate >= 0.55 ? '#d8b35a' : ACCENT;
  return (
    <div className="border" style={{ borderColor: CREAM_FAINT }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          Openers · 1,000 samples
        </div>
        <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
          London mulligan model
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 border-b" style={{ borderColor: CREAM_FAINT }}>
        <div className="p-4 border-r" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Keepable</div>
          <div className="font-serif font-black mt-1" style={{ color: keepTone, fontSize: '1.6rem' }}>
            {keepPct}%
          </div>
        </div>
        <div className="p-4 border-r" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Avg lands</div>
          <div className="font-serif font-black mt-1" style={{ color: CREAM, fontSize: '1.6rem' }}>
            {sim.avgLands.toFixed(2)}
          </div>
        </div>
        <div className="p-4 border-r" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Avg ramp</div>
          <div className="font-serif font-black mt-1" style={{ color: CREAM, fontSize: '1.6rem' }}>
            {sim.avgRamp.toFixed(2)}
          </div>
        </div>
        <div className="p-4 border-r" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Avg draw</div>
          <div className="font-serif font-black mt-1" style={{ color: CREAM, fontSize: '1.6rem' }}>
            {sim.avgDraw.toFixed(2)}
          </div>
        </div>
        <div className="p-4">
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Avg removal</div>
          <div className="font-serif font-black mt-1" style={{ color: CREAM, fontSize: '1.6rem' }}>
            {sim.avgRemoval.toFixed(2)}
          </div>
        </div>
      </div>
      <div className="p-5">
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: CREAM_DIM }}>
          Land count distribution
        </div>
        <div className="flex items-end gap-2" style={{ height: '120px' }}>
          {sim.landDistribution.map((n, i) => {
            const barHeight = n > 0 ? Math.max((n / maxLand) * 100, 2) : 0;
            const pct = ((n / sim.samples) * 100).toFixed(0);
            const sweet = i >= 2 && i <= 5;
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="font-mono text-[9px] mb-1" style={{ color: CREAM_DIM }}>
                  {pct}%
                </div>
                <div className="w-full" style={{ background: sweet ? CREAM : ACCENT, opacity: 0.8, height: `${barHeight}px` }}></div>
                <div className="font-mono text-[10px] mt-2" style={{ color: CREAM_DIM }}>
                  {i === 7 ? '7+' : i}
                </div>
              </div>
            );
          })}
        </div>
        <div className="font-serif text-xs italic mt-3" style={{ color: CREAM_DIM }}>
          2-5 lands is the keepable range. 0-1 means mulligan; 6+ means flood.
        </div>
      </div>
      {sim.sampleHands.length > 0 && (
        <div className="border-t p-5" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: CREAM_DIM }}>
            Sample hands
          </div>
          <div className="space-y-3">
            {sim.sampleHands.slice(0, 4).map((h, i) => (
              <div key={i} className="border-t pt-2" style={{ borderColor: CREAM_FAINT }}>
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
                    hand {i + 1}
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: h.keep ? '#a3c98a' : ACCENT }}>
                    {h.keep ? 'keep' : 'mulligan'}
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
                    {h.lands}L · {h.ramp}R · {h.draw}D
                  </span>
                </div>
                <div className="font-serif text-xs flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: CREAM }}>
                  {h.hand.map((c, j) => (
                    <span key={j} title={c.scryfall.type_line}>{c.name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayoutResult({ log, onReroll }) {
  return (
    <div className="border" style={{ borderColor: CREAM_FAINT }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          Sample Playout · 6 turns
        </div>
        <button
          onClick={onReroll}
          className="font-serif text-[10px] tracking-[0.3em] uppercase"
          style={{ color: CREAM_DIM }}
        >
          Reroll →
        </button>
      </div>
      <div className="p-5 space-y-3">
        {log.map((t) => (
          <div key={t.turn} className="grid grid-cols-12 gap-3 items-baseline border-b pb-2" style={{ borderColor: CREAM_FAINT }}>
            <div className="col-span-1 font-serif font-black text-lg" style={{ color: CREAM }}>
              T{t.turn}
            </div>
            <div className="col-span-2 font-mono text-[10px]" style={{ color: CREAM_DIM }}>
              {t.mana} mana · {t.lands}L · {pad(t.handSize)} in hand
            </div>
            <div className="col-span-9">
              {t.landPlayed && (
                <div className="font-serif text-xs" style={{ color: CREAM_DIM }}>
                  → played <span style={{ color: CREAM }}>{t.landPlayed}</span>
                </div>
              )}
              {t.casts.length > 0 ? (
                <div className="font-serif text-xs mt-0.5" style={{ color: CREAM_DIM }}>
                  → cast{' '}
                  {t.casts.map((c, i) => (
                    <span key={i} style={{ color: CREAM }}>
                      {c.name} <span style={{ color: CREAM_DIM, fontSize: '0.85em' }}>({c.cmc})</span>{i < t.casts.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              ) : !t.landPlayed ? (
                <div className="font-serif text-xs italic" style={{ color: ACCENT }}>
                  → stalled — no land, nothing castable
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t px-5 py-3 font-serif text-xs italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
        Simple model — drops a land, casts the biggest affordable spells, no mulligan / blocking / interaction. Reroll for another sample.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROBABILITIES TAB
// ═══════════════════════════════════════════════════════════════════════════════

export function ProbabilitiesTab({ deck }) {
  const [byTurn, setByTurn] = useState(3);
  const [selectedTag, setSelectedTag] = useState('Ramp');

  const tags = useMemo(() => {
    const s = new Set();
    for (const c of deck.cards) for (const t of c.tags || []) s.add(t);
    return Array.from(s).sort();
  }, [deck.cards]);

  const counts = useMemo(() => {
    const m = {};
    for (const c of deck.cards) {
      if (!c.scryfall) continue;
      for (const t of c.tags || []) m[t] = (m[t] || 0) + c.count;
    }
    return m;
  }, [deck.cards]);

  const deckSize = deck.cards.filter((c) => c.scryfall).reduce((s, c) => s + c.count, 0);
  const successes = counts[selectedTag] || 0;
  const drawCount = 7 + Math.max(0, byTurn - 1);

  const probs = useMemo(() => {
    if (deckSize === 0) return null;
    return {
      p1: hypergeom(deckSize, successes, drawCount, 1),
      p2: hypergeom(deckSize, successes, drawCount, 2),
      p3: hypergeom(deckSize, successes, drawCount, 3),
    };
  }, [deckSize, successes, drawCount]);

  return (
    <div className="space-y-8">
      <GoldfishSection deck={deck} />

      <div className="flex items-baseline gap-4">
        <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
          Tag Probability
        </div>
        <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }}></div>
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          hypergeometric
        </div>
      </div>

      <div className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
        Opening hand of 7 plus 1 draw per turn (approximate).
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
        <div className="border-r border-b p-5" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: CREAM_DIM }}>
            Tag
          </div>
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="w-full border px-3 py-2 font-mono text-sm cursor-pointer"
            style={{ borderColor: CREAM_FAINT, color: CREAM, background: BG }}
          >
            {tags.map((t) => (
              <option key={t} value={t}>
                {t} · {counts[t] || 0}
              </option>
            ))}
          </select>
        </div>
        <div className="border-r border-b p-5" style={{ borderColor: CREAM_FAINT }}>
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
              Turn
            </div>
            <div className="font-serif font-black text-2xl" style={{ color: CREAM }}>
              T{byTurn}
            </div>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={byTurn}
            onChange={(e) => setByTurn(parseInt(e.target.value))}
            className="w-full"
            style={{ accentColor: CREAM }}
          />
          <div className="font-mono text-[10px] mt-2" style={{ color: CREAM_DIM }}>
            cards seen · {pad(drawCount)}
          </div>
        </div>
      </div>

      {probs && (
        <div className="grid grid-cols-3 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
          <ProbCard label="P(≥1)" p={probs.p1} />
          <ProbCard label="P(≥2)" p={probs.p2} />
          <ProbCard label="P(≥3)" p={probs.p3} />
        </div>
      )}

      <div className="border" style={{ borderColor: CREAM_FAINT }}>
        <div
          className="px-5 py-3 border-b font-serif text-sm tracking-[0.3em] uppercase font-bold"
          style={{ borderColor: CREAM_FAINT, color: CREAM }}
        >
          Tag Inventory
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 24)
            .map(([t, n]) => (
              <div
                key={t}
                className="flex items-center justify-between border-r border-b px-3 py-2 cursor-pointer transition"
                style={{ borderColor: CREAM_FAINT }}
                onClick={() => setSelectedTag(t)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <TagPill tag={t} />
                <span className="font-serif font-bold text-sm" style={{ color: CREAM }}>
                  {pad(n)}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECOMMENDATIONS TAB
// ═══════════════════════════════════════════════════════════════════════════════

export function RecommendationsTab({ deck, onUpdate }) {
  const [recs, setRecs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState({}); // { cardName: true } while fetching
  const [view, setView] = useState('synergy'); // 'synergy' | 'theme'

  useEffect(() => {
    let cancelled = false;
    if (!deck.commander) {
      setRecs(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchRecommendations(deck.commander.name)
      .then((r) => {
        if (cancelled) return;
        if (!r) setError('EDHREC has no page for this commander yet.');
        setRecs(r);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [deck.commander?.name]);

  const excludeNames = useMemo(() => {
    const s = new Set(deck.cards.map((c) => c.name.toLowerCase()));
    if (deck.commander) s.add(deck.commander.name.toLowerCase());
    return s;
  }, [deck.cards, deck.commander]);

  const topList = useMemo(
    () => (recs ? topRecommendations(recs, excludeNames, 40) : []),
    [recs, excludeNames]
  );

  const archetype = useMemo(() => classifyArchetype(deck).primary, [deck.cards, deck.commander]);

  const byTheme = useMemo(
    () => (recs ? themesForArchetype(recs, archetype?.id, excludeNames).map((t) => ({ ...t, cards: t.cards.slice(0, 8) })) : []),
    [recs, excludeNames, archetype]
  );

  const cuts = useMemo(
    () => (recs ? suggestCuts(deck, recs) : []),
    [deck, recs]
  );

  const addRec = async (rec) => {
    setAdding((a) => ({ ...a, [rec.name]: true }));
    try {
      const card = await fetchCardByExactName(rec.name);
      if (card) onUpdate(addCardsToDeck(deck, [{ name: card.name, count: 1, scryfall: card }]));
    } finally {
      setAdding((a) => {
        const next = { ...a };
        delete next[rec.name];
        return next;
      });
    }
  };

  const removeFromDeck = (cardName) => {
    onUpdate(removeCardFromDeck(deck, cardName));
  };

  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState('');

  /**
   * Build a 99-card seed deck from EDHREC's top recommendations.
   * Replaces the current cards (commander unchanged). Useful when
   * a user wants the "typical Edgar Markov list" as a starting point.
   */
  const seedFromAverage = async () => {
    if (!recs || !confirm('Replace current cards with EDHREC\'s top 99 picks for this commander?')) return;
    setSeeding(true);
    try {
      const top = topRecommendations(recs, new Set([deck.commander.name.toLowerCase()]), 99);
      const names = top.map((r) => r.name);
      setSeedProgress(`Fetching ${names.length} cards from Scryfall...`);
      // Use the batch endpoint via fetchCardsByName for efficiency.
      const { fetchCardsByName } = await import('../lib/scryfall.js');
      const { results } = await fetchCardsByName(names, setSeedProgress);
      const cards = names
        .map((n) => {
          const card = results[n.toLowerCase()];
          return card ? { name: card.name, count: 1, scryfall: card } : null;
        })
        .filter(Boolean);
      onUpdate({ ...deck, cards: [] }); // clear
      onUpdate(addCardsToDeck({ ...deck, cards: [] }, cards));
      setSeedProgress('');
    } finally {
      setSeeding(false);
    }
  };

  if (!deck.commander) {
    return (
      <EmptyState
        title="No commander set"
        body="Pick a commander (above the tabs) and we'll fetch EDHREC's top cards played alongside it, ranked by synergy. Also unlocks cut suggestions and the seed-99-card builder."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
          Based on EDHREC data for <span style={{ color: CREAM }}>{deck.commander.name}</span>. Recs are cards typical decks run; Cuts flags the weakest cards already in your list.
        </div>
        {/* Picker on its own row so the three options can't L-wrap into a
            confused stack at narrow widths. */}
        <div className="inline-flex border" style={{ borderColor: CREAM_FAINT }}>
          {[
            { id: 'synergy', label: 'Top Synergy' },
            { id: 'theme', label: 'By Theme' },
            { id: 'cuts', label: `Cuts${cuts.length ? ` · ${cuts.length}` : ''}` },
          ].map((v, i) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className="px-4 py-2 font-serif text-[10px] tracking-[0.25em] uppercase transition whitespace-nowrap"
              style={{
                color: view === v.id ? CREAM : CREAM_DIM,
                background: view === v.id ? 'rgba(243,231,201,0.06)' : 'transparent',
                borderLeft: i > 0 ? `1px solid ${CREAM_FAINT}` : 'none',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {recs && deck.cards.length < 50 && (
        <div className="border p-4 flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-5" style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.025)' }}>
          <div className="flex-1">
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: CREAM_DIM }}>
              Quick start
            </div>
            <div className="font-serif text-sm" style={{ color: CREAM }}>
              Build a 99-card baseline from EDHREC's top picks for {deck.commander.name}.
            </div>
            <div className="font-serif text-xs italic mt-0.5" style={{ color: CREAM_DIM }}>
              Replaces the current cards. Use this as a starting point to iterate from.
            </div>
          </div>
          <button
            onClick={seedFromAverage}
            disabled={seeding}
            className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 shrink-0 disabled:opacity-40"
            style={{ borderColor: CREAM_FAINT, color: CREAM }}
          >
            {seeding ? (seedProgress || 'Building...') : 'Seed 99-card deck →'}
          </button>
        </div>
      )}

      {loading && (
        <div className="border p-8 text-center" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-mono text-xs" style={{ color: CREAM_DIM }}>
            Querying EDHREC...
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="border p-6" style={{ borderColor: ACCENT, background: 'rgba(196,74,63,0.06)' }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: ACCENT }}>
            Unavailable
          </div>
          <div className="font-mono text-xs" style={{ color: CREAM_DIM }}>
            {error}
          </div>
        </div>
      )}

      {!loading && !error && view === 'synergy' && topList.length > 0 && (
        <div className="border-t border-l" style={{ borderColor: CREAM_FAINT }}>
          {topList.map((rec) => (
            <RecRow
              key={rec.name}
              rec={rec}
              busy={!!adding[rec.name]}
              onAdd={() => addRec(rec)}
            />
          ))}
        </div>
      )}

      {!loading && !error && view === 'theme' && byTheme.length > 0 && (
        <div className="space-y-3">
          {archetype && (
            <div className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
              Themes matching the detected archetype (<span style={{ color: CREAM }}>{archetype.name}</span>) are highlighted and shown first.
            </div>
          )}
          {byTheme.map((theme) => (
            <div key={theme.header} className="border" style={{ borderColor: theme.relevant ? CREAM : CREAM_FAINT }}>
              <div
                className="px-4 py-2 border-b flex items-center justify-between"
                style={{ borderColor: theme.relevant ? CREAM : CREAM_FAINT, background: theme.relevant ? 'rgba(243,231,201,0.06)' : 'rgba(243,231,201,0.02)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="font-serif text-sm tracking-[0.2em] uppercase font-bold" style={{ color: CREAM }}>
                    {theme.header}
                  </div>
                  {theme.relevant && (
                    <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 border" style={{ borderColor: CREAM, color: CREAM }}>
                      on archetype
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
                  {pad(theme.cards.length)} cards
                </span>
              </div>
              <div>
                {theme.cards.map((rec) => (
                  <RecRow
                    key={rec.name}
                    rec={rec}
                    busy={!!adding[rec.name]}
                    onAdd={() => addRec(rec)}
                    compact
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && view === 'cuts' && (
        cuts.length === 0 ? (
          <div className="border p-12 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            No obvious cuts. Every card in this deck is either commonly played with this commander or carries a detected role.
          </div>
        ) : (
          <div className="border-t border-l" style={{ borderColor: CREAM_FAINT }}>
            <div className="border-r border-b px-4 py-2 font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM, background: 'rgba(243,231,201,0.025)' }}>
              {cuts.length} possible cut{cuts.length === 1 ? '' : 's'} — weakest first
            </div>
            {cuts.map((cut) => (
              <CutRow
                key={cut.card.name}
                cut={cut}
                replacements={topList}
                busy={adding}
                onRemove={() => removeFromDeck(cut.card.name)}
                onReplace={async (rec) => {
                  // Atomic: remove the cut card, then add the rec.
                  setAdding((a) => ({ ...a, [rec.name]: true }));
                  try {
                    const card = await fetchCardByExactName(rec.name);
                    let next = removeCardFromDeck(deck, cut.card.name);
                    if (card) next = addCardsToDeck(next, [{ name: card.name, count: 1, scryfall: card }]);
                    onUpdate(next);
                  } finally {
                    setAdding((a) => {
                      const n = { ...a };
                      delete n[rec.name];
                      return n;
                    });
                  }
                }}
              />
            ))}
          </div>
        )
      )}

      {!loading && !error && (view === 'synergy' || view === 'theme') && topList.length === 0 && byTheme.length === 0 && recs && (
        <div className="border p-12 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          You already have all of EDHREC's top recommendations for this commander. Nice.
        </div>
      )}
    </div>
  );
}

function CutRow({ cut, replacements, busy, onRemove, onReplace }) {
  const c = cut.card;
  const [showPicker, setShowPicker] = useState(false);
  const reasonColor =
    cut.reason === 'missing-from-edhrec' ? ACCENT :
    cut.reason === 'low-synergy' ? '#d8b35a' :
    CREAM_DIM;
  const reasonLabel =
    cut.reason === 'missing-from-edhrec' ? 'off-strategy' :
    cut.reason === 'low-synergy' ? 'low synergy' :
    'untagged';
  // Top 5 EDHREC recs not already in the deck — what we offer as swaps.
  const swapCandidates = (replacements || []).slice(0, 5);

  return (
    <div className="border-r border-b" style={{ borderColor: CREAM_FAINT }}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="font-serif font-bold uppercase tracking-tight truncate" style={{ color: CREAM, fontSize: '0.95rem' }}>
              {c.name}
            </span>
            <span className="font-mono text-[10px] tracking-wider shrink-0" style={{ color: CREAM_DIM }}>
              cmc {c.scryfall.cmc ?? 0}
            </span>
          </div>
          <div className="font-serif text-xs italic mt-0.5" style={{ color: CREAM_DIM }}>
            {cut.note}
          </div>
        </div>
        <div className="hidden md:block shrink-0">
          <span className="font-mono text-[10px] tracking-wider px-2 py-0.5 border" style={{ borderColor: reasonColor, color: reasonColor }}>
            {reasonLabel}
          </span>
        </div>
        {swapCandidates.length > 0 && onReplace && (
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="font-serif text-[10px] tracking-[0.3em] uppercase px-3 py-1 border transition shrink-0"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
            title="Cut and replace with a recommended card"
          >
            {showPicker ? 'Close' : 'Swap'}
          </button>
        )}
        <button
          onClick={onRemove}
          className="font-serif text-[10px] tracking-[0.3em] uppercase px-3 py-1 border transition shrink-0"
          style={{ borderColor: CREAM_FAINT, color: CREAM }}
          title="Remove this card from the deck"
        >
          Cut
        </button>
      </div>
      {showPicker && swapCandidates.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1" style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.025)' }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Replace with — top EDHREC picks
          </div>
          {swapCandidates.map((rec) => (
            <button
              key={rec.name}
              onClick={() => {
                onReplace(rec);
                setShowPicker(false);
              }}
              disabled={!!busy[rec.name]}
              className="w-full flex items-center justify-between gap-3 px-2 py-1.5 border transition disabled:opacity-40"
              style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.02)')}
            >
              <span className="font-serif font-bold uppercase tracking-tight truncate text-left" style={{ color: CREAM, fontSize: '0.85rem' }}>
                {rec.name}
              </span>
              <span className="font-mono text-[10px] tracking-wider shrink-0" style={{ color: CREAM_DIM }}>
                synergy {rec.synergy >= 0 ? '+' : ''}{(rec.synergy * 100).toFixed(0)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecRow({ rec, busy, onAdd, compact }) {
  const inclusionPct = Math.round(rec.inclusion * 100);
  const synergyLabel =
    rec.synergy >= 0.2 ? 'high' :
    rec.synergy >= 0.1 ? 'mid' :
    rec.synergy >= 0 ? 'low' : 'neg';
  return (
    <div
      className={`border-r border-b flex items-center gap-3 px-3 ${compact ? 'py-1.5' : 'py-2.5'}`}
      style={{ borderColor: CREAM_FAINT }}
    >
      {rec.imageUrl && !compact && (
        <img
          src={`https://images.weserv.nl/?url=${encodeURIComponent(rec.imageUrl)}`}
          alt=""
          className="w-9 h-12 object-cover"
          loading="lazy"
          style={{ borderColor: CREAM_FAINT, borderWidth: 1 }}
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-serif font-bold uppercase tracking-tight truncate" style={{ color: CREAM, fontSize: compact ? '0.85rem' : '0.95rem' }}>
          {rec.name}
        </div>
        {!compact && rec.label && (
          <div className="font-serif text-xs italic truncate" style={{ color: CREAM_DIM }}>
            {rec.label}
          </div>
        )}
      </div>
      <div className="hidden md:flex flex-col items-end shrink-0">
        <span className="font-mono text-[10px] tracking-wider" style={{ color: CREAM_DIM }}>
          synergy · {synergyLabel} {rec.synergy >= 0 ? '+' : ''}{(rec.synergy * 100).toFixed(0)}
        </span>
        {inclusionPct > 0 && (
          <span className="font-mono text-[9px]" style={{ color: CREAM_DIM }}>
            in {inclusionPct}% of decks
          </span>
        )}
      </div>
      <button
        onClick={onAdd}
        disabled={busy}
        className="font-serif text-[10px] tracking-[0.3em] uppercase px-3 py-1 border transition disabled:opacity-40"
        style={{ borderColor: CREAM_FAINT, color: CREAM }}
        title="Fetch the card from Scryfall and add it to the deck"
      >
        {busy ? '...' : 'Add'}
      </button>
    </div>
  );
}
