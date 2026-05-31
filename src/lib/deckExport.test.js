import { describe, it, expect } from 'vitest';
import {
  toPlainText, toMoxfield, toArchidekt,
  exportAs, EXPORT_FORMATS,
} from './deckExport.js';
import { parseTextDecklist } from './deckImport.js';

const cardObj = (name, set = null, cn = null) => ({
  count: 1, name,
  scryfall: { name, type_line: 'Creature', oracle_text: '', cmc: 2, set, collector_number: cn },
});
const basicLand = (name, count = 1) => ({
  count, name,
  scryfall: { name, type_line: `Basic Land — ${name}`, oracle_text: '', cmc: 0 },
});

const deckFixture = () => ({
  name: 'Edgar Markov',
  commander: { name: 'Edgar Markov', type_line: 'Legendary Creature — Vampire', oracle_text: '', set: 'CMM', collector_number: '12' },
  cards: [
    cardObj('Sol Ring', 'CMM', '456'),
    cardObj('Arcane Signet', 'CMM', '457'),
    cardObj('Anointed Procession'),
    basicLand('Swamp', 14),
    basicLand('Mountain', 8),
  ],
  wishlist: [{ name: 'Mana Crypt', count: 1, scryfall: { name: 'Mana Crypt' } }],
});

/**
 * Convert the parser's output back to a comparable structure: only the
 * cards' names + counts + section.
 */
function asEntries(parsed) {
  return parsed.map((e) => ({ name: e.name, count: e.count, section: e.section }));
}

describe('toPlainText', () => {
  it('emits `// Commander` header and a sorted mainboard', () => {
    const out = toPlainText(deckFixture());
    expect(out).toMatch(/^\/\/ Commander\n1 Edgar Markov\n\n/);
    // Non-basics sorted alphabetically before basics.
    const lines = out.split('\n');
    expect(lines.indexOf('1 Anointed Procession')).toBeLessThan(lines.indexOf('14 Swamp'));
  });

  it('groups basics at the bottom of the mainboard', () => {
    const out = toPlainText(deckFixture());
    const lines = out.split('\n');
    expect(lines.indexOf('1 Sol Ring')).toBeLessThan(lines.indexOf('8 Mountain'));
    expect(lines.indexOf('1 Sol Ring')).toBeLessThan(lines.indexOf('14 Swamp'));
    // Basics are sorted alphabetically among themselves — Mountain before Swamp.
    expect(lines.indexOf('8 Mountain')).toBeLessThan(lines.indexOf('14 Swamp'));
  });

  it('round-trips through parseTextDecklist (the acceptance case)', () => {
    const out = toPlainText(deckFixture());
    const parsed = asEntries(parseTextDecklist(out));
    const counts = {
      commander: parsed.filter((e) => e.section === 'commander').reduce((s, e) => s + e.count, 0),
      mainboard: parsed.filter((e) => e.section === 'mainboard').reduce((s, e) => s + e.count, 0),
      maybeboard: parsed.filter((e) => e.section === 'maybeboard').reduce((s, e) => s + e.count, 0),
    };
    expect(counts.commander).toBe(1);
    expect(counts.mainboard).toBe(3 + 14 + 8);
    expect(counts.maybeboard).toBe(1);
    expect(parsed.find((e) => e.name === 'Sol Ring')).toBeTruthy();
    expect(parsed.find((e) => e.name === 'Edgar Markov').section).toBe('commander');
    expect(parsed.find((e) => e.name === 'Mana Crypt').section).toBe('maybeboard');
  });
});

describe('toMoxfield', () => {
  it('emits explicit Commander / Deck / Maybeboard headers', () => {
    const out = toMoxfield(deckFixture());
    expect(out).toMatch(/^Commander\n1 Edgar Markov\n\nDeck\n/);
    expect(out).toMatch(/\nMaybeboard\n1 Mana Crypt$/);
  });

  it('round-trips through parseTextDecklist', () => {
    const out = toMoxfield(deckFixture());
    const parsed = asEntries(parseTextDecklist(out));
    expect(parsed.filter((e) => e.section === 'commander').length).toBe(1);
    expect(parsed.filter((e) => e.section === 'mainboard').length).toBe(5);
    expect(parsed.filter((e) => e.section === 'maybeboard').length).toBe(1);
  });

  it('omits commander block when the deck has none', () => {
    const out = toMoxfield({ ...deckFixture(), commander: null });
    expect(out).not.toMatch(/^Commander\n/);
    expect(out).toMatch(/^Deck\n/);
  });
});

describe('toArchidekt', () => {
  it('appends `(SET) <num>` printing tags when available', () => {
    const out = toArchidekt(deckFixture());
    expect(out).toMatch(/1 Sol Ring \(CMM\) 456/);
    expect(out).toMatch(/1 Edgar Markov \(CMM\) 12/);
  });

  it('skips the printing suffix when set/collector_number are missing', () => {
    const out = toArchidekt(deckFixture());
    // Anointed Procession has no set/collector_number in the fixture — no parens.
    expect(out).toMatch(/^1 Anointed Procession$/m);
  });

  it('round-trips through parseTextDecklist (printing tags are stripped on re-parse)', () => {
    const out = toArchidekt(deckFixture());
    const parsed = asEntries(parseTextDecklist(out));
    expect(parsed.find((e) => e.name === 'Sol Ring')).toBeTruthy();
    expect(parsed.find((e) => e.name === 'Edgar Markov').section).toBe('commander');
  });
});

describe('exportAs + EXPORT_FORMATS', () => {
  it('dispatches by id', () => {
    expect(exportAs(deckFixture(), 'moxfield')).toBe(toMoxfield(deckFixture()));
    expect(exportAs(deckFixture(), 'archidekt')).toBe(toArchidekt(deckFixture()));
    expect(exportAs(deckFixture(), 'text')).toBe(toPlainText(deckFixture()));
  });

  it('falls back to plain text for an unknown format id', () => {
    expect(exportAs(deckFixture(), 'mtgo')).toBe(toPlainText(deckFixture()));
  });

  it('every format in EXPORT_FORMATS has a builder + ext', () => {
    for (const f of EXPORT_FORMATS) {
      expect(typeof f.builder).toBe('function');
      expect(typeof f.ext).toBe('string');
      expect(f.builder(deckFixture()).length).toBeGreaterThan(0);
    }
  });
});
