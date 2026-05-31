import { describe, it, expect } from 'vitest';
import { ARCHETYPES, archetypeById, tagsMatchArchetype } from './archetypes.js';

describe('archetypeById', () => {
  it('returns the matching archetype by id', () => {
    expect(archetypeById('tokens').label).toBe('Tokens');
    expect(archetypeById('voltron').label).toBe('Voltron');
  });

  it('falls back to the first entry (Any) for an unknown id', () => {
    expect(archetypeById('does-not-exist').id).toBe('any');
  });

  it('falls back to Any for null / undefined', () => {
    expect(archetypeById(undefined).id).toBe('any');
    expect(archetypeById(null).id).toBe('any');
  });
});

describe('tagsMatchArchetype', () => {
  it('returns false for the Any archetype regardless of tags', () => {
    expect(tagsMatchArchetype(['Token producer', 'Anthem'], archetypeById('any'))).toBe(false);
  });

  it('returns false for a null archetype', () => {
    expect(tagsMatchArchetype(['Anything'], null)).toBe(false);
  });

  it('matches on an exact tag', () => {
    expect(tagsMatchArchetype(['Token producer'], archetypeById('tokens'))).toBe(true);
    expect(tagsMatchArchetype(['Sacrifice outlet'], archetypeById('aristocrats'))).toBe(true);
  });

  it('matches Tribal via the "Tribal: " prefix for any creature type', () => {
    expect(tagsMatchArchetype(['Tribal: Vampire'], archetypeById('tribal'))).toBe(true);
    expect(tagsMatchArchetype(['Tribal: Goblin'], archetypeById('tribal'))).toBe(true);
  });

  it('does not match an unrelated tag', () => {
    expect(tagsMatchArchetype(['Lifegain'], archetypeById('tokens'))).toBe(false);
  });

  it('returns false for an empty tag list', () => {
    expect(tagsMatchArchetype([], archetypeById('combo'))).toBe(false);
  });
});

describe('ARCHETYPES integrity', () => {
  it('every archetype has a unique id and the expected shape', () => {
    const ids = ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ARCHETYPES) {
      expect(typeof a.label).toBe('string');
      expect(Array.isArray(a.exact)).toBe(true);
      expect(Array.isArray(a.prefix)).toBe(true);
    }
  });

  it('leads with the Any archetype so it is the default fallback', () => {
    expect(ARCHETYPES[0].id).toBe('any');
  });
});
