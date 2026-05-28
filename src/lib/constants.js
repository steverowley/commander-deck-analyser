// MTG static data — curated lists used by the bracket assessor and tag engine.
//
// Game Changers list is sourced from WotC's official Commander bracket
// definitions (commander.wizards.com). The list updates roughly twice a year;
// keep this file in sync. Last refreshed against the Feb 9, 2026 update —
// 53 cards. Oct 21, 2025 dropped 10 cards (Deflecting Swat, Expropriate,
// Food Chain, Jin-Gitaxias, Kinnan, Sway of the Stars, Urza, Vorinclex,
// Winota, Yuriko); Feb 9, 2026 added Farewell and Biorhythm.

export const GAME_CHANGERS = new Set([
  // Tutors
  "vampiric tutor", "demonic tutor", "imperial seal", "mystical tutor",
  "enlightened tutor", "grim tutor", "intuition", "survival of the fittest",
  "tainted pact",
  // Fast mana / mana rocks pushed to GC tier
  "mana vault", "chrome mox", "mox diamond", "grim monolith",
  "lion's eye diamond", "jeweled lotus",
  // Lands
  "ancient tomb", "gaea's cradle", "serra's sanctum", "glacial chasm",
  "the tabernacle at pendrell vale", "mishra's workshop",
  // Hate / lock pieces
  "drannith magistrate", "notion thief", "opposition agent", "hullbreacher",
  "trouble in pairs", "orcish bowmasters", "trinisphere", "winter orb",
  "stasis", "blood moon", "back to basics", "humility",
  // Strong commanders / payoffs
  "tergrid, god of fright", "thassa's oracle",
  // Strong staples
  "cyclonic rift", "rhystic study", "mystic remora", "smothering tithe",
  "the one ring", "seedborn muse", "consecrated sphinx",
  "bolas's citadel", "underworld breach", "aetherflux reservoir",
  "coalition victory", "ad nauseam", "necropotence",
  "mana drain", "force of will", "fierce guardianship",
  "armageddon",
  // Feb 9, 2026 additions
  "farewell", "biorhythm",
]);

export const MLD_CARDS = new Set([
  "armageddon", "ravages of war", "catastrophe", "wildfire", "jokulhaups",
  "obliterate", "decree of annihilation", "worldslayer", "cataclysm",
]);

export const EXTRA_TURN_CARDS = new Set([
  "time warp", "temporal manipulation", "time stretch", "capture of jingzhou",
  "temporal mastery", "walk the aeons", "karn's temporal sundering",
  "nexus of fate", "beacon of tomorrows", "time stop", "final fortune",
  "last chance", "glimpse of tomorrow", "alrund's epiphany", "expropriate",
  "temporal trespass", "part the waterveil", "temporal extortion", "time walk"
]);

export const FAST_MANA = new Set([
  "mana crypt", "mana vault", "chrome mox", "mox diamond", "jeweled lotus", "grim monolith"
]);

/**
 * Commander banned list (Magic: The Gathering). Reflects WotC's most
 * recent banlist update — the Commander format banlist shifts a few
 * times a year; refresh this set when the official banlist changes.
 *
 * Source of truth: https://magic.wizards.com/en/banned-restricted-list
 */
export const BANNED_CARDS = new Set([
  // Power Nine + classic eternal-format bans
  "ancestral recall", "black lotus", "time walk", "time vault",
  "library of alexandria", "channel", "fastbond",
  // Commander-format perennials
  "karakas", "lutri, the spellchaser", "shahrazad",
  "sway of the stars", "panoptic mirror",
  "coalition victory", "limited resources", "primeval titan",
  "sundering titan", "upheaval", "worldfire",
  "yawgmoth's bargain", "tinker", "iona, shield of emeria",
  "leovold, emissary of trest", "emrakul, the aeons torn",
  "griselbrand", "erayo, soratami ascendant",
  "rofellos, llanowar emissary", "trade secrets", "paradox engine",
  // Sept 2024 update
  "mana crypt", "jeweled lotus", "dockside extortionist",
  "nadu, winged wisdom",
  // Hate / format-warping
  "hullbreacher", "golos, tireless pilgrim", "prophet of kruphix",
  // Ante / dexterity / sub-game (functionally banned)
  "amulet of quoz", "bronze tablet", "contract from below",
  "darkpact", "demonic attorney", "jeweled bird", "rebirth",
  "tempest efreet", "timmerian fiends", "chaos orb", "falling star",
]);

// Known infinite/win combos now live in src/lib/combos.js with full
// metadata (results, prerequisites, colors). The bracket assessor and the
// combo-piece tagger import from there directly.

