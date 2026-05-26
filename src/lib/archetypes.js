/**
 * Archetype → tag preferences. Used by the random-deck auto-seed to
 * promote cards whose tags line up with the requested play style.
 *
 * Each entry maps a user-facing label to a set of tag matchers:
 *   - exact: literal tags from TAG_PATTERNS (or TYPE_TAGS) that count
 *     as a match
 *   - prefix: tag prefixes (used for `Tribal: ...` so any creature
 *     type counts as a tribal match)
 *
 * Keep this list focused on the most common pod-play archetypes —
 * the picker doesn't need to surface every micro-style.
 */

export const ARCHETYPES = [
  {
    id: 'any',
    label: 'Any',
    exact: [],
    prefix: [],
  },
  {
    id: 'tokens',
    label: 'Tokens',
    exact: ['Token producer', 'Token doubler', 'Anthem'],
    prefix: [],
  },
  {
    id: 'tribal',
    label: 'Tribal',
    exact: ['Anthem', 'Haste enabler'],
    prefix: ['Tribal: '],
  },
  {
    id: 'voltron',
    label: 'Voltron',
    exact: ['Equipment', 'Aura', 'Protection', 'Anthem'],
    prefix: [],
  },
  {
    id: 'aristocrats',
    label: 'Aristocrats',
    exact: ['Sacrifice outlet', 'Death trigger', 'Recursion', 'Token producer'],
    prefix: [],
  },
  {
    id: 'reanimator',
    label: 'Reanimator',
    exact: ['Reanimation', 'Discard', 'Recursion', 'Mill'],
    prefix: [],
  },
  {
    id: 'spellslinger',
    label: 'Spellslinger',
    exact: ['Card draw', 'Burn', 'Counter doubler'],
    prefix: [],
  },
  {
    id: 'counters',
    label: '+1/+1 counters',
    exact: ['+1/+1 counters', 'Counter doubler'],
    prefix: [],
  },
  {
    id: 'combo',
    label: 'Combo',
    exact: ['Combo piece', 'Tutor', 'Mana rock'],
    prefix: [],
  },
  {
    id: 'stax',
    label: 'Stax',
    exact: ['Stax piece', 'Mass Land Destruction'],
    prefix: [],
  },
  {
    id: 'lifegain',
    label: 'Lifegain',
    exact: ['Lifegain', 'Recursion'],
    prefix: [],
  },
  {
    id: 'group-hug',
    label: 'Group hug',
    exact: ['Group hug', 'Card draw'],
    prefix: [],
  },
];

export function archetypeById(id) {
  return ARCHETYPES.find((a) => a.id === id) || ARCHETYPES[0];
}

export function tagsMatchArchetype(tags, archetype) {
  if (!archetype || archetype.id === 'any') return false;
  for (const t of tags) {
    if (archetype.exact.includes(t)) return true;
    for (const p of archetype.prefix) {
      if (t.startsWith(p)) return true;
    }
  }
  return false;
}
