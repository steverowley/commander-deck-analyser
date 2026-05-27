import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Check, BookOpen, Copy, Download, Link as LinkIcon, GitCompare, Archive, FileText, Settings as SettingsIcon, Dices, Shuffle } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { pad, parseDecklist, lc } from '../lib/utils.js';
import { fetchCardsByName, fetchCardByExactName, refreshCachedCards, fetchPrintings, fetchRandomCommander, cardImageUrl } from '../lib/scryfall.js';
import { buildSeededDeck } from '../lib/autoseed.js';
import { ARCHETYPES } from '../lib/archetypes.js';
import { loadCollection, uniqueCount } from '../lib/collection.js';
import { saveRandomRoll } from '../lib/storage-supabase.js';
import { exportDecklist } from '../lib/deckops.js';
import { buildShareUrl } from '../lib/share.js';
import { deckTotalPrice, formatPrice, isConverted } from '../lib/pricing.js';
import { compareDecks } from '../lib/compare.js';
import { buildBackup, parseBackup, backupFilename } from '../lib/backup.js';
import { loadSettings, updateSetting } from '../lib/settings.js';
import { cacheSize, clearIDBCache } from '../lib/idbcache.js';
import { fetchRecommendations, topRecommendations } from '../lib/edhrec.js';
import { TagPill, RuleSection } from './UI.jsx';
import { ManaSymbol } from './ManaCost.jsx';
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
  const [note, setNote] = useState(entry.note || '');
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
            Card Details
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
              Note
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 160))}
              placeholder="why this card is in the deck..."
              className="w-full h-16 p-3 border bg-transparent focus:outline-none font-mono text-xs resize-none"
              style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
            />
            <div className="font-mono text-[9px] mt-1 text-right" style={{ color: CREAM_DIM }}>
              {note.length} / 160
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
              Custom tag
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
              onSave({ tags, note });
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
            const currency = loadSettings().currency || 'usd';
            const price = deckTotalPrice(deck, currency);
            if (price.priced === 0) return null;
            const approx = price.unpriced > 0 || isConverted(currency) ? '~' : '';
            return (
              <div className="flex items-center gap-3 mb-3 font-mono text-[11px]" style={{ color: CREAM_DIM }}>
                <span>Deck price ·</span>
                <span style={{ color: CREAM, fontSize: '1.1rem', fontFamily: 'inherit' }}>
                  {approx}{formatPrice(price.total, currency)} {currency.toUpperCase()}
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

/**
 * Side-by-side deck comparison. Caller passes the active deck and a list
 * of candidate decks. On a pick, the modal renders the comparison inline.
 */
export function CompareModal({ deck, otherDecks, onClose }) {
  const [pickedId, setPickedId] = useState(null);
  // When the user picks "EDHREC average", we synthesise a deck from the
  // top-99 recs and hold it in state separately from otherDecks.
  const [synthDeck, setSynthDeck] = useState(null);
  const [synthLoading, setSynthLoading] = useState(false);
  const [synthError, setSynthError] = useState(null);
  const [synthProgress, setSynthProgress] = useState('');

  const picked = synthDeck || otherDecks.find((d) => d.id === pickedId);
  const cmp = useMemo(() => (picked ? compareDecks(deck, picked) : null), [deck, picked]);

  const compareWithAverage = async () => {
    if (!deck.commander) {
      setSynthError('Set a commander first — needed to look up EDHREC.');
      return;
    }
    setSynthLoading(true);
    setSynthError(null);
    try {
      const recs = await fetchRecommendations(deck.commander.name);
      if (!recs) {
        setSynthError('EDHREC has no page for this commander.');
        return;
      }
      const top = topRecommendations(recs, new Set([deck.commander.name.toLowerCase()]), 99);
      if (top.length === 0) {
        setSynthError('No EDHREC recommendations available.');
        return;
      }
      const names = top.map((r) => r.name);
      setSynthProgress(`Fetching ${names.length} cards from Scryfall...`);
      const { fetchCardsByName } = await import('../lib/scryfall.js');
      const { results } = await fetchCardsByName(names, setSynthProgress);
      const cards = names
        .map((n) => {
          const card = results[n.toLowerCase()];
          return card ? { name: card.name, count: 1, scryfall: card, tags: [] } : null;
        })
        .filter(Boolean);
      setSynthDeck({
        id: 'edhrec-average',
        name: `EDHREC avg · ${deck.commander.name}`,
        commander: deck.commander,
        cards,
      });
      setSynthProgress('');
    } catch (e) {
      setSynthError(e.message);
    } finally {
      setSynthLoading(false);
    }
  };

  const goBack = () => {
    setPickedId(null);
    setSynthDeck(null);
    setSynthError(null);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
            <GitCompare className="w-3.5 h-3.5" /> Compare Decks
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {!picked ? (
          <div className="p-5 flex-1 overflow-auto space-y-4">
            <p className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
              Pick something to compare against <span style={{ color: CREAM }}>{deck.name}</span>.
            </p>

            {/* EDHREC average option — always present when a commander is set */}
            {deck.commander && (
              <button
                onClick={compareWithAverage}
                disabled={synthLoading}
                className="w-full border px-4 py-3 text-left transition flex items-center justify-between disabled:opacity-50"
                style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.025)' }}
                onMouseEnter={(e) => !synthLoading && (e.currentTarget.style.background = 'rgba(243,231,201,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.025)')}
              >
                <div>
                  <div className="font-serif text-sm uppercase tracking-tight" style={{ color: CREAM }}>
                    EDHREC average · {deck.commander.name}
                  </div>
                  <div className="font-mono text-[10px] mt-0.5" style={{ color: CREAM_DIM }}>
                    {synthLoading ? (synthProgress || 'Fetching...') : 'Top 99 cards typical decks run with this commander'}
                  </div>
                </div>
                <span className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
                  {synthLoading ? '...' : 'Compare →'}
                </span>
              </button>
            )}

            {synthError && (
              <div className="border px-4 py-3" style={{ borderColor: ACCENT, background: 'rgba(196,74,63,0.06)' }}>
                <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: ACCENT }}>Error</div>
                <div className="font-mono text-xs" style={{ color: CREAM }}>{synthError}</div>
              </div>
            )}

            {/* Other-deck picker */}
            {otherDecks.length === 0 ? (
              <div className="border p-8 text-center font-serif text-sm italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
                No other decks in the archive to compare against.
              </div>
            ) : (
              <div>
                <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
                  Or vs another deck in your archive
                </div>
                <div className="border-t border-l" style={{ borderColor: CREAM_FAINT }}>
                  {otherDecks.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setPickedId(d.id)}
                      className="w-full border-r border-b px-4 py-3 text-left transition flex items-center justify-between"
                      style={{ borderColor: CREAM_FAINT }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(243,231,201,0.05)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div>
                        <div className="font-serif text-sm uppercase tracking-tight" style={{ color: CREAM }}>{d.name}</div>
                        <div className="font-mono text-[10px] mt-0.5" style={{ color: CREAM_DIM }}>
                          {d.commander?.name || 'No commander'} · {d.cards.reduce((s, c) => s + c.count, 0)} cards
                        </div>
                      </div>
                      <span className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
                        Compare →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <CompareView cmp={cmp} onChange={goBack} />
        )}

        <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CompareView({ cmp, onChange }) {
  const maxCurve = Math.max(...cmp.curve.a, ...cmp.curve.b, 1);
  const sharedPct = (cmp.overlapPct * 100).toFixed(0);
  return (
    <div className="p-5 flex-1 overflow-auto space-y-5">
      {/* Header strip with deck names */}
      <div className="grid grid-cols-2 gap-4">
        <DeckMini deck={cmp.a} title="A" />
        <DeckMini deck={cmp.b} title="B" />
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
        <StatPair label="Bracket" left={cmp.bracket.a} right={cmp.bracket.b} />
        <StatPair label="Health" left={cmp.health.a.score} right={cmp.health.b.score} />
        <StatPair label="Cards" left={cmp.a.cards.reduce((s, c) => s + c.count, 0)} right={cmp.b.cards.reduce((s, c) => s + c.count, 0)} />
        <StatPair label="Price" left={formatPrice(cmp.prices.a)} right={formatPrice(cmp.prices.b)} />
      </div>

      {/* Pip comparison */}
      <div className="border" style={{ borderColor: CREAM_FAINT }}>
        <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          Pip distribution
        </div>
        <div className="grid grid-cols-2 divide-x" style={{ borderColor: CREAM_FAINT }}>
          {[['a', cmp.pips.a], ['b', cmp.pips.b]].map(([side, p]) => (
            <div key={side} className="p-4 flex flex-wrap items-baseline gap-3" style={{ borderColor: CREAM_FAINT }}>
              {['W', 'U', 'B', 'R', 'G'].filter((c) => p[c] > 0).map((c) => (
                <div key={c} className="flex items-center gap-1">
                  <ManaSymbol sym={c} size="0.95em" />
                  <span className="font-mono text-xs" style={{ color: CREAM }}>{p[c]}</span>
                </div>
              ))}
              {p.total === 0 && <span className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>—</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Curve overlay */}
      <div className="border" style={{ borderColor: CREAM_FAINT }}>
        <div className="px-4 py-2 border-b font-serif text-[10px] tracking-[0.3em] uppercase" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          Mana curve (non-lands)
        </div>
        <div className="p-4 flex items-end gap-3" style={{ height: '140px' }}>
          {['0','1','2','3','4','5','6','7+'].map((label, i) => (
            <div key={i} className="flex-1 flex flex-col items-end justify-end h-full">
              <div className="w-full flex gap-px h-full items-end">
                <div className="flex-1" style={{ background: CREAM, opacity: 0.75, height: `${(cmp.curve.a[i] / maxCurve) * 100}%` }}></div>
                <div className="flex-1" style={{ background: ACCENT, opacity: 0.75, height: `${(cmp.curve.b[i] / maxCurve) * 100}%` }}></div>
              </div>
              <div className="font-mono text-[10px] mt-1.5" style={{ color: CREAM_DIM }}>{label}</div>
            </div>
          ))}
        </div>
        <div className="px-4 pb-3 flex items-center gap-4 font-mono text-[10px]" style={{ color: CREAM_DIM }}>
          <div className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, background: CREAM, display: 'inline-block', opacity: 0.75 }}></span>A</div>
          <div className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, background: ACCENT, display: 'inline-block', opacity: 0.75 }}></span>B</div>
        </div>
      </div>

      {/* Card overlap */}
      <div className="border" style={{ borderColor: CREAM_FAINT }}>
        <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Card overlap · {sharedPct}%
          </div>
          <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
            {cmp.shared.length} shared · {cmp.uniqueA.length} only-A · {cmp.uniqueB.length} only-B
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px">
          <CardCol title="Shared" cards={cmp.shared.map((c) => c.name)} />
          <CardCol title="Only in A" cards={cmp.uniqueA.map((c) => c.name)} />
          <CardCol title="Only in B" cards={cmp.uniqueB.map((c) => c.name)} />
        </div>
      </div>

      <div>
        <button onClick={onChange} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          ← Pick a different deck
        </button>
      </div>
    </div>
  );
}

function DeckMini({ deck, title }) {
  return (
    <div className="border p-3" style={{ borderColor: CREAM_FAINT }}>
      <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
        Deck {title}
      </div>
      <div className="font-serif text-sm uppercase tracking-tight mt-1 truncate" style={{ color: CREAM }}>{deck.name}</div>
      <div className="font-mono text-[10px] mt-0.5 truncate" style={{ color: CREAM_DIM }}>
        {deck.commander?.name || 'No commander'}
      </div>
    </div>
  );
}

function StatPair({ label, left, right }) {
  return (
    <div className="border-r border-b p-3" style={{ borderColor: CREAM_FAINT }}>
      <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-1 font-mono">
        <span style={{ color: CREAM, fontSize: '1.2rem' }}>{left}</span>
        <span style={{ color: CREAM_DIM, fontSize: '0.7rem' }}>vs</span>
        <span style={{ color: CREAM, fontSize: '1.2rem' }}>{right}</span>
      </div>
    </div>
  );
}

function CardCol({ title, cards }) {
  return (
    <div className="p-3">
      <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
        {title} · {cards.length}
      </div>
      <div className="space-y-0.5 max-h-72 overflow-auto pr-1">
        {cards.length === 0 ? (
          <div className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>—</div>
        ) : cards.map((name) => (
          <div key={name} className="font-serif text-xs truncate" style={{ color: CREAM }}>{name}</div>
        ))}
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

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Full archive backup + restore. Two tabs: Export (download JSON of
 * all decks) and Restore (paste/upload a previous backup).
 */
export function BackupModal({ decks, onClose, onRestore }) {
  const [tab, setTab] = useState('export');
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
            <Archive className="w-3.5 h-3.5" /> Backup
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex border-b" style={{ borderColor: CREAM_FAINT }}>
          {[
            { id: 'export', label: 'Export' },
            { id: 'restore', label: 'Restore' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 px-4 py-3 font-serif text-[10px] tracking-[0.3em] uppercase"
              style={{
                color: tab === t.id ? CREAM : CREAM_DIM,
                background: tab === t.id ? 'rgba(243,231,201,0.05)' : 'transparent',
                borderBottom: tab === t.id ? `1px solid ${CREAM}` : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'export'
          ? <BackupExport decks={decks} onClose={onClose} />
          : <BackupRestore onRestore={onRestore} onClose={onClose} />
        }
      </div>
    </div>
  );
}

function BackupExport({ decks, onClose }) {
  const payload = useMemo(
    () => JSON.stringify(buildBackup(decks, typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''), null, 2),
    [decks]
  );
  const sizeKb = (new Blob([payload]).size / 1024).toFixed(1);
  const [copied, setCopied] = useState(false);

  const download = () => {
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <>
      <div className="p-5 flex-1 overflow-auto space-y-3">
        <p className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
          Every deck — cards, tags, notes, commanders — as one JSON file. Keep a copy somewhere safe; localStorage doesn't survive a cleared browser.
        </p>
        <div className="grid grid-cols-3 gap-3 border" style={{ borderColor: CREAM_FAINT }}>
          <div className="p-3 border-r" style={{ borderColor: CREAM_FAINT }}>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Decks</div>
            <div className="font-serif font-black mt-1" style={{ color: CREAM, fontSize: '1.4rem' }}>{decks.length}</div>
          </div>
          <div className="p-3 border-r" style={{ borderColor: CREAM_FAINT }}>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Cards</div>
            <div className="font-serif font-black mt-1" style={{ color: CREAM, fontSize: '1.4rem' }}>
              {decks.reduce((s, d) => s + d.cards.reduce((a, c) => a + c.count, 0), 0)}
            </div>
          </div>
          <div className="p-3">
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Size</div>
            <div className="font-serif font-black mt-1" style={{ color: CREAM, fontSize: '1.4rem' }}>{sizeKb} KB</div>
          </div>
        </div>
        <textarea
          value={payload}
          readOnly
          onClick={(e) => e.currentTarget.select()}
          className="w-full h-44 p-3 border bg-transparent focus:outline-none font-mono text-[10px] leading-relaxed"
          style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
        />
      </div>
      <div className="px-5 py-4 border-t flex justify-end gap-4" style={{ borderColor: CREAM_FAINT }}>
        <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          Close
        </button>
        <button onClick={copy} className="font-serif text-[10px] tracking-[0.3em] uppercase flex items-center gap-2" style={{ color: CREAM }}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
        <button onClick={download} className="font-serif text-[10px] tracking-[0.3em] uppercase flex items-center gap-2" style={{ color: CREAM }}>
          <Download className="w-3 h-3" /> Download
        </button>
      </div>
    </>
  );
}

function BackupRestore({ onRestore, onClose }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [mode, setMode] = useState('replace'); // 'replace' | 'merge'

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text());
  };

  const handleRestore = () => {
    setError(null);
    setWarning(null);
    let parsed;
    try {
      parsed = parseBackup(text);
    } catch (e) {
      setError(e.message);
      return;
    }
    if (parsed.invalidCount > 0) {
      setWarning(`${parsed.invalidCount} entry/entries skipped — malformed.`);
    }
    if (mode === 'replace' && !confirm(`Replace your current archive with ${parsed.decks.length} deck(s) from this backup? This can't be undone.`)) {
      return;
    }
    onRestore(parsed.decks, mode);
    if (!warning) onClose();
  };

  return (
    <>
      <div className="p-5 flex-1 overflow-auto space-y-3">
        <p className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
          Paste a previous backup JSON or upload one. Choose whether to merge with your current archive (additive, dedup by id) or replace it wholesale.
        </p>
        <div className="flex gap-3 items-center">
          <label className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-2 cursor-pointer" style={{ borderColor: CREAM_FAINT, color: CREAM }}>
            Upload .json
            <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          </label>
          <span className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>or paste below</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{ "vault": "v1", "decks": [...] }'
          className="w-full h-44 p-3 border bg-transparent focus:outline-none font-mono text-[10px] leading-relaxed"
          style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
        />
        <div className="flex items-center gap-3">
          <span className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>Mode</span>
          {['replace', 'merge'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="font-serif text-[10px] tracking-[0.3em] uppercase px-3 py-1 border"
              style={{
                borderColor: mode === m ? CREAM : CREAM_FAINT,
                color: mode === m ? CREAM : CREAM_DIM,
                background: mode === m ? 'rgba(243,231,201,0.05)' : 'transparent',
              }}
            >
              {m}
            </button>
          ))}
          <span className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
            {mode === 'replace' ? '— wipes current archive' : '— adds new decks, keeps your current ones'}
          </span>
        </div>
        {warning && (
          <div className="px-4 py-2 border font-mono text-xs" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
            {warning}
          </div>
        )}
        {error && (
          <div className="px-4 py-3 border" style={{ borderColor: ACCENT, background: 'rgba(196,74,63,0.06)' }}>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: ACCENT }}>Error</div>
            <div className="font-mono text-xs" style={{ color: CREAM }}>{error}</div>
          </div>
        )}
      </div>
      <div className="px-5 py-4 border-t flex justify-end gap-4" style={{ borderColor: CREAM_FAINT }}>
        <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          Cancel
        </button>
        <button
          onClick={handleRestore}
          disabled={!text.trim()}
          className="font-serif text-[10px] tracking-[0.3em] uppercase disabled:opacity-30"
          style={{ color: CREAM }}
        >
          Restore →
        </button>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

/**
 * App-wide settings. Stored in localStorage via lib/settings.js.
 * Currently three rows: strict-default toggle, currency picker,
 * and a cache info / clear panel.
 */
export function SettingsModal({ onClose }) {
  const [settings, setSettings] = useState(loadSettings());
  const [cacheCount, setCacheCount] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState(null); // { done, total } | { updated, failed } | null

  useEffect(() => {
    cacheSize().then(setCacheCount);
  }, []);

  const update = (key, value) => setSettings(updateSetting(key, value));

  const clear = async () => {
    if (!confirm('Clear the entire card cache? Cards re-download from Scryfall as needed.')) return;
    setClearing(true);
    await clearIDBCache();
    setCacheCount(0);
    setClearing(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    setRefreshStatus({ done: 0, total: cacheCount || 0 });
    try {
      const result = await refreshCachedCards((p) => setRefreshStatus(p));
      setRefreshStatus(result);
      // Brief pause so the user sees the "updated N" message before
      // it clears.
      setTimeout(() => setRefreshStatus(null), 4000);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-xl flex flex-col border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
            <SettingsIcon className="w-3.5 h-3.5" /> Settings
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <SettingsRow
            label="Strict mode default"
            description="Enable strict color-identity / banned-list blocking on every new deck. Per-deck override always available."
          >
            <ToggleSwitch
              on={!!settings.strictIdentityDefault}
              onChange={(v) => update('strictIdentityDefault', v)}
            />
          </SettingsRow>
          <SettingsRow
            label="Price currency"
            description="USD / EUR come straight from Scryfall. GBP is converted from USD at an approximate rate (shown with a ~ prefix)."
          >
            <div className="flex border" style={{ borderColor: CREAM_FAINT }}>
              {['usd', 'eur', 'gbp'].map((c) => (
                <button
                  key={c}
                  onClick={() => update('currency', c)}
                  className="font-mono text-[10px] px-3 py-1.5 uppercase tracking-wider"
                  style={{
                    color: settings.currency === c ? CREAM : CREAM_DIM,
                    background: settings.currency === c ? 'rgba(243,231,201,0.08)' : 'transparent',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </SettingsRow>
          <SettingsRow
            label="Card cache"
            description={cacheCount === null ? 'Querying IndexedDB...' : `${cacheCount} cards cached.`}
          >
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex gap-2">
                <button
                  onClick={refresh}
                  disabled={refreshing || clearing || !cacheCount}
                  className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1.5 disabled:opacity-40"
                  style={{ borderColor: CREAM_FAINT, color: CREAM }}
                  title="Re-download every cached card from Scryfall — refreshes prices + oracle text"
                >
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={clear}
                  disabled={clearing || refreshing || cacheCount === 0}
                  className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1.5 disabled:opacity-40"
                  style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
                >
                  {clearing ? 'Clearing...' : 'Clear'}
                </button>
              </div>
              {refreshStatus && (
                <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
                  {refreshStatus.total !== undefined
                    ? `${refreshStatus.done} / ${refreshStatus.total}`
                    : `${refreshStatus.updated} updated${refreshStatus.failed ? ` · ${refreshStatus.failed} failed` : ''}`}
                </div>
              )}
            </div>
          </SettingsRow>
        </div>
        <div className="px-5 py-4 border-t flex justify-end" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM }}>
            Done →
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsRow({ label, description, children }) {
  return (
    <div className="grid grid-cols-12 gap-4 items-start">
      <div className="col-span-7">
        <div className="font-serif text-sm tracking-wide" style={{ color: CREAM }}>
          {label}
        </div>
        <div className="font-serif text-xs italic mt-0.5" style={{ color: CREAM_DIM }}>
          {description}
        </div>
      </div>
      <div className="col-span-5 flex justify-end">
        {children}
      </div>
    </div>
  );
}

function ToggleSwitch({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="font-mono text-[10px] tracking-wider px-3 py-1 border uppercase"
      style={{
        borderColor: on ? CREAM : CREAM_FAINT,
        color: on ? CREAM : CREAM_DIM,
        background: on ? 'rgba(243,231,201,0.08)' : 'transparent',
      }}
    >
      {on ? 'ON' : 'OFF'}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Free-text deck notes — a per-deck scratchpad for the builder.
 * Auto-saves on blur; cancel discards in-flight edits.
 */
export function NotesModal({ deck, onClose, onSave }) {
  const [draft, setDraft] = useState(deck.notes || '');
  const commit = () => {
    if (draft !== (deck.notes || '')) onSave(draft);
    onClose();
  };
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-2xl flex flex-col border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
            <FileText className="w-3.5 h-3.5" /> Notes — {deck.name}
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          <p className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
            Scratchpad for this deck — strategy reminders, sideboard ideas, cards to test, notes from games. Saved with the deck.
          </p>
          <textarea
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            placeholder="aggressive vampire opener; mulligan for ramp; watch out for board wipes after T5; consider Sword of Hearth and Home..."
            className="w-full h-72 p-4 border bg-transparent focus:outline-none font-mono text-sm leading-relaxed resize-none"
            style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(243,231,201,0.02)' }}
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
              {draft.length} / 2000
            </span>
            {draft.length >= 2000 && (
              <span className="font-mono text-[10px]" style={{ color: ACCENT }}>
                Limit reached
              </span>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-4" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Cancel
          </button>
          <button
            onClick={commit}
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

/**
 * Printing picker — fetches every printing of a card from Scryfall and
 * lets the user pick which art / set to use for this deck. The choice
 * is per-deck (commander slot or a deck-entry's scryfall payload),
 * so swapping art here doesn't touch any other deck or the global cache.
 */
export function PrintingPickerModal({ card, onClose, onPick }) {
  const [printings, setPrintings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchPrintings(card)
      .then((list) => {
        if (!alive) return;
        setPrintings(list);
        if (list.length === 0) setError('No printings found.');
      })
      .catch((e) => alive && setError(e.message || 'Failed to load printings.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [card?.name, card?.oracle_id]);

  return createPortal((
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="border w-full max-w-4xl max-h-[88vh] flex flex-col"
        style={{ background: BG, borderColor: CREAM_FAINT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-baseline justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold" style={{ color: CREAM_DIM }}>
              Change art
            </div>
            <div className="font-serif text-lg font-black uppercase mt-1" style={{ color: CREAM }}>
              {card?.name}
            </div>
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading && (
            <div className="flex items-center gap-2 font-mono text-xs" style={{ color: CREAM_DIM }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading printings from Scryfall...
            </div>
          )}
          {error && !loading && (
            <div className="font-mono text-xs" style={{ color: ACCENT }}>{error}</div>
          )}
          {!loading && printings.length > 0 && (
            <>
              <div className="font-serif text-xs italic mb-4" style={{ color: CREAM_DIM }}>
                {printings.length} printings · click one to apply it to this deck.
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {printings.map((p) => {
                  const active = p.id === card?.id || (!card?.id && p.image_uris?.normal === card?.image_uris?.normal);
                  return (
                    <button
                      key={p.id || `${p.set}-${p.collector_number}`}
                      onClick={() => onPick(p)}
                      className="border p-2 text-left transition flex flex-col gap-2 hover:opacity-100"
                      style={{
                        borderColor: active ? CREAM : CREAM_FAINT,
                        background: active ? 'rgba(243,231,201,0.08)' : 'transparent',
                      }}
                      title={`${p.set_name} · #${p.collector_number}`}
                    >
                      <img
                        src={cardImageUrl(p, 'small')}
                        alt={`${p.name} (${p.set})`}
                        className="w-full aspect-[5/7] object-cover"
                        loading="lazy"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase truncate" style={{ color: CREAM }}>
                          {p.set}
                        </span>
                        <span className="font-mono text-[9px]" style={{ color: CREAM_DIM }}>
                          #{p.collector_number}
                        </span>
                      </div>
                      <div className="font-serif text-[10px] italic truncate" style={{ color: CREAM_DIM }}>
                        {p.set_name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Close
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

// ───────────────────────────────────────────────────────────────────────────────

/**
 * Random commander → auto-seeded deck flow. User optionally constrains
 * color identity, rolls a random legendary creature commander from
 * Scryfall, then (when they hit Build) we synthesise a 99-card list
 * via EDHREC's top recommendations and hand the populated deck back
 * to App.handleImport so it lands in the archive + opens in the editor.
 */
const WUBRG_COLORS = ['W', 'U', 'B', 'R', 'G'];

// Total-deck budget presets. `null` = no cap. The number is the
// max total deck price in the user's currency; per-card cap is
// derived inside buildSeededDeck as ~12% of this.
const BUDGET_PRESETS = [
  { id: 'any',     label: 'Any',          value: null },
  { id: 'budget',  label: 'Budget',       value: 50 },
  { id: 'casual',  label: 'Casual',       value: 150 },
  { id: 'tuned',   label: 'Tuned',        value: 400 },
  { id: 'premium', label: 'Premium',      value: 1000 },
];

// Bracket targets — 1 (precon) through 5 (cEDH). Matches the
// existing Bracket tab numbering used elsewhere in the app.
const BRACKET_OPTIONS = [1, 2, 3, 4, 5];

export function RandomDeckModal({ onClose, onBuild, canShare = false }) {
  const [colors, setColors] = useState([]);
  const [partner, setPartner] = useState(false);
  const [bracket, setBracket] = useState(3);
  const [budgetId, setBudgetId] = useState('any');
  const [archetypeId, setArchetypeId] = useState('any');
  // Whether to publish the rolled deck to the random-rolls gallery.
  // Defaults on when the user is signed in (canShare=true); local-only
  // users can't push to the gallery so the toggle is hidden for them.
  const [shareRoll, setShareRoll] = useState(true);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [collection, setCollection] = useState(null);
  const [commander, setCommander] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCollection().then(setCollection);
  }, []);
  const collectionSize = collection ? uniqueCount(collection) : 0;

  const budget = BUDGET_PRESETS.find((b) => b.id === budgetId)?.value ?? null;
  const archetype = ARCHETYPES.find((a) => a.id === archetypeId) || ARCHETYPES[0];

  const toggleColor = (c) => {
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const roll = async () => {
    setRolling(true);
    setError(null);
    setCommander(null);
    try {
      const c = await fetchRandomCommander({ colors, partner });
      if (!c) {
        setError('Scryfall returned no commander for that filter. Try widening the identity.');
      } else {
        setCommander(c);
      }
    } catch (e) {
      setError(e.message || 'Roll failed.');
    } finally {
      setRolling(false);
    }
  };

  const build = async () => {
    if (!commander) return;
    setBuilding(true);
    setProgress('');
    try {
      const settings = loadSettings();
      const currency = settings.currency || 'usd';
      const opts = {
        bracket,
        budget,
        currency,
        archetype: archetypeId,
        ownedOnly,
        collection,
      };
      const { cards, missing, summary } = await buildSeededDeck(commander, opts, setProgress);
      const breakdown = summary
        ? ` Lands ${summary.land + summary.basics}${summary.basics ? ` (${summary.basics} basics)` : ''}, ramp ${summary.ramp}, draw ${summary.draw}, removal ${summary.removal}, strategy ${summary.other}.`
        : '';
      const optsNote = [
        `bracket ${bracket}`,
        budget != null ? `${isConverted(currency) ? '~' : ''}${formatPrice(budget, currency)} budget` : null,
        archetype.id !== 'any' ? `${archetype.label.toLowerCase()} archetype` : null,
        ownedOnly ? `Vault-only (${collectionSize} cards)` : null,
      ].filter(Boolean).join(', ');
      // Visible warning when the Vault filter chewed the pool down to
      // nothing — otherwise the user gets a deck of basics and wonders
      // why nothing happened.
      if (ownedOnly && summary?.ownedPool != null && summary.ownedPool < 10) {
        setError(`Vault filter matched only ${summary.ownedPool} of EDHREC's top cards for ${commander.name}. Deck is mostly basics — try widening your Vault or turning the filter off.`);
        setTimeout(() => setError(null), 10000);
      }
      const willShare = canShare && shareRoll;
      const seedMeta = {
        bracket,
        budget,
        currency,
        archetype: archetypeId,
        colors,
        rolledAt: Date.now(),
      };
      // Snapshot the roll into random_rolls — survives the user
      // later deleting the deck from their archive. Best-effort;
      // a failure here doesn't block creating the deck itself, but
      // we surface it to the user so they know the gallery copy
      // isn't there (was previously console-only).
      if (willShare) {
        try {
          const { ok } = await saveRandomRoll({ commander, cards, seedMeta });
          if (!ok) {
            setError("Deck built, but couldn't publish to the public Random Rolls gallery. It's saved locally — try rolling again later.");
            setTimeout(() => setError(null), 10000);
          }
        } catch (e) {
          console.warn('Vault: random-roll snapshot failed', e);
          setError("Deck built, but couldn't publish to the public Random Rolls gallery. It's saved locally — try rolling again later.");
          setTimeout(() => setError(null), 10000);
        }
      }
      onBuild({
        name: commander.name,
        commander,
        cards,
        notes: `Auto-seeded from EDHREC averages for ${commander.name} (${optsNote}).${breakdown}${missing?.length ? ` ${missing.length} card(s) unresolved.` : ''}`,
        seedMeta,
        // Personal deck stays private by default now — sharing is
        // captured via the random_rolls snapshot, no need to also
        // pollute the user's archive with a forced-public deck.
        isPublic: false,
      });
    } catch (e) {
      setError(e.message || 'Build failed.');
      setBuilding(false);
    }
  };

  const colorLabel = colors.length === 0 ? 'Any identity' : colors.join('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="border w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ background: BG, borderColor: CREAM_FAINT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-baseline justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM_DIM }}>
              <Dices className="w-3 h-3" /> Roll a deck
            </div>
            <div className="font-serif text-lg font-black uppercase mt-1" style={{ color: CREAM }}>
              Random commander
            </div>
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }} disabled={building}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold mb-2" style={{ color: CREAM_DIM }}>
              Color identity · <span style={{ color: CREAM }}>{colorLabel}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {WUBRG_COLORS.map((c) => {
                const active = colors.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleColor(c)}
                    className="w-9 h-9 border flex items-center justify-center transition"
                    style={{
                      borderColor: active ? CREAM : CREAM_FAINT,
                      background: active ? 'rgba(243,231,201,0.08)' : 'transparent',
                    }}
                    title={c}
                  >
                    <ManaSymbol sym={c} size="1em" />
                  </button>
                );
              })}
              {colors.length > 0 && (
                <button
                  onClick={() => setColors([])}
                  className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100 ml-2"
                  style={{ color: CREAM_DIM }}
                >
                  Reset
                </button>
              )}
            </div>
            <div className="font-serif text-xs italic mt-2" style={{ color: CREAM_DIM }}>
              {colors.length === 0
                ? 'No colors selected → any commander. Pick colors to force the identity exactly.'
                : `Will roll a commander with identity exactly ${colorLabel}.`}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPartner((p) => !p)}
              className="w-9 h-5 border flex items-center transition"
              style={{
                borderColor: CREAM_FAINT,
                background: partner ? 'rgba(243,231,201,0.15)' : 'transparent',
                justifyContent: partner ? 'flex-end' : 'flex-start',
              }}
              aria-pressed={partner}
            >
              <span className="block w-3 h-3 mx-0.5" style={{ background: partner ? CREAM : CREAM_DIM }} />
            </button>
            <span className="font-serif text-xs" style={{ color: CREAM_DIM }}>
              Include partner / background commanders
            </span>
          </div>

          {/* Bracket target */}
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold mb-2" style={{ color: CREAM_DIM }}>
              Bracket · <span style={{ color: CREAM }}>{bracket}</span>
              <span className="ml-2 italic normal-case tracking-normal" style={{ color: CREAM_DIM, opacity: 0.7 }}>
                {bracket === 1 && '— precon-level'}
                {bracket === 2 && '— casual'}
                {bracket === 3 && '— upgraded'}
                {bracket === 4 && '— optimized'}
                {bracket === 5 && '— cEDH'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {BRACKET_OPTIONS.map((b) => {
                const active = bracket === b;
                return (
                  <button
                    key={b}
                    onClick={() => setBracket(b)}
                    className="w-9 h-9 border font-mono text-sm transition"
                    style={{
                      borderColor: active ? CREAM : CREAM_FAINT,
                      color: active ? CREAM : CREAM_DIM,
                      background: active ? 'rgba(243,231,201,0.08)' : 'transparent',
                    }}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
            {bracket <= 2 && (
              <div className="font-serif text-xs italic mt-2" style={{ color: CREAM_DIM }}>
                Drops Game Changers, combos, MLD, stax, extra turns from the pool.
              </div>
            )}
            {bracket === 3 && (
              <div className="font-serif text-xs italic mt-2" style={{ color: CREAM_DIM }}>
                Mass land destruction excluded; combos and Game Changers allowed.
              </div>
            )}
            {bracket >= 4 && (
              <div className="font-serif text-xs italic mt-2" style={{ color: CREAM_DIM }}>
                Anything goes — fast mana, tutors, combos all eligible.
              </div>
            )}
          </div>

          {/* Budget */}
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold mb-2" style={{ color: CREAM_DIM }}>
              Budget
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {BUDGET_PRESETS.map((b) => {
                const active = budgetId === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setBudgetId(b.id)}
                    className="px-3 h-9 border font-serif text-[11px] tracking-[0.2em] uppercase transition"
                    style={{
                      borderColor: active ? CREAM : CREAM_FAINT,
                      color: active ? CREAM : CREAM_DIM,
                      background: active ? 'rgba(243,231,201,0.08)' : 'transparent',
                    }}
                  >
                    {b.label}
                    {b.value != null && (
                      <span className="ml-1.5 font-mono text-[10px]" style={{ opacity: 0.7 }}>
                        ≤{formatPrice(b.value, loadSettings().currency || 'usd')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {budget != null && (
              <div className="font-serif text-xs italic mt-2" style={{ color: CREAM_DIM }}>
                Skips any single card priced above ~{formatPrice(budget * 0.12, loadSettings().currency || 'usd')}, so the total stays close to {formatPrice(budget, loadSettings().currency || 'usd')}.
              </div>
            )}
          </div>

          {/* Archetype */}
          <div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold mb-2" style={{ color: CREAM_DIM }}>
              Archetype · <span style={{ color: CREAM }}>{archetype.label}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {ARCHETYPES.map((a) => {
                const active = archetypeId === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setArchetypeId(a.id)}
                    className="px-3 h-8 border font-serif text-[11px] tracking-[0.15em] uppercase transition"
                    style={{
                      borderColor: active ? CREAM : CREAM_FAINT,
                      color: active ? CREAM : CREAM_DIM,
                      background: active ? 'rgba(243,231,201,0.08)' : 'transparent',
                    }}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
            {archetype.id !== 'any' && (
              <div className="font-serif text-xs italic mt-2" style={{ color: CREAM_DIM }}>
                Promotes cards tagged for this archetype before the rest of the synergy pool.
              </div>
            )}
          </div>

          {commander && (
            <div className="border p-4 flex flex-col sm:flex-row gap-4" style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}>
              <img
                src={cardImageUrl(commander, 'normal')}
                alt={commander.name}
                className="w-32 sm:w-40 self-center sm:self-start shrink-0"
                style={{ borderColor: CREAM_FAINT, borderWidth: 1 }}
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
              <div className="flex-1 min-w-0">
                <div className="font-serif text-[10px] tracking-[0.3em] uppercase font-bold" style={{ color: CREAM_DIM }}>
                  Rolled
                </div>
                <div className="font-serif font-black uppercase mt-1 tracking-tight" style={{ color: CREAM, fontSize: 'clamp(1.25rem, 3vw, 1.75rem)' }}>
                  {commander.name}
                </div>
                <div className="font-serif text-sm italic mt-1" style={{ color: CREAM_DIM }}>
                  {commander.type_line}
                </div>
                {commander.color_identity?.length > 0 && (
                  <div className="flex items-center gap-1 mt-2">
                    {commander.color_identity.map((c) => (
                      <ManaSymbol key={c} sym={c} size="1em" />
                    ))}
                  </div>
                )}
                {commander.oracle_text && (
                  <div className="font-serif text-xs mt-3 leading-snug line-clamp-5" style={{ color: CREAM_DIM }}>
                    {commander.oracle_text}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 border-t pt-4" style={{ borderColor: CREAM_FAINT }}>
            <button
              onClick={() => setOwnedOnly((v) => !v)}
              disabled={collectionSize === 0}
              className="w-9 h-5 border flex items-center transition disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderColor: CREAM_FAINT,
                background: ownedOnly ? 'rgba(243,231,201,0.15)' : 'transparent',
                justifyContent: ownedOnly ? 'flex-end' : 'flex-start',
              }}
              aria-pressed={ownedOnly}
              title={collectionSize === 0 ? 'Add cards to your Vault first to enable this filter.' : ''}
            >
              <span className="block w-3 h-3 mx-0.5" style={{ background: ownedOnly ? CREAM : CREAM_DIM }} />
            </button>
            <span className="font-serif text-xs" style={{ color: CREAM_DIM }}>
              Only use cards from my Vault{' '}
              <span style={{ color: CREAM_DIM, opacity: 0.7 }}>
                {collectionSize === 0
                  ? '(empty — add cards to your Vault to unlock)'
                  : `(${collectionSize} in Vault — basics still padded as needed)`}
              </span>
            </span>
          </div>

          {canShare && (
            <div className="flex items-center gap-3 border-t pt-4" style={{ borderColor: CREAM_FAINT }}>
              <button
                onClick={() => setShareRoll((s) => !s)}
                className="w-9 h-5 border flex items-center transition"
                style={{
                  borderColor: CREAM_FAINT,
                  background: shareRoll ? 'rgba(243,231,201,0.15)' : 'transparent',
                  justifyContent: shareRoll ? 'flex-end' : 'flex-start',
                }}
                aria-pressed={shareRoll}
              >
                <span className="block w-3 h-3 mx-0.5" style={{ background: shareRoll ? CREAM : CREAM_DIM }} />
              </button>
              <span className="font-serif text-xs" style={{ color: CREAM_DIM }}>
                Share to the random-rolls gallery (others can View / Copy)
              </span>
            </div>
          )}

          {building && (
            <div className="flex items-center gap-2 font-mono text-xs" style={{ color: CREAM_DIM }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {progress || 'Building deck...'}
            </div>
          )}
          {error && (
            <div className="font-mono text-xs" style={{ color: ACCENT }}>{error}</div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: CREAM_FAINT }}>
          <button
            onClick={onClose}
            disabled={building}
            className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100 disabled:opacity-30"
            style={{ color: CREAM_DIM }}
          >
            Cancel
          </button>
          <div className="flex items-center gap-4">
            <button
              onClick={roll}
              disabled={rolling || building}
              className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 hover:opacity-100 disabled:opacity-30 flex items-center gap-1.5"
              style={{ borderColor: CREAM_FAINT, color: CREAM }}
            >
              {rolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shuffle className="w-3 h-3" />}
              {commander ? 'Reroll' : 'Roll commander'}
            </button>
            <button
              onClick={build}
              disabled={!commander || building}
              className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 disabled:opacity-30"
              style={{ borderColor: CREAM, color: CREAM, background: 'rgba(243,231,201,0.06)' }}
            >
              {building ? 'Building...' : 'Build deck →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
