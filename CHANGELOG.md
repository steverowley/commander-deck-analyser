# Changelog

## v0.9.2 — Drag a CSV onto the page + better import errors

- **Drop a Moxfield .csv file straight onto the page.** The existing global drop overlay now accepts file drops too. Any `.csv` file (matched by extension or `text/csv` MIME) is read with `File.text()`, detected as a Moxfield export, parsed, and bulk-upserted into your Vault. Drop it on either zone — both route to the CSV import path. Success toast on completion.
- **Better import errors.** Previous CSV imports said "1195 failed" with no detail. `bulkImportVault` now returns the actual Supabase error message (`{ added, failed, error }`); the modal + drop toast both surface it. Sample row logged to console.
- **Deduplicates rows by name** before upserting — a CSV with the same card twice was rejecting the whole chunk because the upsert payload had duplicate primary keys. Last-write-wins per name within a single import.

## v0.9.1 — Moxfield CSV import into the Vault

- **Bulk paste** in the Manage Vault modal now auto-detects a Moxfield "haves" CSV export (matched on the `Count, Tradelist Count, Name, ...` header). Parses Count + Name + Foil + Edition + Collector Number and writes to the Vault.
- Quantities are **set** (snapshot semantics) rather than added — a CSV represents your current inventory, not a delta.
- Foil column maps to our internal styles: `foil` → Rainbow, `etched` → Etched, blank → none.
- Batched in chunks of 100 rows via `supabase.upsert` so a 1k+ row import is a handful of round trips instead of 1k separate inserts.
- The old line-list parser is still the fallback when the input isn't a CSV.
- New tests cover Moxfield-header detection, quantity / foil mapping, commas in quoted names, and escaped doubled-quotes.

## v0.9.0 — Vault card affordances (corner radius, foil, art picker, "Vault-only" toggle)

### Vault thumbnails
- New shared **VaultCard** component used in both the homepage Vault strip and the Manage Vault grid. PNG variant gives proper transparent rounded corners. Hover surfaces three chips:
  - **Art** — opens the existing PrintingPickerModal scoped to that card. Choice persists per-Vault-entry via `meta.printing_id`.
  - **Foil** — cycles through the same five styles the commander chip uses (Rainbow / Galaxy / Surge / Etched / Oil slick). Persists via `meta.foil`.
  - **Remove** — confirms then drops the card from the Vault.
- `×N` quantity badge stays pinned top-right.

### Random roller — "Only use cards from my Vault"
- The toggle is now **always visible** in the Roll-a-deck modal (was hidden when Vault was empty). Disabled with hint text "(empty — add cards to your Vault to unlock)" when there's nothing in the Vault, so the feature is discoverable.
- Label changed from "Only use cards I own" to **"Only use cards from my Vault"** for terminology consistency.

### Data
- New `meta jsonb` column on `public.collection`. Per-card overrides: `{ printing_id, foil }`. Existing rows stay nullable so no backfill needed.
- New helper `setCardMeta(name, meta)` in `lib/collection.js` + a `fetchCardById(id)` helper in `lib/scryfall.js`.

## v0.8.4 — Actually fix the Scryfall drop handler

The previous "fix the drag" PRs touched the drop zone wiring and the activation logic, but the drop handler itself was still silently broken: `handleZoneDrop` was declared `async (target) => async (e) => {...}`. The outer `async` meant the factory returned a **Promise** instead of a **function**, so React's `onDrop` never got a real handler and the drop was a no-op.

- Removed the outer `async` so the factory is synchronous.
- Drop activation also made permissive — Chrome/Safari hide `dataTransfer.types` on dragenter / dragover for cross-origin drags, so we now activate the overlay on any drag entering the window and figure out at drop time whether it's a Scryfall card.
- Added `console.log` traces (`[Vault] Drop received...` / `Extracted URL...` / `Resolved card...`) so future failures can be diagnosed from the browser console without redeploying.
- Error toasts now include a snippet of the actual dropped data so you can see *why* the drop didn't resolve.

## v0.8.3 — Dropped cards refresh the Vault instantly

- **Fix**: dragging a card from scryfall.com onto the Vault drop zone wrote to the backend but the homepage thumbnail strip didn't update until you reloaded the page. `App.jsx` now bumps a `collectionRev` counter after every drop (and after closing the Vault modal), which DeckList watches as a useEffect dependency to re-fetch.
- Same trigger fires after the Vault modal closes — so any add/remove/quantity edit inside the modal also refreshes the homepage strip.

