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

/**
 * Per-archetype build targets for the random-deck roller. The base
 * profile is the Command Zone "New Era" template (Ep. 658) crossed with
 * Kristen Gregory's Four Pillars: ~10 draw, 10 spot removal, 3 wipes,
 * plus protection + recursion floors (aim 3-5 — we target the low end so
 * the synergy slots aren't starved) and a couple of guaranteed closers.
 * `landDelta` / `rampDelta` nudge the curve-derived land/ramp targets.
 *
 * Per-archetype overrides follow the community-consensus deviations
 * (control wants more answers; voltron fewer lands + more protection;
 * aristocrats more wipes; combo/reanimator more recursion + closers).
 * Lands + ramp still come from the curve — these only reshape the
 * role split so a rolled deck scores well on its own health check.
 */
const BASE_PROFILE = {
  draw: 10, removal: 10, wipe: 3, protection: 3, recursion: 3, wincon: 2,
  landDelta: 0, rampDelta: 0,
};

const PROFILE_OVERRIDES = {
  tokens:      { wipe: 4 },
  voltron:     { draw: 6, removal: 6, wipe: 1, protection: 6, recursion: 2, landDelta: -2 },
  aristocrats: { removal: 9, wipe: 5, recursion: 4 },
  reanimator:  { recursion: 5, wincon: 3 },
  spellslinger:{ draw: 13, removal: 12, wipe: 2 },
  combo:       { draw: 12, removal: 8, wipe: 2, protection: 5, wincon: 3 },
  stax:        { removal: 8, wipe: 2, protection: 4, landDelta: -2 },
  lifegain:    { recursion: 4 },
  'group-hug': { protection: 5 },
};

export function archetypeBuildProfile(id) {
  return { ...BASE_PROFILE, ...(PROFILE_OVERRIDES[id] || {}) };
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
