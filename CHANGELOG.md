# Changelog

## v0.6.0 — Cloud-first, mobile-friendly, smarter health

### Cloud sync, accounts, gallery
- **Supabase backend** — sign in with Google or magic link. Decks sync across devices, every save is durable, and there's a one-time auto-migration of local decks into your account on first sign-in.
- **Public gallery** — flip a deck to public from the editor's action strip. Anyone (signed in or not) can browse the gallery on the landing page, **View** a deck read-only, or **Copy** it into their own archive.
- **Archive is now sign-in only** — the landing page hides the archive list + dashboard when you're signed out, so the page reads as marketing until you log in.

### Mobile + nav
- **Mobile nav** on the landing page and deck editor — the previous `md:flex` cells have been replaced with a compact mobile layout that shows deck/card counts, account status, and the version chip on every screen size.
- **Mobile action strip** in the editor — Notes / Share / Public / Compare / Export / Dupe / Rules now appear as an icon row on small screens instead of being hidden.
- **Footer reflows** on mobile — version chip, Backup, Settings stack vertically when the row would overflow.
- **Version chip with changelog hover** — hovering the `v0.6.0` chip in the nav opens a panel showing the latest release notes inline.

### Smarter analysis
- **Curve-aware health score** — land + ramp targets now derive from the deck's average CMC, so an aggro curve doesn't get dinged for running 32 lands and a top-heavy ramp deck doesn't get a free pass on 5.
- **Deck-size component** — health now also penalises oversized decks (101+ counting the commander) instead of silently passing.
- **Identity histogram** on the archive dashboard — replaces the per-colour bar list with proper combo names (Mardu, Esper, Bant, Mono-White, etc.) so the chart actually distinguishes a Mardu deck from an Esper one.
- **Landbase advisor** uses the same curve-aware target — the recommended count moves with your curve instead of being a fixed 36/37.

### Currency + pricing
- **GBP currency** (USD / EUR / GBP) in Settings. GBP is FX-converted from USD and prefixed with `~`. The archive-dashboard total value now respects the active currency.

