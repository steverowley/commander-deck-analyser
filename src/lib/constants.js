// MTG static data — curated lists used by the bracket assessor and tag engine.

export const GAME_CHANGERS = new Set([
  "drannith magistrate", "winota, joiner of forces", "yuriko, the tiger's shadow",
  "kinnan, bonder prodigy", "thassa's oracle", "tergrid, god of fright",
  "vampiric tutor", "demonic tutor", "imperial seal", "mystical tutor",
  "enlightened tutor", "grim tutor", "cyclonic rift", "rhystic study",
  "mystic remora", "smothering tithe", "the one ring", "jeweled lotus",
  "mana crypt", "mana vault", "chrome mox", "mox diamond", "ancient tomb",
  "gaea's cradle", "serra's sanctum", "bolas's citadel", "underworld breach",
  "aetherflux reservoir", "coalition victory", "notion thief", "opposition agent",
  "hullbreacher", "trouble in pairs", "glacial chasm", "mana drain",
  "force of will", "fierce guardianship", "deflecting swat", "consecrated sphinx",
  "ad nauseam", "necropotence", "trinisphere", "humility", "winter orb",
  "stasis", "blood moon", "back to basics", "armageddon", "expropriate"
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

// Known two-card infinite combos. Used by the bracket assessor and combo-piece tagger.
export const KNOWN_COMBOS = [
  ["thassa's oracle", "demonic consultation", "Wins on cast"],
  ["thassa's oracle", "tainted pact", "Wins on cast"],
  ["dockside extortionist", "temur sabertooth", "Infinite mana"],
  ["worldgorger dragon", "animate dead", "Infinite mana + ETB/LTB"],
  ["heliod, sun-crowned", "walking ballista", "Infinite damage"],
  ["kiki-jiki, mirror breaker", "zealous conscripts", "Infinite hasty tokens"],
  ["kiki-jiki, mirror breaker", "felidar guardian", "Infinite hasty tokens"],
  ["devoted druid", "vizier of remedies", "Infinite green mana"],
  ["sanguine bond", "exquisite blood", "Infinite lifegain/drain"],
  ["mikaeus, the unhallowed", "triskelion", "Infinite damage"],
  ["isochron scepter", "dramatic reversal", "Infinite mana with rocks"],
];

// Regex patterns matched against oracle text to assign tags.
export const TAG_PATTERNS = {
  "Lifegain": [/gain (a|an|\d+|x) life/i, /gains? life/i, /lifelink/i],
  "+1/+1 counters": [/\+1\/\+1 counter/i],
  "Token producer": [/create.{1,40}token/i, /creates?.{1,40}token/i],
  "Token doubler": [/twice that many|double the number of (those |.{0,10})?(creature )?tokens/i],
  "Counter doubler": [/twice that many \+1\/\+1 counters|double the number of \+1\/\+1 counters/i],
  "Ramp": [/search your library for an? (basic )?(forest|island|swamp|mountain|plains|land)/i, /\{t\}: add (\{[wubrgc]\}|one mana|two mana)/i, /adds? (an additional )?\{[wubrgc]\}/i],
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
  { n: 2, name: "Core",       desc: "Average precon-level power. No Game Changers, no MLD, no 2-card infinite combos, ≤3 tutors." },
  { n: 3, name: "Upgraded",   desc: "Beyond precon, focused builds. Up to 3 Game Changers, no MLD, no early-game infinite combos." },
  { n: 4, name: "Optimized",  desc: "High-power. Game Changers, MLD, fast mana, and 2-card combos all on the table." },
  { n: 5, name: "cEDH",       desc: "Tournament-level. Built to win as fast and consistently as possible." }
];
