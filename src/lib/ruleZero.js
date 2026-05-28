/**
 * Rule Zero card — shareable pre-game summary.
 *
 * Pure aggregator over data already produced elsewhere:
 *   - bracket + flags from analyzers.assessBracket
 *   - archetype from strategy.classifyArchetype
 *   - assembled combos from combos.detectCombos
 *   - fastest-win heuristic from a small goldfish playout
 *
 * All flags are auto-derived from the deck — the data model is
 * intentionally read-only so a user can't curate dishonesty into
 * their Rule Zero card.
 *
 * `buildRuleZeroCard(deck)` returns the structured data; `asMarkdown`
 * renders it for Discord / Slack / WhatsApp.
 */

import { assessBracket } from './analyzers.js';
import { classifyArchetype } from './strategy.js';
import { detectCombos } from './combos.js';
import { simulatePlayout } from './goldfish.js';
import { lc } from './utils.js';

// Cards that win the game outright with their own text — separate from
// 2-card combos. Used to produce a "Wins via …" line.
const ALT_WIN_CARDS = new Set([
  'approach of the second sun',
  "maze's end",
  'biovisionary',
  'mortal combat',
  'felidar sovereign',
  'test of endurance',
  'celestial convergence',
  'azor\'s elocutors',
  'mechanized production',
  'happily ever after',
  'simic ascendancy',
  'helix pinnacle',
  'coalition victory',
  'epic struggle',
  'darksteel reactor',
]);

const STAX_TAG_RE = /^stax piece$/i;

/**
 * Crude "earliest realistic threat density" estimate. Runs N goldfish
 * playouts (no mulligan); for each, walks the per-turn log and returns
 * the first turn where the cumulative non-land CMC on the battlefield
 * crosses 10 — a rough proxy for "this deck has put down enough mass
 * to threaten lethal soon". Returns the median across playouts so a
 * single hot draw doesn't lie.
 *
 * Returns null when the simulator can't run (deck too small) or the
 * threshold isn't crossed within the playout window.
 */
export function estimateFastestWinTurn(deck, { samples = 20, turns = 8, threshold = 10 } = {}) {
  const results = [];
  for (let i = 0; i < samples; i++) {
    const log = simulatePlayout(deck, turns);
    if (!log) return null;
    let cum = 0;
    let crossed = null;
    for (const t of log) {
      for (const cast of t.casts || []) {
        cum += cast.cmc || 0;
      }
      if (cum >= threshold) { crossed = t.turn; break; }
    }
    if (crossed) results.push(crossed);
  }
  if (results.length === 0) return null;
  results.sort((a, b) => a - b);
  return results[Math.floor(results.length / 2)];
}

/**
 * Inspect the deck and assemble a short list of win conditions.
 * Each entry is a human-readable phrase like "2-card infinite combo
 * (Thassa's Oracle + Demonic Consultation)".
 */
