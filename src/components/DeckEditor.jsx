import React, { useState, useEffect } from 'react';
import { ChevronLeft, BookOpen, Loader2, Crown, Sparkles, Tag, BarChart3, Target, Clock, Calculator } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { lc, pad } from '../lib/utils.js';
import { searchCardAutocomplete, fetchCardByExactName, cardImageUrl } from '../lib/scryfall.js';
import { CardsTab, PackagesTab, CurveTab, BracketTab, StagesTab, ProbabilitiesTab } from './Tabs.jsx';
import { RulesModal } from './Modals.jsx';

// ───────────────────────────────────────────────────────────────────────────────

function CommanderPicker({ deck, onSet }) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!q || q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await searchCardAutocomplete(q);
      setSuggestions(r.slice(0, 6));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const handleSelect = async (name) => {
    setLoading(true);
    setError(null);
    try {
      const card = await fetchCardByExactName(name);
      if (card) {
        onSet(card);
        setQ('');
        setSuggestions([]);
      } else setError(`Could not find "${name}"`);
    } catch (e) {
      setError(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  if (deck.commander) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-5 border" style={{ borderColor: CREAM_FAINT }}>
        <div
          className="md:col-span-2 p-6 border-r flex items-center justify-center"
          style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
        >
          <img
            src={cardImageUrl(deck.commander, 'normal')}
            alt={deck.commander.name}
            className="w-48 md:w-56"
            style={{ borderColor: CREAM_FAINT, borderWidth: 1 }}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </div>
        <div className="md:col-span-3 p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div className="font-serif text-[10px] tracking-[0.4em] uppercase font-bold" style={{ color: CREAM_DIM }}>
              <Crown className="w-3 h-3 inline mr-2" style={{ verticalAlign: 'baseline' }} />
              Commander
            </div>
            <button
              onClick={() => onSet(null)}
              className="font-serif text-[10px] tracking-[0.3em] uppercase"
              style={{ color: CREAM_DIM }}
            >
              Change →
            </button>
          </div>
          <h2
            className="font-serif font-black uppercase leading-[0.95] tracking-tight"
            style={{ color: CREAM, fontSize: 'clamp(2rem, 4vw, 3rem)' }}
          >
            {deck.commander.name}
          </h2>
          <div className="font-serif text-sm italic mt-2" style={{ color: CREAM_DIM }}>
            {deck.commander.type_line}
          </div>
          {deck.commander.mana_cost && (
            <div className="font-mono text-sm mt-4" style={{ color: CREAM }}>
              {deck.commander.mana_cost}
            </div>
          )}
          {deck.commander.oracle_text && (
            <div
              className="font-serif text-sm mt-4 whitespace-pre-wrap leading-relaxed line-clamp-6"
              style={{ color: CREAM_DIM }}
            >
              {deck.commander.oracle_text}
            </div>
          )}
          {(deck.commander.power || deck.commander.loyalty) && (
            <div className="font-mono text-base mt-4" style={{ color: CREAM }}>
              {deck.commander.power
                ? `${deck.commander.power} / ${deck.commander.toughness}`
                : `Loyalty ${deck.commander.loyalty}`}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border relative" style={{ borderColor: CREAM_FAINT }}>
      <div
        className="px-6 py-4 border-b font-serif text-[10px] tracking-[0.4em] uppercase font-bold"
        style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
      >
        <Crown className="w-3 h-3 inline mr-2" /> Set Commander
      </div>
      <div className="p-6">
        <div
          className="flex gap-3 items-center border px-4 py-3"
          style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && suggestions[0]) handleSelect(suggestions[0]);
            }}
            placeholder="search by card name..."
            className="flex-1 bg-transparent focus:outline-none font-mono text-sm"
            style={{ color: CREAM }}
            disabled={loading}
          />
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: CREAM_DIM }} />}
        </div>
        {error && (
          <div className="mt-3 font-mono text-xs" style={{ color: ACCENT }}>
            {error}
          </div>
        )}
        {suggestions.length > 0 && !loading && (
          <div
            className="absolute top-full left-6 right-6 border z-20 mt-px"
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
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function DeckEditor({ deck, onUpdate, onBack }) {
  const [tab, setTab] = useState('cards');
  const [showRules, setShowRules] = useState(false);

  const setCommander = (card) => {
    if (!card) {
      onUpdate({ ...deck, commander: null });
      return;
    }
    const filteredCards = deck.cards.filter((c) => lc(c.name) !== lc(card.name));
    onUpdate({ ...deck, commander: card, cards: filteredCards });
  };

  const tabs = [
    { id: 'cards', label: 'Cards', icon: Sparkles },
    { id: 'packages', label: 'Packages', icon: Tag },
    { id: 'curve', label: 'Stats', icon: BarChart3 },
    { id: 'bracket', label: 'Bracket', icon: Target },
    { id: 'stages', label: 'Stages', icon: Clock },
    { id: 'probs', label: 'Probability', icon: Calculator },
  ];

  const totalCards = deck.cards.reduce((s, c) => s + c.count, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8">
      <nav className="grid grid-cols-2 md:grid-cols-5 border-b mt-6" style={{ borderColor: CREAM_FAINT }}>
        <div className="p-5 md:border-r flex items-center gap-3" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onBack} className="hover:opacity-100 transition" style={{ color: CREAM_DIM }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="font-serif text-xl font-black leading-none tracking-wider truncate" style={{ color: CREAM }}>
              {deck.name.toUpperCase()}
            </div>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase mt-1" style={{ color: CREAM_DIM }}>
              Vault · Deck
            </div>
          </div>
        </div>
        <div
          className="hidden md:flex items-center px-5 border-r font-serif text-[11px] tracking-[0.3em] uppercase"
          style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
        >
          Cards ·{' '}
          <span className="ml-1" style={{ color: CREAM }}>
            {pad(totalCards)} / {pad(100 - (deck.commander ? 1 : 0))}
          </span>
        </div>
        <div
          className="hidden md:flex items-center px-5 border-r font-serif text-[11px] tracking-[0.3em] uppercase"
          style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
        >
          Commander ·{' '}
          <span className="ml-1" style={{ color: deck.commander ? CREAM : ACCENT }}>
            {deck.commander ? 'set' : 'null'}
          </span>
        </div>
        <div
          className="hidden md:flex items-center px-5 border-r font-serif text-[11px] tracking-[0.3em] uppercase"
          style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
        >
          {
            Object.keys(
              deck.cards.reduce((m, c) => {
                (c.tags || []).forEach((t) => (m[t] = 1));
                return m;
              }, {})
            ).length
          }{' '}
          tags
        </div>
        <button
          onClick={() => setShowRules(true)}
          className="hidden md:flex items-center justify-end px-5 font-serif text-[11px] tracking-[0.3em] uppercase hover:opacity-100"
          style={{ color: CREAM_DIM }}
        >
          <BookOpen className="w-3 h-3 mr-2" /> Rules
        </button>
      </nav>

      <div className="my-8 fade-up">
        <CommanderPicker deck={deck} onSet={setCommander} />
      </div>

      <div
        className="grid grid-cols-3 md:grid-cols-6 border-t border-l fade-up"
        style={{ borderColor: CREAM_FAINT, animationDelay: '120ms' }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="border-r border-b py-3 px-3 transition flex flex-col items-center gap-1.5"
              style={{
                borderColor: CREAM_FAINT,
                background: active ? 'rgba(243,231,201,0.06)' : 'transparent',
                color: active ? CREAM : CREAM_DIM,
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="font-serif text-[10px] tracking-[0.25em] uppercase font-bold">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="py-8 fade-up" style={{ animationDelay: '180ms' }}>
        {tab === 'cards' && <CardsTab deck={deck} onUpdate={onUpdate} />}
        {tab === 'packages' && <PackagesTab deck={deck} />}
        {tab === 'curve' && <CurveTab deck={deck} />}
        {tab === 'bracket' && <BracketTab deck={deck} />}
        {tab === 'stages' && <StagesTab deck={deck} />}
        {tab === 'probs' && <ProbabilitiesTab deck={deck} />}
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
