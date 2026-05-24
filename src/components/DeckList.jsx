import React, { useState } from 'react';
import { Trash2, Crown, Copy, Upload } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, ACCENT } from '../theme.js';
import { pad } from '../lib/utils.js';
import { cardImageUrl } from '../lib/scryfall.js';
import { assessBracket } from '../lib/analyzers.js';
import { computeHealth } from '../lib/health.js';
import { deckTotalPrice, formatPrice } from '../lib/pricing.js';
import { ManaSymbol } from './ManaCost.jsx';
import { ImportDeckModal } from './Modals.jsx';

export function DeckListView({ decks, onSelect, onCreate, onDelete, onDuplicate, onImport }) {
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showImport, setShowImport] = useState(false);

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
          Bracket · Auto
        </div>
        <div
          className="hidden md:flex items-center justify-end px-5 text-[11px] tracking-[0.3em] uppercase font-serif"
          style={{ color: CREAM_DIM }}
        >
          v{__APP_VERSION__}
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

      {/* Stored decks */}
      <div className="mt-12 fade-up" style={{ animationDelay: '240ms' }}>
        <div className="flex items-baseline gap-4 mb-1">
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            <span style={{ color: CREAM_DIM }}>3.</span> Archive
          </div>
          <div className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }}></div>
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            {pad(decks.length)} on file
          </div>
        </div>
        {decks.length === 0 ? (
          <div
            className="border border-dashed p-16 text-center font-serif text-sm"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            No decks yet — initialize one above.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 border-t border-l" style={{ borderColor: CREAM_FAINT }}>
            {decks.map((d, idx) => (
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
                  <DeckCardMeta deck={d} />
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

      <div
        className="border-t mt-20 py-6 text-center font-serif text-[10px] tracking-[0.4em] uppercase"
        style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
      >
        Vault · v{__APP_VERSION__} · MIT
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

function DeckCardMeta({ deck }) {
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
    </div>
  );
}

function healthColor(score) {
  if (score >= 80) return '#a3c98a';
  if (score >= 65) return CREAM;
  if (score >= 50) return '#d8b35a';
  return ACCENT;
}
