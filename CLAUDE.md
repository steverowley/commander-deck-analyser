# Vault — project notes for Claude

What this session needs to know to pick up without re-reading old chat history.

---

## What Vault is

A Magic: The Gathering Commander deck builder. Built as a Vite + React + Tailwind SPA, deployed to GitHub Pages via Actions, with a Supabase backend (auth, sync, public gallery). The big features shipped to date:

- **Deck editor** — Cards / Packages / Stages / Recs / Stats / Bracket / Probability tabs. Auto-tags cards from oracle text, classifies archetype, scores legality + bracket + curve-aware health, simulates 1000 openers, recommends adds & cuts via EDHREC.
- **Vault** (collection inventory) — owned cards with per-card foil + printing overrides; backed by `public.collection` jsonb-meta column when signed in, localStorage otherwise. Manage Vault modal has a Grid + List view. Homepage strip shows recent cards as thumbnails with `×N` badges.
- **Random-deck roller** — pick colors / bracket / budget / archetype, optional "Only use cards from my Vault". Builds 99 cards via EDHREC then enforces curve-aware land target, ramp/draw/removal minimums, basics for non-utility land slots, total-budget swap loop. Rolled decks open transient (id `roll:<ts>`) — only saved to archive via a "Save to my archive" banner button. Snapshots written to `public.random_rolls` for the Latest Random Rolls homepage section.
- **Scryfall search + drag/drop** — internal search panel reachable from a homepage tile + editor action. `GlobalDropOverlay` mounted at app root catches external drags from `scryfall.com` tabs and from local `.csv` files, lights up full-window drop zones (Add to Vault / Add to active deck). Card URLs resolved via `lib/scryfall.js#resolveScryfallUrl`; CSVs routed to `lib/csvImport.js#parseMoxfieldCsv` → `lib/collection.js#bulkImportVault`.
- **Public Gallery** + **Latest Random Rolls** — landing-page sections fed by `loadPublicDecks` and `loadRandomRolls`. Cards styled identically (commander thumb, badges, `@user · 5m ago`, View / Copy → mine).
- **Profile** — first-sign-in onboarding for username; editor reachable from the `Profile · <handle>` button. Username uniqueness at DB level via `public.profiles`.

Current version: tracked in `package.json` (the `version` field) — read it there rather than trusting a number hardcoded here. Bump per the rules below.

---

## Release discipline

Bump `package.json` + add a CHANGELOG entry on **every** shippable PR. The version chip on the landing page hover-displays the changelog, so it has to track main.

- Bug-fix-only PR: patch bump (e.g. `0.39.0 → 0.39.1`), one bullet under the latest section.
- Feature PR: minor bump (e.g. `0.39.x → 0.40.0`), new section with categorised bullets.

