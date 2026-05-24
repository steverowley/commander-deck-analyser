/**
 * Goldfish / mulligan simulator.
 *
 * Two flavours of simulation:
 *   - simulateOpeners(deck, n): sample N opening hands and report the
 *     distribution of lands / ramp / draw / removal plus a keepable %
 *   - simulatePlayout(deck, turns): play out a single game for N turns
 *     using simple rules (drop a land, cast biggest affordable spell)
 *     so the user can see what a representative game looks like
 *
 * Both are pure: shuffle uses Math.random, no side effects. Inputs are
 * the same deck shape the rest of the app uses; outputs are plain
 * objects suitable for direct render.
 */

const HAND_SIZE = 7;
const DEFAULT_SAMPLES = 1000;

function buildLibrary(deck) {
  const lib = [];
  for (const c of deck.cards) {
    if (!c.scryfall) continue;
    for (let i = 0; i < c.count; i++) lib.push(c);
  }
  return lib;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isLand(c) {
  return !!c.scryfall?.type_line?.includes('Land');
}

function hasTag(c, ...tags) {
  return (c.tags || []).some((t) => tags.includes(t));
}

/**
 * Sample N opening hands. Returns aggregate distribution + a few
 * concrete sample hands the UI can display.
 *
 * Keepable rule (London-mulligan-friendly): 2-5 lands AND either
 * 3+ lands OR a ramp/draw piece to dig for more.
 */
export function simulateOpeners(deck, samples = DEFAULT_SAMPLES) {
  const lib = buildLibrary(deck);
  if (lib.length < HAND_SIZE) return null;

  let totalLands = 0, totalRamp = 0, totalDraw = 0, totalRemoval = 0;
  let keepable = 0;
  const landDist = [0, 0, 0, 0, 0, 0, 0, 0]; // 0..7+
  const sampleHands = [];

  for (let i = 0; i < samples; i++) {
    const hand = shuffle(lib).slice(0, HAND_SIZE);
    const lands = hand.filter(isLand).length;
    const ramp = hand.filter((c) => !isLand(c) && hasTag(c, 'Ramp', 'Mana rock')).length;
    const draw = hand.filter((c) => hasTag(c, 'Card draw')).length;
    const removal = hand.filter((c) => hasTag(c, 'Targeted removal', 'Board wipe')).length;

    totalLands += lands;
    totalRamp += ramp;
    totalDraw += draw;
    totalRemoval += removal;
    landDist[Math.min(7, lands)]++;

    const keep = lands >= 2 && lands <= 5 && (lands >= 3 || ramp + draw >= 1);
    if (keep) keepable++;

    if (i < 6) sampleHands.push({ hand, lands, ramp, draw, removal, keep });
  }

  return {
    samples,
    avgLands: totalLands / samples,
    avgRamp: totalRamp / samples,
    avgDraw: totalDraw / samples,
    avgRemoval: totalRemoval / samples,
    landDistribution: landDist,
    keepableRate: keepable / samples,
    sampleHands,
  };
}

/**
 * Simulate the first `turns` turns of one game. Returns a per-turn log
 * the UI can display as a play sequence.
 *
 * Heuristics:
 *   - Draw a card each turn (turn 1 included, EDH convention)
 *   - Drop one land if available
 *   - Cast the biggest affordable spells first, repeating until OOM
 *   - Mana = #lands on battlefield + #mana rocks on battlefield
 *
 * Doesn't model summoning sickness, untap, blocking, sorcery vs instant
 * timing, etc. — it's a curve check, not an opponent.
 */
export function simulatePlayout(deck, turns = 6) {
  const lib = buildLibrary(deck);
  if (lib.length < HAND_SIZE + turns) return null;

  const shuffled = shuffle(lib);
  let hand = shuffled.slice(0, HAND_SIZE);
  let library = shuffled.slice(HAND_SIZE);
  const battlefield = [];
  const log = [];

  for (let t = 1; t <= turns; t++) {
    if (library.length) hand.push(library.shift());

    // Play one land
    const landIdx = hand.findIndex(isLand);
    let landPlayed = null;
    if (landIdx >= 0) {
      landPlayed = hand[landIdx];
      battlefield.push(landPlayed);
      hand.splice(landIdx, 1);
    }

    const lands = battlefield.filter(isLand).length;
    const rocks = battlefield.filter((c) => !isLand(c) && hasTag(c, 'Mana rock')).length;
    const manaTotal = lands + rocks;

    // Cast spells biggest-first, repeating while we have mana left
    const casts = [];
    let manaLeft = manaTotal;
    let progress = true;
    while (progress) {
      progress = false;
      // Find the most expensive castable spell in hand (cmc > 0, cmc <= manaLeft)
      let best = -1;
      let bestCmc = -1;
      for (let i = 0; i < hand.length; i++) {
        const c = hand[i];
        if (isLand(c)) continue;
        const cmc = c.scryfall.cmc || 0;
        if (cmc <= 0) continue;
        if (cmc <= manaLeft && cmc > bestCmc) {
          best = i;
          bestCmc = cmc;
        }
      }
      if (best >= 0) {
        const card = hand[best];
        casts.push(card);
        battlefield.push(card);
        manaLeft -= bestCmc;
        hand.splice(best, 1);
        progress = true;
      }
    }

    log.push({
      turn: t,
      lands,
      mana: manaTotal,
      landPlayed: landPlayed?.name || null,
      casts: casts.map((c) => ({ name: c.name, cmc: c.scryfall.cmc || 0 })),
      handSize: hand.length,
    });
  }
  return log;
}
