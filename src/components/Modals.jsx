import React, { useState } from 'react';
import { X, Loader2, Check, BookOpen, Copy, Download, Link as LinkIcon } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { pad, parseDecklist, lc } from '../lib/utils.js';
import { fetchCardsByName, fetchCardByExactName } from '../lib/scryfall.js';
import { exportDecklist } from '../lib/deckops.js';
import { buildShareUrl } from '../lib/share.js';
import { deckTotalPrice, formatPrice } from '../lib/pricing.js';
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

// ───────────────────────────────────────────────────────────────────────────────

export function ExportModal({ deck, onClose }) {
  const text = exportDecklist(deck);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (insecure context); fall through to manual select.
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.name.replace(/[^a-z0-9-]+/gi, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            <span style={{ color: CREAM_DIM }}>·</span> Export Decklist
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 flex-1 overflow-auto">
          <p className="font-serif text-sm mb-3 italic" style={{ color: CREAM_DIM }}>
            Moxfield/MTGA-compatible text. Paste this into any deck builder that accepts plain decklists.
          </p>
          {(() => {
            const price = deckTotalPrice(deck);
            if (price.priced === 0) return null;
            const approx = price.unpriced > 0 ? '~' : '';
            return (
              <div className="flex items-center gap-3 mb-3 font-mono text-[11px]" style={{ color: CREAM_DIM }}>
                <span>Deck price ·</span>
                <span style={{ color: CREAM, fontSize: '1.1rem', fontFamily: 'inherit' }}>
                  {approx}{formatPrice(price.total)} USD
                </span>
                {price.unpriced > 0 && <span>({price.unpriced} card{price.unpriced === 1 ? '' : 's'} unpriced)</span>}
              </div>
            );
          })()}
          <textarea
            value={text}
            readOnly
            onClick={(e) => e.currentTarget.select()}
            className="w-full h-72 p-4 border bg-transparent focus:outline-none font-mono text-xs leading-relaxed"
            style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
          />
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-4" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Close
          </button>
          <button
            onClick={download}
            className="font-serif text-[10px] tracking-[0.3em] uppercase flex items-center gap-2"
            style={{ color: CREAM }}
          >
            <Download className="w-3 h-3" /> Download .txt
          </button>
          <button
            onClick={copy}
            className="font-serif text-[10px] tracking-[0.3em] uppercase flex items-center gap-2"
            style={{ color: CREAM }}
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function ShareModal({ deck, onClose }) {
  const url = buildShareUrl(deck);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-xl border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
            <LinkIcon className="w-3.5 h-3.5" /> Share Deck
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
            Anyone with this link can open the deck. No accounts — the deck is encoded in the URL. Card data refetches from Scryfall on import.
          </p>
          <textarea
            value={url}
            readOnly
            onClick={(e) => e.currentTarget.select()}
            className="w-full h-24 p-3 border bg-transparent focus:outline-none font-mono text-[10px] leading-relaxed break-all"
            style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
          />
          <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
            {url.length} characters · {deck.cards.length} cards
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-4" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Close
          </button>
          <button
            onClick={copy}
            className="font-serif text-[10px] tracking-[0.3em] uppercase flex items-center gap-2"
            style={{ color: CREAM }}
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy link →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Full-deck import. Reads a pasted Moxfield/MTGA text decklist, detects
 * a Commander block if present, and hands the resolved cards + commander
 * back to onImport. Caller is expected to create a fresh deck (or replace
 * the active deck's contents).
 */
export function ImportDeckModal({ onClose, onImport, suggestedName = '' }) {
  const [name, setName] = useState(suggestedName);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState([]);

  const handleImport = async () => {
    setError(null);
    setNotFound([]);
    if (!name.trim()) {
      setError('Give the deck a name.');
      return;
    }
    if (!text.trim()) {
      setError('Paste a decklist first.');
      return;
    }

    // Split into Commander / Deck blocks if "Commander" header is present.
    const blocks = parseBlocks(text);
    const cmdrEntries = parseDecklist(blocks.commander || '');
    const deckEntries = parseDecklist(blocks.deck || text);

    setLoading(true);
    try {
      // Fetch all unique names in one call.
      const allNames = [
        ...cmdrEntries.map((e) => e.name),
        ...deckEntries.map((e) => e.name),
      ];
      const uniqNames = [...new Set(allNames)];
      const { results, notFound: nf } = await fetchCardsByName(uniqNames, setProgress);

      // Build commander (first commander entry that resolved).
      let commander = null;
      for (const e of cmdrEntries) {
        const c = results[lc(e.name)];
        if (c) {
          commander = c;
          break;
        }
      }

      const cards = deckEntries
        .map((e) => {
          const c = results[lc(e.name)];
          return c ? { name: c.name, count: e.count, scryfall: c } : null;
        })
        .filter(Boolean);

      setLoading(false);
      setProgress('');
      setNotFound(nf);
      if (cards.length === 0 && !commander) {
        setError('No cards resolved.');
        return;
      }
      onImport({ name: name.trim(), commander, cards });
    } catch (e) {
      setLoading(false);
      setProgress('');
      setError(e.message);
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
            <span style={{ color: CREAM_DIM }}>·</span> Import Deck
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 flex-1 overflow-auto space-y-4">
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
              Deck name
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="edgar markov vampires"
              disabled={loading}
              className="w-full border px-4 py-2.5 bg-transparent focus:outline-none font-mono text-sm"
              style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
            />
          </div>
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
              Decklist
            </div>
            <p className="font-serif text-xs italic mb-2" style={{ color: CREAM_DIM }}>
              Accepts Moxfield/MTGA format. Include a <span className="font-mono not-italic">Commander</span> section header to set the commander automatically.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={loading}
              placeholder={'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n...'}
              className="w-full h-56 p-4 border bg-transparent focus:outline-none font-mono text-xs leading-relaxed"
              style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
            />
          </div>
          {progress && (
            <div className="px-4 py-3 border font-mono text-[11px] flex items-center gap-2" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
              <Loader2 className="w-3 h-3 animate-spin" /> {progress}
            </div>
          )}
          {error && (
            <div className="px-4 py-3 border" style={{ borderColor: ACCENT, background: 'rgba(196,74,63,0.08)' }}>
              <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: ACCENT }}>
                Error
              </div>
              <div className="font-mono text-xs" style={{ color: CREAM_DIM }}>
                {error}
              </div>
            </div>
          )}
          {notFound.length > 0 && (
            <div className="px-4 py-3 border" style={{ borderColor: CREAM_FAINT }}>
              <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
                Unresolved · {pad(notFound.length)}
              </div>
              <ul className="font-mono text-xs space-y-0.5 max-h-32 overflow-auto" style={{ color: CREAM_DIM }}>
                {notFound.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-4" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !text.trim() || !name.trim()}
            className="font-serif text-[10px] tracking-[0.3em] uppercase disabled:opacity-30"
            style={{ color: CREAM }}
          >
            {loading ? 'Importing...' : 'Import →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Split a pasted decklist into "commander" and "deck" sections by detecting
 * the Moxfield-style section headers. Lines outside any known section land
 * in `deck` so a header-less paste still works.
 */
function parseBlocks(text) {
  const lines = text.split('\n');
  const out = { commander: '', deck: '' };
  let cur = 'deck';
  for (const raw of lines) {
    const line = raw.trim();
    if (/^commander\b/i.test(line)) { cur = 'commander'; continue; }
    if (/^(deck|main(deck|board)?|library)\b/i.test(line)) { cur = 'deck'; continue; }
    if (/^(sideboard|maybeboard|tokens?)\b/i.test(line)) { cur = 'skip'; continue; }
    if (cur === 'skip') continue;
    out[cur] += raw + '\n';
  }
  return out;
}
