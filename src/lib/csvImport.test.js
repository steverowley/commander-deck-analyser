import { describe, it, expect } from 'vitest';
import { detectMoxfieldCsv, parseMoxfieldCsv } from './csvImport.js';

const MOX_HEADER = '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"';

describe('detectMoxfieldCsv', () => {
  it('matches the canonical Moxfield header', () => {
    expect(detectMoxfieldCsv(MOX_HEADER + '\n"1","1","Sol Ring",...')).toBe(true);
  });
  it('matches an unquoted variant', () => {
    expect(detectMoxfieldCsv('Count,Tradelist Count,Name,Edition\n...')).toBe(true);
  });
  it('rejects a plain decklist', () => {
    expect(detectMoxfieldCsv('1 Sol Ring\n4x Lightning Bolt')).toBe(false);
  });
  it('rejects empty input', () => {
    expect(detectMoxfieldCsv('')).toBe(false);
  });
});

describe('parseMoxfieldCsv', () => {
  it('parses count + name + foil per row', () => {
    const text = [
      MOX_HEADER,
      '"1","1","Abaddon the Despoiler","40k","Near Mint","English","foil","","2026-03-31","171","False","False",""',
      '"2","2","Sol Ring","cmm","Near Mint","English","","","2026-04-01","456","False","False",""',
      '"1","1","Lightning Bolt","sld","Near Mint","English","etched","","2026-04-02","12","False","False",""',
    ].join('\n');
    const rows = parseMoxfieldCsv(text);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ name: 'Abaddon the Despoiler', count: 1, foil: 'rainbow', set: '40k' });
    expect(rows[1]).toMatchObject({ name: 'Sol Ring', count: 2, foil: null });
    expect(rows[2]).toMatchObject({ name: 'Lightning Bolt', count: 1, foil: 'etched' });
  });

  it('skips rows with zero/missing count or name', () => {
    const text = [
      MOX_HEADER,
      '"0","0","Bad Row","x","NM","English","","","2026-01-01","1","False","False",""',
      '"","","","x","NM","English","","","2026-01-01","2","False","False",""',
      '"3","3","Good Card","x","NM","English","","","2026-01-01","3","False","False",""',
    ].join('\n');
    const rows = parseMoxfieldCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Good Card');
  });

  it('handles commas inside quoted card names', () => {
    const text = [
      MOX_HEADER,
      `"1","1","Edgar, Markov","x","NM","English","","","2026-01-01","1","False","False",""`,
    ].join('\n');
    const rows = parseMoxfieldCsv(text);
    expect(rows[0].name).toBe('Edgar, Markov');
  });

  it('handles escaped doubled-quotes inside a name', () => {
    const text = [
      MOX_HEADER,
      `"1","1","Yawgmoth, Thran ""Physician""","x","NM","English","","","2026-01-01","1","False","False",""`,
    ].join('\n');
    const rows = parseMoxfieldCsv(text);
    expect(rows[0].name).toBe('Yawgmoth, Thran "Physician"');
  });
});
