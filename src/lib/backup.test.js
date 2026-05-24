import { describe, it, expect } from 'vitest';
import { buildBackup, parseBackup, backupFilename, BACKUP_VERSION } from './backup.js';

const sampleDeck = (id = 'd1') => ({
  id,
  name: 'Test',
  commander: null,
  cards: [{ name: 'Sol Ring', count: 1, scryfall: { name: 'Sol Ring' } }],
  created: 1,
  updated: 2,
});

describe('buildBackup', () => {
  it('produces a versioned envelope', () => {
    const b = buildBackup([sampleDeck()], '0.3.0');
    expect(b.vault).toBe(BACKUP_VERSION);
    expect(b.appVersion).toBe('0.3.0');
    expect(b.decks).toHaveLength(1);
    expect(typeof b.exportedAt).toBe('number');
  });
});

describe('parseBackup', () => {
  it('round-trips a built backup', () => {
    const decks = [sampleDeck('a'), sampleDeck('b')];
    const json = JSON.stringify(buildBackup(decks));
    const out = parseBackup(json);
    expect(out.decks).toHaveLength(2);
    expect(out.invalidCount).toBe(0);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseBackup('not json')).toThrow(/Invalid JSON/);
  });

  it('throws on unknown vault version', () => {
    expect(() => parseBackup(JSON.stringify({ vault: 'v2', decks: [] })))
      .toThrow(/Unknown backup version/);
  });

  it('throws when decks is not an array', () => {
    expect(() => parseBackup(JSON.stringify({ vault: BACKUP_VERSION })))
      .toThrow(/missing a `decks` array/);
  });

  it('drops malformed deck entries but keeps the good ones', () => {
    const json = JSON.stringify({
      vault: BACKUP_VERSION,
      decks: [sampleDeck('good'), { name: 'no id, no cards' }, null],
    });
    const out = parseBackup(json);
    expect(out.decks).toHaveLength(1);
    expect(out.invalidCount).toBe(2);
  });
});

describe('backupFilename', () => {
  it('formats as vault-backup-YYYYMMDD.json', () => {
    const f = backupFilename(new Date('2026-05-24'));
    expect(f).toBe('vault-backup-20260524.json');
  });
});
