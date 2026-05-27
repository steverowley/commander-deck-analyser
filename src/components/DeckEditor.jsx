import React, { useState, useEffect } from 'react';
import { ChevronLeft, BookOpen, Loader2, Crown, Sparkles, Tag, BarChart3, Target, Clock, Calculator, Lightbulb, Pencil, Copy, Download, Link as LinkIcon, GitCompare, FileText, Globe, Images, Sparkle, Save, Search } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { lc, pad } from '../lib/utils.js';
import { searchCardAutocomplete, fetchCardByExactName, cardImageUrl } from '../lib/scryfall.js';
import { renameDeck, setDeckNotes, setDeckPublic } from '../lib/deckops.js';
import { CardsTab, PackagesTab, CurveTab, BracketTab, StagesTab, ProbabilitiesTab, RecommendationsTab } from './Tabs.jsx';
import { deckTotalPrice, formatPrice, deckPriceTooltip } from '../lib/pricing.js';
import { loadSettings } from '../lib/settings.js';
import { RulesModal, ExportModal, ShareModal, CompareModal, NotesModal, PrintingPickerModal } from './Modals.jsx';
import { ScryfallSearchPanel } from './ScryfallSearchPanel.jsx';
import { addCardsToDeck } from '../lib/deckops.js';
import { ManaCost } from './ManaCost.jsx';
import { InlineOracle } from './UI.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';

// ───────────────────────────────────────────────────────────────────────────────

// Foil styles cycled by the chip on the commander art. Order = cycle
// order. 'off' is implicit (null/undefined commander_foil).
const FOIL_STYLES = ['rainbow', 'galaxy', 'surge', 'etched', 'oil'];
const FOIL_LABELS = {
  rainbow: 'Rainbow',
  galaxy:  'Galaxy',
  surge:   'Surge',
  etched:  'Etched',
  oil:     'Oil slick',
};

function normaliseFoilStyle(value) {
  // Legacy boolean `true` from earlier versions maps to the original
  // rainbow style so existing saved decks keep their visual.
  if (value === true) return 'rainbow';
  if (typeof value === 'string' && FOIL_STYLES.includes(value)) return value;
  return null;
}

function nextFoilStyle(current) {
  const norm = normaliseFoilStyle(current);
  if (!norm) return FOIL_STYLES[0];
  const idx = FOIL_STYLES.indexOf(norm);
  // Cycle off after the last style.
  if (idx >= FOIL_STYLES.length - 1) return null;
  return FOIL_STYLES[idx + 1];
}

