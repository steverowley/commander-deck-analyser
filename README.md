# Vault

A **Magic: The Gathering Commander (EDH)** deck builder and analyser — auto-tagging, bracket assessment, a curve-aware "health score", opening-hand simulation, hypergeometric probability, EDHREC-powered recommendations, a card collection ("Vault"), a random-deck roller, and a public deck gallery.

**Live app:** https://steverowley.github.io/commander-deck-analyser/

Built as a React + Vite + Tailwind single-page app with a Supabase backend (accounts, cloud sync, public gallery). Card data comes from [Scryfall](https://scryfall.com/); recommendation data from [EDHREC](https://edhrec.com/); combo data from [Commander Spellbook](https://commanderspellbook.com/).

> **Signed out, everything stays in your browser** (localStorage) — no account needed to build and analyse decks. **Sign in** (passwordless magic-link or Google) to sync your decks and collection across devices and publish decks to the gallery.

---

## What it does

**Deck analysis**
- **Auto-tagging** — ~25 categories detected from oracle text (Ramp, Card Draw, Removal, Token Producer, ETB Trigger, Sacrifice Outlet, Recursion, Protection, Win Condition, …). Cards can hold multiple tags.
- **Bracket assessment** — estimates your Commander bracket (1–5) using WotC's published definitions, flagging Game Changers, mass land destruction, tutors, fast mana, extra-turn spells, and 2-card combos.
- **Health score** — a 100-point composite covering legality, deck size, lands, the "Four Pillars" (ramp / draw / removal / **recursion**) plus **protection**, board wipes, and mana curve.
- **Archetype classification**, **mana curve / card-type / colour-pip stats**, and **game-stage** bucketing (early / mid / late).
- **Probability** — hypergeometric "chance of N cards with tag X by turn Y", plus a colour-source check and a **1,000-hand opening simulation** ("goldfish").
- **Recommendations** — suggested adds and cuts via EDHREC, with a **land-base advisor**.

**Building & importing**
- Build decks by search, by pasting a decklist, or by importing a **Moxfield / Archidekt** URL.
- **Export** decks (Moxfield / Archidekt formats) and a **missing-cards buylist** priced across TCGplayer + Cardmarket with a CSV export.
- **Random-deck roller** — pick colours / bracket / budget / archetype (optionally "only cards from my Vault") and it builds a legal 99-card deck.

**Collection ("Vault")**
- Track owned cards with per-card foil and printing overrides.
- Import via **Moxfield CSV**, an **OCR camera scanner** (scan a physical card), or **drag-and-drop** from a scryfall.com tab.

**Social & extras**
- **Public Gallery** + **Latest Random Rolls** with bracket / colour / archetype / budget filters.
- **Pods** game-log tracking, a shareable **Rule Zero** pre-game summary card, and a **token sheet** generator.
- **Region-aware** pricing and buy links.

---

## Quick start

If you've never used Node before: install [Node.js](https://nodejs.org/) (version **22 or newer**), then in a terminal:

```bash
npm install
cp .env.example .env     # then fill in the two Supabase values — see Configuration below
npm run dev
```

The terminal prints a URL like `http://localhost:5173`. Open it in a browser.

To build a production version:

```bash
npm run build
npm run preview
```

The built files go into `dist/` — that's what gets deployed (this project deploys to GitHub Pages automatically; see Deployment).

### Configuration

Copy `.env.example` to `.env` and fill in the values. The two Supabase ones are required for accounts and cloud sync; everything else is optional and the app runs fine without them (see [`.env.example`](.env.example) for the full annotated list):

| Variable | Required? | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | **Yes** | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | Supabase publishable anon key (safe to ship in the bundle; security rests on Row-Level Security) |
| `VITE_CARDKINGDOM_PARTNER`, `VITE_TCGPLAYER_IMPACT_PREFIX`, `VITE_CARDMARKET_REFERRER_USERNAME` | No | Affiliate attribution on buy links |
| `VITE_PAYPAL_ME_URL`, `VITE_PAYPAL_BUTTON_ID`, `VITE_PAYPAL_ENV` | No | Tip jar / supporter pipeline |

> Without an account (and without Supabase configured) the app still works fully — it just stores everything in your browser instead of the cloud.

### Tests

Unit + integration tests run via Vitest:

```bash
npm test          # one-shot
npm run test:watch  # re-run on change
```

End-to-end smoke tests via Playwright (boots the dev server, mocks Scryfall + EDHREC):

```bash
npm run e2e:install  # one-time browser install
npm run e2e
```

---

## Where your data lives

- **Signed out:** everything is in your browser's `localStorage` (decks, collection, and a card-lookup cache). Nothing is uploaded. Decks are tied to one browser on one device; clearing site data wipes them.
- **Signed in:** decks, your Vault collection, your profile, and any decks you publish sync to **Supabase** (Postgres with Row-Level Security). This is what enables cross-device sync and the public gallery.

The data layer is split so both modes share the same UI:

| Concern | Local (signed out) | Cloud (signed in) |
| --- | --- | --- |
| Decks | `src/lib/storage.js` | `src/lib/storage-supabase.js` |
| Collection | `src/lib/collection.js` (localStorage path) | `src/lib/collection.js` (`public.collection`) |

---

## Project structure

```
src/
├── main.jsx                 # React entry point
├── App.jsx                  # Top-level state + view routing
├── index.css                # Tailwind directives + global styles
├── theme.js                 # Colour tokens
├── lib/                     # Business logic — small, single-purpose, unit-tested
│   ├── constants.js           # MTG static data: Game Changers, MLD, combos, tag patterns
│   ├── tags.js                # detectTags — regex-based tag assignment
│   ├── analyzers.js           # assessBracket, analyzeGameStages
│   ├── health.js              # curve-aware health score (Four Pillars)
│   ├── autoseed.js            # random-deck build pipeline
│   ├── edhrec.js              # recommendation data
│   ├── landbase.js            # land-base advisor + colour-source math
│   ├── scryfall.js            # card lookup + image URLs + URL resolution
│   ├── storage.js / storage-supabase.js   # deck persistence (local / cloud)
│   ├── collection.js          # the Vault
│   ├── buylist.js, pricing.js, geo.js      # buylist + region-aware pricing
│   ├── billing.js, affiliate.js            # tip jar + affiliate links
│   └── … (~45 modules, most with a sibling *.test.js)
└── components/              # React UI (deck editor, modals, gallery, Vault, pods, …)

supabase/functions/          # Edge functions: bug-report, paypal-webhook
e2e/                         # Playwright smoke tests
.github/workflows/           # CI (test.yml) + GitHub Pages deploy (deploy.yml)
```

---

## Deployment

Pushing to `main` triggers two GitHub Actions workflows:

- **Tests** (`.github/workflows/test.yml`) — runs the Vitest suite.
- **Deploy to GitHub Pages** (`.github/workflows/deploy.yml`) — runs the tests, builds, and publishes `dist/` to GitHub Pages. The deploy is **gated on the tests passing**, so a red test blocks the deploy.

The production Supabase URL + anon key are baked into the build via Vite `define` (see `vite.config.js`). Edge-function secrets (PayPal credentials) are set separately with `supabase secrets set`, not in the Vite build.

---

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, etc. Scope is encouraged: `fix(ui):`, `refactor(storage):`.
- **Versioning:** bump `package.json` and add a `CHANGELOG.md` entry on every shippable PR (the landing-page version chip hover-displays the changelog, so it has to track `main`).
- **Card name comparisons** always use the `lc()` helper from `src/lib/utils.js` (lowercase + trim).
- **Auto-tags vs manual tags** — `AUTO_TAGS` in `src/lib/tags.js` is the set of auto-assignable tags. When re-running detection, anything *not* in that set is preserved as a user-added tag.

See [`CLAUDE.md`](CLAUDE.md) for deeper architecture notes and the data-flow "gotchas" worth knowing before changing the storage, tagging, or drag-and-drop code.

---

## Known limitations

- Tag detection is regex-based — false positives and negatives both happen.
- The hand-curated 2-card combo list is short (supplemented by the Commander Spellbook index).
- No undo/redo.

---

## License

[MIT](LICENSE).
