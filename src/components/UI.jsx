import React, { useState, useEffect } from 'react';
import { Search, Loader2, Tag, Trash2, X } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { pad } from '../lib/utils.js';
import { cardImageUrl, searchCardAutocomplete, fetchCardByExactName } from '../lib/scryfall.js';

// ───────────────────────────────────────────────────────────────────────────────

export function CardThumb({ card, size = 'sm' }) {
  const [errored, setErrored] = useState(false);
  if (!card?.name) return null;
  const ver = size === 'sm' ? 'small' : 'normal';
  const url = cardImageUrl(card, ver);
  const sz = size === 'sm' ? 'w-10 h-14' : 'w-32 h-44';
  if (errored) {
    return (
      <div
        className={`${sz} flex items-center justify-center text-[8px] text-center px-1 leading-tight font-serif`}
        style={{ background: BG, borderColor: CREAM_FAINT, borderWidth: 1, color: CREAM_DIM }}
      >
        {card.name.slice(0, 14)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={card.name}
      className={`${sz} object-cover`}
      style={{ background: BG, borderColor: CREAM_FAINT, borderWidth: 1 }}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function TagPill({ tag, onRemove }) {
  const accent = ['Game Changer', 'Combo piece', 'Mass Land Destruction', 'Extra Turn'].includes(tag);
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 border font-mono uppercase tracking-wider"
      style={{
        borderColor: accent ? ACCENT : CREAM_FAINT,
        color: accent ? ACCENT : CREAM_DIM,
        background: accent ? 'rgba(196,74,63,0.05)' : 'transparent',
      }}
    >
      {tag}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-100">
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function StatBox({ label, value, sub }) {
  return (
    <div className="border p-4" style={{ borderColor: CREAM_FAINT }}>
      <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: CREAM_DIM }}>
        {label}
      </div>
      <div className="font-serif font-black" style={{ color: CREAM, fontSize: '2rem', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div className="font-mono text-[10px] mt-1.5" style={{ color: CREAM_DIM }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function FlagBox({ title, items, desc }) {
  const active = items.length > 0;
  return (
    <div
      className="border-r border-b p-5"
      style={{ borderColor: CREAM_FAINT, background: active ? 'rgba(196,74,63,0.04)' : 'transparent' }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div
          className="font-serif text-sm tracking-[0.2em] uppercase font-bold"
          style={{ color: active ? CREAM : CREAM_DIM }}
        >
          {title}
        </div>
        <div className="font-serif font-black text-2xl" style={{ color: active ? ACCENT : CREAM_DIM }}>
          {pad(items.length)}
        </div>
      </div>
      <div className="font-serif text-xs italic mb-3" style={{ color: CREAM_DIM }}>
        {desc}
      </div>
      {items.length > 0 && (
        <ul className="font-mono text-[11px] space-y-0.5" style={{ color: CREAM }}>
          {items.slice(0, 5).map((i, idx) => (
            <li key={idx}>· {i}</li>
          ))}
          {items.length > 5 && <li style={{ color: CREAM_DIM }}>+ {items.length - 5} more</li>}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function ProbCard({ label, p }) {
  const pct = (p * 100).toFixed(1);
  return (
    <div className="border-r border-b p-6 text-center" style={{ borderColor: CREAM_FAINT }}>
      <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
        {label}
      </div>
      <div className="font-serif font-black leading-none" style={{ color: CREAM, fontSize: 'clamp(2.5rem, 5vw, 3.5rem)' }}>
        {pct}
        <span className="text-2xl">%</span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function RuleSection({ title, children }) {
  return (
    <div>
      <div
        className="font-serif text-[10px] tracking-[0.4em] uppercase font-bold mb-3 border-b pb-2"
        style={{ color: CREAM_DIM, borderColor: CREAM_FAINT }}
      >
        {title}
      </div>
      <ul className="space-y-2 ml-2">{children}</ul>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function CardRow({ entry, idx, onChangeCount, onRemove, onEditTags }) {
  const c = entry.scryfall;
  const [hoverPos, setHoverPos] = useState(null);
  const [imgError, setImgError] = useState(false);
  if (!c) return null;

  const handleMouseEnter = (e) => {
    setImgError(false);
    setHoverPos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseMove = (e) => {
    if (hoverPos) setHoverPos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseLeave = () => setHoverPos(null);

  let previewStyle = null;
  if (hoverPos) {
    const W = 256, H = 360, M = 16;
    const willOverflowRight = hoverPos.x + W + M > window.innerWidth;
    const top = Math.max(10, Math.min(hoverPos.y - H / 2, window.innerHeight - H - 10));
    const left = willOverflowRight ? hoverPos.x - W - M : hoverPos.x + M;
    previewStyle = { position: 'fixed', left: `${left}px`, top: `${top}px`, zIndex: 50, pointerEvents: 'none' };
  }

  return (
    <div
      className="border-b p-3 flex gap-3 items-start transition"
      style={{ borderColor: CREAM_FAINT }}
      onMouseEnter={(e) => {
        handleMouseEnter(e);
        e.currentTarget.style.background = 'rgba(243,231,201,0.025)';
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={(e) => {
        handleMouseLeave();
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div className="font-mono text-[10px] w-8 pt-1.5 shrink-0 tracking-wider" style={{ color: CREAM_DIM }}>
        {pad(idx + 1)}
      </div>
      <CardThumb card={c} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <span
            className="font-serif font-bold uppercase tracking-tight truncate"
            style={{ color: CREAM, fontSize: '0.95rem' }}
          >
            {c.name}
          </span>
          <span className="font-serif text-xs italic shrink-0" style={{ color: CREAM_DIM }}>
            {c.type_line}
          </span>
        </div>
        <div className="font-serif text-xs mt-1 line-clamp-2 leading-snug" style={{ color: CREAM_DIM }}>
          {c.oracle_text || c.card_faces?.[0]?.oracle_text}
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {(entry.tags || []).map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <div className="font-mono text-[10px] tracking-wider" style={{ color: CREAM_DIM }}>
          cmc · {c.cmc ?? 0}
        </div>
        <div className="flex items-center gap-px border" style={{ borderColor: CREAM_FAINT }}>
          <button
            onClick={() => onChangeCount(entry, entry.count - 1)}
            className="w-6 h-5 text-xs font-mono"
            style={{ color: CREAM_DIM }}
          >
            −
          </button>
          <span className="w-7 text-center font-mono text-xs" style={{ color: CREAM }}>
            {entry.count}
          </span>
          <button
            onClick={() => onChangeCount(entry, entry.count + 1)}
            className="w-6 h-5 text-xs font-mono"
            style={{ color: CREAM_DIM }}
          >
            +
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEditTags(entry)} className="hover:opacity-100" style={{ color: CREAM_DIM }} title="Edit tags">
            <Tag className="w-3 h-3" />
          </button>
          <button onClick={() => onRemove(entry)} className="hover:text-red-400" style={{ color: CREAM_DIM }}>
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {previewStyle && !imgError && (
        <div style={previewStyle}>
          <img
            src={cardImageUrl(c, 'normal')}
            className="w-64"
            style={{ borderColor: CREAM_FAINT, borderWidth: 1 }}
            alt={c.name}
            onError={() => setImgError(true)}
          />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function CardSearchBar({ onAdd }) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q || q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await searchCardAutocomplete(q);
      setSuggestions(r.slice(0, 8));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const handleSelect = async (name) => {
    setLoading(true);
    const card = await fetchCardByExactName(name);
    setLoading(false);
    if (card) {
      onAdd([{ name: card.name, count: 1, scryfall: card }]);
      setQ('');
      setSuggestions([]);
    }
  };

  return (
    <div className="relative">
      <div
        className="flex gap-3 items-center border px-4 py-2.5"
        style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
      >
        <Search className="w-3.5 h-3.5" style={{ color: CREAM_DIM }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search card archive..."
          className="flex-1 bg-transparent focus:outline-none font-mono text-sm"
          style={{ color: CREAM }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && suggestions[0]) handleSelect(suggestions[0]);
          }}
        />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: CREAM_DIM }} />}
      </div>
      {suggestions.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 border-t-0 border z-20 max-h-64 overflow-auto"
          style={{ background: BG, borderColor: CREAM_FAINT }}
        >
          {suggestions.map((s) => (
            <div
              key={s}
              onClick={() => handleSelect(s)}
              className="px-4 py-2.5 cursor-pointer font-mono text-xs border-b last:border-0 transition"
              style={{ borderColor: CREAM_FAINT, color: CREAM }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
