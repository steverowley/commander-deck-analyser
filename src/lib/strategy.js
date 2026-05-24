/**
 * Strategy engine — looks at a deck's tag profile and produces:
 *   - archetype classification (Aggro, Combo, Control, etc.)
 *   - stage-by-stage action plan with specific card references
 *   - win conditions
 *   - gaps to address
 *
 * Output is pure data; rendering happens in the StagesTab component.
 */

import { lc } from './utils.js';

// Tag-count thresholds chosen to fit 99-card EDH decks.
const ARCHETYPES = [
  {
    id: 'tokens',
    name: 'Token Swarm',
    description: 'Flood the board with creature tokens, pump them, swing wide.',
    score: (t) =>
      (t['Token producer'] || 0) * 2 +
      (t['Token doubler'] || 0) * 3 +
      (t['Anthem'] || 0) * 1.5,
  },
  {
    id: 'tribal',
    name: 'Tribal',
    description: 'A single creature type drives the strategy — anthems, lords, and synergy payoffs.',
    score: (t, deck) => {
      const tribalTags = Object.keys(t).filter((k) => k.startsWith('Tribal:'));
      if (tribalTags.length === 0) return 0;
      const dominant = tribalTags.map((k) => t[k]).sort((a, b) => b - a)[0] || 0;
      return dominant * 1.5;
    },
  },
  {
    id: 'voltron',
    name: 'Voltron',
    description: 'Suit up the commander with equipment and auras, win via commander damage.',
    score: (t, deck) =>
      (t['Equipment'] || 0) * 1.5 +
      (t['Aura'] || 0) * 1.2 +
      (t['Protection'] || 0) * 1.5 -
      (t['Creature'] || 0) * 0.3,
  },
  {
    id: 'combo',
    name: 'Combo',
    description: 'Assemble a winning interaction; tutors and protection set it up.',
    score: (t) =>
      (t['Combo piece'] || 0) * 3 +
      (t['Tutor'] || 0) * 2 +
      (t['Card draw'] || 0) * 0.5,
  },
  {
    id: 'control',
    name: 'Control',
    description: 'Stabilise with removal and counters, then close with a big finisher.',
    score: (t) =>
      (t['Board wipe'] || 0) * 2 +
      (t['Targeted removal'] || 0) * 1.2 +
      (t['Card draw'] || 0) * 1.2,
  },
  {
    id: 'reanimator',
    name: 'Reanimator',
    description: 'Cheat big threats into play from the graveyard.',
    score: (t) =>
      (t['Reanimation'] || 0) * 2.5 +
      (t['Recursion'] || 0) * 1.5 +
      (t['Discard'] || 0) * 0.7,
  },
  {
    id: 'aristocrats',
    name: 'Aristocrats',
    description: 'Sacrifice creatures for value; drain opponents bit by bit.',
    score: (t) =>
      (t['Sacrifice outlet'] || 0) * 2.5 +
      (t['Death trigger'] || 0) * 1.5 +
      (t['Token producer'] || 0) * 0.8,
  },
  {
    id: 'aggro',
    name: 'Aggro',
    description: 'Lean curve, fast pressure, close before opponents stabilise.',
    score: (t, deck) => {
      const lowCmc = deck.cards.filter(
        (c) => c.scryfall && !c.scryfall.type_line?.includes('Land') && (c.scryfall.cmc || 0) <= 3
      ).length;
      return lowCmc * 0.4 +
        (t['Haste enabler'] || 0) * 1.5 +
        (t['Combat trigger'] || 0) * 1.2 +
        (t['Anthem'] || 0) * 1.2;
    },
  },
  {
    id: 'spellslinger',
    name: 'Spellslinger',
    description: 'Cast instants and sorceries; trigger payoffs on every cast.',
    score: (t, deck) => {
      const instSorc = deck.cards.filter(
        (c) =>
          c.scryfall &&
          (c.scryfall.type_line?.includes('Instant') || c.scryfall.type_line?.includes('Sorcery'))
      ).length;
      return instSorc * 0.5 + (t['Burn'] || 0) * 1.2;
    },
  },
  {
    id: 'midrange',
    name: 'Midrange',
    description: 'Efficient value creatures and answers — beat opponents through resource attrition.',
    score: (t, deck) => {
      const midCmc = deck.cards.filter(
        (c) => c.scryfall && !c.scryfall.type_line?.includes('Land') && (c.scryfall.cmc || 0) >= 3 && (c.scryfall.cmc || 0) <= 5
      ).length;
      return midCmc * 0.3 + (t['Card draw'] || 0) * 0.8 + (t['Targeted removal'] || 0) * 0.6;
    },
  },
  {
    id: 'stax',
    name: 'Stax',
    description: 'Resource denial — taxes, lockdowns, and asymmetric prison pieces grind opponents to a halt.',
    score: (t) =>
      (t['Stax piece'] || 0) * 2.5 +
      (t['Mass Land Destruction'] || 0) * 1.5 +
      (t['Protection'] || 0) * 0.5,
  },
  {
    id: 'group-hug',
    name: 'Group Hug',
    description: 'Give everyone resources, then leverage the chaos — political and durdly.',
    score: (t) =>
      (t['Group hug'] || 0) * 3 +
      (t['Card draw'] || 0) * 0.3,
  },
  {
    id: 'theft',
    name: 'Theft',
    description: 'Borrow opponents\' creatures, copy their spells, win with their own threats.',
    score: (t) =>
      (t['Theft'] || 0) * 2.5 +
      (t['Sacrifice outlet'] || 0) * 0.8,
  },
  {
    id: 'self-mill',
    name: 'Self-Mill',
    description: 'Fill your own graveyard, then leverage it via reanimation, dredge, or escape.',
    score: (t) =>
      (t['Self-mill'] || 0) * 2.5 +
      (t['Reanimation'] || 0) * 1.2 +
      (t['Recursion'] || 0) * 0.8,
  },
];