function CommanderPicker({ deck, onSet, onCycleFoil }) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [highlight, setHighlight] = useState(0);
  const [showPrintings, setShowPrintings] = useState(false);
  const foilStyle = normaliseFoilStyle(deck.commander_foil);
  const foil = !!foilStyle;
  const foilLabel = foilStyle ? FOIL_LABELS[foilStyle] : null;

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
          className="md:col-span-2 p-6 md:border-r border-b md:border-b-0 flex items-center justify-center relative group"
          style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
        >
          {/* Card wrapper. Art opens the printing picker; Foil toggles
              the foil overlay. Both action buttons are siblings of the
              image (not nested) so we don't get button-in-button HTML.
              `foil-wrap` lives here so the gradient overlays inherit
              the rounded-card radius. */}
          <div
            className="relative foil-wrap w-56 sm:w-64 md:w-56"
            style={{ borderRadius: '4.75% / 3.5%' }}
          >
            <button
              type="button"
              onClick={() => setShowPrintings(true)}
              className="relative block w-full"
              title="Change art / printing"
              style={{ borderRadius: '4.75% / 3.5%' }}
            >
              <img
                src={cardImageUrl(deck.commander, 'png')}
                alt={deck.commander.name}
                className="block w-full"
                style={{ borderRadius: '4.75% / 3.5%' }}
                onError={(e) => {
                  // Fall back to the JPG variant if the PNG fails (some
                  // older printings still 404 on the PNG endpoint).
                  if (!e.target.dataset.fallback) {
                    e.target.dataset.fallback = '1';
                    e.target.src = cardImageUrl(deck.commander, 'normal');
                  } else {
                    e.target.style.display = 'none';
                  }
                }}
              />
            </button>
            {foilStyle && (
              <>
                <span className={`foil-tint foil-${foilStyle} pointer-events-none`} style={{ borderRadius: '4.75% / 3.5%' }} />
                <span className={`foil-shine foil-${foilStyle} pointer-events-none`} style={{ borderRadius: '4.75% / 3.5%' }} />
              </>
            )}
            {/* Foil cycle chip — top-right corner. Cycles
                off → rainbow → galaxy → surge → etched → oil → off
                on each click. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCycleFoil?.();
              }}
              className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 text-[9px] tracking-[0.2em] uppercase font-serif border md:opacity-0 md:group-hover:opacity-100 transition z-10"
              style={{
                background: BG,
                borderColor: foil ? CREAM : CREAM_FAINT,
                color: foil ? CREAM : CREAM_DIM,
              }}
              title={foil
                ? `Foil: ${foilLabel} — click to cycle. After Oil slick, click cycles back to off.`
                : 'Click to add a foil sheen — cycles through Rainbow / Galaxy / Surge / Etched / Oil slick.'}
              aria-pressed={foil}
            >
              <Sparkle className="w-3 h-3" /> {foil ? foilLabel : 'Foil'}
            </button>
            {/* Art hover chip — bottom-right corner */}
            <span
              className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 text-[9px] tracking-[0.2em] uppercase font-serif border md:opacity-0 md:group-hover:opacity-100 transition z-10 pointer-events-none"
              style={{ background: BG, borderColor: CREAM_FAINT, color: CREAM }}
            >
              <Images className="w-3 h-3" /> Art
            </span>
          </div>
        </div>
        <div className="md:col-span-3 p-6">
          <div className="flex items-baseline justify-between mb-4 gap-3">
            <div className="font-serif text-[10px] tracking-[0.4em] uppercase font-bold" style={{ color: CREAM_DIM }}>
              <Crown className="w-3 h-3 inline mr-2" style={{ verticalAlign: 'baseline' }} />
              Commander
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <button
                onClick={() => setShowPrintings(true)}
                className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100 flex items-center gap-1.5"
                style={{ color: CREAM_DIM }}
                title="Pick a different printing"
              >
                <Images className="w-3 h-3" /> Art
              </button>
              <span style={{ opacity: 0.4, color: CREAM_DIM }}>·</span>
              <button
                onClick={onCycleFoil}
                className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100 flex items-center gap-1.5"
                style={{ color: foil ? CREAM : CREAM_DIM }}
                title={foil
                  ? `Foil: ${foilLabel} — click to cycle. After Oil slick, click cycles back to off.`
                  : 'Click to add a foil sheen — cycles Rainbow / Galaxy / Surge / Etched / Oil slick.'}
              >
                <Sparkle className="w-3 h-3" /> {foil ? `Foil · ${foilLabel}` : 'Foil'}
              </button>
              <span style={{ opacity: 0.4, color: CREAM_DIM }}>·</span>
              <button
                onClick={() => onSet(null)}
                className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100"
                style={{ color: CREAM_DIM }}
              >
                Change →
              </button>
            </div>
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
          {deck.commander.set_name && (
            <div className="font-mono text-[10px] mt-3 tracking-wider" style={{ color: CREAM_DIM }}>
              {deck.commander.set?.toUpperCase()} · {deck.commander.set_name} · #{deck.commander.collector_number}
            </div>
          )}
        </div>
        {showPrintings && (
          <PrintingPickerModal
            card={deck.commander}
            onClose={() => setShowPrintings(false)}
            onPick={(p) => {
              onSet(p);
              setShowPrintings(false);
            }}
          />
        )}
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
            className="absolute top-full left-6 right-6 border z-40 mt-px"
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

