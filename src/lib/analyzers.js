import {
  GAME_CHANGERS, MLD_CARDS, EXTRA_TURN_CARDS, FAST_MANA, KNOWN_COMBOS,
} from './constants.js';
import { lc } from './utils.js';

/**
 * Inspect a deck and return its bracket (1–5) plus flagged cards and reasons.
 * Bracket definitions come from WotC's published Commander brackets.
 */
export function assessBracket(deck) {
  const cards = deck.cards.filter((c) => c.scryfall);
  const cardNames = new Set(cards.map((c) => lc(c.scryfall.name)));
  const flags = {
    gameChangers: [], mld: [], extraTurns: [], tutors: [], combos: [], fastMana: [],
  };

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
  }
  for (const [a, b] of KNOWN_COMBOS) {
    if (cardNames.has(a) && cardNames.has(b)) flags.combos.push(`${a} + ${b}`);
  }

  let bracket = 2;
  const reasons = [];
  if (flags.combos.length > 0) {
    bracket = Math.max(bracket, 4);
    reasons.push(`${flags.combos.length} 2-card infinite combo(s) detected — Bracket 4+`);
  }
  if (flags.gameChangers.length > 3) {
    bracket = Math.max(bracket, 4);
    reasons.push(`${flags.gameChangers.length} Game Changers — Bracket 4`);
  } else if (flags.gameChangers.length > 0) {
    bracket = Math.max(bracket, 3);
    reasons.push(`${flags.gameChangers.length} Game Changer(s) — fits Bracket 3 (up to 3)`);
  }
  if (flags.mld.length > 0) {
    bracket = Math.max(bracket, 4);
    reasons.push(`Mass Land Destruction — Bracket 4+`);
  }
  if (flags.extraTurns.length > 1) {
    bracket = Math.max(bracket, 4);
    reasons.push(`Multiple extra-turn spells — Bracket 4+`);
  }
  if (flags.tutors.length > 3) {
    bracket = Math.max(bracket, 4);
    reasons.push(`${flags.tutors.length} tutors — heavy tutoring suggests Bracket 4+`);
  } else if (flags.tutors.length > 0) {
    reasons.push(`${flags.tutors.length} tutor(s) — fine in Bracket 3`);
  }
  if (flags.fastMana.length > 0) {
    bracket = Math.max(bracket, 4);
    reasons.push(`Fast mana (${flags.fastMana.join(', ')}) — Bracket 4`);
  }
  if (bracket === 2 && cards.length >= 60) {
    reasons.push('No Bracket-4 flags detected');
    bracket = 3;
  }

  return { bracket, flags, reasons };
}

/**
 * Bucket cards into early/mid/late game roles. A card may appear in
 * multiple stages (e.g. a 6 CMC spell that's also a "Reanimation" play
 * could fit both mid and late).
 */
export function analyzeGameStages(deck) {
  const cards = deck.cards.filter(
    (c) => c.scryfall && !c.scryfall.type_line?.includes('Land')
  );
  const stages = { early: [], mid: [], late: [] };
  for (const c of cards) {
    const cmc = c.scryfall.cmc || 0;
    const tags = c.tags || [];
    const oracle = (c.scryfall.oracle_text || '').toLowerCase();
    if (cmc <= 2 || tags.includes('Ramp') || tags.includes('Mana rock')) stages.early.push(c);
    if (cmc >= 3 && cmc <= 5) stages.mid.push(c);
    if (
      cmc >= 6 ||
      tags.includes('Extra Turn') ||
      tags.includes('Board wipe') ||
      oracle.includes('win the game')
    ) {
      stages.late.push(c);
    }
  }
  return stages;
}
