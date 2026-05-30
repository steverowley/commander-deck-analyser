# Changelog

## v0.36.0 — Win Condition tag + over-tutoring check

The tag engine gains a `Win condition` tag — wincons are now first-class citizens alongside Ramp / Draw / Removal. Build Advisor uses the count to spot decks that tutor for nothing in particular.

### Library
- **`WIN_CONDITION_CARDS` Set in `constants.js`** — curated list of 35 game-ending cards across four families: game-state alt-wins (Approach of the Second Sun, Felidar Sovereign, Helix Pinnacle, Maze's End, …), library-empty wins (Thassa's Oracle, Lab Maniac, Jace Wielder), infinite/X damage finishers (Aetherflux Reservoir, Walking Ballista, Exsanguinate, Torment of Hailfire, Comet Storm, …), and big-mana mass-power closers (Craterhoof Behemoth, Insurrection, Pathbreaker Ibex, finales). The Build Advisor's over-tutoring check uses this plus assembled-combo detection.
- **`Win condition` added to `TAG_PATTERNS`** with generic regex covering "you win the game", "target player loses the game", "each opponent loses the game", and X-damage-to-each-opponent finishers. Pattern matching catches cards the curated list misses; the list catches cards whose wincon text is hidden behind triggers.
- **`detectTags` (in `tags.js`) auto-applies `Win condition`** when the card matches the patterns, is on the curated list, OR is part of an assembled combo (combos in `COMBO_INDEX` all have `results` that end the game). `AUTO_TAGS` updated so the tag is preserved by `retag()`. (closes #132)

### Build Advisor (closes #137)
- **New `checkOverTutoring(deck)` check** in `antipatterns.js`. Counts tutors and wincons; warns when `tutors > wincons + 2`. Title format: `"6 tutors with only 2 win conditions"`. Detail asks the user to either add more closers or trim tutors. Severity escalates to `major` when the gap is ≥ 5. No-ops cleanly on decks with zero tutors.

### Tests
- **`tags.test.js`** — 4 new cases: Approach of the Second Sun (named curated list), Helix Pinnacle ("you win the game" pattern), assembled combo piece tagged as Win condition, vanilla creature not tagged.
- **`antipatterns.test.js`** — 4 new cases: 6-tutor / 2-wincon warns; 6-tutor / 5-wincon stays quiet; deck with no tutors returns null; gap ≥ 5 escalates to `major`.

## v0.35.0 — Decklist export: plain text / Moxfield / Archidekt + send-to buttons

The Export modal now exposes three target formats and one-click handoff to the major deckbuilders. The same paste-import path that landed in #111 now round-trips with the export, so a deck exported here drops back in untouched.

### Library
- **New `src/lib/deckExport.js`** with `toPlainText`, `toMoxfield`, `toArchidekt`, `exportAs(deck, formatId)`, and an `EXPORT_FORMATS` registry. All three formats sort non-basics alphabetically with basics grouped at the bottom (matches Moxfield's own export convention). Plain text uses `// Commander` + `// Deck` comment headers so a re-parse correctly routes the body into the mainboard; Moxfield uses explicit `Commander` / `Deck` / `Maybeboard` section blocks; Archidekt adds `(SET) <num>` printing tags when the card has them so the importer can pin the exact printing.
- Constants `MOXFIELD_IMPORT_URL` and `ARCHIDEKT_IMPORT_URL` expose the upstream import endpoints for the send-to flow.

### UI
- **`ExportModal` overhaul** in `Modals.jsx`:
  - Segmented format picker (Plain text / Moxfield / Archidekt) above the preview textarea — switching format re-renders the text in place.
  - Footer gains **Send to Moxfield** and **Send to Archidekt** buttons. Each copies the current format to the clipboard, then opens the upstream import page in a new tab (their importers require a paste — there's no URL-prefill scheme).

### Tests
- 12 new cases in `deckExport.test.js` covering plain-text layout + basics-at-bottom + alphabetical basics, plain-text round-trip through `parseTextDecklist`, Moxfield header round-trip + commander-less variant, Archidekt printing tags + bare-name fallback + round-trip with tags stripped, `exportAs` dispatch + fallback.

## v0.34.0 — Region-aware currency, buy links + Cardmarket referral pop-up

First-time visitors now get prices and shopping links that match where they are, and UK/EU players get a dedicated nudge toward the Cardmarket referral that funds Vault. No setup, no override of anyone who's already chosen their own settings.

### Library
- **New `src/lib/geo.js`** detects a visitor's region (`uk` / `eu` / `us`). `detectRegion()` tries IP geolocation first (keyless `ipapi.co`, 2s timeout) and falls back to browser timezone + locale; both signals run through `regionForCountry()`. `REGION_DEFAULTS` maps each region to its currency / buy-link retailer / price source (UK → GBP + Cardmarket, EU → EUR + Cardmarket, US → USD + TCGplayer). All detection helpers take injectable inputs so they're testable.
- **`src/lib/settings.js`** gains a `region` field (informational), `applyRegionDefaults(region)` to seed the existing currency / `prefRetailer` / `prefPriceSource` settings, and `hasStoredSettings()` so auto-detection never overrides a user who's already saved preferences.
- **New `src/lib/referralPrompt.js`** mirrors the tip-jar prompt's show-once / maybe-later (~30 day) / dismiss-forever gate. `isReferralEligible()` only passes for UK/EU players when a Cardmarket referrer username is configured.

### UI
- **`App.jsx`** runs region detection once per device (gated by a `vault:geoApplied` flag) and seeds the settings on a brand-new visitor's first load. The engagement-gated auto-prompt now coordinates two CTAs: the **Cardmarket referral pop-up** (UK/EU) takes priority, everyone else still gets the tip jar — only one fires per session.
- **New `src/components/ReferralModal.jsx`** — a Cardmarket-first refer-a-friend pop-up reusing the tip-jar modal shell, with copy-username + signup-link affordances from `affiliate.js`.
- **Settings** shows a "Detected region" note above the currency / buy-link controls so users know why their defaults were set, with a reminder they can change anything.
- **CSP `connect-src`** now allows `https://ipapi.co` for the region lookup.

### Tests
- **New `geo.test.js`** (country mapping, timezone/locale fallback, IP path with mocked fetch, IP-first-then-fallback ordering) and **`referralPrompt.test.js`** (region gating, referrer gating, dismissed / remind-window logic, writers). 416 tests green (up from 382).

## v0.33.0 — Per-deck swap log

## v0.32.0 — Build Advisor: anti-pattern warnings + curve-aware land label

The Stats tab gains a **Build Advisor** panel that surfaces structural problems the health-score fundamentals don't catch. Two checks ship in this release: Karsten-formula underland detection (the #1 casual deckbuilding mistake per Frank Karsten) and top-heavy-curve-without-compensating-ramp. The static "Rec: 36-38" land label is also retired in favour of the curve-aware target.

### Library
- **New `src/lib/antipatterns.js`** with `checkUnderland(deck)`, `checkCurveRampImbalance(deck)`, and `runAntipatternChecks(deck)`. Each check returns `null` when fine or `{ id, severity, title, detail, formula? }` when something looks off. The orchestrator sorts non-null warnings by severity (`major` → `warn` → `info`).
  - **`checkUnderland`** computes `target = round(28 + 2×colors + avg_MV - 1)` and warns when the deck is below BOTH the Karsten floor and the curve-aware ok-low band. The dual condition keeps the warning from firing on a low-curve aggro deck that's correctly running 32 lands. Severity escalates to `major` when the gap is ≥3 lands. Surfaces the formula in the warning so users see *why* (closes #135).
  - **`checkCurveRampImbalance`** fires when avg MV ≥ 3.8 with <11 ramp pieces, escalating to `major` when avg MV ≥ 4.2 with <8 ramp. Action-oriented detail: "add N more or trim a high-MV card" (closes #140).

### UI
- **`BuildAdvisorSection`** in `Tabs.jsx` Stats view, rendered above Land Base. Only mounts when there's at least one warning. Each warning row shows severity chip (color-coded — accent red for `major`, amber for `warn`, dim for `info`), title, detail, and the formula on its own monospace line when present.
- **`Lands` summary card now shows the curve-aware target** instead of the hardcoded "Rec: 36-38" — a 2.0-CMC aggro deck sees "Rec: 32–34", a 4.5-CMC top-heavy deck sees "Rec: 40–42". Pulls from the same `recommendByCurve(avgCmc)` the Health panel already uses (closes #143).

### Tests
- **New `antipatterns.test.js`** (10 cases): Karsten underland fires for a 3-color 3.5-MV deck with 32 lands (gap = 5, major); skipped when at target; skipped for a low-curve aggro deck at 32 lands; curve-ramp imbalance fires at 4.0 MV / 8 ramp; compensated by 12 ramp; skipped on a 3.0-MV deck regardless; severity sort puts the major warning first; healthy deck returns empty.
- 382 tests green (up from 372).

## v0.31.0 — Separate spot removal from board wipes (Command Zone Ep. 658)

The Command Zone deckbuilding template was updated in Ep. 658: targeted removal doubled from 5 to **10-12**, board wipes dropped from 5 to **3-4**, and card draw bumped to **~10**. Vault's health score and auto-seed still treated them as one combined "removal" bucket, which let a deck of nine wipes and zero spot removal score full points. This release splits them so the score reflects the new template.

### Health score (closes #127, #128)
- **`COMPONENTS.removal` (15 pts) split into `targetedRemoval` (10 pts) + `boardWipes` (5 pts).** Total still sums to 100. Health panel now shows two rows. (closes #127)
- **`computeHealth`** counts `Targeted removal` and `Board wipe` separately. Spot-removal scoring: 10+ → full, 7-9 → 6, 4-6 → 3. Wipes scoring: 3+ → full, 1-2 → partial, 0 → 0. Wipes don't penalise extras (Aristocrats decks legitimately want more).
- **Card draw target bumped from 9 to 10-12** per the same update. Full points at 10+, partial 7-9. Hint copy reads "aim for 10-12" (was "aim for 8-10"). (closes #128)

### Auto-seed
- **`autoseed.js` adds a `wipe` bucket** alongside `removal`, with `TARGETED_REMOVAL_TARGET = 10` and `BOARD_WIPE_TARGET = 3`. `DRAW_TARGET` bumped 9 → 10. `categorize()` routes `Board wipe`-tagged cards to the wipe bucket before checking `Targeted removal` so overload-style cards land in the right place.
- **Summary** carries `summary.wipe` alongside `summary.removal`; the deck-notes breakdown in Modals.jsx now reads `"…spot removal N, wipes M…"`.

### UI
- **Health panel** renders Spot removal + Board wipes as separate rows via the existing `Object.entries(breakdown).map` — no component changes needed.
- **Help text** for the Health tab: "0-100 composite of legality + lands + ramp (8-12) + draw (10-12) + spot removal (10-12) + board wipes (3-4) + curve. Tracks the Command Zone 'New Era' template."

### Tests
- **`health.test.js`** — textbook deck now includes 3 wipes (Ep. 658 baseline) and asserts both `targetedRemoval.points === 10` and `boardWipes.points === 5`. New case verifies the split: 9 wipes + 0 spot removal scores full wipe but zero spot points (the anti-pattern the old combined score missed). New draw-hint test asserts the 10-12 target.
- **`autoseed.test.js`** — new case asserts the wipe bucket fills to ≥3 when the pool contains "Destroy all creatures" cards, and that spot removal stays at ≥7 separately.

## v0.30.1 — Packages tab: one-click "Re-detect tags" recovery

The Packages tab's "No auto-tags detected" empty state was a dead end — it pointed at Settings → Refresh card prices + text, but that path only updates the card cache, not the open deck. Users had to manually add/remove a card to trigger a re-tag. This release replaces the dead-end message with an actionable button.

- **`PackagesTab` empty state now exposes a "Re-detect tags" button** that finds cards whose `scryfall.oracle_text` is missing or empty, force-fetches them from Scryfall's `/cards/collection` endpoint (bypassing the cache so we always get fresh oracle text), and re-runs `retag()` over the whole deck — all in one click. Reports per-batch progress while running and a status line afterwards ("Refreshed N cards — tags should now populate", "Tags already up to date", "Couldn't reach Scryfall…"). User-chosen printing fields (id, set, collector_number, image_uris) are preserved across the refresh.
- **`rehydrateMissingOracleText(cards, onProgress)`** added to `lib/scryfall.js`. Scoped helper that only touches cards actually missing oracle text — no-op when everything is already populated, treats double-faced cards as present when at least one face has text, surfaces Scryfall `not_found` and network errors via the `failed` count. 5 new tests in `scryfall.test.js`. (closes #154)

## v0.30.0 — Browse-all pages for Public Gallery + Random Rolls

The landing-page Public Gallery and Latest Random Rolls sections were each loading the most recent ~12–18 entries inline, which crowded the home page once the gallery started filling up and left no way to dig past the newest few. Both sections now cap to the 6 most-recent on the home page and gain a **View all →** link that opens a dedicated browse page with search + sort.

### UI
- **Home page** — `GalleryView` and `RandomRollsView` now load only 6 entries each (was 18 + 12). A `View all →` link appears in each section header when a callback is wired.
- **`GalleryAllView`** (new) — full Public Gallery browse page. Loads up to 200 public decks; client-side search across deck name / commander / `@owner`; sort by most recent / deck name / commander / bracket / health.
- **`RandomRollsAllView`** (new) — full Latest random rolls browse page. Loads up to 200 rolls; search across commander / `@owner` / archetype; sort by most recent / commander / bracket / budget (low→high or high→low) / archetype.
- **Routing** — `App.jsx` gains two new view states (`'gallery-all'`, `'rolls-all'`) wired through `DeckListView` via new `onViewAllGallery` / `onViewAllRolls` callbacks. Both new pages mirror `VaultPage`'s top nav (ChevronLeft back button + title chip + total / shown counters + version chip).
- **Card-tile reuse** — `GalleryCard` and `RollCard` are now exported from their source files so the new browse pages render identical tiles to the home page (commander thumb, badges, `@user · 5m ago`, View / Copy → mine). Behavior stays in lockstep — one place to change a tile.

### Refactor
- `App.jsx` — extracted `handleImportFromGallery` and `handleViewGalleryDeck` from the inline `DeckListView` props into named functions on the App component so the new browse pages share the same implementation. Single source of truth for "copy → mine" and "view in transient session".

## v0.29.3 — Vault stats now use the chosen printing's price + set

- **Fix: `Total value`, `Foil value`, `Most valuable`, `Top sets`, and `Cards on the shelf → unplayed value` now reflect the user's chosen printing.** They were always reading from the canonical Scryfall printing returned by `fetchCardsByName`, so a Beta Sol Ring (~$4000) reported as the Commander Anthology reprint (~$2). `VaultPage` now merges `printingCards` over `cardData` and hands the merged map to `computeVaultStats`. Oracle-level fields (type/colors/CMC) are identical across printings; printing-level fields (set, rarity, price, image) now follow the user's choice. (closes #152)
- **Fix: the value sort in the Inventory filter bar** is now printing-aware for the same reason — sorting by value puts your Beta Sol Ring at the top.

## v0.29.2 — Vault: chosen card art now actually displays

- **Fix: changing a card's printing in the Vault now updates the displayed image.** The picker was correctly saving `meta.printing_id` to `public.collection.meta`, but both `VaultPage` and the homepage Vault strip only ever fetched the canonical printing by name — so the user's chosen art never rendered. Both surfaces now resolve `meta.printing_id` via `fetchCardById` and prefer that printing when present. The Printing Picker modal's "active" highlight also now correctly indicates the saved choice. (closes #150)

## v0.29.1 — Sync Game Changers list + tutor rules to Feb 2026 WotC update

WotC has shipped two bracket updates since this codebase was last refreshed against the late-2024 Game Changers list. The list is now 53 cards (was 58), the tutor cap is gone from Brackets 1–3, and Biorhythm is no longer banned. This release brings Vault back in sync.

### Bracket data
- **`GAME_CHANGERS` refreshed to Feb 9, 2026 (53 cards).** Dropped six cards WotC removed in their Oct 21, 2025 update — Winota, Yuriko, Kinnan, Jin-Gitaxias, Urza, and Expropriate. Added the two Feb 9, 2026 additions — **Farewell** and **Biorhythm**. (closes #123)
- **`BANNED_CARDS` no longer lists Biorhythm.** Biorhythm was unbanned and moved onto the Game Changers list — it now flags as Bracket 3 power rather than a hard format violation. (closes #123)
- **`MLD_CARDS` and `EXTRA_TURN_CARDS` unchanged** (those lists are stable).

### Tutor rule (closes #124)
- **`analyzers.js` no longer pushes 4+ tutor decks to Bracket 4.** WotC removed the tutor restriction from Brackets 1–3 in their Oct 21, 2025 beta update — the Game Changers list now catches the warping tutors (Demonic, Vampiric, Imperial Seal, Mystical, Enlightened, etc.) directly, so the secondary penalty was double-counting. Tutor count still feeds the cEDH (Bracket 5) signal at high density.
- **UI: tutor `FlagBox` now reads "Informational only — WotC removed the tutor cap in Oct 2025."** Was "≤3 appropriate for Bracket 3."
- **Modals.jsx `What Escalates a Deck` list** now reads "Very high tutor density (6+) — cEDH-grade signal" (was "High tutor density (4+)").
- **Bracket reference for B2** no longer says "≤3 tutors."

### Tests
- New `analyzers.test.js` cases: 5-tutor mono-W value deck stays at Bracket 2 (no longer pushed to Bracket 4); Farewell flags as Game Changer; Winota/Urza/Yuriko/Kinnan/Expropriate are no longer Game Changers.

## v0.29.0 — Color-source hypergeometric (Karsten check)

The Stats tab gains a **Color Sources** panel that walks every non-land in the deck, looks up the required source count per color from Frank Karsten's 90%-on-curve table, and reports deficits against actual sources. Now you'll see "30 W required for `{1}{W}{W}` at CMC 3, you have 26 → short 4" instead of having to do the math yourself.

### Library
- **`src/lib/landbase.js`** gains `KARSTEN_TABLE`, `requiredSourcesFor(cmc, pips)` (clamps CMC to 1–7 and pips to 1–3, matching the published table), `spellPipsByColor(card)` (hybrid `{W/U}` counts toward both), `producesColor(card, color)` (basic-land subtypes, `Add {X}`, "any color" rocks, and fetch-land oracle text all count), `actualSourcesByColor(deck)`, and `analyzeColorSources(deck)`. The aggregator returns one row per color the deck cares about with the worst-spell example surfaced — so the deficit explanation cites the spell that drove the requirement, not just the colour bucket.

### UI
- **`ColorSourcesSection` in the Stats tab** sits between Land Base and Tokens. Per-colour rows show `actual / required` with a colour-coded status (green when met, amber for ≤3 short, accent red for >3 short), an italic "Driven by …" line citing up to three example spells, and a header chip showing whether any colour is short overall.

### Tests
- 17 new cases in `landbase.test.js` covering the lookup (1-pip, 2-pip, 3-pip, CMC clamp, pip clamp), `spellPipsByColor` (pure / hybrid / colorless), `producesColor` (basics by subtype, dual lands, mana rocks, any-color rocks like Chromatic Lantern, fetch lands), `actualSourcesByColor` aggregation, and the canonical Teferi acceptance case (deficit when blue sources < 11, green when sources meet target, `{1}{W}{W}` @ CMC 3 needs 18 W). **358 tests green** (up from 338).

## v0.28.0 — Rule Zero card

The DeckEditor toolbar gains a **Rule Zero** action that opens a one-page pre-game summary — bracket, archetype, win conditions (combos from v0.24, alt-win cards, commander damage), auto-derived flags (GC / MLD / fast mana / tutors / extra turns / stax / combos), realistic-threat turn from a goldfish playout. Export as markdown for Discord/Slack, as a PNG for chat thumbnails, or as a shareable link.

### Library
- **`src/lib/ruleZero.js`** — `buildRuleZeroCard(deck)` aggregates bracket (`analyzers.assessBracket`), archetype (`strategy.classifyArchetype`), assembled combos (`combos.detectCombos`), and a `fastestWinTurn` heuristic that runs 20 goldfish playouts and returns the median turn at which cumulative non-land CMC on the battlefield crosses 10 — a rough proxy for "threat density". Win conditions blend combos + a curated alt-win list (Approach / Maze's End / Biovisionary / Felidar Sovereign / Helix Pinnacle / Coalition Victory / …) + a commander-damage heuristic (power ≥ 5 + evasion or explicit "commander damage" oracle text). `asMarkdown(card)` renders Discord/Slack-friendly markdown.
- **`src/lib/ruleZeroImage.js`** — `downloadRuleZeroPng(card)` paints the card onto a 768-wide canvas at 2× device pixels (zero deps — pure 2D context, word-wrapping, the existing cream-on-charcoal palette) and triggers a download. The markdown path stays zero-dep regardless.

### UI
- **`RuleZeroModal`** in `Modals.jsx` shows a live-rendered preview of the card, the markdown source in a copy textarea, and three actions in the footer: Copy link (existing share URL), Save PNG (canvas export), Copy markdown.
- **DeckEditor toolbar** gets a `Rule Zero` action button (sparkle icon) right after Export.

### Tests
- **`ruleZero.test.js`** (13 cases): bracket / deck size / flag aggregation; Thoracle + Consultation surfaces as the combo win; Approach of the Second Sun flagged as alt-win; commander damage heuristic on Skithiryx; stax counted from the tag list; commander color identity carried; null deck safe; markdown render; `flagsLine` formatter; multi-win-cond ordering. 338 tests green (up from 325).

## v0.27.0 — Token sheet generator

The Stats tab now lists every token the deck creates with the cards that make them — so you know which dice / cardboard tokens to bring to a game. Token doublers (Anointed Procession, Parallel Lives, Mondrak) are flagged on every row in the accent colour. A "Copy sheet" button drops the whole thing as plain text into the clipboard.

### Library
- **New `src/lib/tokens.js`** with `parseTokensFromOracle(text)`, `extractTokens(deck)`, `extractResources(deck)`, and `tokensAsText({ tokens, resources, deckName })`.
  - Parser walks `create [N] … token(s)` clauses, extracts P/T (`(\*|x|\d+)\/(\*|x|\d+)`), color words, and the subtype block between the P/T and the literal "creature" keyword. Strips trailing `with X` ability clauses and `named Y` flavour text. Falls back to a list of known artifact-token types (Treasure / Food / Clue / Blood / Gold / Powerstone / Map / Incubator / Junk / Shard) when there's no P/T.
  - Doublers detected via a separate regex (`twice that many | double the number of … tokens`) and appended as `doublerSources` to every aggregated token, since they affect every token the deck makes.
  - `extractResources` flags energy / experience / monarch / initiative / day-night / dungeons / Ring tempts you / plot via dedicated patterns so the same printable sheet covers non-token state that's easy to forget at the table.

### UI
- **`TokensSection` in the Stats tab** appears whenever the deck creates any token or interacts with a non-token resource. Each token row shows the canonical label (e.g. `Goblin 1/1 R`) followed by its source-card chips; doubler chips render in the accent color with a `· doubles` suffix. Resources get their own block below the token list.
- Copy button uses `navigator.clipboard.writeText` with a textarea fallback for older browsers; success flips the button text to `Copied ✓` for 1.5 seconds.

### Tests
- **New `tokens.test.js`** (17 cases) — Krenko + Anointed Procession produces Goblin 1/1 R with both as sources (the issue's named acceptance check); Elspeth's Soldier; Treasure parsing; multiple tokens per card; "with abilities" / "named X" trailing-clause stripping; commander counted as a source; sort order (creatures before artifact tokens, alphabetical); non-token resource detection (monarch / initiative / energy / day-night); empty-state copy text. 325 tests green (up from 308).

## v0.26.0 — Pod tracking + game log

Vault now tracks what happens at the table. Create a pod, name the regulars, log games with commander + winner, and per-deck matchup stats (wins/losses vs each opponent commander) surface in the Stats tab. Owner-private — RLS on `pods.owner_id` means nobody but you sees your pods.

### Database (migration `add_pods_tracking`, already applied)
- **`public.pods`** — `(id uuid pk, owner_id uuid fk → auth.users, name text, created_at)`. Index on `owner_id`.
- **`public.pod_members`** — `(id, pod_id fk → pods, user_id? fk → auth.users, display_name)`. `user_id` nullable because not every opponent has a Vault account.
- **`public.games`** — `(id, pod_id fk → pods, played_at, winner_member_id? fk → pod_members, notes?)`. Index on `(pod_id, played_at desc)`.
- **`public.game_decks`** — `(id, game_id fk → games, member_id? fk → pod_members, deck_id? fk → decks, commander_name?, placement?)`. `deck_id` is `ON DELETE SET NULL` so deleting a deck doesn't wipe matchup history; foreign-key indexes on both join columns.
- **RLS** — every table has a single `to authenticated` policy gating on the pod's `owner_id = auth.uid()` via the appropriate chain. Members are display-name only; an opponent appears in your data without consenting to the app.

### Library
- **New `src/lib/pods.js`** — full CRUD: `listPods`, `createPod`, `deletePod`, `renamePod`, `listPodMembers`, `addPodMember`, `removePodMember`, `listGames`, `logGame` (transactional: rolls back the `games` row if the `game_decks` insert fails), `deleteGame`, `gamesForDeck`, `matchupForDeck`. Pure aggregators `aggregateMatchups` + `aggregatePodStats` are split out so the math is unit-testable.

### UI
- **New `PodsPage`** (`src/components/PodsPage.jsx`) — full-page view reached via the new **Pods** link in the homepage footer (signed-in only). List of owned pods with a create form, then per-pod detail showing members (CRUD), an inline game-log form (one row per seat: member picker, optional saved-deck dropdown that auto-fills the commander, free-text commander, free-text notes; winner is its own dropdown), and a chronological game log with delete on each row. Mobile layouts stack vertically so a quick post-game log is well under 30 seconds.
- **`MatchupSection` in the Stats tab** — appears under Land Base when the active deck has a cloud uuid and at least one logged game. Lists opponents by games-played descending with wins-losses-pct on the right.
- **`App.jsx`** gains a `view='pods'` route; `DeckListView` accepts an `onPods` prop and renders the link only when signed-in (Pods are RLS-gated to owners).

### Tests
- New `pods.test.js` (7 cases) covers the matchup aggregator (wins/losses per opponent, commander-name fallback to member display name, sort by games played, deck-not-seated skip, no-winner counted as a loss) and the pod-stats aggregator (winner counts per member, 30-day window). 308 tests green (up from 301).

## v0.25.0 — Decklist import: text paste + Moxfield / Archidekt URLs

The Import Deck modal now accepts a public Moxfield or Archidekt URL directly — paste the link, hit **Fetch →**, and the cards drop into the paste box for review. The text parser is broken out into its own module with explicit sections, and unresolved card names get a "did you mean" picker backed by Scryfall autocomplete.

### Library
- **New `src/lib/deckImport.js`** with `parseTextDecklist(text)` returning `[{ name, count, section }]` where section ∈ `commander | mainboard | maybeboard`. Section tracking walks `Commander` / `Deck` / `Maybeboard` headers (plain or `//`-prefixed), routes `SB:` prefixed lines into the maybeboard, skips `Sideboard` / `Tokens`, and strips MTGA-style `(SET) 123` / `*F*` printing tags. Default section is `mainboard` so a header-less 100-line paste still imports cleanly.
- **URL helpers** `parseMoxfieldUrl`, `parseArchidektUrl`, `detectDeckUrl` extract deck IDs from public URLs. `fetchDeckFromUrl(url)` dispatches to `api2.moxfield.com/v3/decks/all/<id>` or `archidekt.com/api/decks/<id>/`, normalises both response shapes via `shapeMoxfieldDeck` / `shapeArchidektDeck`, and throws a single readable error on network/HTTP failure so the modal can fall back to "paste the list instead".

### UI
- **`ImportDeckModal` overhaul** in `src/components/Modals.jsx`:
  - New "Import from URL" field with a `Fetch →` button. Fetched cards render into the paste box so the user reviews before committing; the deck name auto-fills from the upstream payload when blank.
  - Live preview chip showing `cmdr · main · maybe` counts as the user types or fetches.
  - Unresolved card names show inline "did you mean …" buttons populated by `searchCardAutocomplete`; clicking a suggestion queues a replacement and a second `Import →` press re-resolves with the override applied.
  - The old `parseBlocks` / `parseDecklist` split is replaced by `parseTextDecklist`. `parseDecklist` in `utils.js` stays put — `BulkAddModal` still calls it for the lighter single-section case.

### Tests
- **New `deckImport.test.js`** (23 cases) — every format variant (`1 Card`, `1x Card`, bare names), section headers (`Commander`, `Deck`, `// Commander`, `Maybeboard`, `SB:`), Sideboard / Tokens skipped, MTGA printing tags stripped, alias table applied, empty/non-string input safe, count clamping. Plus URL extraction for both sources, dispatch via mocked `fetch`, and the upstream-error path.
- All 301 tests green (up from 278).
- New `analyzers.test.js` cases: 5-tutor mono-W value deck stays at Bracket 2 (no longer pushed to Bracket 4); Farewell flags as Game Changer; Winota/Urza/Yuriko/Kinnan/Expropriate are no longer Game Changers. All vitest cases pass.

## v0.24.0 — Combo detection (Commander Spellbook)

The Bracket tab now lists every combo the deck has fully assembled — cards, what the combo produces, and the prerequisites to fire it. The Recs tab gains a "Near-miss combos" section that shows lines where the deck has every card but one, with a one-click "Add missing card" button.

### Library
- **New `src/lib/combos.js`** carrying a curated combo index (60+ entries) modelled on Commander Spellbook's schema — each entry has `id`, `cards`, `results`, optional `prerequisites`, and `colors`. The index includes a few 3-card combos (e.g. Persist + Redcap + Seer; Thopter/Sword/Sieve) so the near-miss detector has something to find. `detectCombos(deck)` returns `{ assembled, nearMiss }`; matching is case-insensitive and includes the commander toward the 99. `loadComboIndex()` is async on purpose — a future remote-refresh path (Spellbook via Supabase proxy → IDB cache) can drop in without changing callers.
- **`KNOWN_COMBOS` removed from `src/lib/constants.js`** — `analyzers.js` and `tags.js` import `detectCombos` / `COMBO_INDEX` directly. The `assessBracket` flags object now also carries `comboDetails` (full combo objects) and `nearMissCombos` alongside the existing `combos` string array.
- **`tags.js` "Combo piece" detection** now respects N-card combos: a card is tagged only when every other required card in the combo is also in the deck.

### UI
- **`CombosPanel` in the Bracket tab** lists assembled combos under the flag boxes, showing the card chips, every listed result, and the prereq line.
- **Near-miss combos panel in the Recs tab** shows combos with one missing piece, highlights the missing card in the accent color, and offers a one-click add via the existing Scryfall fetch + `addCardsToDeck` path.

### Tests
- New `combos.test.js` (10 cases) covers Thoracle + Consultation assembly, a 3-card combo missing one card as a near-miss, commander counted toward combo cards, case-insensitivity, scryfall-less card stubs, and schema invariants on the bundled index.

## v0.23.3 — Settings modal QA pass

- **`SettingsRow` now stacks on mobile.** Was a rigid 7/5 grid that wedged controls into a 5-column sliver; long buttons ("Card Kingdom", "Cardmarket (Trend)") overflowed into the description text on desktop and were unreadable on mobile. Below the `sm` breakpoint the label/description and the controls now stack vertically; at `sm+` the same 7/5 grid layout remains.
- **Control rows wrap instead of overflow.** Added `flex-wrap` to the Currency / Buy links / Price source segmented controls and to the Card cache Refresh/Clear pair so they reflow onto a second line rather than crashing into adjacent text. Each button also has `whitespace-nowrap` so individual labels stay on one line.
- **Shortened "Price source" labels.** Was "TCGplayer (Mid)" / "Cardmarket (Trend)"; now just "TCGplayer" / "Cardmarket" with the variant kept in the row description and the tooltip. New `shortVendorLabel(vendor)` helper in `src/lib/pricing.js`.
- **Settings modal scrolls.** Added `max-h-[90vh]` + an internal `overflow-y-auto` wrapper so the modal can't outgrow the viewport on small screens (was getting clipped on phone-height displays); header + footer remain pinned via `shrink-0`.

## v0.23.2 — Nav button now reads "Profile · @handle"

- **`src/components/DeckList.jsx`** — the signed-in nav button (mobile + desktop) that opens the Profile modal now reads "Profile · @handle" instead of "Cloud · @handle". The button has always had `onClick={onProfile}` and `title="View profile"`, so the label now matches the action. No behaviour change.

## v0.23.1 — Bug-report function surfaces the actual GitHub error

The v0.23.0 path failed silently with "Edge Function returned a non-2xx status code" whenever GitHub rejected the call — leaving no way to tell from the UI whether the token was missing, expired, or scoped wrong. The function now returns HTTP 200 with `{ ok: false, error: "GitHub 401: Bad credentials" }` (or similar) on every failure mode, so the modal can render the actual reason instead of the generic supabase-js wrapper. GitHub's error message is parsed out of its JSON response and passed through verbatim.

## v0.23.0 — Bug reports go straight to GitHub, no account required

The v0.14.0 release shipped a Cloudflare-Worker-backed bug submission path, but the deploy step never happened — so prod has been falling back to "Open on GitHub" the whole time, defeating the purpose. This release moves the backend onto Supabase (which Vault already uses) so the path is wired up by default and no third-party account is in the loop.

- **Edge Function `bug-report`** under `supabase/functions/bug-report/`. Holds a fine-grained PAT as a Supabase secret, validates the payload (honeypot, length caps, email format), files the issue under the existing GitHub tracker tagged `bug` + `from-app`. Source committed; deploy is one MCP call (or `supabase functions deploy bug-report`).
- **Modal calls the function unconditionally** when the Supabase client is configured (which it always is in prod). No more `VITE_BUG_REPORT_URL` repo secret to manage. Pure-local builds (no Supabase env) still get the prefilled-GitHub-URL fallback for completeness.
- **Removed `worker/` directory** — superseded by the edge function. Removed the `VITE_BUG_REPORT_URL` env wiring from `vite.config.js` and `deploy.yml`. CSP `connect-src` is unchanged since `*.supabase.co` is already allowed.
- **One-time setup:** paste a fine-grained PAT (Issues: Read and write on this repo only) into Supabase → Edge Functions → Manage secrets as `GITHUB_TOKEN`. After that, every Vault user can file bugs with no GitHub account.

## v0.22.0 — Slim public-gallery queries

The Public Gallery and Latest random rolls strips used to pull the full deck JSON (commander, every card, tags, notes, etc.) for every tile, on every homepage load — anonymous visitors included. At ~5–20 KB per deck × 30 tiles that's a chunk of Supabase egress spent on data nobody renders until they actually click in. This release denormalises the badge stats onto columns and slims the public selects to commander + summary fields only; the full payload is lazy-fetched when the user hits **View** or **Copy → mine**.

### Migration (already applied)
- New columns on `public.decks`: `card_count int`, `bracket int`, `health_score int`. `card_count` backfilled from `data->'cards'` in SQL; `bracket` / `health_score` populate on the next save per deck (legacy rows show no badge until their owner re-saves, which is fine — the card still renders).
- New column on `public.random_rolls`: `card_count int`, backfilled the same way.
- All columns nullable, no indexes — they're rendered, not queried.

### Storage layer
- **`src/lib/storage-supabase.js`** — `deckToRow` now computes the three denorm columns via a new `denormStats(deck)` helper (wraps `assessBracket` / `computeHealth` in try/catch so half-shaped decks still save with NULLs). `saveRandomRoll` writes `card_count` alongside the cards blob.
- `loadPublicDecks` SELECT drops `data` and pulls `commander:data->commander` (PostgREST JSON sub-extract) plus the three new scalar columns. Returns a slim deck shape via new `rowToSlimDeck(row)` — no `cards` array.
- `loadRandomRolls` SELECT drops `cards_data`, pulls `card_count` instead.
- New `loadDeckById(id)` and `loadRandomRollById(rollId)` fetch the full payload on demand. Both rely on the existing "anyone can read public" RLS policies.

### Gallery tiles
- **`src/components/GalleryView.jsx`** — `GalleryCard` reads `deck.bracket` / `deck.health_score` / `deck.card_count` directly from the slim row instead of running the analyzers in the renderer. View and Copy → mine become async — each shows a brief `Loading…` / `Copying…` state while `loadDeckById` hydrates the deck, then hands the fully-shaped object to the parent.
- **`src/components/RandomRollsView.jsx`** — `RollCard` reads `deck.card_count` directly; View / Copy lazy-load via `loadRandomRollById` with the same loading state.

### Note
This is the first change that depends on a denorm column staying in sync with `data`. Any future writer that touches `decks.data` or `random_rolls.cards_data` outside `saveDeck` / `saveRandomRoll` will drift — keep all writes funnelled through those two helpers.

## v0.21.3 — Copy tweaks: "Save settings" + "camera"

- **`src/components/ProfileModal.jsx`** — the Save button outside onboarding now reads "Save settings →" instead of "Save username →". The modal embeds the Preferences body alongside the username field, so "settings" is the more accurate label for what the button is associated with.
- **`src/components/CardScanner.jsx`**, **`src/components/VaultPage.jsx`**, **`src/components/DeckList.jsx`** — user-facing copy and the scanner modal title swap "webcam" for "camera" (matches what mobile users actually have, and reads more naturally on desktop too).

## v0.21.2

- **Landing footer now wraps cleanly on mobile.** The `Backup · Settings · Profile · Vault · Report bug · Tip jar` row was a single non-wrapping flex with `tracking-[0.4em]` letter-spacing — on a phone it overflowed the viewport and pushed the page into horizontal scroll. The button row now uses `flex-wrap` with vertical `gap-y` so links flow onto multiple rows, the separator dots are hidden on mobile (`hidden md:inline`) so wrapped lines don't start with a stray `·`, mobile tracking eases off to `0.3em`, and the affiliate disclaimer is constrained to `max-w-xs` so it wraps mid-sentence rather than running to the edge. Desktop layout is unchanged. (`src/components/DeckList.jsx`)

## v0.21.1 — Theme toggle moves into Settings + Profile

The Sun/Moon/Monitor toggle was crowding the already-busy landing nav. It's now a row inside the Settings modal (footer entrypoint, available to everyone) and — for signed-in users — inside the Profile modal under a new "Preferences" section. Two entrypoints, same body.

- **`src/components/Modals.jsx`** — `SettingsModal`'s body extracted into an exported `<SettingsBody />` so it can be embedded elsewhere without duplicating the rows or the `loadSettings` / `cacheSize` state. `SettingsModal` becomes a thin modal-chrome wrapper. New "Theme" row sits at the top of `<SettingsBody />` and renders `<ThemeToggle />` as the control.
- **`src/components/ProfileModal.jsx`** — embeds `<SettingsBody />` under a "Preferences" header (skipped during onboarding so the username step stays focused). Modal widened from `max-w-md` → `max-w-xl` to fit the settings grid, with `max-h-[90vh] overflow-y-auto` on the body so it scrolls on short viewports. Save button now reads "Save username →" outside onboarding so it's unambiguous which save it triggers (settings rows auto-save on change, as before).
- **`src/components/DeckList.jsx`** — removed `<ThemeToggle />` from both the mobile and desktop landing-nav headers. The toggle is no longer rendered there.

## v0.21.0 — Light mode

Vault now ships with a light theme. On first load the palette follows the OS preference (`prefers-color-scheme`); a small Sun / Moon / Monitor icon in the header lets the user cycle through **System → Light → Dark → System**, with the choice persisted to localStorage. "System" stays live — flipping the OS appearance updates Vault without a reload.

### Light palette
- Warm parchment background `#fdf9ec` with dark sepia ink `#2b1f12`, keeping Vault's bookish identity in daylight. Accent red darkened to `#a8392f` for AA contrast against the cream.
- Dark mode is unchanged — the historical `#0d1614` / `#f3e7c9` / `#c44a3f` triple is the default and what existing users see if they leave the toggle on System with a dark OS.

### CSS variable refactor
- **`src/index.css`** — three base colors are now exposed as CSS custom properties at `:root` (`--bg`, `--ink`, `--accent`), each in both hex (for solid fills) and `r,g,b` form (for the ~165 `rgba(... , α)` literals scattered across the JSX). Light values cascade in via `[data-theme="light"]` (explicit) and `@media (prefers-color-scheme: light)` (when no override is set).
- **`src/theme.js`** — `CREAM`, `CREAM_DIM`, `CREAM_FAINT`, `BG`, `ACCENT` are now `var(...)` / `rgba(var(...), α)` strings rather than hex literals. Every inline `style={{ color: CREAM, ... }}` in the app now reflows automatically when the theme flips.
- Mechanical sweep of `rgba(243,231,201,α)` → `rgba(var(--ink-rgb),α)` and the matching bg / accent triples across every component file (including the new `prefPriceSource` row added in v0.20.0). Tests stay green.
- `color-scheme: light|dark` is set alongside the variables so native form controls and scrollbars track the theme.

### Toggle + persistence
- **`src/lib/themeMode.js`** — owns the `vault:themeMode` localStorage key. Exports `getThemeMode()`, `setThemeMode(mode)`, `applyThemeMode(mode)`, `nextThemeMode(mode)`, `systemPrefersLight()`. Storage access wrapped in a `safeStorage()` guard.
- **`src/components/ThemeToggle.jsx`** — small icon button in the landing header (mobile + desktop). Tooltip names the current state and the next state. While on "System" it listens to `matchMedia('(prefers-color-scheme: light)')` for live OS flips.
- **`src/main.jsx`** applies the persisted choice before React mounts, so users who explicitly picked Light never see a dark flash on load.

## v0.20.1

- **Random-deck roller now respects "Only use cards from my Vault" for the commander itself.** The toggle previously only filtered the 99-card body — the commander was always rolled from the full Scryfall database. New `pickRandomCommanderFromCollection()` in `src/lib/scryfall.js` picks from the user's vault using the same "Legendary Creature" rule the Vault page applies (`vaultStats.js#isLegendaryCreature`), honouring color identity and the partner/background toggle. Empty-match path shows a Vault-specific error so users know to widen their colors or add a commander to their Vault.

## v0.20.0 — Decoupled price source + buy-link

Card Kingdom doesn't publish per-card prices on Scryfall, but v0.18.0 still proxied CK numbers from TCGplayer Mid — which produced totals that disagreed with what users actually paid when they clicked through. Celestine, the Living Saint was the canary: app showed ~£21, CK's actual sell price was materially lower. The buy-link vendor and the price-source vendor are now two separate settings — pick CK as your cart destination, pick TCGplayer or Cardmarket as your price feed, no more pretend-CK numbers.

### Pricing
- **`prefPriceSource` setting** in `src/lib/settings.js` (default `tcgplayer`). Migrates existing users on first load: anyone who had Cardmarket as their buy-link keeps Cardmarket as their source; everyone else (incl. all the default-CK users) lands on TCGplayer.
- **`activePriceSource()` in `src/lib/pricing.js`** reads `prefPriceSource`; `activeVendor()` stays as a back-compat alias. `PRICE_VENDORS` now only lists `['tcgplayer', 'cardmarket']` — Card Kingdom isn't a valid price source anywhere in the app.
- **`cardPriceDetails()` / `deckTotalPrice()`** carry a `buyLink` + `buyLinkLabel` so tooltips can say "Cart icon links to Card Kingdom — actual price there may differ" when the two diverge. The misleading "TCGplayer Mid as an estimate" note is gone; the source is just whichever feed you picked.

### Settings UI
- **Settings → Buy links** drives only the cart icon now. Copy trimmed to match.
- **New Settings → Price source row** with TCGplayer / Cardmarket buttons. Description explains why CK isn't an option.

### Vendor threading (audit)
Vendor was being re-read at call time in several spots, so a setting flip mid-flow could mix sources. Each of these now captures the source once and threads it explicitly:
- **`src/lib/vaultStats.js`** — `computeVaultStats(collection, cardData, decks, currency, vendor)` accepts and threads vendor; both per-card price lookups (`totalValue` and `unusedValue`) use it.
- **`src/lib/autoseed.js`** — `buildSeededDeck` snapshots `activePriceSource()` (or `opts.priceVendor`) at entry so pool prune, swap-loop, and final sweep all quote from the same feed.
- **`src/components/VaultPage.jsx`** — the value-sort and the `computeVaultStats` call both receive the active source; the memo dependencies include it.
- **`src/lib/compare.js`** — `compareDecks` captures the source once and passes it to both `deckTotalPrice` calls.
- **`src/lib/stats.js`** — switched to `activePriceSource()` and now passes `vendor` + `buyLink` into `deckPriceTooltip`.

### Tests
- `pricing.test.js` rewritten for the new model: Card Kingdom as a price source returns null, `PRICE_VENDORS` no longer lists CK, `cardPriceDetails` notes the buy-link when it differs from the source, `deckTotalPrice` returns `buyLink`/`buyLinkLabel`, and the regression that CK-buy-link totals are no longer marked `exact: false` is pinned.

## v0.19.1 — Dim zero labels on bar charts

- Bar-chart labels with a value of zero now render at ~40% opacity instead of full CREAM_DIM, so empty buckets recede and the eye lands on the buckets that actually have data. Applied to the archive bracket distribution, Vault mana curve, deck-editor Stats mana curve, and Probability-tab land distribution.

## v0.19.0 — Engagement-gated tip-jar CTA

The tip jar now nudges itself once, on its own. After the user does something meaningful in a session (creates a deck, rolls one, saves a roll, imports a shared deck) and five minutes have passed, the tip modal opens automatically with a "Maybe later" affordance. Closing it sets a localStorage flag that suppresses the prompt forever on that device; "Maybe later" defers it ~30 days. Supporters and builds with no tip jar configured never see it.

### Prompt state machine
- **`src/lib/tipPrompt.js`** owns the localStorage flags (`vault:tipPrompt:dismissed`, `vault:tipPrompt:remindAfter`, `vault:tipPrompt:shownAt`) and exposes `isPromptEligible({ supporter, tipsConfigured, now })`, `dismissTipPrompt()`, `remindLater(days)`, `markPromptShown()`, `clearTipPrompt()`. Storage access goes through a `safeStorage()` guard so SSR / non-browser callers no-op cleanly.
- **`tipPrompt.test.js`** covers eligibility for tip-jar config, supporter status, dismissal, future / past / malformed remind-after timestamps, and the dismiss-clears-remind / remind-clears-dismiss invariants.

### App wiring
- **`App.jsx`** tracks `engagementAt` (set once per session via `markEngagement()` from `handleCreate` / `handleSaveTransient` / `handleImport` / `onRandomBuild`) and runs a single `setTimeout` for the remaining delay. A `useRef` one-shot (`autoPromptHandled`) prevents re-arming after the user manually opens / closes the tip jar in the same session.
- **`tipState`** gains an `'open-auto'` variant. Auto-prompt closes call `dismissTipPrompt()`; manual closes leave the flags alone. Re-checks eligibility at timer-fire time so a webhook-flipped supporter never sees the modal.

### TipModal copy
- New `autoPrompted` + `onRemindLater` props. Auto-prompted opens render a "Enjoying Vault? You can close this — it won't pop up again unless you ask." lead-in and a left-aligned **Maybe later** button alongside **Close →**.

## v0.18.0 — Vendor-aware pricing

Prices shown across Vault now come from the same retailer you've chosen for buy links — pick TCGplayer and you see TCGplayer Mid; pick Cardmarket and you see Cardmarket Trend in EUR. Card Kingdom doesn't publish per-card prices on Scryfall, so its prices are estimated from TCGplayer Mid and flagged with a `~` prefix everywhere they appear. Every price now has a hover tooltip that explains its source, any FX conversion, and any unpriced cards in the total.

### Pricing
- **Vendor → Scryfall field mapping** in `src/lib/pricing.js`. TCGplayer reads `prices.usd` (foil `usd_foil`, etched `usd_etched`); Cardmarket reads `prices.eur` (foil `eur_foil`); Card Kingdom proxies TCGplayer USD because no Scryfall feed exists. `cardPrice()` and `deckTotalPrice()` accept an explicit `vendor` arg; when omitted they read `prefRetailer` from settings so existing callers stay working.
- **`cardPriceDetails()` + `deckPriceTooltip()`** return rich descriptors with notes the UI joins into multiline `title` tooltips — source vendor, FX conversion direction, foil/non-foil fallback, unpriced-card counts, "change in Settings → Buy links" hint.
- **Scryfall normalize keeps every price field we know how to consume.** Previously `usd_foil`, `usd_etched`, `eur_foil`, `tix` were dropped at cache time to save bytes; vendor switching needs them so they're kept now.
- **Currency × vendor cross-conversion.** Display in any of USD/EUR/GBP regardless of source — €/Cardmarket → $ converts at the bundled FX rate, exact-vendor + matching currency shows the price unmodified.

### Tooltips surfaced
- Card-row prices in `ScryfallSearchPanel` / `CardRowCompact`.
- Deck-editor header cost chip.
- Archive-dashboard "Total value" and per-deck row prices on the landing page.
- Copy-decklist modal price line (now also names the source vendor inline).
- Vault page "Total value", "Foils", "Most valuable", and "Cards on the shelf" stats.

### Settings copy
- "Price currency" description clarifies that crossing source and display currencies is approximate.
- "Buy links" row renamed to **"Buy links & price source"** and explains that Card Kingdom prices are estimated from TCGplayer Mid (no Scryfall feed).

### Out of scope (yet)
- Cheapest-printing lookup per vendor (would need a Scryfall sort-by-price walk on demand). For now we use the printing already on the card; the tooltip notes vendor mapping but doesn't yet hunt for the lowest variant.
- Card Kingdom direct pricing — no public per-card price API; would need scraping.

## v0.17.1 — PayPal webhook operator README

- `supabase/functions/paypal-webhook/README.md` — step-by-step setup for the PayPal Business app, hosted Donate button, webhook subscription, Supabase secrets, sandbox test, and flip-to-live. Plus a quick "how it works" + debugging crib for the three most common failure modes (every webhook 400s, badge doesn't flip, CSP blocks the SDK).

## v0.17.0 — Auto-supporter badge (PayPal Donate SDK + webhook)

Tips now flip the supporter badge automatically. The TipModal renders PayPal's in-page Donate button when the build is configured for it AND the user is signed in (so the tip can be attributed to a Supabase user_id). PayPal posts to a new edge function on completion; the function verifies the signature, checks idempotency, and flips `supporter=true` for the right user.

### Edge function (`supabase/functions/paypal-webhook/`)
- Reads the raw POST body, parses headers, calls PayPal's `verify-webhook-signature` endpoint (using a cached OAuth client-credentials access token).
- Inserts the `event_id` into `paypal_events` for idempotency — PayPal redelivers webhooks freely; the primary-key conflict on duplicates short-circuits without double-incrementing the cents total.
- On verified `PAYMENT.SALE.COMPLETED` with a `resource.custom = <user_id>`, updates `profiles`: `supporter = true`, `supporter_total_cents += amount`, `supporter_since = coalesce(supporter_since, now())`. Service-role write — the trigger added in v0.15.0 bypasses for the service role.
- Anonymous tips (no `custom` field) and other event types are recorded in `paypal_events` for accounting but don't flip any badge. All paths return 200 unless the signature failed (400) or a DB error happened (500).
- Deployed as `paypal-webhook`, `verify_jwt: false` (PayPal can't send a Supabase JWT — auth happens via the signature verify call).

### Client
- **`src/lib/billing.js`** gains `loadDonateSdk()` (lazy script-tag loader) + `renderDonateButton(container, { userId })` (mounts the SDK button with `custom = userId` so the webhook can attribute). Two new tests cover `hasDonateButton` truthy / unconfigured cases.
- **TipModal** now picks the path at render time: SDK button when `VITE_PAYPAL_BUTTON_ID` is set AND the user is signed in; PayPal.Me fallback otherwise (with a "sign in for auto-badge" hint when the button ID is set but the user isn't signed in).
- **`?tip=thanks` URL handler** in `App.jsx` now also re-fetches the profile after a 3s delay so the badge appears without a manual reload once the webhook lands.

### Config
- **CSP** in `vite.config.js` allowlists `https://www.paypalobjects.com` (script + image), `https://www.paypal.com` + `https://www.sandbox.paypal.com` (XHR + iframe + form-action). Dev-mode HMR unaffected — the policy is build-only.
- **`.env.example`** documents `VITE_PAYPAL_BUTTON_ID`, `VITE_PAYPAL_ENV`, and the edge-function secrets (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV` — set via `supabase secrets set`, not the Vite build).

### Operator setup (one-time)
Before the auto-flow actually fires:
1. Create a PayPal Business app → grab `client_id` + `client_secret`.
2. Create a Hosted Donate button in the PayPal dashboard → grab the button ID, set `VITE_PAYPAL_BUTTON_ID`.
3. Create a webhook subscription pointing at the deployed function URL, subscribed to `PAYMENT.SALE.COMPLETED` → grab the webhook ID.
4. `supabase secrets set PAYPAL_CLIENT_ID=… PAYPAL_CLIENT_SECRET=… PAYPAL_WEBHOOK_ID=… PAYPAL_ENV=sandbox` (then `live` when ready).
5. Test with a sandbox tip; flip `PAYPAL_ENV=live` and re-test with a real one.

## v0.16.0 — Tip jar

A new **Tip jar** link in the footer opens a small modal with preset $3 / $5 / $10 PayPal buttons (plus a custom amount). Each opens PayPal.Me in a new tab where the tipper completes payment. Tips land in Vault's PayPal account; the supporter badge added in v0.15.0 is flipped manually for now — the auto-attribution webhook lands in the next slice.

- **PayPal.Me-based, zero infrastructure.** No SDK loaded, no CSP changes, no webhook yet. `VITE_PAYPAL_ME_URL` at build time enables the modal; without it, the footer link still shows but the modal explains tipping isn't configured for that build.
- **`?tip=thanks` URL handler.** Returning to the app with this query param auto-opens the modal in a "thanks" state. Wired in `App.jsx` against the existing URL-cleanup pass so the param is consumed and the address bar stays clean. PayPal.Me doesn't redirect today; the handler is ready for the Donate-SDK return URL that lands in the next slice.
- **Cardmarket EU referral CTA inside the modal.** Because Cardmarket attribution only happens at signup (no per-URL affiliate exists), the modal also surfaces the referrer username with a click-to-copy pill + "Open Cardmarket signup →" link — the only place in Vault that referral can actually convert.
- **`src/lib/billing.js`** with `paypalMeUrl(amount)`, `hasTipJar()`, and `TIP_PRESETS`. Eight unit tests cover URL construction, trailing-slash normalisation, integer flooring, and unconfigured-build fallback.

## v0.15.0 — Supporter badge foundation

The plumbing for a "supporter" badge that will eventually be flipped automatically when someone tips via PayPal. **No tip jar yet** — that lands in the next slice. This release adds the data shape, the badge component, and renders it next to handles in the Public Gallery, Latest Random Rolls, and the Cloud · @handle button in the nav.

### Schema
- **`profiles`** gains four columns: `supporter` (boolean, default `false`), `supporter_since` (timestamptz, nullable), `supporter_total_cents` (integer, default `0`), `pref_retailer` (text, default `'cardkingdom'`, constrained to `cardkingdom|tcgplayer|cardmarket`).
- **`paypal_events`** new table with one row per processed PayPal webhook — primary-key idempotency so redeliveries can't double-count tips. RLS on with no policies → only the service role (the future webhook edge function) can touch it.
- **Trigger guards the supporter columns.** A `BEFORE INSERT OR UPDATE` trigger on `profiles` blocks the authenticated/anon roles from writing `supporter`, `supporter_since`, or `supporter_total_cents`; the service role (used by the PayPal webhook) is exempted. Verified end-to-end: a self-promotion attempt from the JS client gets `42501 supporter columns are read-only from the client`; legitimate `pref_retailer` updates pass through.

### UI
- **`<SupporterBadge />`** new component in `UI.jsx` — small filled heart in the accent colour next to a handle, with a "Supporter — thanks for keeping Vault running" tooltip.
- **Public Gallery + Latest Random Rolls** show the badge next to the owner handle when `ownerSupporter === true`. The two `loadPublicDecks` / `loadRandomRolls` queries now select `profiles.supporter` alongside `username`.
- **Cloud · @handle nav button** (mobile + desktop) renders the badge next to your own handle when your profile has `supporter = true`. App-level state now holds the loaded profile so any component down the tree can read it.

### Not in this release
- No way to actually become a supporter yet — the PayPal Donate button lands in the next slice. For now, flipping `supporter = true` on a row in Supabase Studio is the only way to make the badge appear.
- `pref_retailer` exists in the cloud profile but isn't yet synced to local Settings. Retailer preference still lives in localStorage. Sync lands when there's a reason to (e.g. a second device).

## v0.14.1 — Vault-only roll respects front-face names

- **DFC / adventure / split cards now match the Vault correctly when "Only use cards from my Vault" is on.** Scryfall returns these with the canonical `"Front // Back"` name (e.g. `Bonecrusher Giant // Stomp`), but Moxfield CSV imports and hand-typed Vault entries usually store only the front face (`Bonecrusher Giant`). The strict-equality filter was dropping every owned DFC from the pool, leaving the deck to short-fall into basics and look like the toggle wasn't working. The ownership check now falls back to the front-face name when the canonical name has a `//` in it, so Vaults populated from CSV imports work the same as ones drag-loaded from Scryfall. Same fix applied to the per-card-budget bypass and the budget-swap-skip checks so owned DFCs stay free of those gates too.

## v0.14.0 — Bug reports submit directly (no GitHub account needed)

The in-app bug reporter previously dumped users on GitHub's "Sign in to file an issue" wall — most users don't have an account, so reports dried up. The form now POSTs straight to a tiny Cloudflare Worker that files the issue on the user's behalf and returns the issue URL. No reporter account required; reports land in the same GitHub tracker as before.

- **New submit flow.** When `VITE_BUG_REPORT_URL` is configured at build time, **Submit bug** sends the report to the Worker and shows a success state inline with a link to the filed issue. If the env var isn't set, the modal silently falls back to the old prefilled-GitHub-URL behaviour.
- **Optional email field.** Reporter can leave an address if they want a reply; appended as an issue footer. Empty = anonymous.
- **`File on GitHub →` secondary link** kept in the modal footer for users who'd rather track the issue under their own account.
- **Honeypot field** (hidden `website` input) drops bot submissions before they reach GitHub.
- **Worker source** lives under `worker/` with its own `wrangler.toml` and README. Holds a fine-grained PAT (Issues: write, single repo) as a secret — the token never ships to the browser. CORS allowlist + CSP `connect-src` are configurable via env so prod can lock to a specific origin.
- **`buildBugReportBody`** extracted to `src/lib/bugReport.js` with seven unit tests covering section toggling, env block contents, and whitespace handling.

## v0.13.0 — Affiliate buy links

A small cart icon now sits next to the price on every card row. Click it to open the card on your chosen retailer in a new tab — Card Kingdom by default, with TCGplayer and Cardmarket selectable in **Settings → Buy links**.

- **Retailer picker in Settings.** Card Kingdom (default), TCGplayer, or Cardmarket. Stored in localStorage; signed-out users get the same options.
- **Card Kingdom + TCGplayer links are affiliate.** Vault earns a small commission on purchases that flow through them; you pay the same price. Cardmarket links are plain — Cardmarket's referral program only attributes at signup, not via URL, so the buy link there is unmodified.
- **Footer disclosure** added so the affiliate relationship is up-front: _"Buy links are affiliate — we earn a small commission at no extra cost to you."_
- **Env-var based, fail-soft.** If the affiliate codes (`VITE_CARDKINGDOM_PARTNER`, `VITE_TCGPLAYER_IMPACT_PREFIX`, `VITE_CARDMARKET_REFERRER_USERNAME`) aren't set at build time, the buy links still work — they just lose attribution.

## v0.12.0 — In-app bug reporting

- **Report bug** link in the footer opens a small in-app form (title, what went wrong, optional repro steps). Submit kicks the user out to a pre-filled new-issue page on GitHub, tagged `bug`, with app version, browser user-agent, and current URL appended (toggleable). No backend, no secrets — the user clicks **Submit new issue** on GitHub to actually file it.
- **Dropped the "MIT" and "Open Source" labels** from the site (footer chip + hero subtitle). Hero now reads "For Commander"; footer chip is just `Vault · vX.Y.Z`.

## v0.11.3 — Code-review fixes

A round of correctness and efficiency cleanups surfaced by a deep code review. No new features.

- **Drag-to-Vault now reports its own failures.** A drop that failed on the Supabase side (RLS reject, transient 5xx, expired session) used to silently look like success — the homepage strip refreshed but the card never landed. The drop overlay now throws on a null write so the error toast actually fires.
- **Random-roll publish errors are visible.** The "share to gallery" snapshot was fire-and-forget; if it failed (offline, schema drift) the deck still opened in the editor and the user had no idea the gallery copy hadn't been written. Now the modal shows a "saved locally — couldn't publish" banner.
- **`avgValue` on the Vault page used the wrong denominator** — divided priced cards by all owned copies (including unresolved-Scryfall entries), so a half-loaded vault read as half its real per-card average. Now uses the priced-copy count.
- **Random-deck summary misclassified overflow cards.** Ramp/draw/removal pieces that spilled into the post-priority overflow fill all reported as `other` strategy — the modal's `ramp X, draw Y, removal Z` line now reflects what's actually in the deck.
- **Snow-Covered basics are now recognised** by the autoseed budget swap + safety-trim loops, so they no longer slip into "expensive non-basic" candidate lists and their removal correctly decrements `summary.basics`.
- **Bulk-add to Vault is now one batched upsert** instead of one round-trip per card. Pasting 60 cards was ~120 sequential round-trips (~18s); now it's one read + one upsert.
- **Restoring a backup runs deletes / saves in parallel** instead of awaiting each one sequentially, so a 20-deck restore over Supabase no longer freezes the tab for ~6 seconds.
- **`currentUserId() === null` no longer silently runs queries against `user_id = null`.** Every cloud-path Vault call (load, add, set quantity, bulk import, clear, set meta) now guards on the id resolving — a transient session expiry returns an empty result instead of looking like an empty inventory.
- **Local-fallback `bulkImportVault` clamps `quantity` to `Math.max(1, count | 0)`** to match the Supabase path, so a corrupted CSV can't store negative or zero quantities in localStorage.

## v0.11.2 — Security hardening for public launch

- **`deleteDeck` now binds the delete to the authenticated owner_id.** Previously the call ran `.delete().eq('id', id)` and relied entirely on Supabase RLS to reject cross-tenant deletes. Same defense-in-depth shape as `loadDecks` / `saveDeck`, so an accidental RLS policy widening can't be exploited from the client.
- **Content-Security-Policy meta tag in the production build.** Locks scripts to `'self'`, allows only the origins the app actually contacts (Supabase REST + realtime, Scryfall, EDHREC, weserv.nl, Google Fonts), and disallows `object-src` entirely. Injected via a `apply: 'build'` Vite plugin so dev-mode HMR (which needs `'unsafe-eval'`) is unaffected.

## v0.11.1 — Hero cycle: dots + always-cycle

- **Position dots under the hero.** Small click-to-jump indicators show which of the four taglines is active and let you skip ahead.
- **Reduced motion no longer kills the rotation.** `prefers-reduced-motion: reduce` was silently turning the whole cycle off for anyone with macOS Reduce Motion enabled — only the first entry ever showed. Reduced motion now drops the 600ms crossfade + 8px slide (content swaps instantly) but the rotation itself keeps running. The listener is live, so toggling the OS setting takes effect without a reload.

## v0.11.0 — Cycling hero copy

The landing-page hero now cycles between four taglines, each leading with a different USP the previous single-headline didn't quite earn space for:

- **From 200 maybes to 99 keepers.** — the original anchor.
- **Roll a deck from your shelf.** — the random builder + Vault-only mode.
- **Bracket-scored, before they ask.** — auto WotC bracket assessment from oracle text.
- **1,000 opening hands, run before you sleeve.** — hypergeometric opener math.

Each entry crossfades + slides 8px every 7 seconds with a 600ms transition. CSS grid stacking keeps the section the height of the tallest entry so the page below doesn't shift between cycles. Pauses on hover; respects `prefers-reduced-motion` (no cycle, first entry only).

## v0.10.2 — Homepage Vault layout + printing picker fix

- **Search / Open Vault buttons now sit inline with the copy** instead of squeezed to the right of the recent-cards strip. Recently-added cards now span the full width of the container — up to 10 across at md, 12 across at lg, so all 12 thumbnails usually fit on a single row.
- **Change Art modal now sits above other cards.** The printing picker was rendered inside the VaultCard wrapper, which has `isolation: isolate` (for the foil overlay) — that created a stacking context the modal couldn't escape, so neighbouring cards in the inventory grid bled on top of it. Now rendered via a React portal on `document.body`.

## v0.10.1 — Homepage QA polish

- **Removed leftover `3.` prefix** on the homepage Archive section header. It was a holdover from an older numbered-section layout — the four action tiles still go 1→4, but the Archive section (like Vault, Latest Rolls, Public Gallery) is no longer in that sequence.
- **Tightened drag-from-Scryfall copy** on the homepage Vault strip and the Vault page empty state, matching the wording used elsewhere ("Scryfall" instead of "scryfall.com tab" / "scryfall.com").

## v0.10.0 — Vault is now its own page (with stats)

The Vault graduates from a modal to a first-class page, sitting beside Decks. Same add / paste / scan / search affordances, plus a dashboard built for actually looking at a 1000-card inventory.

### Features
- **Dashboard.** Tiles for unique / total / total value / foil count, then four breakdown panels: colour distribution (W/U/B/R/G + multicolor + colourless), type distribution, mana curve (spells only — lands excluded), and rarity. A *Top sets* strip surfaces the sets you've collected most heavily.
- **Most valuable.** Top 12 cards by single-copy price, with set name, quantity, foil flag, and total-value line for multi-copies. Handy for trade reference.
- **Deck coverage.** For every saved deck, what percentage of its 100 slots you already own. Click a row to open the deck — its missing cards are still surfaced via the existing "to buy" math on the deck page.
- **Buildable commanders.** Every legendary creature in your Vault, sorted by colour-identity size so the deepest builds appear first. The deck roller's "Vault-only" toggle picks from these.
- **Cards on the shelf.** Surface unique cards in the Vault that aren't in any saved deck (excluding basics) — and how much that unplayed value totals to. One-click "Show me →" filters the inventory grid to just those.
- **Inventory filters.** Filter by type (creature / instant / sorcery / artifact / enchantment / planeswalker / land), colour (W/U/B/R/G + multicolour + colourless), or "unused only". Sort by recent / name / value / quantity. Grid and list views.
- **Cleaner homepage strip.** The Art / Foil overlay buttons are hidden on the landing-page Vault thumbnails — picking printings and cycling foils belongs on the full Vault page. Remove (×) still available on hover for quick deletes.

### Internals
- New `src/lib/vaultStats.js` — pure, tested. 8 unit tests cover empty collections, foil tracking, deck coverage, unused exclusions, buildable-commander filtering, the lands-out-of-CMC rule, and the multicolor/colourless bucketing.
- `rarity` added to the normalized Scryfall card cache so the rarity histogram has data. Existing cached cards fill in as they're re-resolved (no breakage).
- `CollectionModal.jsx` deleted. `App.jsx` now has a `view` state ('landing' | 'vault'); the footer "Vault" link and the landing "Open Vault →" button switch to the page rather than opening a modal.
- Landing-page copy updated: "Manage Vault →" → "Open Vault →", and the empty-state hint mentions the new stats page.

## v0.9.3 — Vault-only roller: visibility + diagnostics

- **Visible warning** in the Roll modal when the Vault filter cut the EDHREC pool down to under 10 cards. Without this you got a deck of mostly basics with no explanation. Now the modal says "Vault filter matched only N of EDHREC's top cards for ... try widening your Vault or turning the filter off."
- **Always-on filter** — when ownedOnly was checked but `collection` happened to be null (race on modal open), the filter was silently skipped and you got an EDHREC deck. Now the filter always runs; null collection = empty Vault = filter rejects everything, with a console warn.
- **Auto-seed attribution** now mentions Vault-only mode and the Vault size, so the deck Notes record which configuration produced the deck.
- New summary fields `ownedPool` and `vaultSize` from `buildSeededDeck` so the UI can surface diagnostics.
- `[autoseed]` console logs report `before → after` counts so failures can be diagnosed from the browser console.

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
