import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Tag, Trash2, X, FileX, Bookmark, HelpCircle } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { pad } from '../lib/utils.js';
import { cardImageUrl, searchCardAutocomplete, fetchCardByExactName } from '../lib/scryfall.js';
import { ManaCost, ManaSymbol } from './ManaCost.jsx';
import { getLatestRelease } from '../lib/changelog.js';

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Question-mark help icon with a hover-revealed tooltip. Renders as a
 * small dim icon next to a label; on hover/focus shows a panel with
 * the body text. Click-to-toggle for touch.
 */
export function HelpTip({ children, side = 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-baseline" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="opacity-60 hover:opacity-100 transition"
        style={{ color: CREAM_DIM }}
        aria-label="Help"
      >
        <HelpCircle className="w-3 h-3" />
      </button>
      {open && (
        <span
          className="absolute z-30 w-64 p-3 border font-serif text-xs italic leading-snug normal-case tracking-normal"
          style={{
            background: BG,
            borderColor: CREAM_FAINT,
            color: CREAM_DIM,
            top: '100%',
            marginTop: '6px',
            [side]: 0,
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Version pill with a click-to-open popover that shows the latest
 * CHANGELOG entry inline. Click-toggle (not hover) so the panel stays
 * open long enough to scroll and read; closes on click-outside or Esc.
 * `align` controls which edge of the chip the popover anchors to so
 * it doesn't clip off-screen.
 */
export function VersionChip({ version, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const release = getLatestRelease();

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-serif text-[11px] tracking-[0.3em] uppercase hover:opacity-100 transition cursor-pointer"
        style={{ color: open ? CREAM : CREAM_DIM }}
        aria-label="What's new"
        aria-expanded={open}
      >
        v{version}
      </button>
      {open && (
        <span
          className="absolute z-40 w-80 max-h-96 overflow-y-auto border p-4 normal-case tracking-normal text-left block"
          style={{
            background: BG,
            borderColor: CREAM_FAINT,
            color: CREAM_DIM,
            top: 'calc(100% + 8px)',
            [align]: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-baseline justify-between mb-2 pb-2 border-b" style={{ borderColor: CREAM_FAINT }}>
            <span className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
              v{release.version}
            </span>
            <span className="font-serif text-[10px] italic" style={{ color: CREAM_DIM }}>
              latest
            </span>
          </div>
          {release.title && (
            <div className="font-serif text-sm italic mb-3" style={{ color: CREAM }}>
              {release.title}
            </div>
          )}
          {release.sections.map((s, i) => (
            <div key={i} className={i === 0 ? '' : 'mt-3'}>
              {s.heading && (
                <div className="font-serif text-[10px] tracking-[0.2em] uppercase font-bold mb-1" style={{ color: CREAM_DIM }}>
                  {s.heading}
                </div>
              )}
              <ul className="font-serif text-xs leading-snug space-y-1" style={{ color: CREAM_DIM }}>
                {s.items.slice(0, 8).map((item, j) => (
                  <li key={j} className="flex gap-1.5">
                    <span style={{ color: CREAM_FAINT }}>·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </span>
      )}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Reusable empty-state block. Use anywhere a tab/section has nothing
 * meaningful to show — pairs a one-line headline with optional helper
 * text and a call-to-action button.
 */
export function EmptyState({ title, body, action, actionLabel, icon }) {
  const Icon = icon || FileX;
  return (
    <div
      className="border p-10 flex flex-col items-center text-center"
      style={{ borderColor: CREAM_FAINT }}
    >
      <Icon className="w-6 h-6 mb-3" style={{ color: CREAM_DIM, opacity: 0.6 }} />
      <div className="font-serif text-sm tracking-[0.2em] uppercase font-bold" style={{ color: CREAM }}>
        {title}
      </div>
      {body && (
        <div className="font-serif text-sm italic mt-2 max-w-md" style={{ color: CREAM_DIM }}>
          {body}
        </div>
      )}
      {action && actionLabel && (
        <button
          onClick={action}
          className="mt-4 font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2"
          style={{ borderColor: CREAM_FAINT, color: CREAM }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function CardThumb({ card, size = 'sm', onClick }) {
  const [errored, setErrored] = useState(false);
  if (!card?.name) return null;
  const ver = size === 'sm' ? 'small' : 'normal';
  const url = cardImageUrl(card, ver);
  const sz = size === 'sm' ? 'w-10 h-14' : 'w-32 h-44';
  const interactive = !!onClick;
  if (errored) {
    return (
      <div
        className={`${sz} flex items-center justify-center text-[8px] text-center px-1 leading-tight font-serif ${interactive ? 'cursor-pointer' : ''}`}
        style={{ background: BG, borderColor: CREAM_FAINT, borderWidth: 1, color: CREAM_DIM }}
        onClick={onClick}
      >
        {card.name.slice(0, 14)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={card.name}
      className={`${sz} object-cover ${interactive ? 'cursor-pointer' : ''}`}
      style={{ background: BG, borderColor: CREAM_FAINT, borderWidth: 1 }}
      loading="lazy"
      onError={() => setErrored(true)}
      onClick={onClick}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Inline oracle splitter — emits a fragment instead of a block,
 * so it can be embedded in line-clamped row text without breaking layout.
 */
export function InlineOracle({ text }) {
  if (!text) return null;
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\{([^}]+)\}$/);
        if (m) return <ManaSymbol key={i} sym={m[1].replace('/', '')} size="0.9em" title={part} />;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/**
 * Render rules text with inline mana symbols. Splits on `{X}` patterns,
 * keeps the surrounding prose, and inserts a ManaSymbol for each match.
 */
export function OracleText({ text }) {
  if (!text) return null;
  // Split keeping the delimiters so we can map them back to symbols.
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <div className="font-serif text-sm whitespace-pre-wrap leading-relaxed" style={{ color: CREAM }}>
      {parts.map((part, i) => {
        const m = part.match(/^\{([^}]+)\}$/);
        if (m) return <ManaSymbol key={i} sym={m[1].replace('/', '')} size="0.95em" title={part} />;
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

/**
 * Centered card preview modal. Used when a user taps a card on touch
 * devices (where the hover preview can't fire) or wants to inspect
 * the full oracle text.
 */
export function CardPreview({ card, onClose }) {
  if (!card) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col md:flex-row gap-4 md:gap-6 max-w-3xl w-full max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={cardImageUrl(card, 'normal')}
          alt={card.name}
          className="w-64 self-center md:self-start shrink-0"
          style={{ borderColor: CREAM_FAINT, borderWidth: 1 }}
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
        <div className="flex-1 min-w-0 overflow-auto border p-5" style={{ borderColor: CREAM_FAINT, background: BG }}>
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h3 className="font-serif font-black uppercase tracking-tight" style={{ color: CREAM, fontSize: 'clamp(1.1rem, 3vw, 1.5rem)' }}>
              {card.name}
            </h3>
            <button onClick={onClose} style={{ color: CREAM_DIM }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="font-serif text-sm italic mb-3" style={{ color: CREAM_DIM }}>
            {card.type_line}
          </div>
          {card.mana_cost && (
            <div className="mb-3" style={{ color: CREAM, fontSize: '1.25rem' }}>
              <ManaCost cost={card.mana_cost} />
            </div>
          )}
          {card.oracle_text && (
            <OracleText text={card.oracle_text} />
          )}
          {(card.card_faces || []).map((face, i) => (
            face.oracle_text ? (
              <div key={i} className="mt-3 pt-3 border-t" style={{ borderColor: CREAM_FAINT }}>
                <OracleText text={face.oracle_text} />
              </div>
            ) : null
          ))}
          {(card.power || card.loyalty) && (
            <div className="font-mono text-sm mt-3 pt-3 border-t" style={{ borderColor: CREAM_FAINT, color: CREAM }}>
              {card.power ? `${card.power} / ${card.toughness}` : `Loyalty ${card.loyalty}`}
            </div>
          )}
        </div>
      </div>
    </div>
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

export function CardRow({ entry, idx, onChangeCount, onRemove, onEditTags, onDemoteToWishlist }) {
  const c = entry.scryfall;
  const [hoverPos, setHoverPos] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
      <CardThumb card={c} onClick={() => setShowPreview(true)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <button
            onClick={() => setShowPreview(true)}
            className="font-serif font-bold uppercase tracking-tight truncate text-left"
            style={{ color: CREAM, fontSize: '0.95rem' }}
          >
            {c.name}
          </button>
          <span className="font-serif text-xs italic shrink-0" style={{ color: CREAM_DIM }}>
            {c.type_line}
          </span>
        </div>
        <div
          className={`font-serif text-xs mt-1 leading-snug ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}
          style={{ color: CREAM_DIM }}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          title={expanded ? 'Collapse' : 'Expand oracle text'}
        >
          <InlineOracle text={c.oracle_text || c.card_faces?.[0]?.oracle_text} />
        </div>
        {entry.note && (
          <div
            className="font-serif text-xs mt-1.5 italic flex items-start gap-2 pl-2 border-l-2"
            style={{ color: CREAM, borderColor: CREAM_FAINT }}
          >
            <span style={{ color: CREAM_DIM, fontSize: '0.7rem' }}>note ·</span>
            <span className="flex-1">{entry.note}</span>
          </div>
        )}
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
          <button onClick={() => onEditTags(entry)} className="hover:opacity-100" style={{ color: CREAM_DIM }} title="Edit tags / notes">
            <Tag className="w-3 h-3" />
          </button>
          {onDemoteToWishlist && (
            <button
              onClick={() => onDemoteToWishlist(entry)}
              className="hover:opacity-100"
              style={{ color: CREAM_DIM }}
              title="Move to wishlist (set aside, doesn't count against 100)"
            >
              <Bookmark className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => onRemove(entry)} className="hover:text-red-400" style={{ color: CREAM_DIM }} title="Remove from deck">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {previewStyle && !imgError && (
        <div style={previewStyle} className="hidden md:block">
          <img
            src={cardImageUrl(c, 'normal')}
            className="w-64"
            style={{ borderColor: CREAM_FAINT, borderWidth: 1 }}
            alt={c.name}
            onError={() => setImgError(true)}
          />
        </div>
      )}
      {showPreview && <CardPreview card={c} onClose={() => setShowPreview(false)} />}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Card-name search with autocomplete. Hands resolved cards back to onAdd.
 * Optional `target` tells the caller where to put the result — when "deck"
 * or "wishlist" is offered via a small toggle the consumer renders, the
 * label changes accordingly.
 */
export function CardSearchBar({ onAdd, target = 'deck', onTargetChange }) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!q || q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await searchCardAutocomplete(q);
      setSuggestions(r.slice(0, 8));
      setHighlight(0);
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
      setHighlight(0);
    }
  };

  const onKey = (e) => {
    if (suggestions.length === 0) {
      if (e.key === 'Enter' && q.trim().length >= 2) handleSelect(q.trim());
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(suggestions[highlight] || suggestions[0]);
    } else if (e.key === 'Escape') {
      setSuggestions([]);
    }
  };

  const placeholder = target === 'wishlist'
    ? 'search and add to wishlist...'
    : 'search card archive...';

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
          placeholder={placeholder}
          className="flex-1 bg-transparent focus:outline-none font-mono text-sm"
          style={{ color: CREAM }}
          onKeyDown={onKey}
        />
        {onTargetChange && (
          <div className="flex border" style={{ borderColor: CREAM_FAINT }}>
            {['deck', 'wishlist'].map((t) => (
              <button
                key={t}
                onClick={() => onTargetChange(t)}
                className="font-mono text-[9px] px-2 py-0.5 uppercase tracking-wider"
                style={{
                  color: target === t ? CREAM : CREAM_DIM,
                  background: target === t ? 'rgba(243,231,201,0.08)' : 'transparent',
                }}
                title={t === 'deck' ? 'Add to deck' : 'Add to wishlist'}
              >
                {t === 'deck' ? '→ deck' : '→ wish'}
              </button>
            ))}
          </div>
        )}
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: CREAM_DIM }} />}
      </div>
      {suggestions.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 border-t-0 border z-20 max-h-64 overflow-auto"
          style={{ background: BG, borderColor: CREAM_FAINT }}
        >
          {suggestions.map((s, i) => (
            <div
              key={s}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setHighlight(i)}
              className="px-4 py-2.5 cursor-pointer font-mono text-xs border-b last:border-0 transition"
              style={{
                borderColor: CREAM_FAINT,
                color: CREAM,
                background: i === highlight ? 'rgba(243,231,201,0.08)' : 'transparent',
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