function tagCounts(deck) {
  const counts = {};
  for (const c of deck.cards) {
    if (!c.scryfall) continue;
    for (const t of c.tags || []) counts[t] = (counts[t] || 0) + c.count;
  }
  // Add a "Creature" count for archetype scoring.
  counts['Creature'] = deck.cards
    .filter((c) => c.scryfall?.type_line?.includes('Creature'))
    .reduce((s, c) => s + c.count, 0);
  return counts;
}

/**
 * Score every archetype and return the top one plus the two runners-up.
 */
export function classifyArchetype(deck) {
  const counts = tagCounts(deck);
  const scored = ARCHETYPES.map((a) => ({
    ...a,
    score: a.score(counts, deck),
  }))
    .sort((a, b) => b.score - a.score)
    .filter((a) => a.score > 0);
  return {
    primary: scored[0] || null,
    secondary: scored.slice(1, 3),
    counts,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Stage plans
// ───────────────────────────────────────────────────────────────────────────────

function topN(deck, predicate, n = 4) {
  return deck.cards
    .filter((c) => c.scryfall && predicate(c))
    .sort((a, b) => (a.scryfall.cmc || 0) - (b.scryfall.cmc || 0))
    .slice(0, n)
    .map((c) => c.name);
}

function hasTag(c, ...tags) {
  return tags.some((t) => (c.tags || []).includes(t));
}

function bullet(text, cards = []) {
  return { text, cards };
}

/**
 * Generate a turn-by-turn action plan for a deck.
 * Returns three stages, each with a headline and a list of bullets.
 * Bullets cite specific cards from the deck so the guidance is concrete.
 */
export function buildStagePlans(deck) {
  const { primary, counts } = classifyArchetype(deck);
  const archetypeId = primary?.id;

  const rampCards = topN(deck, (c) => hasTag(c, 'Ramp', 'Mana rock'), 5);
  const drawCards = topN(deck, (c) => hasTag(c, 'Card draw'), 4);
  const wipeCards = topN(deck, (c) => hasTag(c, 'Board wipe'), 3);
  const removalCards = topN(deck, (c) => hasTag(c, 'Targeted removal'), 4);
  const finisherCards = topN(
    deck,
    (c) => (c.scryfall.cmc || 0) >= 6 || hasTag(c, 'Extra Turn', 'Mass damage'),
    4
  );
  const tokenCards = topN(deck, (c) => hasTag(c, 'Token producer', 'Token doubler'), 4);
  const anthemCards = topN(deck, (c) => hasTag(c, 'Anthem', '+1/+1 counters'), 4);
  const tutors = topN(deck, (c) => hasTag(c, 'Tutor'), 3);
  const combos = topN(deck, (c) => hasTag(c, 'Combo piece'), 4);
  const sacOutlets = topN(deck, (c) => hasTag(c, 'Sacrifice outlet'), 3);
  const reanimation = topN(deck, (c) => hasTag(c, 'Reanimation', 'Recursion'), 4);
  const equipment = topN(deck, (c) => hasTag(c, 'Equipment'), 4);
  const protection = topN(deck, (c) => hasTag(c, 'Protection'), 4);

  const cmdr = deck.commander?.name;
  const cmdrCost = deck.commander?.cmc || 0;
  const cmdrCastTurn = Math.max(2, cmdrCost - 1);

  // Stage 1: Early game (T1-3)
  const early = {
    headline: archetypeHeadline(archetypeId, 'early'),
    bullets: [],
  };
  if (rampCards.length > 0) {
    early.bullets.push(
      bullet(`Mulligan aggressively for ramp — you have ${counts['Ramp'] || 0} ramp pieces and want one in your opener.`, rampCards.slice(0, 3))
    );
  } else {
    early.bullets.push(bullet('Light on ramp (0 pieces detected) — keep hands with cheap plays and double-land openers.'));
  }
  if (archetypeId === 'aggro' || archetypeId === 'tribal' || archetypeId === 'tokens') {
    const cheap = topN(deck, (c) => !c.scryfall.type_line?.includes('Land') && (c.scryfall.cmc || 0) <= 2 && c.scryfall.type_line?.includes('Creature'), 4);
    if (cheap.length > 0) {
      early.bullets.push(bullet('Drop a creature every turn from T1. Tempo matters more than card advantage at this stage.', cheap));
    }
  }
  if (archetypeId === 'reanimator') {
    if (reanimation.length > 0) {
      early.bullets.push(bullet('Discard or mill a fat target into the yard. Set up the cheat for turn 3-4.', reanimation));
    }
  }
  if (archetypeId === 'combo' && tutors.length > 0) {
    early.bullets.push(bullet('Use early tutors to set up the combo or grab a protection piece.', tutors));
  }
  if (cmdr && cmdrCost <= 3) {
    early.bullets.push(bullet(`Cast ${cmdr} on curve (turn ${cmdrCost}). Cheap commanders snowball if left unanswered.`));
  }
  if (early.bullets.length === 0) {
    early.bullets.push(bullet('Develop mana, hold up disruption, and look for an opening.'));
  }

  // Stage 2: Mid game (T4-7)
  const mid = {
    headline: archetypeHeadline(archetypeId, 'mid'),
    bullets: [],
  };
  if (cmdr && cmdrCost >= 4 && cmdrCost <= 6) {
    mid.bullets.push(
      bullet(`Land ${cmdr} on turn ${cmdrCastTurn}-${cmdrCost}. Protect it — losing it twice means a ${cmdrCost + 2} CMC cast next time.`, protection.slice(0, 2))
    );
  }
  if (archetypeId === 'tokens' || archetypeId === 'tribal') {
    if (tokenCards.length > 0) {
      mid.bullets.push(bullet('Start chaining token producers. Each one should be a 2-for-1 minimum.', tokenCards));
    }
    if (anthemCards.length > 0) {
      mid.bullets.push(bullet('Layer an anthem only when you can swing with it the same turn — otherwise it draws a wrath.', anthemCards));
    }
  }
  if (archetypeId === 'control' && (wipeCards.length > 0 || removalCards.length > 0)) {
    mid.bullets.push(bullet('Hold a board wipe for when threats stack up. Use point removal to pick off the most dangerous player\'s commander.', [...wipeCards, ...removalCards.slice(0, 2)]));
  }
  if (archetypeId === 'midrange' || archetypeId === 'spellslinger') {
    if (drawCards.length > 0) {
      mid.bullets.push(bullet('Refuel — cast your card draw engines to stay ahead on resources.', drawCards));
    }
  }
  if (archetypeId === 'combo') {
    mid.bullets.push(bullet(`Look for the combo line. With ${counts['Combo piece'] || 0} combo pieces and ${counts['Tutor'] || 0} tutors, you should have an assembly path by turn 5-6.`, combos));
  }
  if (archetypeId === 'aristocrats' && sacOutlets.length > 0) {
    mid.bullets.push(bullet('Get a sac outlet on the board. Without one, the engine stalls.', sacOutlets));
  }
  if (archetypeId === 'reanimator') {
    mid.bullets.push(bullet('Reanimate your first big threat. Be ready to recur it.', reanimation));
  }
  if (mid.bullets.length === 0) {
    mid.bullets.push(bullet('Commit one large threat per turn while holding interaction. Avoid overextending into a known wrath.'));
  }

  // Stage 3: Late game (T8+)
  const late = {
    headline: archetypeHeadline(archetypeId, 'late'),
    bullets: [],
  };
  switch (archetypeId) {
    case 'aggro':
    case 'tribal':
    case 'tokens':
      late.bullets.push(bullet('Pivot to one overwhelming alpha strike — pump, double-strike, or anthem-into-swing.', anthemCards));
      if (finisherCards.length > 0) {
        late.bullets.push(bullet('Hold a finisher in reserve. If the board stabilises, this is your "go again" button.', finisherCards));
      }
      break;
    case 'combo':
      late.bullets.push(bullet('You should already be winning. If not: tutor for the missing piece, protect the play, then execute.', tutors));
      break;
    case 'control':
      late.bullets.push(bullet('You\'ve survived. Close the game with a haymaker or grind opponents out with recursion.', finisherCards));
      break;
    case 'reanimator':
      late.bullets.push(bullet('Recur your best threat repeatedly. Each reanimation should change the board state.', [...reanimation, ...finisherCards.slice(0, 2)]));
      break;
    case 'voltron':
      late.bullets.push(bullet('Suit up and protect. 21 commander damage = lethal — line up a haste or unblockable enabler.', [...equipment, ...protection]));
      break;
    case 'aristocrats':
      late.bullets.push(bullet('Loop sacrifices for incremental damage. The win condition is "the death of a thousand cuts."', sacOutlets));
      break;
    case 'spellslinger':
      late.bullets.push(bullet('Chain spells for the trigger pile-on. One big turn often closes the game.', finisherCards));
      break;
    case 'stax':
      late.bullets.push(bullet('Lock established. Threats are mostly dead under your prison — close with a low-cost win condition.', finisherCards));
      break;
    case 'group-hug':
      late.bullets.push(bullet('Your "boring" win condition: opponents kill each other, you fall behind, then steal the last damage. Have a finisher ready.', finisherCards));
      break;
    case 'theft':
      late.bullets.push(bullet('Use opponents\' creatures as your wincon — Insurrection-style alpha-strike or sacrifice loops.', finisherCards));
      break;
    case 'self-mill':
      late.bullets.push(bullet('Loop your graveyard. Reanimation chains and escape costs let one threat win in two turns.', [...reanimation, ...finisherCards.slice(0, 2)]));
      break;
    case 'midrange':
    default:
      late.bullets.push(bullet('Deploy your most expensive threats. Whoever resolves the last bomb usually wins.', finisherCards));
  }
  if (counts['Extra Turn'] > 0) {
    const turns = topN(deck, (c) => hasTag(c, 'Extra Turn'), 3);
    late.bullets.push(bullet('Extra-turn spells exist — use them to set up lethal in a single window.', turns));
  }
  if (late.bullets.length === 0) {
    late.bullets.push(bullet('Push damage. The longer the game, the more variance.'));
  }

  return { archetype: primary, secondary: classifyArchetype(deck).secondary, early, mid, late };
}

function archetypeHeadline(id, stage) {
  const map = {
    aggro: {
      early: 'Curve out — every turn matters',
      mid: 'Sustain pressure, force responses',
      late: 'Close with one decisive swing',
    },
    tribal: {
      early: 'Establish tribal density',
      mid: 'Stack anthems and synergy',
      late: 'Alpha strike with the lord package',
    },
    tokens: {
      early: 'Set up the engine',
      mid: 'Chain token producers',
      late: 'Wide swing or anthem-into-lethal',
    },
    combo: {
      early: 'Dig and protect',
      mid: 'Find the line',
      late: 'Execute the win',
    },
    control: {
      early: 'Hold up disruption',
      mid: 'Stabilise the board',
      late: 'Drop the finisher',
    },
    midrange: {
      early: 'Develop mana and value',
      mid: 'Trade resources favorably',
      late: 'Deploy bombs',
    },
    reanimator: {
      early: 'Fill the yard',
      mid: 'Cheat a threat',
      late: 'Recur for value',
    },
    voltron: {
      early: 'Set up the commander',
      mid: 'Suit up and protect',
      late: '21 damage = lethal',
    },
    aristocrats: {
      early: 'Build the sac chain',
      mid: 'Drain with death triggers',
      late: 'Loop for the win',
    },
    spellslinger: {
      early: 'Develop and dig',
      mid: 'Trigger the payoffs',
      late: 'Chain to lethal',
    },
    stax: {
      early: 'Drop mana, hold a lock piece',
      mid: 'Land the prison, deny answers',
      late: 'Close behind the lock',
    },
    'group-hug': {
      early: 'Feed the table, smile a lot',
      mid: 'Steer the kingmaker spot',
      late: 'Cash the chaos for a win',
    },
    theft: {
      early: 'Develop, hold removal',
      mid: 'Borrow the biggest threat on the board',
      late: 'Win with their own toys',
    },
    'self-mill': {
      early: 'Fill the yard',
      mid: 'Reanimate the engine',
      late: 'Recur to infinity',
    },
  };
  return map[id]?.[stage] || 'Play to your outs';
}

// ───────────────────────────────────────────────────────────────────────────────
// Synergy hubs — cards that appear in multiple packages
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Score every card by how many tags it covers. Cards with high overlap are
 * "synergy hubs" — load-bearing pieces that touch multiple game plans.
 *
 * Ignores type/role-only tags (Creature, Legendary, etc.) so that being a
 * Legendary Creature doesn't inflate a card's hub score.
 */
const HUB_IGNORED_TAGS = new Set([
  'Creature', 'Artifact', 'Enchantment', 'Instant', 'Sorcery',
  'Planeswalker', 'Land', 'Battle', 'Saga', 'Legendary',
  'Equipment', 'Aura', 'Vehicle',
]);

export function synergyHubs(deck, minPackages = 3) {
  return deck.cards
    .filter((c) => c.scryfall)
    .map((c) => ({
      card: c,
      packages: (c.tags || []).filter(
        (t) => !HUB_IGNORED_TAGS.has(t) && !t.startsWith('Tribal:')
      ),
    }))
    .filter((x) => x.packages.length >= minPackages)
    .sort((a, b) => b.packages.length - a.packages.length);
}

// ───────────────────────────────────────────────────────────────────────────────
// Package weighting — sort packages by strategic importance, not just size
// ───────────────────────────────────────────────────────────────────────────────

const PACKAGE_PRIORITY = {
  'Ramp': 100, 'Card draw': 95, 'Mana rock': 92,
  'Tutor': 88, 'Combo piece': 85,
  'Board wipe': 82, 'Targeted removal': 80,
  'Token producer': 78, 'Token doubler': 76,
  '+1/+1 counters': 74, 'Anthem': 72,
  'Reanimation': 70, 'Recursion': 68,
  'Sacrifice outlet': 66, 'Death trigger': 64,
  'ETB trigger': 60, 'Lifegain': 55,
  'Protection': 50, 'Haste enabler': 48,
  'Extra Turn': 90, 'Extra combat': 75,
  'Mass damage': 65, 'Burn': 45,
  'Game Changer': 95, 'Mass Land Destruction': 30,
  'Discard': 50, 'Mill': 40,
  'Combat trigger': 55,
};

export function packageWeight(tag) {
  if (tag.startsWith('Tribal:')) return 85;
  if (PACKAGE_PRIORITY[tag] !== undefined) return PACKAGE_PRIORITY[tag];
  if (HUB_IGNORED_TAGS.has(tag)) return 5; // type tags last
  return 35; // unknown or custom tags mid-pack
}