## v0.8.2 — See the cards in your Vault

- **Homepage Vault section** now renders the 12 most recently-added cards as **image thumbnails** instead of a plain comma-separated text list. Multi-quantity entries get a `×N` badge in the corner.
- **Vault modal** gained a **Grid / List toggle** (defaults to Grid). Grid view shows every owned card as a thumbnail with inline +/- quantity controls and a delete button. List view kept for keyboard / accessibility users who prefer dense rows.
- Scryfall data for owned cards batch-fetched (75 names / request) and cached in component state so a 200-card Vault loads in one round trip.

## v0.8.1 — Scryfall cross-tab drag actually works

After research: Moxfield doesn't natively support cross-tab drag from scryfall.com (the [Moxfall](https://github.com/jemmec/moxfall) browser extension was built specifically to fix that). Native cross-tab drag has to be implemented by the destination site — which is what this release does properly.

### Global drop overlay
- New `GlobalDropOverlay` mounted at the app root. Listens at document level for `dragenter` / `dragover` / `drop` from any scryfall.com or scryfall.io URL.
- Pops up a full-window overlay with two big drop zones — **Add to Vault** and **Add to active deck** — so you can't miss the target. Mirrors how design tools like Figma handle cross-tab image drops.
- PreventDefault at the document level means the browser no longer navigates to the image URL when you drop outside the box. The drag is captured globally.
- Spinner + error toast surface the resolution step so you know if the URL didn't match a card.

### Editor search panel
- The Scryfall search panel is now reachable from inside the deck editor (new **Search** action in the action strip), with `onAdd` wired straight into the open deck instead of the Vault.

### Internals
- Shared `extractDroppedScryfallUrl(dt)` helper tries every dataTransfer slot the browser might use (uri-list / plain / html → src=/href=).
- `resolveScryfallUrl(url)` cached so re-drops are instant.

## v0.8.0 — Vault rebrand, Scryfall drag, polish round

### Vault (formerly Collection)
- Renamed **Collection** → **Vault** throughout the UI. Same backend; the inventory of cards you own is now first-class branding.
- **Homepage Vault section** — landing-page block summarises unique / total counts, recently-added cards, and offers **Manage Vault** + **Search →** actions. Always visible (even when empty) so the feature is discoverable.
- VAULT logo on the landing nav is now a clickable link back to the homepage / scroll-to-top.

### Scryfall drag-and-drop
- **External drag from scryfall.com tabs** (Moxfield-style). Drag a card image straight from any `scryfall.com` browser tab onto your Vault or a deck's Cards tab — the URL is parsed (`cards.scryfall.io` image, `scryfall.com/card/...` page, or `api.scryfall.com/cards/...`) and the matched card lands in the target. Card-by-uuid cached so repeated drops are instant.
- **In-app Scryfall search panel** with draggable card thumbnails. Slide-out from the right edge of the screen, accessible from a new **`4. Search Scryfall`** tile on the homepage create section.
- Drop zones: Vault section + every deck's Cards tab. Internal-panel drops take the fast path (no extra network round-trip).

### Auto-seed roller — three big fixes
- **Total budget enforced**, not just per-card cap. A `$50` Budget preset used to produce ~$500 decks because 99 cards × per-card cap = `$594`. Now a post-build swap loop replaces the most expensive non-basic non-owned cards with basic lands until the deck total fits the chosen budget.
- **Builder prefers basics** — non-basic lands now capped at `utilityReserve(colorCount)` (2 mono / 6 two-colour / 10 three / 12 four+). Rest of the land target fills with basics matching the commander's identity, which matches real EDH deck construction.
- **Archive leak fixed** — `loadDecks` now explicitly filters `.eq('owner_id', userId)`. Previously RLS let an anonymous-read "anyone can read public decks" policy leak every other user's public deck into your archive grid.

### Random rolls
- **Persistent random-rolls table** — rolled decks are now snapshotted into a dedicated `public.random_rolls` table that survives the user deleting the deck from their archive. Owner FK is `ON DELETE SET NULL` so account deletions don't wipe historical rolls either.
- **Rolled decks are transient by default** — `onRandomBuild` opens the built deck in a viewing-only session (id `roll:<ts>`). They no longer pollute your archive unless you hit **Save to my archive →** in the editor banner.

