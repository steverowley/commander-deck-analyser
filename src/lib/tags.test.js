import { describe, it, expect } from 'vitest';
import { detectTags } from './tags.js';

const c = (overrides) => ({
  name: 'Test Card',
  oracle_text: '',
  type_line: 'Creature',
  ...overrides,
});

describe('detectTags', () => {
  it('tags Ramp on land-search oracles', () => {
    const tags = detectTags(c({
      name: 'Cultivate',
      type_line: 'Sorcery',
      oracle_text: 'Search your library for up to two basic land cards...',
    }));
    expect(tags).toContain('Ramp');
  });

  it('tags Card draw on draw-text', () => {
    const tags = detectTags(c({
      name: 'Read the Bones',
      type_line: 'Sorcery',
      oracle_text: 'Scry 2, then draw two cards. You lose 2 life.',
    }));
    expect(tags).toContain('Card draw');
  });

  it('tags Token producer on create-token text', () => {
    const tags = detectTags(c({
      name: 'Bitterblossom',
      type_line: 'Tribal Enchantment — Faerie',
      oracle_text: 'At the beginning of your upkeep, create a 1/1 black Faerie Rogue creature token with flying.',
    }));
    expect(tags).toContain('Token producer');
  });

  it('tags Combo piece when partner is in the deck', () => {
    const card = c({ name: "Thassa's Oracle", type_line: 'Creature — Merfolk', oracle_text: 'wins' });
    const names = new Set(["demonic consultation"]);
    const tags = detectTags(card, names);
    expect(tags).toContain('Combo piece');
  });

  it('does NOT tag Combo piece when partner is absent', () => {
    const card = c({ name: "Thassa's Oracle", type_line: 'Creature — Merfolk', oracle_text: 'wins' });
    const tags = detectTags(card, new Set());
    expect(tags).not.toContain('Combo piece');
  });

  it('tags Sacrifice outlet on activated-cost-sacrifice text', () => {
    const tags = detectTags(c({
      name: 'Phyrexian Altar',
      type_line: 'Artifact',
      oracle_text: 'Sacrifice a creature: Add one mana of any color.',
    }));
    expect(tags).toContain('Sacrifice outlet');
  });

  it('tags Tribal on creature subtypes', () => {
    const tags = detectTags(c({
      name: 'Edgar Markov',
      type_line: 'Legendary Creature — Vampire Knight',
    }));
    expect(tags).toEqual(expect.arrayContaining(['Tribal: Vampire', 'Tribal: Knight']));
  });

  it('tags Lifegain on lifelink and "gain X life"', () => {
    expect(detectTags(c({ oracle_text: 'Lifelink' }))).toContain('Lifegain');
    expect(detectTags(c({ oracle_text: 'You gain 3 life.' }))).toContain('Lifegain');
  });

  it('does NOT tag basic lands as Ramp / Mana rock', () => {
    const tags = detectTags(c({
      name: 'Mountain',
      type_line: 'Basic Land — Mountain',
      oracle_text: '({T}: Add {R}.)',
    }));
    expect(tags).not.toContain('Ramp');
    expect(tags).not.toContain('Mana rock');
  });

  it('still tags spells that fetch basic lands as Ramp', () => {
    const tags = detectTags(c({
      name: 'Cultivate',
      type_line: 'Sorcery',
      oracle_text: 'Search your library for up to two basic land cards, reveal them...',
    }));
    expect(tags).toContain('Ramp');
  });

  it('still tags mana rocks (artifacts) as Ramp / Mana rock', () => {
    const tags = detectTags(c({
      name: 'Sol Ring',
      type_line: 'Artifact',
      oracle_text: '{T}: Add {C}{C}.',
    }));
    expect(tags).toContain('Ramp');
    expect(tags).toContain('Mana rock');
  });
});
