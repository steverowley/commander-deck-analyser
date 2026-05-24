# Vault

A Magic: The Gathering **Commander (EDH)** deck builder with auto-tagging, bracket assessment, mana curve analysis, game-stage analysis, and hypergeometric probability calculation.

Built with React + Vite + Tailwind. Card data via [Scryfall](https://scryfall.com/). Decks persist to `localStorage`.

---

## Quick start

If you've never used Node before: install [Node.js](https://nodejs.org/) (LTS version is fine), then in a terminal:

```bash
npm install
npm run dev
```

The terminal will print a URL like `http://localhost:5173`. Open it in a browser.

To build a production version:

```bash
npm run build
npm run preview
```

The built files go into `dist/` — those are what you'd upload to a static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages).

---

## What it does

- **Deck building** — Create named decks, set a commander, add cards via search or by pasting a decklist
- **Auto-tagging** — ~25 categories detected from oracle text (Ramp, Card Draw, Token Producer, ETB Trigger, Sacrifice Outlet, etc.). Each card can belong to multiple tags
- **Bracket assessment** — Estimates your deck's Commander bracket (1–5) using WotC's published definitions, flagging Game Changers, MLD, tutors, fast mana, extra-turn spells, and 2-card combos
- **Packages** — Cards grouped by tag, so you can see your "Ramp package" or "Token producer package" at a glance
- **Stats** — Mana curve, card types, color pip count
- **Game stages** — Bucket cards into Early / Mid / Late game roles
- **Probability** — Hypergeometric calculation for "what's the chance I have at least N cards with tag X by turn Y"
- **Card images** — Hover any card row to see the full card; commander shows the full card on the deck page

---

## Project structure

```
vault/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.jsx          # React entry point
    ├── App.jsx           # Top-level routing
    ├── index.css         # Tailwind directives + global styles
    ├── theme.js          # Color tokens (CREAM, BG, ACCENT, etc.)
    ├── lib/
    │   ├── constants.js    # MTG static data: Game Changers list, MLD list, combos, tag patterns
    │   ├── utils.js        # lc, pad, hypergeom, parseDecklist
    │   ├── tags.js         # detectTags — regex-based tag assignment
    │   ├── analyzers.js    # assessBracket, analyzeGameStages
    │   ├── storage.js      # Deck persistence (localStorage adapter)
    │   └── scryfall.js     # Card lookup via Scryfall API + image URL builder
    └── components/
        ├── UI.jsx          # Small reusable components (TagPill, CardRow, StatBox, etc.)
        ├── Modals.jsx      # BulkAddModal, TagEditModal, RulesModal
        ├── DeckList.jsx    # Deck list landing view
        ├── DeckEditor.jsx  # CommanderPicker + DeckEditor parent
        └── Tabs.jsx        # CardsTab, PackagesTab, CurveTab, BracketTab, StagesTab, ProbabilitiesTab
```

---

## Where decks are stored

Everything is in **your browser's localStorage** — keys `vault:decks-v1` (deck data) and `vault:card-cache-v1` (cached card lookups). Nothing is uploaded anywhere.

This means:
- Decks are tied to one browser on one device
- Clearing site data wipes everything
- localStorage caps out around 5 MB. The card cache auto-evicts half its entries if it hits the limit

If you want cross-device sync, you'd need to swap `src/lib/storage.js` for a real backend (Supabase or Firebase are easy starting points — both have free tiers).

---

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, etc. Scope is encouraged: `fix(ui):`, `refactor(storage):`
- **Card name comparisons** always use the `lc()` helper from `src/lib/utils.js` (lowercase + trim)
- **Auto-tags vs manual tags** — `AUTO_TAGS` in `src/lib/tags.js` is the set of auto-assignable tags. When re-running tag detection, anything NOT in that set is preserved as a user-added tag. Maintain this behavior

---

## Known limitations

- Tag detection is regex-based, not perfect — false positives and false negatives both happen
- The 2-card combo list is hand-curated and short
- No deck legality checking (banned list, color identity validation, singleton rule)
- No undo/redo
- No export to Moxfield / Archidekt formats yet — easy to add, just hasn't been
- Card cache uses localStorage which is sync and capped at ~5 MB. IndexedDB would be better for big libraries (use `idb` or `dexie`)

---

## Ideas for next features

- Color identity validation when adding cards (warn if a card isn't in commander's identity)
- Export deck as text (Moxfield-compatible)
- Import from a Moxfield/Archidekt URL
- Replace `localStorage` deck storage with IndexedDB for larger libraries and faster lookups
- Add a "synergy score" — count overlapping tags between commander and each card
- Land base advisor — given commander color identity, suggest a fixing land base
- Vitest unit tests for `assessBracket`, `detectTags`, `hypergeom` (they're pure functions and easy to cover)

---

## License

MIT