### Foil styles
- **Five foil treatments** cycle on the chip: Rainbow, Galaxy (purple-blue with star sparkles), Surge (neon hard-light), Etched (silver linear striping), Oil slick (slow ellipse pools). `deck.commander_foil` accepts a style id; legacy `true` migrates to `'rainbow'`. Foil chip is hover-only on md+ to match the Art chip.

### Profile / accounts polish
- Profile editor reachable from the `Cloud · email` button anywhere it appears; first-sign-in user is locked into an onboarding modal to pick a username before going further.

### Editor + card row
- **Deck cost** now visible in the editor header (`Cost · $X · 4 unpriced`). Mobile + desktop layouts updated.
- **Per-card prices** on every CardRow (`cmc · 3 · $4.25`). Currency-aware via Settings.
- **Owned-card pricing** — `deckTotalPrice` returns `ownedTotal` + `toBuy`. Archive deck cards + dashboard tile show "$X (Y to buy)" in green when you already own some.

### Mobile + UX
- Card-row name no longer truncates to `M...` on mobile — name + type stack vertically below `sm`. Count buttons enlarged to 28×28 px touch targets.
- Card scanner: **auto-scan loop** every ~1.5 s (no need to keep tapping Scan). Confidence gate via Levenshtein similarity so low-confidence reads keep scanning instead of locking on a wrong card. Crop region recomputed from the on-screen guide so the OCR actually targets the title strip. Tesseract page-seg mode = 7 for single-line accuracy.
- **Public Gallery cards restyled** to match the Latest Random Rolls layout (commander thumb + badge row + timestamp).

### Bug fixes
- Packages tab on rolled decks no longer goes empty silently — explicit empty-state copy when there are no detected tags.
- Ramp count no longer inflated by basic lands (lands stripped from Ramp / Mana rock tags in `detectTags`).
- Land-base advisor accounts for existing nonbasics — `basicSlots = max(0, target - max(nonbasic, utilityReserve))`.
- Random-deck builder no longer produces 130+ card piles (summary key mismatch + basic-pad over-add fixed).
- Commander suggestions dropdown bumped to `z-40` so the sticky tab bar doesn't cover it.
- Mana symbols in oracle text get tiny inline `margin-inline` so `{R}{R}{R}` reads as a sequence instead of a blob.
- Version chip popover is click-to-toggle (was hover, which closed the panel mid-scroll).
- Cards tab + Vault drop zones accept `text/uri-list` / `text/plain` in addition to the internal MIME — fixes drops from external Scryfall tabs that the previous wiring silently ignored.

### Internals
- New helpers: `resolveScryfallUrl`, `archetypeById`, `tagsMatchArchetype`, `saveRandomRoll`.
- New components: `ScryfallSearchPanel`, `VaultSection` (homepage), `RandomRollsView`, `CollectionModal`, `CardScanner`, `ProfileModal`.
- New tables: `public.random_rolls`, `public.collection`, `public.profiles`.
- New devDep: `tesseract.js` (lazy-loaded only when the scanner opens).
- 176 Vitest tests pass.

## v0.7.0 — Roll-a-deck, collections, webcam scanner

### Random commander → auto-seeded decks
- **Roll a deck** tile on the landing page (third option in the create section) opens a flow that picks a random commander and auto-seeds a 99-card list around it via EDHREC's typical-deck averages.
- Settings: **Color identity** (WUBRG multi-select), **Partner / background** toggle, **Bracket target 1-5** (filters Game Changers / MLD / combos at low brackets), **Budget cap** (Any / Budget / Casual / Tuned / Premium — currency-aware), **Archetype preference** (Tokens / Tribal / Voltron / Aristocrats / Reanimator / Spellslinger / counters / Combo / Stax / Lifegain / Group hug).
- **Curve-aware bucket fill** — lands / ramp / draw / removal targets come from `recommendByCurve`. Falls back to basic-land padding when the EDHREC pool doesn't supply enough lands. 99-card cap is now an invariant (pinned by tests).
- **Always-on ban-list filter** — `BANNED_CARDS` excluded from every roll regardless of bracket, even at cEDH.

### Latest Random Rolls gallery
- New landing-page section above the curated Public Gallery, showing recent rolled decks across all users.
- Tiles match the Public Gallery style: commander thumb, name, identity pips, `B<bracket>` / budget / archetype badges, `@user · 5m ago`, View / Copy → mine.
- Snapshots live in a dedicated `random_rolls` table so they **survive the original user deleting the deck from their archive**. Owner FK is `ON DELETE SET NULL` so account deletions don't wipe historical rolls either.
- Opt-in toggle inside the Roll modal — defaults on for signed-in users, hidden for anonymous.

