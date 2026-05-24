import React, { useState } from 'react';
import { X, Loader2, Check, BookOpen } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { pad, parseDecklist, lc } from '../lib/utils.js';
import { fetchCardsByName } from '../lib/scryfall.js';
import { TagPill, RuleSection } from './UI.jsx';
import { BRACKETS } from '../lib/constants.js';

// ───────────────────────────────────────────────────────────────────────────────

export function BulkAddModal({ onClose, onAdd }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [notFound, setNotFound] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleAdd = async () => {
    const entries = parseDecklist(text);
    if (entries.length === 0) {
      setError('No valid card lines found.');
      return;
    }
    setLoading(true);
    setNotFound([]);
    setError(null);
    setSuccess(null);
    setProgress('Initializing...');
    const names = [...new Set(entries.map((e) => e.name))];
    try {
      const { results, notFound: nf, errors } = await fetchCardsByName(names, setProgress);
      const cards = entries
        .map((e) => {
          const card = results[lc(e.name)];
          return card ? { name: card.name, count: e.count, scryfall: card } : null;
        })
        .filter(Boolean);
      setLoading(false);
      setProgress('');
      setNotFound(nf);
      if (cards.length > 0) {
        onAdd(cards);
        setSuccess(`Loaded ${cards.length} cards${nf.length > 0 ? ` · ${nf.length} unresolved` : ''}`);
        if (errors.length > 0) setError(errors.join(' · '));
        if (nf.length === 0 && errors.length === 0) setTimeout(onClose, 700);
      } else if (errors.length > 0) {
        setError(errors.join(' · '));
      } else {
        setError(`No matches found.`);
      }
    } catch (e) {
      setLoading(false);
      setProgress('');
      setError(`Error: ${e.message}`);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            <span style={{ color: CREAM_DIM }}>·</span> Bulk Import
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }} className="hover:opacity-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 flex-1 overflow-auto">
          <p className="font-serif text-sm mb-4 italic" style={{ color: CREAM_DIM }}>
            Paste decklist below. Format: <span className="font-mono not-italic">1 Card Name</span> per line. Set codes are stripped automatically.
          </p>
          <div className="border" style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'1 Sol Ring\n1 Arcane Signet\n1 Bloodghast\n...'}
              className="w-full h-56 p-4 bg-transparent border-none focus:outline-none font-mono text-sm"
              style={{ color: CREAM }}
              disabled={loading}
            />
          </div>
          {progress && (
            <div
              className="mt-4 px-4 py-3 border font-mono text-[11px] flex items-center gap-2"
              style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
            >
              <Loader2 className="w-3 h-3 animate-spin" /> {progress}
            </div>
          )}
          {error && (
            <div className="mt-4 px-4 py-3 border" style={{ borderColor: ACCENT, background: 'rgba(196,74,63,0.08)' }}>
              <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: ACCENT }}>
                Error
              </div>
              <div className="font-mono text-xs" style={{ color: CREAM_DIM }}>
                {error}
              </div>
            </div>
          )}
          {success && (
            <div
              className="mt-4 px-4 py-3 border font-serif text-sm flex items-center gap-2"
              style={{ borderColor: CREAM_FAINT, color: CREAM }}
            >
              <Check className="w-3.5 h-3.5" /> {success}
            </div>
          )}
          {notFound.length > 0 && (
            <div className="mt-4 px-4 py-3 border" style={{ borderColor: CREAM_FAINT }}>
              <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
                Unresolved · {pad(notFound.length)}
              </div>
              <ul className="font-mono text-xs space-y-0.5 max-h-40 overflow-auto" style={{ color: CREAM_DIM }}>
                {notFound.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-4" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Close
          </button>
          <button
            onClick={handleAdd}
            disabled={loading || !text.trim()}
            className="font-serif text-[10px] tracking-[0.3em] uppercase disabled:opacity-30"
            style={{ color: CREAM }}
          >
            {loading ? 'Loading...' : 'Execute →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

const COMMON_TAGS = [
  'Lifegain', '+1/+1 counters', 'Token producer', 'Ramp', 'Card draw', 'Tutor',
  'Targeted removal', 'Board wipe', 'Recursion', 'Sacrifice outlet', 'ETB trigger',
  'Death trigger', 'Combat trigger', 'Haste enabler', 'Anthem', 'Protection',
  'Mana rock', 'Reanimation', 'Combo piece',
];

export function TagEditModal({ entry, onClose, onSave }) {
  const [tags, setTags] = useState(entry.tags || []);
  const [newTag, setNewTag] = useState('');

  const add = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-lg border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            Edit Tags
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
              {entry.scryfall.name}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 ? (
                <span className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
                  No tags
                </span>
              ) : (
                tags.map((t) => (
                  <TagPill key={t} tag={t} onRemove={() => setTags(tags.filter((x) => x !== t))} />
                ))
              )}
            </div>
          </div>
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
              Presets
            </div>
            <div className="flex flex-wrap gap-1">
              {COMMON_TAGS.filter((t) => !tags.includes(t)).map((t) => (
                <button
                  key={t}
                  onClick={() => setTags([...tags, t])}
                  className="text-[10px] px-2 py-0.5 border font-mono uppercase tracking-wider hover:opacity-100 transition"
                  style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
              Custom
            </div>
            <div
              className="flex gap-2 border px-3 py-2"
              style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
            >
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') add();
                }}
                placeholder="edgar payoff..."
                className="flex-1 bg-transparent focus:outline-none font-mono text-xs"
                style={{ color: CREAM }}
              />
              <button onClick={add} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
                Add
              </button>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-4" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(tags);
              onClose();
            }}
            className="font-serif text-[10px] tracking-[0.3em] uppercase"
            style={{ color: CREAM }}
          >
            Save →
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function RulesModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div
          className="px-5 py-4 border-b sticky top-0 flex items-center justify-between z-10"
          style={{ borderColor: CREAM_FAINT, background: BG }}
        >
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
            <BookOpen className="w-3.5 h-3.5" /> Commander Rules
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-6 font-serif text-sm" style={{ color: CREAM }}>
          <RuleSection title="Deck Construction">
            <li>Exactly 100 cards including commander(s).</li>
            <li>Singleton: only one copy of each card except basic lands.</li>
            <li>Commander must be a legendary creature (or designated planeswalker).</li>
            <li>Color identity: every card's mana symbols must be within commander's color identity.</li>
            <li>40 starting life; 21 commander damage from a single commander ends the game.</li>
          </RuleSection>
          <RuleSection title="The Brackets">
            {BRACKETS.map((b) => (
              <li key={b.n}>
                <b>{b.n} · {b.name}</b> — <span className="italic">{b.desc}</span>
              </li>
            ))}
          </RuleSection>
          <RuleSection title="What Escalates a Deck">
            <li>Game Changers (WotC curated list of strong cards)</li>
            <li>Mass land destruction</li>
            <li>Fast mana beyond Sol Ring and Arcane Signet</li>
            <li>Chained extra-turn effects</li>
            <li>Two-card infinite combos, especially uninteractive ones</li>
            <li>High tutor density (4+)</li>
          </RuleSection>
        </div>
      </div>
    </div>
  );
}
