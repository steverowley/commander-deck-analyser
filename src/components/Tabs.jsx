import React, { useState, useMemo, useEffect } from 'react';
import { Upload, BookOpen } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { lc, pad, hypergeom } from '../lib/utils.js';
import { detectTags, AUTO_TAGS } from '../lib/tags.js';
import { assessBracket } from '../lib/analyzers.js';
import { buildStagePlans, synergyHubs, packageWeight } from '../lib/strategy.js';
import { BRACKETS } from '../lib/constants.js';
import { CardSearchBar, CardRow, TagPill, CardThumb, StatBox, FlagBox, ProbCard } from './UI.jsx';
import { BulkAddModal, TagEditModal } from './Modals.jsx';

// ═══════════════════════════════════════════════════════════════════════════════
// CARDS TAB
// ═══════════════════════════════════════════════════════════════════════════════

export function CardsTab({ deck, onUpdate }) {
  const [showBulk, setShowBulk] = useState(false);
  const [editingTags, setEditingTags] = useState(null);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('type');

  const addCards = (newCards) => {
    const cardNames = new Set([...deck.cards, ...newCards].map((c) => lc(c.name)));
    const cardsCopy = deck.cards.map((c) => ({ ...c, tags: [...(c.tags || [])] }));
    for (const nc of newCards) {
      const existing = cardsCopy.find((c) => lc(c.name) === lc(nc.name));
      if (existing) existing.count += nc.count;
      else cardsCopy.push({ ...nc, tags: detectTags(nc.scryfall, cardNames) });
    }
    // Re-run tag detection across all cards (combo pieces depend on what's in the deck),
    // preserving any tags the user added manually.
    for (const c of cardsCopy) {
      if (c.scryfall) {
        const tags = detectTags(c.scryfall, cardNames);
        const manual = (c.tags || []).filter((t) => !AUTO_TAGS.has(t) && !t.startsWith('Tribal:'));
        c.tags = [...new Set([...tags, ...manual])];
      }
    }
    onUpdate({ ...deck, cards: cardsCopy });
  };

  const changeCount = (entry, count) => {
    if (count <= 0) onUpdate({ ...deck, cards: deck.cards.filter((c) => c !== entry) });
    else {
      entry.count = count;
      onUpdate({ ...deck, cards: [...deck.cards] });
    }
  };

  const removeCard = (entry) => onUpdate({ ...deck, cards: deck.cards.filter((c) => c !== entry) });

  const saveTagsForCard = (entry, tags) => {
    entry.tags = tags;
    onUpdate({ ...deck, cards: [...deck.cards] });
  };

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
          <CardSearchBar onAdd={addCards} />
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
        <span>{filtered.length === total ? `${filtered.length} visible` : `${filtered.length} / ${total} visible`}</span>
      </div>

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
              onEditTags={setEditingTags}
            />
          ))
        )}
      </div>

      {showBulk && <BulkAddModal onClose={() => setShowBulk(false)} onAdd={addCards} />}
      {editingTags && (
        <TagEditModal
          entry={editingTags}
          onClose={() => setEditingTags(null)}
          onSave={(t) => saveTagsForCard(editingTags, t)}
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
      <div className="border p-12 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
        Add cards on the Cards tab to see packages.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Synergy hubs */}
      <div>
        <div className="flex items-baseline gap-4 mb-3">
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            Synergy Hubs
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
                <div key={k} className="flex flex-col items-center">
                  <span className="font-serif font-black text-lg" style={{ color: CREAM }}>
                    {v}
                  </span>
                  <span className="font-mono text-[9px] tracking-widest mt-0.5" style={{ color: CREAM_DIM }}>
                    {k}
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BRACKET TAB
// ═══════════════════════════════════════════════════════════════════════════════

export function BracketTab({ deck }) {
  const assessment = useMemo(() => assessBracket(deck), [deck]);

  return (
    <div className="space-y-6">
      <div className="border" style={{ borderColor: CREAM_FAINT }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            Power Assessment
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
      <div className="border p-12 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
        Add cards to generate a stage-by-stage action plan.
      </div>
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
    <div className="space-y-6">
      <div className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
        Hypergeometric probability — opening hand of 7 plus 1 draw per turn (approximate).
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