export function DeckEditor({ deck, onUpdate, onBack, onDuplicate, onSaveTransient, otherDecks = [], initialTab }) {
  const [tab, setTab] = useState(initialTab || 'cards');
  const [showRules, setShowRules] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showScryfall, setShowScryfall] = useState(false);
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
  const currency = loadSettings().currency || 'usd';
  const priceInfo = deckTotalPrice(deck, currency);
  const priceApprox = priceInfo.approximate ? '~' : '';
  const priceLabel = priceInfo.priced > 0
    ? `${priceApprox}${formatPrice(priceInfo.total, currency)}`
    : '—';
  const priceTip = deckPriceTooltip(priceInfo);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8">
      {/* Header — deck name + status. On mobile the Cards/Commander
          status cells render as a 2-col strip below the title so all
          three pieces of info stay visible. */}
      <nav className="border-b mt-6" style={{ borderColor: CREAM_FAINT }}>
        <div className="grid grid-cols-1 md:grid-cols-4">
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
              <button
                type="button"
                onClick={onBack}
                className="font-serif text-[10px] tracking-[0.3em] uppercase mt-1 hover:opacity-100 transition"
                style={{ color: CREAM_DIM }}
                title="Back to Vault home"
              >
                Vault · Deck
              </button>
            </div>
          </div>
          <div
            className="flex items-center px-4 md:px-5 py-3 md:py-0 border-t md:border-t-0 md:border-r font-serif text-[11px] tracking-[0.3em] uppercase"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            Cards ·{' '}
            <span className="ml-1" style={{ color: CREAM }}>
              {pad(totalCards)} / {pad(100 - (deck.commander ? 1 : 0))}
            </span>
          </div>
          <div
            className="flex items-center px-4 md:px-5 py-3 md:py-0 border-t md:border-t-0 md:border-r font-serif text-[11px] tracking-[0.3em] uppercase"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
          >
            Commander ·{' '}
            <span className="ml-1" style={{ color: deck.commander ? CREAM : ACCENT }}>
              {deck.commander ? 'set' : 'null'}
            </span>
          </div>
          <div
            className="flex items-center px-4 md:px-5 py-3 md:py-0 border-t md:border-t-0 font-serif text-[11px] tracking-[0.3em] uppercase"
            style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
            title={priceTip}
          >
            Cost ·{' '}
            <span className="ml-1" style={{ color: CREAM }}>
              {priceLabel}
            </span>
          </div>
        </div>
      </nav>

      {/* Action row — icon-only on mobile (wraps, no horizontal scroll),
          icon+label on desktop. Removing overflow-x-auto means every
          button stays reachable on narrow screens without swipe-scroll. */}
      {(deck.__transient || String(deck.id).startsWith('roll:') || String(deck.id).startsWith('view:')) && onSaveTransient && (
        <div
          className="px-4 md:px-5 py-2.5 border-b flex items-center justify-between gap-3 flex-wrap"
          style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.04)' }}
        >
          <div className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
            This is a transient session — edits don't persist until you save it to your archive.
          </div>
          <button
            onClick={() => onSaveTransient(deck)}
            className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-1.5 hover:opacity-100 flex items-center gap-1.5 shrink-0"
            style={{ borderColor: CREAM, color: CREAM, background: 'rgba(243,231,201,0.08)' }}
          >
            <Save className="w-3 h-3" /> Save to my archive →
          </button>
        </div>
      )}

      <div
        className="flex items-center flex-wrap gap-x-5 md:gap-x-5 gap-y-3 md:gap-y-2 border-b px-4 md:px-5 py-3 md:py-2.5 font-serif text-[11px] tracking-[0.3em] uppercase"
        style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}
      >
        <ActionButton
          onClick={() => setShowNotes(true)}
          icon={FileText}
          label={`Notes${deck.notes ? ' ·' : ''}`}
          title="Deck notes / scratchpad"
          activeColor={deck.notes ? CREAM : null}
        />
        <ActionButton
          onClick={() => setShowShare(true)}
          icon={LinkIcon}
          label="Share"
          title="Share via link"
        />
        <ActionButton
          onClick={() => onUpdate(setDeckPublic(deck, !deck.is_public))}
          icon={Globe}
          label={deck.is_public ? 'Public' : 'Private'}
          title={deck.is_public ? 'This deck is in the public gallery. Click to unlist.' : 'Click to add this deck to the public gallery.'}
          activeColor={deck.is_public ? '#a3c98a' : null}
        />
        {(otherDecks.length > 0 || deck.commander) && (
          <ActionButton
            onClick={() => setShowCompare(true)}
            icon={GitCompare}
            label="Compare"
            title="Compare with another deck or the EDHREC average"
          />
        )}
        <ActionButton
          onClick={() => setShowExport(true)}
          icon={Download}
          label="Export"
          title="Export decklist"
        />
        {onDuplicate && (
          <ActionButton
            onClick={onDuplicate}
            icon={Copy}
            label="Dupe"
            title="Duplicate deck"
          />
        )}
        <ActionButton
          onClick={() => setShowScryfall(true)}
          icon={Search}
          label="Search"
          title="Search Scryfall — drag results into the card list"
        />
        {/* Spacer pushes Rules to the right edge on desktop */}
        <span className="hidden md:block flex-1" />
        <ActionButton
          onClick={() => setShowRules(true)}
          icon={BookOpen}
          label="Rules"
          title="Commander rules reference"
        />
      </div>

      <div className="my-8 fade-up">
        <CommanderPicker
          deck={deck}
          onSet={setCommander}
          onCycleFoil={() => onUpdate({ ...deck, commander_foil: nextFoilStyle(deck.commander_foil) })}
        />
      </div>

      {/* Tab bar — horizontally scrolls on mobile so all 7 tabs are
          reachable without leaving an empty grid cell or wrapping
          awkwardly. Desktop keeps the original equal-width 7-col grid.
          Sticky lives on the outer wrapper so horizontal overflow can
          scroll while the bar stays pinned vertically. */}
      <div
        className="sticky top-0 z-30 fade-up overflow-x-auto md:overflow-visible -mx-4 md:mx-0 px-4 md:px-0"
        style={{ background: BG, animationDelay: '120ms' }}
      >
        <div
          className="flex md:grid md:grid-cols-7 border-t border-l min-w-max md:min-w-0"
          style={{ borderColor: CREAM_FAINT }}
        >
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="border-r border-b py-3 px-4 md:px-3 transition flex flex-col items-center gap-1.5 shrink-0 min-w-[72px]"
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
      {showScryfall && (
        <ScryfallSearchPanel
          open={showScryfall}
          onClose={() => setShowScryfall(false)}
          addLabel="Add to deck"
          onAdd={(card) => {
            onUpdate(addCardsToDeck(deck, [{ name: card.name, count: 1, scryfall: card }]));
          }}
        />
      )}
    </div>
  );
}

// Action-strip button — icon-only on mobile, icon + label on md+.
function ActionButton({ onClick, icon: Icon, label, title, activeColor }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center hover:opacity-100 shrink-0"
      title={title}
      style={{ color: activeColor || CREAM_DIM }}
    >
      <Icon className="w-3.5 h-3.5 md:w-3 md:h-3 md:mr-1.5" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
