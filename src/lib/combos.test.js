import { describe, it, expect } from 'vitest';
import { detectCombos, comboLabel, COMBO_INDEX, loadComboIndex } from './combos.js';

const card = (name) => ({
  count: 1,
  name,
  scryfall: { name, type_line: 'Creature', oracle_text: '', cmc: 2 },
});

const deck = (names, commander) => ({
  cards: names.map(card),
  commander: commander ? { name: commander } : null,
});

describe('detectCombos', () => {
  it("flags Thassa's Oracle + Demonic Consultation as assembled", () => {
    const { assembled, nearMiss } = detectCombos(
      deck(["Thassa's Oracle", 'Demonic Consultation', 'Sol Ring'])
    );
    expect(assembled.length).toBe(1);
    expect(assembled[0].id).toBe('thoracle-consultation');
    expect(assembled[0].results).toContain('Win the game');
    // Same cards → no near-miss for the same combo.
    expect(nearMiss.find((n) => n.combo.id === 'thoracle-consultation')).toBeUndefined();
  });

  it('reports a 3-card combo missing one card as a near-miss', () => {
    const { assembled, nearMiss } = detectCombos(
      deck(['Melira, Sylvok Outcast', 'Murderous Redcap', 'Sol Ring'])
    );
    expect(assembled.find((c) => c.id === 'persist-redcap')).toBeUndefined();
    const miss = nearMiss.find((n) => n.combo.id === 'persist-redcap');
    expect(miss).toBeTruthy();
    expect(miss.missing).toEqual(['Viscera Seer']);
  });

  it('assembles the same 3-card combo when all pieces are present', () => {
    const { assembled, nearMiss } = detectCombos(
      deck(['Melira, Sylvok Outcast', 'Murderous Redcap', 'Viscera Seer'])
    );
    expect(assembled.find((c) => c.id === 'persist-redcap')).toBeTruthy();
    expect(nearMiss.find((n) => n.combo.id === 'persist-redcap')).toBeUndefined();
  });

  it('counts the commander toward combo cards', () => {
    const d = {
      cards: [card('Walking Ballista')],
      commander: { name: 'Heliod, Sun-Crowned' },
    };
    const { assembled } = detectCombos(d);
    expect(assembled.find((c) => c.id === 'heliod-ballista')).toBeTruthy();
  });

  it('does not flag combos when 2+ pieces are missing', () => {
    const { assembled, nearMiss } = detectCombos(
      deck(['Sol Ring', 'Cultivate'])
    );
    expect(assembled.length).toBe(0);
    expect(nearMiss.length).toBe(0);
  });

  it('matches case-insensitively', () => {
    const { assembled } = detectCombos(
      deck(["thassa's oracle", 'DEMONIC CONSULTATION'])
    );
    expect(assembled.find((c) => c.id === 'thoracle-consultation')).toBeTruthy();
  });

  it('tolerates cards without scryfall payloads', () => {
    const d = {
      cards: [
        { name: "Thassa's Oracle", count: 1 },
        { name: 'Demonic Consultation', count: 1 },
      ],
    };
    const { assembled } = detectCombos(d);
    expect(assembled.find((c) => c.id === 'thoracle-consultation')).toBeTruthy();
  });

  it('every entry in the bundled index has the required schema fields', () => {
    expect(COMBO_INDEX.length).toBeGreaterThan(0);
    const ids = new Set();
    for (const c of COMBO_INDEX) {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(Array.isArray(c.cards)).toBe(true);
      expect(c.cards.length).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(c.results)).toBe(true);
      expect(c.results.length).toBeGreaterThan(0);
    }
  });
});

describe('comboLabel', () => {
  it('joins card names with " + "', () => {
    const c = COMBO_INDEX.find((c) => c.id === 'thoracle-consultation');
    expect(comboLabel(c)).toBe("Thassa's Oracle + Demonic Consultation");
  });
});

describe('loadComboIndex', () => {
  it('returns the bundled index', async () => {
    const idx = await loadComboIndex();
    expect(idx).toBe(COMBO_INDEX);
  });
});
