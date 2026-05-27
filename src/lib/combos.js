/**
 * Combo detection — matches a deck's 99 (plus commander) against a curated
 * index of well-known Commander combos and reports both fully-assembled
 * lines and near-miss combos (deck has all but one card).
 *
 * The index is bundled at build time because the Commander Spellbook backend
 * isn't CORS-friendly from a static SPA, and 30k variants would be too big
 * to ship anyway. The shape mirrors Spellbook so a future remote-refresh
 * path (proxied through Supabase) can drop straight into `loadComboIndex`.
 *
 * Combo schema:
 *   {
 *     id:            string,             // stable slug
 *     cards:         string[],           // required cards, display-cased
 *     results:       string[],           // what the combo produces (one per line)
 *     prerequisites: string (optional),  // setup notes
 *     colors:        string[] (optional) // WUBRG identity
 *   }
 *
 * Detection returns:
 *   {
 *     assembled: Combo[],
 *     nearMiss:  Array<{ combo: Combo, missing: string[] }>  // missing.length === 1
 *   }
 */

import { lc } from './utils.js';

export const COMBO_INDEX = [
  // ─── Win-on-cast (Thoracle / Consultation lines) ─────────────────────────
  {
    id: 'thoracle-consultation',
    cards: ["Thassa's Oracle", 'Demonic Consultation'],
    results: ['Win the game'],
    prerequisites: "Cast Demonic Consultation naming a card not in your library, then activate Thassa's Oracle with an empty library.",
    colors: ['U', 'B'],
  },
  {
    id: 'thoracle-pact',
    cards: ["Thassa's Oracle", 'Tainted Pact'],
    results: ['Win the game'],
    prerequisites: "Run only singletons in your deck so Tainted Pact mills the whole library, then Oracle's trigger wins.",
    colors: ['U', 'B'],
  },
  {
    id: 'labman-consultation',
    cards: ['Laboratory Maniac', 'Demonic Consultation'],
    results: ['Win the game'],
    prerequisites: 'Lab Man on the battlefield, then Consultation a card not in your library.',
    colors: ['U', 'B'],
  },
  {
    id: 'labman-pact',
    cards: ['Laboratory Maniac', 'Tainted Pact'],
    results: ['Win the game'],
    prerequisites: 'All-singleton library so Tainted Pact mills the deck while Lab Man is in play.',
    colors: ['U', 'B'],
  },
  {
    id: 'jace-consultation',
    cards: ['Jace, Wielder of Mysteries', 'Demonic Consultation'],
    results: ['Win the game'],
    prerequisites: 'Jace in play, then Consultation a card not in your deck.',
    colors: ['U', 'B'],
  },
  {
    id: 'jace-pact',
    cards: ['Jace, Wielder of Mysteries', 'Tainted Pact'],
    results: ['Win the game'],
    prerequisites: 'All-singleton library so Tainted Pact empties it with Jace in play.',
    colors: ['U', 'B'],
  },

  // ─── Infinite mana ──────────────────────────────────────────────────────
  {
    id: 'dockside-sabertooth',
    cards: ['Dockside Extortionist', 'Temur Sabertooth'],
    results: ['Infinite mana', 'Infinite ETB triggers'],
    prerequisites: 'Opponents must control enough artifacts/enchantments that Dockside mints more than two mana each ETB.',
    colors: ['R', 'G'],
  },
  {
    id: 'dockside-cloudstone',
    cards: ['Dockside Extortionist', 'Cloudstone Curio'],
    results: ['Infinite mana'],
    prerequisites: 'A second non-artifact creature in play and ≥4 artifacts/enchantments across opponents.',
    colors: ['R'],
  },
  {
    id: 'dockside-image',
    cards: ['Dockside Extortionist', 'Phantasmal Image'],
    results: ['Infinite mana'],
    prerequisites: 'A bounce outlet (e.g. Words of Wind) and ≥3 opposing artifacts/enchantments per cycle.',
    colors: ['U', 'R'],
  },
  {
    id: 'isochron-reversal',
    cards: ['Isochron Scepter', 'Dramatic Reversal'],
    results: ['Infinite mana with non-land mana producers'],
    prerequisites: 'Non-land permanents that tap for ≥3 mana so Dramatic Reversal nets mana per cast.',
    colors: ['U'],
  },
  {
    id: 'devoted-vizier',
    cards: ['Devoted Druid', 'Vizier of Remedies'],
    results: ['Infinite green mana'],
    prerequisites: 'Both creatures in play, no summoning sickness on the druid.',
    colors: ['G', 'W'],
  },
  {
    id: 'basalt-rings',
    cards: ['Basalt Monolith', 'Rings of Brighthearth'],
    results: ['Infinite colorless mana'],
    colors: ['C'],
  },
  {
    id: 'basalt-power-artifact',
    cards: ['Basalt Monolith', 'Power Artifact'],
    results: ['Infinite colorless mana'],
    colors: ['U'],
  },
  {
    id: 'grim-power-artifact',
    cards: ['Grim Monolith', 'Power Artifact'],
    results: ['Infinite colorless mana'],
    colors: ['U'],
  },
  {
    id: 'palinchron-high-tide',
    cards: ['Palinchron', 'High Tide'],
    results: ['Infinite blue mana'],
    prerequisites: 'High Tide active, then loop Palinchron untapping seven Islands per cast.',
    colors: ['U'],
  },
  {
    id: 'palinchron-image',
    cards: ['Palinchron', 'Phantasmal Image'],
    results: ['Infinite mana'],
    colors: ['U'],
  },
  {
    id: 'food-chain-scourge',
    cards: ['Food Chain', 'Eternal Scourge'],
    results: ['Infinite creature mana'],
    colors: ['G'],
  },
  {
    id: 'food-chain-griffin',
    cards: ['Food Chain', 'Misthollow Griffin'],
    results: ['Infinite creature mana'],
    colors: ['G', 'U'],
  },
  {
    id: 'food-chain-squee',
    cards: ['Food Chain', 'Squee, the Immortal'],
    results: ['Infinite creature mana'],
    colors: ['G', 'R'],
  },
  {
    id: 'birthing-pod-cobra',
    cards: ['Birthing Pod', 'Lotus Cobra'],
    results: ['Infinite mana with fetches'],
    prerequisites: 'Stack of fetch lands + Cobra in play; Pod chains creatures while fetches replay.',
    colors: ['G'],
  },

  // ─── Infinite hasty creatures ───────────────────────────────────────────
  {
    id: 'kiki-pestermite',
    cards: ['Pestermite', 'Kiki-Jiki, Mirror Breaker'],
    results: ['Infinite hasty 2/1 fliers'],
    colors: ['U', 'R'],
  },
  {
    id: 'kiki-exarch',
    cards: ['Deceiver Exarch', 'Kiki-Jiki, Mirror Breaker'],
    results: ['Infinite hasty 1/4 creatures'],
    colors: ['U', 'R'],
  },
  {
    id: 'kiki-conscripts',
    cards: ['Zealous Conscripts', 'Kiki-Jiki, Mirror Breaker'],
    results: ['Infinite hasty tokens + untap any permanent'],
    colors: ['R'],
  },
  {
    id: 'kiki-felidar',
    cards: ['Kiki-Jiki, Mirror Breaker', 'Felidar Guardian'],
    results: ['Infinite hasty 3/4 cats'],
    colors: ['R', 'W'],
  },
  {
    id: 'kiki-bellringer',
    cards: ['Kiki-Jiki, Mirror Breaker', 'Village Bell-Ringer'],
    results: ['Infinite hasty 1/4 humans + untap your team'],
    colors: ['R', 'W'],
  },
  {
    id: 'twin-conscripts',
    cards: ['Zealous Conscripts', 'Splinter Twin'],
    results: ['Infinite hasty tokens'],
    colors: ['U', 'R'],
  },
  {
    id: 'twin-pestermite',
    cards: ['Pestermite', 'Splinter Twin'],
    results: ['Infinite hasty tokens'],
    colors: ['U', 'R'],
  },
  {
    id: 'twin-exarch',
    cards: ['Deceiver Exarch', 'Splinter Twin'],
    results: ['Infinite hasty tokens'],
    colors: ['U', 'R'],
  },

  // ─── Reanimator / ETB loops ─────────────────────────────────────────────
  {
    id: 'worldgorger-animate',
    cards: ['Worldgorger Dragon', 'Animate Dead'],
    results: ['Infinite mana', 'Infinite ETB/LTB triggers'],
    prerequisites: 'Need a payoff such as a mana sink to convert the loop into a win.',
    colors: ['B'],
  },
  {
    id: 'worldgorger-necromancy',
    cards: ['Worldgorger Dragon', 'Necromancy'],
    results: ['Infinite mana', 'Infinite ETB/LTB triggers'],
    colors: ['B'],
  },
  {
    id: 'worldgorger-dance',
    cards: ['Worldgorger Dragon', 'Dance of the Dead'],
    results: ['Infinite mana', 'Infinite ETB/LTB triggers'],
    colors: ['B'],
  },
  {
    id: 'leonin-animate',
    cards: ['Leonin Relic-Warder', 'Animate Dead'],
    results: ['Infinite ETB/LTB triggers'],
    colors: ['W', 'B'],
  },
  {
    id: 'karmic-reveillark',
    cards: ['Karmic Guide', 'Reveillark'],
    results: ['Infinite recursion (with a free sac outlet)'],
    prerequisites: 'A free sacrifice outlet such as Carrion Feeder or Viscera Seer.',
    colors: ['W'],
  },
  {
    id: 'nim-altar',
    cards: ['Nim Deathmantle', "Ashnod's Altar"],
    results: ['Infinite ETB/LTB triggers (with a creature)'],
    prerequisites: 'A creature with mana value ≥2 to power the reanimation.',
    colors: ['C'],
  },

  // ─── Lifegain / drain ───────────────────────────────────────────────────
  {
    id: 'sanguine-exquisite',
    cards: ['Sanguine Bond', 'Exquisite Blood'],
    results: ['Infinite life loss to each opponent'],
    prerequisites: 'Any source of life gain or life loss to start the loop.',
    colors: ['B'],
  },
  {
    id: 'vito-exquisite',
    cards: ['Vito, Thorn of the Dusk Rose', 'Exquisite Blood'],
    results: ['Infinite life loss to each opponent'],
    colors: ['B'],
  },
  {
    id: 'heliod-ballista',
    cards: ['Heliod, Sun-Crowned', 'Walking Ballista'],
    results: ['Infinite damage to any target'],
    prerequisites: 'Walking Ballista with at least one counter, Heliod in play.',
    colors: ['W'],
  },
  {
    id: 'heliod-spike',
    cards: ['Heliod, Sun-Crowned', 'Spike Feeder'],
    results: ['Infinite life and +1/+1 counters'],
    colors: ['W', 'G'],
  },

  // ─── Damage / token wins ────────────────────────────────────────────────
  {
    id: 'mike-trike',
    cards: ['Mikaeus, the Unhallowed', 'Triskelion'],
    results: ['Infinite damage'],
    colors: ['B'],
  },
  {
    id: 'mike-ballista',
    cards: ['Mikaeus, the Unhallowed', 'Walking Ballista'],
    results: ['Infinite damage'],
    colors: ['B'],
  },
  {
    id: 'mike-putrid',
    cards: ['Mikaeus, the Unhallowed', 'Putrid Goblin'],
    results: ['Infinite sacrifice triggers (with a free sac outlet)'],
    prerequisites: 'A free sacrifice outlet to fuel the loop.',
    colors: ['B'],
  },
  {
    id: 'earthcraft-squirrel',
    cards: ['Earthcraft', 'Squirrel Nest'],
    results: ['Infinite 1/1 squirrels'],
    colors: ['G'],
  },
  {
    id: 'intruder-drake',
    cards: ['Intruder Alarm', 'Shrieking Drake'],
    results: ['Infinite ETB triggers (with another blue creature)'],
    colors: ['U'],
  },

  // ─── Storm / engine ─────────────────────────────────────────────────────
  {
    id: 'breach-led',
    cards: ['Underworld Breach', "Lion's Eye Diamond"],
    results: ['Storm engine — recurs LED for any colored mana'],
    colors: ['R', 'B'],
  },
  {
    id: 'breach-brainfreeze',
    cards: ['Underworld Breach', 'Brain Freeze'],
    results: ['Mill the whole table once a storm count is set up'],
    colors: ['U', 'R'],
  },
  {
    id: 'aetherflux-citadel',
    cards: ['Aetherflux Reservoir', "Bolas's Citadel"],
    results: ['50-life burst kill'],
    colors: ['B', 'W'],
  },

  // ─── Wheels / draw ──────────────────────────────────────────────────────
  {
    id: 'nivp-curiosity',
    cards: ['Niv-Mizzet, Parun', 'Curiosity'],
    results: ['Infinite draw and 1-damage pings'],
    colors: ['U', 'R'],
  },
  {
    id: 'nivp-ophidian',
    cards: ['Niv-Mizzet, Parun', 'Ophidian Eye'],
    results: ['Infinite draw and 1-damage pings'],
    colors: ['U', 'R'],
  },
  {
    id: 'nivf-curiosity',
    cards: ['Niv-Mizzet, the Firemind', 'Curiosity'],
    results: ['Infinite draw and 1-damage pings'],
    colors: ['U', 'R'],
  },

  // ─── Tribal / niche ─────────────────────────────────────────────────────
  {
    id: 'edgar-altar',
    cards: ['Edgar Markov', 'Phyrexian Altar'],
    results: ['Infinite mana from vampire tokens (with a graveyard recursion outlet)'],
    colors: ['W', 'B', 'R'],
  },
  {
    id: 'krenko-thornbite',
    cards: ['Krenko, Mob Boss', 'Thornbite Staff'],
    results: ['Infinite goblin tokens (with a sac outlet)'],
    prerequisites: 'A sacrifice outlet to untap Krenko via Thornbite Staff.',
    colors: ['R'],
  },
  {
    id: 'krark-sakashima',
    cards: ['Krark, the Thumbless', 'Sakashima of a Thousand Faces'],
    results: ['Coin-flip storm engine'],
    colors: ['U', 'R'],
  },

  // ─── 3-card combos (used by near-miss detection) ─────────────────────────
  {
    id: 'persist-redcap',
    cards: ['Melira, Sylvok Outcast', 'Murderous Redcap', 'Viscera Seer'],
    results: ['Infinite damage to any target'],
    prerequisites: 'Melira removes the -1/-1 counter, Viscera Seer sacrifices on demand, Redcap pings on each ETB.',
    colors: ['W', 'B', 'G'],
  },
  {
    id: 'thopter-sword-sieve',
    cards: ['Thopter Foundry', 'Sword of the Meek', 'Time Sieve'],
    results: ['Infinite turns'],
    prerequisites: 'Five artifacts each cycle to fuel Time Sieve while Thopter Foundry + Sword loop.',
    colors: ['W', 'U', 'B'],
  },
  {
    id: 'sanguine-vizkopa-exquisite',
    cards: ['Sanguine Bond', 'Vizkopa Guildmage', 'Exquisite Blood'],
    results: ['Infinite life loss to each opponent (redundancy package)'],
    prerequisites: 'Any incidental lifegain to trigger the chain.',
    colors: ['W', 'B'],
  },
];

