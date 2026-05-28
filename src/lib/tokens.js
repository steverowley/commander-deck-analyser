/**
 * Token sheet generator — walks each card's oracle text for token-creation
 * patterns and aggregates a printable sheet of `[{ token, sources }]`
 * the user can take to a game so they remember which dice / cardboard
 * tokens to bring.
 *
 * Two passes per deck:
 *   1. Token creators — parse each card's oracle text for "create … token"
 *      lines. Extracts the token's name, P/T (creatures), and color.
 *   2. Token doublers (Anointed Procession, Parallel Lives, etc.) — added
 *      as sources to every token, since they amplify whatever else makes
 *      them.
 *
 * Also extracts non-token resources (treasure / food / clue artifact
 * tokens use the creator path; energy, experience, monarch, initiative,
 * day/night are surfaced separately via `extractResources`).
 *
 * `extractTokens(deck)` returns the aggregated sheet; `tokensAsText`
 * formats it as plain text for the print / copy button.
 */

import { lc } from './utils.js';

const NUMBER_WORDS = new Set([
  'a', 'an', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'x',
]);

const COLOR_WORDS = [
  ['white', 'W'], ['blue', 'U'], ['black', 'B'],
  ['red', 'R'], ['green', 'G'], ['colorless', 'C'],
];

// Non-creature token types — their oracle text doesn't list P/T.
const ARTIFACT_TOKENS = [
  'Treasure', 'Food', 'Clue', 'Blood', 'Gold', 'Powerstone',
  'Map', 'Incubator', 'Junk', 'Shard',
];

// Cards with these oracle patterns double the count of any token you'd
// otherwise make — track separately and surface on every token row.
const DOUBLER_RE = /(twice that many|double the number of (those |[a-z\s-]{0,20})?(creature )?tokens?|create twice that many tokens)/i;

const CREATE_RE =
  /create (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|x|\d+) ([^.;\n]*?) tokens?/gi;

function parseCreatureTokenDesc(desc) {
  const ptM = desc.match(/(\*|x|\d+)\/(\*|x|\d+)/i);
  if (!ptM) return null;

  const lower = desc.toLowerCase();
  const colors = [];
  for (const [word, c] of COLOR_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) colors.push(c);
  }

  const pt = ptM[0];
  // The subtype block sits between the P/T and the literal "creature"
  // keyword. Stop at " with " / " named " / " that " / " having ".
  const afterPt = desc.slice(desc.indexOf(pt) + pt.length);
  const subM = afterPt.match(/^\s*(.+?)\s+creature/i);
  let subtype = subM ? subM[1] : '';
  subtype = subtype.replace(/\s+(with|named|that|having|attacking)\b.*$/i, '').trim();
  // Strip any leading color words we already picked out.
  for (const [word] of COLOR_WORDS) {
    subtype = subtype.replace(new RegExp(`\\b${word}\\b\\s*`, 'gi'), '');
  }
  // Strip "tapped" / "legendary" / "artifact" prefixes for the display name.
  subtype = subtype.replace(/\b(tapped|legendary|artifact|enchantment)\b\s*/gi, '').trim();
  // Strip "and" or commas to keep multi-subtype combos compact.
  subtype = subtype.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim();

  const titleSub = subtype
    ? subtype.split(/\s+/).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join(' ')
    : 'Creature';

  // Uppercase X / * so "X/1" reads as "X/1" not "x/1" on the sheet.
  const normPt = (s) => (/^[x*]$/i.test(s) ? s.toUpperCase() : s);
  return {
    kind: 'creature',
    name: titleSub,
    power: normPt(ptM[1]),
    toughness: normPt(ptM[2]),
    colors,
  };
}

function parseArtifactTokenDesc(desc) {
  for (const t of ARTIFACT_TOKENS) {
    const re = new RegExp(`\\b${t}\\b`, 'i');
    if (re.test(desc)) {
      return { kind: 'artifact', name: t, power: null, toughness: null, colors: [] };
    }
  }
  return null;
}

/**
 * Parse every token-creation line out of a card's oracle text. Returns
 * an array — a single card may make several token types (e.g. Mondrak,
 * Glory Dominus, Ojer Pakpatiq).
 */