### Collection + webcam scanner
- New **Collection** inventory (link in the landing footer). Add cards via webcam, bulk paste (Moxfield format), or autocomplete; quantities edited inline with `-/+/×` controls.
- **Auto-scanning webcam scanner** — opens the device camera, draws a card-outline guide, and runs OCR every ~1.5s automatically (no need to tap a button each time). Scanner uses **Tesseract.js** (lazy-loaded, PSM 7 single-line mode, ~2× upscale of the cropped title strip), fuzzy-matches the read against Scryfall's autocomplete, and presents the best hit with alternative suggestions.
- Storage is Supabase-backed for signed-in users (RLS-locked to owner) and localStorage for anonymous.
- **"Only use cards I own"** toggle in the Roll-a-deck modal filters the EDHREC pool to your inventory; basics still pad out the rest of the deck.

### Collection-aware pricing
- `deckTotalPrice` now optionally takes the user's collection and returns `ownedTotal` + `toBuy`. Archive deck cards show `(£X to buy)` in green when you already own some of the cards; the Archive Dashboard total tile reflects the same.
- Auto-seed budget filter lets owned cards bypass the per-card price cap (they're $0 to you), so a $50 Sol Ring you own can still land in a $100 budget deck.

### Per-card art + foil
- **Per-card printing picker** — click any card thumbnail anywhere in the app, open the preview, tap **Art** to browse every printing on Scryfall and pick one. The chosen printing is a per-deck override; the global card cache is untouched.
- Commander panel got the same affordance plus a **Foil** toggle that overlays a rainbow sheen + animated diagonal shine over the card art.
- Commander image switched to Scryfall's PNG variant for transparent rounded corners (kills the ugly white border on Beta-era cards).

### Profiles + accounts
- First-sign-in **username picker** modal locks new users into choosing a public handle before the gallery credits decks "shared by @username".
- **Profile editor** reachable from the nav (`Cloud · email` is now a button) and footer; shows username, email, and member-since date.
- Username validation: 2-24 chars, letters/digits/underscore/hyphen, friendly "already taken" error on conflicts.

### Mobile + nav polish
- Tab bar on the editor scrolls horizontally on mobile instead of wrapping into a 4-col grid with an empty cell.
- Action strip uses `flex-wrap` (no horizontal scroll), so every Notes / Share / Public / Compare / Export / Dupe / Rules icon stays reachable.
- CardRow no longer truncates names to `M...` — name + type stack vertically on mobile, count buttons are now a 28×28 px touch target, action icons have a `-m-1.5 p-1.5` halo for hit-testing.
- Top navs on the landing page and editor have dedicated mobile branches with vertical stacks; the desktop grids are unchanged.
- Footer reflows on narrow viewports.

### Bug fixes
- **Random deck no longer produces 130+ card piles** — fixed two bugs in `buildSeededDeck` (summary key mismatch + basic-pad over-add). 99-card invariant pinned by 3 new tests.
- **Ramp count was inflated by basic lands** — `detectTags` now strips `Ramp` / `Mana rock` from any card whose type line includes `Land`. Health panel, Stages, and Strategy plans all benefit.
- **Land Base advisor ignored existing nonbasics** — `basicSlots = max(0, target - max(currentNonbasic, utilityReserve))`. A mono-red deck with 17 basics + 20 nonbasics no longer gets told to add 18 more Mountains.
- **Viewing a gallery deck no longer pollutes your archive** — view-mode decks live in a separate `viewingDeck` state; navigating back clears them.
- **Commander suggestions dropdown** bumped from `z-20` to `z-40` so it's no longer covered by the sticky tab bar.
- **Mana symbol spacing** — adjacent `{R}{R}{R}` in oracle text reads as a sequence instead of a blob.
- **Version chip changelog popover** is now click-to-toggle (not hover) so you can actually scroll the release notes without it closing.

### Internals
- New modules: `lib/autoseed.js`, `lib/archetypes.js`, `lib/collection.js`, `lib/profile.js`, `lib/changelog.js`.
- New components: `RandomDeckModal`, `RandomRollsView`, `PrintingPickerModal`, `ProfileModal`, `CollectionModal`, `CardScanner`, `VersionChip`.
- New tables: `public.collection`, `public.profiles`, `public.random_rolls`.
- New devDep: `tesseract.js` (lazy-loaded only when the scanner opens).
- Test count: 160 → 174.

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
