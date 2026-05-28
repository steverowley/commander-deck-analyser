import {
  GAME_CHANGERS, MLD_CARDS, EXTRA_TURN_CARDS, FAST_MANA,
} from './constants.js';
import { detectCombos } from './combos.js';
import { lc } from './utils.js';

/**
 * Inspect a deck and return its bracket (1–5) plus flagged cards and reasons.
 * Bracket definitions come from WotC's published Commander brackets.
 *
 * Bracket ladder:
 *   1 Exhibition  — themed/casual; no power tools, lean curve, often <99 cards
 *   2 Core        — average power; no Game Changers, no MLD, no 2-card combos
 *   3 Upgraded    — focused builds; up to 3 Game Changers, no MLD
 *   4 Optimized   — high-power; GC/MLD/fast-mana/combos all allowed
 *   5 cEDH        — tournament-grade; ≥6 GC, ≥3 fast mana, multiple combos, low avg CMC
 */
export function assessBracket(deck) {
  const cards = deck.cards.filter((c) => c.scryfall);
  const flags = {
    gameChangers: [], mld: [], extraTurns: [], tutors: [],
    combos: [],         // string labels "a + b" — preserves the legacy FlagBox shape
    comboDetails: [],   // full combo objects from src/lib/combos.js
    fastMana: [],
  };

  let totalCmc = 0;
  let nonLandCount = 0;
  for (const c of cards) {
    const name = lc(c.scryfall.name);
    const oracle = c.scryfall.oracle_text || '';
    if (GAME_CHANGERS.has(name)) flags.gameChangers.push(c.scryfall.name);
    if (MLD_CARDS.has(name)) flags.mld.push(c.scryfall.name);
    if (EXTRA_TURN_CARDS.has(name)) flags.extraTurns.push(c.scryfall.name);
    if (FAST_MANA.has(name)) flags.fastMana.push(c.scryfall.name);
    if (/search your library for an? .{1,40} card/i.test(oracle) && !/basic land/i.test(oracle)) {
      flags.tutors.push(c.scryfall.name);
    }
    if (!c.scryfall.type_line?.includes('Land')) {
      totalCmc += (c.scryfall.cmc || 0) * c.count;
      nonLandCount += c.count;
    }
  }
  const comboMatches = detectCombos(deck);
  flags.comboDetails = comboMatches.assembled;
  flags.combos = comboMatches.assembled.map((c) => c.cards.join(' + '));
  flags.nearMissCombos = comboMatches.nearMiss;

  const avgCmc = nonLandCount > 0 ? totalCmc / nonLandCount : 0;
  const deckSize = cards.reduce((s, c) => s + c.count, 0);

  let bracket = 2;
  const reasons = [];

  // Bracket 4 triggers
  if (flags.combos.length > 0) {
    bracket = Math.max(bracket, 4);
    reasons.push(`${flags.combos.length} 2-card infinite combo(s) — Bracket 4+`);
  }
  if (flags.gameChangers.length > 3) {
    bracket = Math.max(bracket, 4);
    reasons.push(`${flags.gameChangers.length} Game Changers (>3) — Bracket 4+`);
  } else if (flags.gameChangers.length > 0) {
    bracket = Math.max(bracket, 3);
    reasons.push(`${flags.gameChangers.length} Game Changer(s) — Bracket 3 limit (≤3)`);
  }
  if (flags.mld.length > 0) {
    bracket = Math.max(bracket, 4);
    reasons.push('Mass Land Destruction — Bracket 4+');
  }
  if (flags.extraTurns.length > 1) {
    bracket = Math.max(bracket, 4);
    reasons.push(`${flags.extraTurns.length} extra-turn spells — Bracket 4+`);
  }
  // Tutor count is informational only — WotC removed the tutor cap from
  // Brackets 1-3 in their Oct 21, 2025 update. The Game Changers list now
  // catches the warping tutors (Demonic, Vampiric, Imperial Seal, etc.)
  // directly. Volume still feeds the cEDH (Bracket 5) signal below.
  if (flags.tutors.length > 0) {
    reasons.push(`${flags.tutors.length} tutor(s) — informational, no bracket penalty`);
  }
  if (flags.fastMana.length > 0) {
    bracket = Math.max(bracket, 4);
    reasons.push(`Fast mana: ${flags.fastMana.join(', ')} — Bracket 4+`);
  }

  // Bracket 5 (cEDH) — only when multiple Bracket-4 signals stack high
  const cedhScore =
    (flags.gameChangers.length >= 6 ? 1 : 0) +
    (flags.fastMana.length >= 3 ? 1 : 0) +
    (flags.combos.length >= 2 ? 1 : 0) +
    (flags.tutors.length >= 6 ? 1 : 0) +
    (avgCmc > 0 && avgCmc <= 2.4 ? 1 : 0);
  if (cedhScore >= 3) {
    bracket = 5;
    reasons.push(`cEDH-grade density (avg CMC ${avgCmc.toFixed(2)}, ${flags.gameChangers.length} GC, ${flags.fastMana.length} fast mana) — Bracket 5`);
  }

  // Bracket 1 (Exhibition) — clean of power tools AND signs of a casual/themed build
  if (
    bracket === 2 &&
    flags.gameChangers.length === 0 &&
    flags.mld.length === 0 &&
    flags.combos.length === 0 &&
    flags.fastMana.length === 0 &&
    flags.extraTurns.length === 0 &&
    flags.tutors.length === 0
  ) {
    if (deckSize < 80 || avgCmc >= 4.2) {
      bracket = 1;
      reasons.push(
        deckSize < 80
          ? `Light deck (${deckSize} cards) with no power tools — Exhibition`
          : `High curve (avg CMC ${avgCmc.toFixed(2)}) with no power tools — themed/Exhibition`
      );
    }
  }

  if (reasons.length === 0) {
    reasons.push('No Bracket-3+ flags detected — sits at Core power.');
  }

  return { bracket, flags, reasons, avgCmc, deckSize };
}