export function parseTokensFromOracle(oracle) {
  if (!oracle) return [];
  const tokens = [];
  const seen = new Set();
  let m;
  CREATE_RE.lastIndex = 0;
  while ((m = CREATE_RE.exec(oracle)) !== null) {
    const desc = m[1].trim();
    const parsed = parseCreatureTokenDesc(desc) || parseArtifactTokenDesc(desc);
    if (!parsed) continue;
    const key = tokenKey(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(parsed);
  }
  return tokens;
}

function tokenKey(t) {
  if (t.kind === 'creature') {
    return `creature:${t.name}:${t.power}/${t.toughness}:${[...t.colors].sort().join('')}`;
  }
  return `artifact:${t.name}`;
}

function tokenLabel(t) {
  if (t.kind === 'creature') {
    const colorStr = t.colors.length > 0 ? ' ' + t.colors.join('') : '';
    return `${t.name} ${t.power}/${t.toughness}${colorStr}`;
  }
  return t.name;
}

function isDoubler(card) {
  if (!card || !card.oracle_text) return false;
  return DOUBLER_RE.test(card.oracle_text);
}

/**
 * Walk a deck (including the commander) and return a printable sheet
 * of unique tokens with the cards that make them.
 *
 * Schema: `[{ token, label, sources }]`
 *   - token  — full token object `{ kind, name, power?, toughness?, colors }`
 *   - label  — e.g. "Goblin 1/1 R" or "Treasure"
 *   - sources — card names that create or double this token
 */
export function extractTokens(deck) {
  const byKey = new Map();
  const doublers = new Set();

  const consider = (card) => {
    if (!card) return;
    const oracle = card.oracle_text || '';
    const tokens = parseTokensFromOracle(oracle);
    for (const t of tokens) {
      const key = tokenKey(t);
      if (!byKey.has(key)) {
        byKey.set(key, { token: t, label: tokenLabel(t), sources: [], doublerSources: [] });
      }
      const entry = byKey.get(key);
      if (!entry.sources.includes(card.name)) entry.sources.push(card.name);
    }
    if (isDoubler(card)) doublers.add(card.name);
  };

  if (deck?.commander) consider(deck.commander);
  for (const c of deck?.cards || []) {
    if (c.scryfall) consider(c.scryfall);
  }

  // Append every doubler card as a source on every token — they affect
  // whatever else makes them, so the player still needs the dice / cardboard.
  const doublerList = [...doublers];
  for (const entry of byKey.values()) {
    for (const d of doublerList) {
      if (!entry.sources.includes(d)) {
        entry.sources.push(d);
        entry.doublerSources.push(d);
      }
    }
  }

  // Sort: creatures first by name, then artifact tokens.
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.token.kind !== b.token.kind) return a.token.kind === 'creature' ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Non-token resources the deck cares about — energy, experience,
 * monarch, initiative, day/night. Each resource is reported once with
 * the list of cards that involve it.
 */
const RESOURCE_PATTERNS = [
  { id: 'energy',     label: 'Energy counters',    re: /\bget \{e\}|\bpay \{e\}/i },
  { id: 'experience', label: 'Experience counters', re: /\bexperience counter/i },
  { id: 'monarch',    label: 'Monarch',            re: /\bbecome the monarch|\bis the monarch/i },
  { id: 'initiative', label: 'Initiative',         re: /\btake the initiative|\bhas the initiative/i },
  { id: 'day-night',  label: 'Day / Night',        re: /\bday(?: \/\/| then) night|\bbecomes? night|\bdaybound\b|\bnightbound\b|\bit becomes day\b/i },
  { id: 'dungeon',    label: 'Dungeons',           re: /\bventure into the dungeon\b/i },
  { id: 'ring',       label: 'The Ring tempts you', re: /\bthe ring tempts you\b/i },
  { id: 'plot',       label: 'Plot',                re: /\bplot \{|\byou may plot\b/i },
];

export function extractResources(deck) {
  const out = [];
  const consider = (card, all) => {
    if (!card) return;
    const oracle = card.oracle_text || '';
    for (const p of RESOURCE_PATTERNS) {
      if (p.re.test(oracle)) {
        let entry = all.find((e) => e.id === p.id);
        if (!entry) {
          entry = { id: p.id, label: p.label, sources: [] };
          all.push(entry);
        }
        if (!entry.sources.includes(card.name)) entry.sources.push(card.name);
      }
    }
  };
  if (deck?.commander) consider(deck.commander, out);
  for (const c of deck?.cards || []) {
    if (c.scryfall) consider(c.scryfall, out);
  }
  return out;
}

/**
 * Plain-text representation of the token sheet, suitable for
 * copy/paste into a chat client or a print dialog.
 */
export function tokensAsText({ tokens, resources, deckName }) {
  const lines = [];
  lines.push(`Token sheet — ${deckName || 'Deck'}`);
  lines.push('');
  if (!tokens.length && !resources?.length) {
    lines.push('No tokens or non-token resources detected.');
    return lines.join('\n');
  }
  if (tokens.length) {
    lines.push('Tokens:');
    for (const t of tokens) {
      lines.push(`  · ${t.label}`);
      for (const s of t.sources) lines.push(`      from ${s}`);
    }
  }
  if (resources?.length) {
    if (tokens.length) lines.push('');
    lines.push('Non-token resources:');
    for (const r of resources) {
      lines.push(`  · ${r.label}`);
      for (const s of r.sources) lines.push(`      from ${s}`);
    }
  }
  return lines.join('\n');
}