// Pre-lowercased card lookup arrays so detectCombos doesn't lc() the same
// names on every call.
const INDEX_LC = COMBO_INDEX.map((c) => ({
  combo: c,
  cardsLc: c.cards.map((n) => lc(n)),
}));

/**
 * Collect lowercased card names from a deck object, including the commander.
 * Tolerates partial card objects (deck might have a stub before Scryfall
 * resolves) — uses `.name` then `.scryfall?.name`.
 */
function collectDeckNames(deck) {
  const set = new Set();
  if (!deck) return set;
  for (const c of deck.cards || []) {
    const n = c?.scryfall?.name || c?.name;
    if (n) set.add(lc(n));
  }
  const cmdr = deck.commander?.name || deck.commander?.scryfall?.name;
  if (cmdr) set.add(lc(cmdr));
  return set;
}

/**
 * Detect assembled combos + near-miss combos.
 *
 * - Assembled: every required card is in the deck (including commander).
 * - Near-miss: exactly one required card is missing.
 *
 * The matcher operates on the bundled index. A future revision can pass a
 * larger index (e.g. fetched from Spellbook + cached in IDB) into this
 * function — that's why `index` is parameterised.
 */
export function detectCombos(deck, index = INDEX_LC) {
  const have = collectDeckNames(deck);
  const assembled = [];
  const nearMiss = [];
  for (const entry of index) {
    const combo = entry.combo || entry; // tolerate plain combo objects
    const cardsLc = entry.cardsLc || combo.cards.map((n) => lc(n));
    const missingIdx = [];
    for (let i = 0; i < cardsLc.length; i++) {
      if (!have.has(cardsLc[i])) missingIdx.push(i);
    }
    if (missingIdx.length === 0) {
      assembled.push(combo);
    } else if (missingIdx.length === 1 && combo.cards.length >= 2) {
      nearMiss.push({ combo, missing: [combo.cards[missingIdx[0]]] });
    }
  }
  return { assembled, nearMiss };
}

/**
 * Pretty-print a combo as "a + b + c".
 */
export function comboLabel(combo) {
  return combo.cards.join(' + ');
}

/**
 * Return the bundled index. Async signature is intentional so a future
 * remote-refresh path (Spellbook → IDB cache → here) can replace the
 * implementation without changing callers.
 */
export async function loadComboIndex() {
  return COMBO_INDEX;
}