Work on a feature branch off `main` (e.g. `feat/<short-description>`, or the session's `claude/*` branch) and open a PR — `main` is protected, so nothing lands without one. PRs are **squash-merged**, so each PR becomes a single commit on `main`; start the next branch fresh from the updated `main` rather than reusing or rebasing an old one.

---

## Testing + build before push

- `npm test` (Vitest) — **542 passing** as of v0.53.0 (autoseed invariants, pricing, landbase, tags, csvImport, toast/confirm buses, router, vault-migration merge, etc.); the full suite must be green. Use Node 22+ locally (the Supabase realtime client needs a native `WebSocket`, which Node 20 lacks). `changelog.test.js` pins the CHANGELOG top section to `package.json`'s version — bump both together or the suite fails.
- `npm run build` (Vite) — verifies the prod bundle compiles.
- Both must be green locally; CI re-runs them. If a CI run is fast (<30s) and the diff is small, "merge when ready" is your cue to act on the green webhook.

---

## Data flow quick reference

- `src/lib/storage.js` — local-only deck storage (localStorage).
- `src/lib/storage-supabase.js` — cloud deck storage. `loadDecks` MUST filter `.eq('owner_id', userId)` because RLS has an "anyone can read public decks" policy AND an "owner can do anything" policy — a bare select returns every public deck across all users.
- `src/lib/collection.js` — the Vault. `meta jsonb` column on `public.collection` holds per-card `{ printing_id, foil }`. `bulkImportVault` dedupes by `lc(name)` before upserting (Moxfield CSVs can have duplicates that reject the whole chunk).
- `src/lib/autoseed.js` — random-deck build pipeline. Order: EDHREC pool → banned-card filter → bracket exclusions → per-card budget cap → ownedOnly filter (always runs when `ownedOnly` is true, even with null collection) → archetype boost → bucket fill (`utilityReserve(colorCount)` cap on nonbasic lands) → overflow fill (EXCLUDING lands) → basic-land padding → total-budget swap loop → safety trim to 99.
- `src/lib/profile.js` — `public.profiles` upsert. Username uniqueness enforced at DB level; `23505` maps to "already taken".
- `src/lib/csvImport.js` — Moxfield collection CSV parser + exporter. `detectMoxfieldCsv(text)` matches the canonical header; `parseMoxfieldCsv` returns `[{ name, count, foil, set, collectorNumber }]`; `collectionToMoxfieldCsv(collection)` round-trips back out.

### Shared UX systems (added in the v0.41–v0.53 UX-hardening run — use these, don't reinvent)

- `src/lib/toast.js` + `<ToastHost/>` (App root) — global feedback bus. `toast(msg)`, `toast.success`, `toast.error`, optional `{ action: { label, onClick } }` (e.g. Undo). Surface EVERY user-triggered write failure through this; never `console.warn`-only.
- `src/lib/confirm.js` + `<ConfirmHost/>` (App root) — `await confirmDialog(msg, { confirmLabel })` replaces `window.confirm` everywhere. Falls back to `window.confirm` when no host (tests). Don't reintroduce native dialogs.
- `src/lib/router.js` — hash router (`#/deck/:id`, `#/vault`, `#/pods`, `#/gallery[/:id]`, `#/rolls`, `#/roll/:id`). App.jsx holds two one-way syncs (hash→state on hashchange/popstate, state→hash on navigation) with equality guards. Routes start `#/`; legacy `#d=` share links parse to null and bypass it. Transient `roll:`/`view:` ids are NOT routable (`isRoutableDeckId`).
- `useEscapeClose(onClose, enabled)` in `UI.jsx` — the modal-behavior hook (Esc close, focus restore to opener, Tab trap in topmost `[aria-modal]`). Every modal wrapper carries `role="dialog" aria-modal="true"`. New modals must use both.
- Deck editor undo — `DeckEditor.jsx` keeps a 30-deep pre-change snapshot stack; Ctrl/Cmd+Z restores exact prior states (NOT swap-log replay). Restored snapshots get a fresh `updated` so the `saveDeck` conflict guard (5-min staleness check in `storage-supabase.js`) doesn't misfire.
- First-sign-in migration covers decks AND the Vault collection (separate per-account flags `vault:migrated:` / `vault:collectionMigrated:`); collection merge is `max(local, cloud)` via `mergeVaultQuantities` — retry-safe, never sums. `uploadLocalDecks` THROWS on failure (returning 0 once caused local decks to be cleared after a failed upload — don't regress this).
- Unsaved rolls are backed up to `vault:lastRoll` (single slot) with a Resume/Discard banner on next load.

---

## Supabase tables

| table | purpose | RLS |
| --- | --- | --- |
| `public.decks` | user-owned decks; `data jsonb` carries the full deck object | owner-anything, anyone-read-public — **MUST filter on `owner_id` in app-side selects** |
| `public.collection` | Vault entries `(user_id, card_name, quantity, added_at, meta jsonb)` | owner read+write only |
| `public.random_rolls` | snapshot of rolled decks (commander, cards, seed_meta) | anyone read, owner insert+delete; `owner_id` is `ON DELETE SET NULL` so deleted accounts don't wipe history |
| `public.profiles` | `(user_id, username, supporter, supporter_since, supporter_total_cents, pref_retailer)` | **owner-only** read + upsert. Public/other-user contexts read the `public.public_profiles` view (`user_id, username, supporter` only) — NEVER the base table, so the money columns stay private. The PayPal webhook writes the supporter columns via the service role (bypasses RLS); a trigger blocks client writes to them |
| `public.public_profiles` | view = `select user_id, username, supporter from profiles` | `select` granted to `anon` + `authenticated`; the safe public projection the gallery joins against |

Supabase MCP tools are available — use `apply_migration` for DDL, `execute_sql` for diagnostics.

---

## Drag-and-drop drop zones

`GlobalDropOverlay` is mounted at the app root and listens at document level for any drag. On enter it pops a full-window overlay with two big drop zones (**Add to Vault** + **Add to active deck**), so users can't miss the target.

Three drop sources, all accepted on both zones:

1. **Internal panel drag** — `application/x-vault-card+json` (`SCRYFALL_DRAG_MIME`) from `ScryfallSearchPanel`. Fast path.
2. **External drag from scryfall.com** — `text/uri-list` / `text/plain` / `text/html` (parsed for `src=` / `href=`). Passed to `resolveScryfallUrl()` → `/cards/<uuid>` or `/cards/<set>/<collector>`.
3. **Local file drop** — `dataTransfer.files`. `.csv` files routed to `parseMoxfieldCsv` → `bulkImportVault`.

`drag*` handler quirks:
- Cross-origin drags hide `dataTransfer.types` on `dragenter`/`dragover` (Chrome/Safari security). Don't gate activation on `types.includes(...)` — always `preventDefault()` on `dragover`, decide at drop time.
- Document-level `drop` also `preventDefault()`s so a stray drop doesn't navigate the browser to the image URL.
- Depth counter for `dragenter`/`dragleave` handles Chrome's fires-on-every-child quirk.
- Factory handlers must be **synchronous functions returning async handlers** — `const f = (target) => async (e) => {...}`. Writing the outer as `async` returns a Promise to React's `onDrop` and drops silently no-op.

---

## Vault freshness — `collectionRev`

`App.jsx` keeps a `collectionRev` counter that's bumped after every external mutation (drop, modal close, CSV import). `DeckListView` watches it as a `useEffect` dep for `loadCollection()`. **Always bump it** when adding a new collection write path or the homepage Vault strip goes stale.

---

## Don't

- Don't call `retag()` in PackagesTab or any read-only view. `retag` strips manually-added auto-tag overrides (e.g. user-added `Ramp` on a card whose oracle text doesn't match the patterns). Tags are maintained at write-time via `addCardsToDeck` / `setCardCount`.
- Don't reintroduce custom CSS cursors. Tried multiple iterations (quill, V-seal, MTG card, classic arrow) — none stuck. OS defaults are the floor.
- Don't auto-publish rolled decks into the user's archive. They open as a transient session (`viewingDeck` slot, `id: 'roll:<ts>'`). User has to explicitly hit **Save to my archive →** in the editor banner to keep one.
- Don't strip the `owner_id` filter from `loadDecks`. That's the leak that put strangers' decks in your archive.
- Don't read other users' rows from `public.profiles`, and don't re-add an "anyone can read" policy to it. The base table is owner-only; gallery / other-user reads MUST go through the `public_profiles` view (`user_id, username, supporter` only). A bare read of `profiles` would leak `supporter_total_cents` + account UUIDs.
- Don't write an `async (target) => async (e) => ...` drop-handler factory. The outer async makes the factory return a Promise and `onDrop` becomes a no-op.

---

## Recent gotchas pinned by tests

- 99-card invariant in `autoseed.test.js` — three scenarios assert `totalCount(cards) === 99`.
- Banned-card filter always runs (even at bracket 5).
- Bracket ≤ 2 drops `HIGH_POWER_TAGS` (Game Changer / Combo piece / MLD / Extra Turn / Stax piece).
- Total budget enforced via post-build basic-swap loop, not just per-card cap.
- `csvImport.test.js` covers Moxfield header detection, count/foil mapping, commas in quoted names, escaped doubled-quotes.
- `pricing.test.js` pins `ownedTotal` / `toBuy` arithmetic with a collection arg.