export function winConditions(deck, { bracket, combos } = {}) {
  const out = [];
  for (const c of combos?.assembled || []) {
    const tagline = (c.results && c.results[0]) || 'Combo win';
    out.push(`${tagline} — ${c.cards.join(' + ')}`);
  }
  const altWins = (deck.cards || [])
    .filter((c) => c.scryfall && ALT_WIN_CARDS.has(lc(c.scryfall.name)))
    .map((c) => c.scryfall.name);
  for (const name of altWins) out.push(`Alt-win card: ${name}`);

  // Commander damage check — commander with power >= 5 + evasion or
  // double strike. Cheap heuristic — full damage-math would need
  // synergy modelling.
  const cmdr = deck.commander;
  if (cmdr) {
    const oracle = cmdr.oracle_text || '';
    const evasion = /(flying|menace|trample|unblockable|can't be blocked|shadow|fear|intimidate|skulk)/i.test(oracle);
    const power = parseInt(cmdr.power, 10);
    if (Number.isFinite(power) && power >= 5 && evasion) {
      out.push(`Commander damage — ${cmdr.name} (${cmdr.power}/${cmdr.toughness})`);
    } else if (cmdr.oracle_text && /commander damage/i.test(cmdr.oracle_text)) {
      out.push(`Commander damage — ${cmdr.name}`);
    }
  }

  if (out.length === 0) {
    if (bracket && bracket >= 4) out.push('No assembled combo found, but high power tools present.');
    else out.push('Beats — value engines or combat damage.');
  }

  return out;
}

/**
 * Build the structured Rule Zero card for a deck.
 */
export function buildRuleZeroCard(deck) {
  if (!deck) return null;
  const bracketAssessment = assessBracket(deck);
  const archetype = classifyArchetype(deck);
  const combos = detectCombos(deck);
  const fastestWin = estimateFastestWinTurn(deck);

  const flags = {
    tutors:      bracketAssessment.flags.tutors.length,
    mld:         bracketAssessment.flags.mld.length,
    extraTurns:  bracketAssessment.flags.extraTurns.length,
    fastMana:    bracketAssessment.flags.fastMana.length,
    gameChangers: bracketAssessment.flags.gameChangers.length,
    combos:      combos.assembled.length,
    stax:        (deck.cards || []).reduce((s, c) => {
      if (!c.scryfall) return s;
      const tags = c.tags || [];
      return s + (tags.some((t) => STAX_TAG_RE.test(t)) ? c.count : 0);
    }, 0),
  };

  const wins = winConditions(deck, {
    bracket: bracketAssessment.bracket,
    combos,
  });

  const colorId = (deck.commander?.color_identity || []).join('');

  return {
    deckName: deck.name || 'Untitled',
    commanderName: deck.commander?.name || null,
    colors: colorId || 'C',
    bracket: bracketAssessment.bracket,
    bracketReasons: bracketAssessment.reasons,
    archetype: archetype.primary ? { id: archetype.primary.id, name: archetype.primary.name } : null,
    secondaryArchetypes: (archetype.secondary || []).map((a) => a.name),
    avgCmc: bracketAssessment.avgCmc,
    deckSize: bracketAssessment.deckSize,
    fastestWinTurn: fastestWin,
    winCons: wins,
    flags,
  };
}

const BRACKET_LABELS = ['', 'Exhibition', 'Core', 'Upgraded', 'Optimized', 'cEDH'];

function flagsLine(flags) {
  const bits = [];
  if (flags.combos > 0)       bits.push(`${flags.combos} combo${flags.combos === 1 ? '' : 's'}`);
  if (flags.gameChangers > 0) bits.push(`${flags.gameChangers} GC`);
  if (flags.mld > 0)          bits.push(`${flags.mld} MLD`);
  if (flags.extraTurns > 0)   bits.push(`${flags.extraTurns} extra-turn`);
  if (flags.fastMana > 0)     bits.push(`${flags.fastMana} fast mana`);
  if (flags.tutors > 0)       bits.push(`${flags.tutors} tutor${flags.tutors === 1 ? '' : 's'}`);
  if (flags.stax > 0)         bits.push(`${flags.stax} stax`);
  return bits.length ? bits.join(' · ') : 'none flagged';
}

/**
 * Render the Rule Zero card as Markdown suitable for Discord / Slack.
 */
export function asMarkdown(card) {
  if (!card) return '';
  const lines = [];
  lines.push(`## ${card.deckName}`);
  if (card.commanderName) {
    lines.push(`**Commander:** ${card.commanderName}${card.colors ? ` · ${card.colors}` : ''}`);
  }
  const bracketName = BRACKET_LABELS[card.bracket] || '';
  lines.push(`**Bracket:** ${card.bracket}${bracketName ? ` (${bracketName})` : ''}`);
  if (card.archetype) lines.push(`**Archetype:** ${card.archetype.name}`);
  if (Number.isFinite(card.avgCmc)) lines.push(`**Avg CMC:** ${card.avgCmc.toFixed(2)}`);
  if (Number.isFinite(card.fastestWinTurn)) {
    lines.push(`**Realistic threat turn:** T${card.fastestWinTurn}`);
  }
  lines.push('');
  lines.push('**Win conditions:**');
  for (const w of card.winCons) lines.push(`- ${w}`);
  lines.push('');
  lines.push(`**Flags:** ${flagsLine(card.flags)}`);
  if (card.bracketReasons && card.bracketReasons.length > 0) {
    lines.push('');
    lines.push('**Bracket notes:**');
    for (const r of card.bracketReasons) lines.push(`- ${r}`);
  }
  lines.push('');
  lines.push('_Generated by Vault — flags are auto-derived from the deck._');
  return lines.join('\n');
}

export { BRACKET_LABELS, flagsLine };