// Regex patterns matched against oracle text to assign tags.
export const TAG_PATTERNS = {
  "Lifegain": [/gain (a|an|\d+|x) life/i, /gains? life/i, /lifelink/i],
  "+1/+1 counters": [/\+1\/\+1 counter/i],
  "Token producer": [/create.{1,40}token/i, /creates?.{1,40}token/i],
  "Token doubler": [/twice that many|double the number of (those |.{0,10})?(creature )?tokens/i],
  "Counter doubler": [/twice that many \+1\/\+1 counters|double the number of \+1\/\+1 counters/i],
  "Ramp": [
    /search your library for (an?|up to (one|two|three|four|five|six|\d+)) (basic )?(forest|island|swamp|mountain|plains|land)/i,
    /\{t\}: add (\{[wubrgc]\}|one mana|two mana)/i,
    /adds? (an additional )?\{[wubrgc]\}/i,
    /put (a|an|that|target) land card .{0,40}(onto the battlefield|into play)/i,
  ],
  "Card draw": [/draw (a|an|one|two|three|four|x|\d+) cards?/i, /draws? (a|an|one|two|three|x|\d+) cards?/i],
  "Tutor": [/search your library for an? .{1,40} card/i],
  "Targeted removal": [/destroy target|exile target (creature|permanent|nonland)/i, /counter target/i],
  "Board wipe": [/destroy all (creature|nonland|permanent)/i, /exile all (creature|permanent|nonland)/i, /deals \d+ damage to each (creature|other creature)/i],
  "Recursion": [/return .{1,30} from (your |a )?graveyard to (your hand|the battlefield|your library)/i],
  "Sacrifice outlet": [/sacrifice (a|another) (creature|permanent|artifact|token)\s*:/i],
  "ETB trigger": [/enters the battlefield/i],
  "Death trigger": [/when(ever)?\s.{1,20}\sdies/i],
  "Combat trigger": [/whenever .{1,30} attacks/i, /whenever .{1,30} deals combat damage/i],
  "Haste enabler": [/creatures you control have haste/i, /gains? haste/i],
  "Anthem": [/(creatures|other creatures) you control get \+\d+\/\+\d+/i],
  "Protection": [/hexproof|shroud|indestructible|protection from/i, /ward \{/i],
  "Extra combat": [/additional combat phase|after the first/i],
  "Extra turn": [/take an extra turn/i],
  "Mass damage": [/deals? \d+ damage to each (creature|opponent|player)/i],
  "Mana rock": [/\{t\}: add (\{[wubrgc]\}|one mana of any color|two mana)/i],
  "Reanimation": [/return target creature card from (your |a )?graveyard to the battlefield/i],
  "Mill": [/mill (a|an|\d+|x|that many) cards?/i],
  "Discard": [/discards? (a|an|\d+|x|that many|your hand) cards?/i],
  "Burn": [/deals? \d+ damage to (any target|target (creature|player|opponent|planeswalker))/i],
  "Stax piece": [/each (player|opponent) sacrifices/i, /can't (cast|play|untap)/i, /skip (your|each opponent's) (untap|draw|upkeep)/i, /players can't .{0,30} more than/i],
  "Group hug": [/each (player|opponent) draws? (a|an|\d+) cards?/i, /each (player|opponent) (gains|gets) \d+ life/i, /each player may search/i],
  "Theft": [/gain control of target (creature|permanent|spell|artifact)/i, /untap target (creature|permanent) you don't control/i, /threaten/i],
  "Self-mill": [/put the top \d+ cards of your library into your graveyard/i, /mill yourself/i],
  "Vehicle payoff": [/crew \d+/i, /becomes an artifact creature/i],
  "Saga payoff": [/saga (sacrificed|with the final|enters)/i, /add a lore counter/i],
  "Counters matter": [/proliferate/i, /double the number of .{0,20}counters/i, /move .{0,15}counters/i, /for each .{0,15}counter on/i],
  "Wheel": [/each player discards their hand,? then draws/i, /each player shuffles their hand .{0,20}library/i],
  "Flicker": [/exile target (creature|permanent).{0,30}(return|then return)/i, /(blink|flicker).{0,30}return.{0,15}battlefield/i],
  "Energy": [/get \{e\}/i, /pay \{e\}/i],
  "Devotion": [/devotion to/i],
  "Equipment": [], "Aura": [], "Vehicle": [], "Combo piece": [], "Game Changer": [],
};

export const TYPE_TAGS = [
  "Creature", "Artifact", "Enchantment", "Instant", "Sorcery",
  "Planeswalker", "Land", "Battle", "Equipment", "Aura", "Vehicle", "Saga", "Legendary"
];

// Manual remaps for cards Scryfall might not match directly.
export const ALT_NAMES = {
  "hunger of the ancient one": "Exquisite Blood",
  "nightfeeder's visitation": "Night's Whisper",
  "dracula's tomb": "Phyrexian Tower",
};

export const BRACKETS = [
  { n: 1, name: "Exhibition", desc: "Ultra-casual / showcase decks. Often themed and intentionally weak." },
  { n: 2, name: "Core",       desc: "Average power. No Game Changers, no MLD, no 2-card infinite combos. (WotC removed the tutor cap in Oct 2025.)" },
  { n: 3, name: "Upgraded",   desc: "Beyond precon, focused builds. Up to 3 Game Changers, no MLD, no early-game infinite combos." },
  { n: 4, name: "Optimized",  desc: "High-power. Game Changers, MLD, fast mana, and 2-card combos all on the table." },
  { n: 5, name: "cEDH",       desc: "Tournament-level. Built to win as fast and consistently as possible." }
];