### Auth + gallery fixes
- OAuth `?code=` params are stripped from the URL after Supabase parses them, fixing a `flow_state_already_used` loop on re-mount.
- Public gallery list now works end-to-end (split into two queries — decks then profiles by owner_id — because PostgREST can't auto-join `decks → auth.users → profiles`).

### UI polish
- Commander panel now renders mana symbols in oracle text as proper icons instead of literal `{R}` text.
- Empty Lands / Ramp bars no longer look filled — the tinted track + transparent fill clarifies 0%.
- Recs view-switcher (Top Synergy / By Theme / Cuts) is on its own row with `whitespace-nowrap` so it stays a single clean strip at every width.
- Hero rewrite — "Build sharper Commander decks. Win more pods." with a concrete sub-headline naming the actual features.

### Internals
- New helper: `parseLatestChangelog()` (powers the hover panel from `CHANGELOG.md?raw`).
- `aggregateStats(decks, currency)` now currency-aware.
- `recommendByCurve(avgCmc)` exported from `health.js`; reused by landbase.
- Build still passes 160 Vitest tests.

## v0.5.0 — Settings, offline, comparison depth

### Preferences & control
- **App Settings panel** — opens from the landing footer. Three rows: strict-mode default (auto-enabled on new decks), preferred currency (USD/EUR), cached-card count with a Clear-cache button.
- **Wishlist target on search bar** — `→ deck` / `→ wish` toggle inline in the card search; route adds straight to the wishlist instead of slotting them first.

### Offline-capable
- **Service worker** (`public/sw.js`) caches the app shell and immutable assets (Scryfall mana SVGs, weserv card images). Scryfall + EDHREC API calls pass through — the app's own IndexedDB cache handles those. SPA now boots and works offline against cached data.
- **Offline indicator** — small pill that appears bottom-center when `navigator.onLine` is false, explaining what still works.

### Comparison depth
- **Compare with EDHREC average** — third option in the Compare modal, alongside other-deck picker. Synthesises a typical deck for your commander from EDHREC's top 99 cards, batch-fetches Scryfall data, runs through the existing `compareDecks` pipeline. Curve overlay, pip distribution, shared / only-A / only-B columns all work.
- **Compare button always available when a commander is set** (was: only with a second deck in the archive).

### Internals
- New modules: `settings`, `sw-register`
- New components: `OfflineIndicator`, `SettingsModal`
- 160 unit tests (Vitest); E2E suite still in `e2e/` for local use

## v0.4.0 — Builder workflow, archive UX, durable storage

### Builder workflow
- **Strict color-identity mode** — toggleable per-deck. When on, off-color, banned, and duplicate adds are blocked with a red banner explaining why. When off, they're advisory warnings (the existing behaviour).
- **Per-card notes** — TagEditModal renamed to "Card Details", adds a 160-char textarea above the preset tags. CardRow renders the note dimmed-italic with a left border when present.
- **Deck-level notes / scratchpad** — Notes button in the editor header opens a 2000-char free-text modal. Button shows a "·" marker when the deck has notes saved.
- **Wishlist** — cards-on-hold area that doesn't count toward the 100-card cap, legality, stats, or bracket. Bookmark icon on each card row demotes; collapsible WishlistPanel above the card list with ↑ Promote and × Remove buttons.
- **Card-replace on Cuts** — Swap button on each CutRow opens an inline picker of the top 5 EDHREC recs you don't have; click to atomically cut + add.

### Archive UX
- **Search + filter + sort** — search bar (deck/commander name), bracket pills (1-5), color identity icons (W/U/B/R/G/C), sort by recent/name/bracket/health. Appears at ≥3 decks.
- **Archive dashboard** — appears at ≥2 decks. Headline stats (Decks / Cards / Total value / Avg health), bracket-distribution bar chart, colors-played bar list with mana icons, top archetypes pill row.
- **Full archive backup + restore** — JSON export of every deck + commander + tags + notes; restore via paste or .json upload, choose merge vs replace. Useful against cleared browser data.

### Durable storage
- **IndexedDB card cache** with localStorage fallback. Cache cap goes from ~5MB to 50MB+. Async writes don't block the main thread. Legacy localStorage cache auto-migrates once on first load.
- **Delta writes** — `persistCacheSoon` now only writes cards added since the last save instead of the whole cache on every Scryfall fetch.

### Internals
- New modules: `share`, `pricing`, `compare`, `health`, `goldfish`, `landbase`, `strategy`, `edhrec`, `legality`, `deckops`, `stats`, `backup`, `idbcache`
- Tests: 124 → 157 (Vitest); E2E suite (Playwright) ships in `e2e/` for local use

## v0.3.0 — Sharing, smarter analysis, resilience

### Sharing & data
- **URL share** — encode a deck into a `#d=` URL hash; receiver re-fetches cards from Scryfall on import. No backend, no accounts.
- **Banned-list check** — current Commander banlist (Power 9, Karakas, Lutri, the Sept 2024 update: Mana Crypt / Jeweled Lotus / Dockside / Nadu, etc.) flagged in the Legality panel.
- **Card pricing** — Scryfall USD price kept in cache; deck total shown on each archive card and in the Export modal.

### Smarter analysis
- **Four new archetypes** — Stax, Group Hug, Theft, Self-Mill — with detection patterns and stage plans.
- **Archetype-aware recommendations** — "By Theme" view in the Recs tab now ranks themes matching the detected archetype to the top.
- **Mulligan tree** — `simulateMulliganTree(deck)` reports keepable % at hand sizes 7/6/5/4 plus a stop-distribution showing expected mulligan depth. Runs alongside the opener stats.

### UX tools
- **Side-by-side deck compare** — Compare button in the editor opens a modal showing two decks' bracket, health, pip distribution, mana-curve overlay, and shared/unique card lists.
- **EmptyState component** — consistent empty-state styling swept across Packages, Stages, Goldfish, and Recs tabs with explanatory copy.

### Quality & resilience
- **Per-tab error boundaries** — a render error in one tab no longer blanks the editor; the other tabs keep working, switch tabs to reset.
- **Stress tests** — `simulateOpeners` at 99×5000, `addCardsToDeck` at 500 cards, `compareDecks` on full 99-card decks all under loose-but-meaningful budgets.
- **Edge-case tests** — all-5-colors pip distributions, deck of only lands, empty cards array — none crash or produce NaN.
- **E2E Playwright suite** — `npm run e2e` boots the dev server with mocked Scryfall/EDHREC and walks the full create-deck → all-7-tabs flow. Runs anywhere.

### Internals
- New modules: `share`, `pricing`, `compare`, `health`, `goldfish`, `landbase`, `strategy`, `edhrec`, `legality`, `deckops`
- Tests: 53 → 124 across 13 files (Vitest)

## v0.2.0 — From single-file artifact to full Vite app

### Strategy & insight
- **Strategy engine** — classifies decks into 10 archetypes (Aggro / Combo / Control / Midrange / Tribal / Tokens / Reanimator / Voltron / Aristocrats / Spellslinger) by tag profile, writes stage-by-stage action plans citing actual cards.
- **Synergy hubs** on the Packages tab — cards appearing in 3+ packages.
- **Recommendations tab** — EDHREC top cards for the active commander, two views (Top Synergy, By Theme), one-click Add via Scryfall.
- **Cut suggestions** — flags weakest cards in your deck (off-strategy / low synergy / untagged).
- **Seed-from-average** — one click to build a 99-card baseline from EDHREC's top picks.
- **Goldfish simulator** — 1,000-sample opener distribution + keepable %, 6-turn sample playout with reroll.
- **Land base advisor** — pip-ratio basic recommendations + curated utility shortlist by colour identity.
- **Deck health score** — 0-100 composite of legality + lands + ramp + draw + removal + curve, shown on archive cards and Bracket tab.

### Correctness
- **Legality checks** — singleton, color identity, deck size; advisory warnings on the Cards + Bracket tabs.
- **Bracket scorer rewritten** — all 5 brackets reachable, including cEDH signal-stacking.
- **Refreshed Game Changers list** against WotC's late-2024 update.
- **Expanded combo database** — 11 → 28 known 2-card infinite combos.

### Deck ops
- Inline rename, duplicate, Moxfield-format export, full-deck import from text.

### UI
- Mana symbols rendered as Scryfall SVG icons (commander panel, card preview, pip stats, oracle text).
- Tap-to-preview card modal for touch.
- Sticky tab bar, keyboard nav in autocompletes, oracle-text expand on card rows.
- Mobile-friendly spacing.

### Internals
- Tests scaffolded with Vitest.
- CI runs `npm test` ahead of GitHub Pages deploy.

## v0.1.0 — Initial Vite + React + Tailwind scaffold

- Single-file `vault.jsx` artifact split into `src/lib/` (pure helpers, analyzers, storage adapter, Scryfall client) and `src/components/`.
- `localStorage` adapter replacing `window.storage`.
- Scryfall API replacing the Anthropic card-lookup workaround.
- GitHub Actions workflow deploying `dist/` to Pages.
