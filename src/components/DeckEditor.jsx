import React, { useState, useEffect } from 'react';
import { ChevronLeft, BookOpen, Loader2, Crown, Sparkles, Tag, BarChart3, Target, Clock, Calculator, Lightbulb, Pencil, Copy, Download, Link as LinkIcon, GitCompare, FileText, Globe } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { lc, pad } from '../lib/utils.js';
import { searchCardAutocomplete, fetchCardByExactName, cardImageUrl } from '../lib/scryfall.js';
import { renameDeck, setDeckNotes, setDeckPublic } from '../lib/deckops.js';
import { CardsTab, PackagesTab, CurveTab, BracketTab, StagesTab, ProbabilitiesTab, RecommendationsTab } from './Tabs.jsx';
import { RulesModal, ExportModal, ShareModal, CompareModal, NotesModal } from './Modals.jsx';
import { ManaCost } from './ManaCost.jsx';
import { InlineOracle } from './UI.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';

// ───────────────────────────────────────────────────────────────────────────────

function CommanderPicker({ deck, onSet }) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!q || q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await searchCardAutocomplete(q);
      setSuggestions(r.slice(0, 6));
      setHighlight(0);
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
        setHighlight(0);
      } else setError(`Could not find "${name}"`);
    } catch (e) {
      setError(`Error: ${e.message}`);
    }
    setLoading(false);
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
            <div className="mt-4" style={{ color: CREAM, fontSize: '1.5rem' }}>
              <ManaCost cost={deck.commander.mana_cost} size="1em" gap="0.15em" />
            </div>
          )}
          {deck.commander.oracle_text && (
            <div
              className="font-serif text-sm mt-4 whitespace-pre-wrap leading-relaxed line-clamp-6"
              style={{ color: CREAM_DIM }}
            >
              <InlineOracle text={deck.commander.oracle_text} />
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
            onKeyDown={onKey}
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
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export function DeckEditor({ deck, onUpdate, onBack, onDuplicate, otherDecks = [], initialTab }) {
  const [tab, setTab] = useState(initialTab || 'cards');
  const [showRules, setShowRules] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(deck.name);

  const setCommander = (card) => {
    if (!card) {
      onUpdate({ ...deck, commander: null });
      return;
    }
    const filteredCards = deck.cards.filter((c) => lc(c.name) !== lc(card.name));
    onUpdate({ ...deck, commander: card, cards: filteredCards });
  };

  const commitRename = () => {
    setEditingName(false);
    if (nameDraft.trim() && nameDraft.trim() !== deck.name) {
      onUpdate(renameDeck(deck, nameDraft));
    } else {
      setNameDraft(deck.name);
    }
  };

  const tabs = [
    { id: 'cards', label: 'Cards', icon: Sparkles },
    { id: 'packages', label: 'Packages', icon: Tag },
    { id: 'stages', label: 'Stages', icon: Clock },
    { id: 'recs', label: 'Recs', icon: Lightbulb },
    { id: 'curve', label: 'Stats', icon: BarChart3 },
    { id: 'bracket', label: 'Bracket', icon: Target },
    { id: 'probs', label: 'Probability', icon: Calculator },
  ];

  const totalCards = deck.cards.reduce((s, c) => s + c.count, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8">
      {/* Two-row header: status nav up top, action buttons in a dedicated
          flex-wrap row underneath so they have full width to breathe and
          can reflow on narrower screens without overlapping. */}
      <nav className="grid grid-cols-2 md:grid-cols-3 border-b mt-6" style={{ borderColor: CREAM_FAINT }}>
        <div className="p-5 md:border-r flex items-center gap-3 min-w-0" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onBack} className="hover:opacity-100 transition shrink-0" style={{ color: CREAM_DIM }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0 overflow-hidden">
            {editingName ? (
              <input
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  else if (e.key === 'Escape') {
                    setNameDraft(deck.name);
                    setEditingName(false);
                  }
                }}
                className="font-serif text-xl font-black leading-none tracking-wider w-full bg-transparent border-b focus:outline-none uppercase"
                style={{ color: CREAM, borderColor: CREAM_FAINT }}
              />
            ) : (
              <button
                onClick={() => {
                  setNameDraft(deck.name);
                  setEditingName(true);
                }}
                className="font-serif text-xl font-black leading-none tracking-wider text-left flex items-center gap-2 group w-full min-w-0"
                style={{ color: CREAM }}
                title="Rename"
              >
                <span className="truncate min-w-0">{deck.name.toUpperCase()}</span>
                <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition shrink-0" style={{ color: CREAM_DIM }} />
              </button>
            )}
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
          className="hidden md:flex items-center px-5 font-serif text-[11px] tracking-[0.3em] uppercase"
          style={{ color: CREAM_DIM }}
        >
          Commander ·{' '}
          <span className="ml-1" style={{ color: deck.commander ? CREAM : ACCENT }}>
            {deck.commander ? 'set' : 'null'}
          </span>
        </div>
      </nav>

      {/* Action row — dedicated horizontal strip below the nav. flex-wrap
          handles 5+ buttons reflowing on narrow viewports. */}
      <div
        className="hidden md:flex items-center flex-wrap gap-x-5 gap-y-2 border-b px-5 py-2.5 font-serif text-[11px] tracking-[0.3em] uppercase"
        style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
      >
        <button
          onClick={() => setShowNotes(true)}
          className="flex items-center hover:opacity-100"
          title="Deck notes / scratchpad"
          style={{ color: deck.notes ? CREAM : CREAM_DIM }}
        >
          <FileText className="w-3 h-3 mr-1.5" /> Notes{deck.notes ? ' ·' : ''}
        </button>
        <button
          onClick={() => setShowShare(true)}
          className="flex items-center hover:opacity-100"
          title="Share via link"
        >
          <LinkIcon className="w-3 h-3 mr-1.5" /> Share
        </button>
        <button
          onClick={() => onUpdate(setDeckPublic(deck, !deck.is_public))}
          className="flex items-center hover:opacity-100"
          title={deck.is_public ? 'This deck is in the public gallery. Click to unlist.' : 'Click to add this deck to the public gallery.'}
          style={{ color: deck.is_public ? '#a3c98a' : CREAM_DIM }}
        >
          <Globe className="w-3 h-3 mr-1.5" /> {deck.is_public ? 'Public' : 'Private'}
        </button>
        {(otherDecks.length > 0 || deck.commander) && (
          <button
            onClick={() => setShowCompare(true)}
            className="flex items-center hover:opacity-100"
            title="Compare with another deck or the EDHREC average"
          >
            <GitCompare className="w-3 h-3 mr-1.5" /> Compare
          </button>
        )}
        <button
          onClick={() => setShowExport(true)}
          className="flex items-center hover:opacity-100"
          title="Export decklist"
        >
          <Download className="w-3 h-3 mr-1.5" /> Export
        </button>
        {onDuplicate && (
          <button
            onClick={onDuplicate}
            className="flex items-center hover:opacity-100"
            title="Duplicate deck"
          >
            <Copy className="w-3 h-3 mr-1.5" /> Dupe
          </button>
        )}
        {/* Spacer pushes Rules to the right edge */}
        <span className="flex-1" />
        <button
          onClick={() => setShowRules(true)}
          className="flex items-center hover:opacity-100"
          title="Commander rules reference"
        >
          <BookOpen className="w-3 h-3 mr-1.5" /> Rules
        </button>
      </div>

      <div className="my-8 fade-up">
        <CommanderPicker deck={deck} onSet={setCommander} />
      </div>

      <div
        className="grid grid-cols-4 md:grid-cols-7 border-t border-l fade-up sticky top-0 z-30"
        style={{ borderColor: CREAM_FAINT, animationDelay: '120ms', background: BG }}
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
        <ErrorBoundary key={tab} label={`${tab} tab crashed`}>
          {tab === 'cards' && <CardsTab deck={deck} onUpdate={onUpdate} />}
          {tab === 'packages' && <PackagesTab deck={deck} />}
          {tab === 'stages' && <StagesTab deck={deck} />}
          {tab === 'recs' && <RecommendationsTab deck={deck} onUpdate={onUpdate} />}
          {tab === 'curve' && <CurveTab deck={deck} />}
          {tab === 'bracket' && <BracketTab deck={deck} onUpdate={onUpdate} />}
          {tab === 'probs' && <ProbabilitiesTab deck={deck} />}
        </ErrorBoundary>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {showExport && <ExportModal deck={deck} onClose={() => setShowExport(false)} />}
      {showShare && <ShareModal deck={deck} onClose={() => setShowShare(false)} />}
      {showCompare && <CompareModal deck={deck} otherDecks={otherDecks} onClose={() => setShowCompare(false)} />}
      {showNotes && (
        <NotesModal
          deck={deck}
          onSave={(notes) => onUpdate(setDeckNotes(deck, notes))}
          onClose={() => setShowNotes(false)}
        />
      )}
    </div>
  );
}
