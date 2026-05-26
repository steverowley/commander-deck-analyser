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
- **Profile** — first-sign-in onboarding for username; editor reachable from the `Cloud · <handle>` button. Username uniqueness at DB level via `public.profiles`.

Current version: **v0.9.3**. Bump per the rules below.

---

## Release discipline

Bump `package.json` + add a CHANGELOG entry on **every** shippable PR. The version chip on the landing page hover-displays the changelog, so it has to track main.

- Bug-fix-only PR: patch bump (`0.9.3 → 0.9.4`), one bullet under the latest section.
- Feature PR: minor bump (`0.9.x → 0.10.0`), new section with categorised bullets.

All work on `claude/youthful-brahmagupta-mQLkb`. After each squash-merge, rebase the branch onto `origin/main` before opening the next PR — the previous unsquashed commits will conflict otherwise:

```
git fetch origin main
git rebase --onto origin/main <last-commit-already-on-main>
git push --force-with-lease origin claude/youthful-brahmagupta-mQLkb
```

---

## Testing + build before push

- `npm test` (Vitest) — currently **184 passing** (autoseed invariants, pricing, landbase, tags, csvImport, etc.).
- `npm run build` (Vite) — verifies the prod bundle compiles.
- Both must be green locally; CI re-runs them. If a CI run is fast (<30s) and the diff is small, "merge when ready" is your cue to act on the green webhook.

---

## Data flow quick reference

- `src/lib/storage.js` — local-only deck storage (localStorage).
- `src/lib/storage-supabase.js` — cloud deck storage. `loadDecks` MUST filter `.eq('owner_id', userId)` because RLS has an "anyone can read public decks" policy AND an "owner can do anything" policy — a bare select returns every public deck across all users.
- `src/lib/collection.js` — the Vault. `meta jsonb` column on `public.collection` holds per-card `{ printing_id, foil }`. `bulkImportVault` dedupes by `lc(name)` before upserting (Moxfield CSVs can have duplicates that reject the whole chunk).
- `src/lib/autoseed.js` — random-deck build pipeline. Order: EDHREC pool → banned-card filter → bracket exclusions → per-card budget cap → ownedOnly filter (always runs when `ownedOnly` is true, even with null collection) → archetype boost → bucket fill (`utilityReserve(colorCount)` cap on nonbasic lands) → overflow fill (EXCLUDING lands) → basic-land padding → total-budget swap loop → safety trim to 99.
- `src/lib/profile.js` — `public.profiles` upsert. Username uniqueness enforced at DB level; `23505` maps to "already taken".
- `src/lib/csvImport.js` — Moxfield collection CSV parser. `detectMoxfieldCsv(text)` matches the canonical header; `parseMoxfieldCsv` returns `[{ name, count, foil, set, collectorNumber }]`.

---

## Supabase tables

| table | purpose | RLS |
| --- | --- | --- |
| `public.decks` | user-owned decks; `data jsonb` carries the full deck object | owner-anything, anyone-read-public — **MUST filter on `owner_id` in app-side selects** |
| `public.collection` | Vault entries `(user_id, card_name, quantity, added_at, meta jsonb)` | owner read+write only |
| `public.random_rolls` | snapshot of rolled decks (commander, cards, seed_meta) | anyone read, owner insert+delete; `owner_id` is `ON DELETE SET NULL` so deleted accounts don't wipe history |
| `public.profiles` | `(user_id, username)` | anyone read, owner upsert |

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
- Don't write an `async (target) => async (e) => ...` drop-handler factory. The outer async makes the factory return a Promise and `onDrop` becomes a no-op.

---

## Recent gotchas pinned by tests

- 99-card invariant in `autoseed.test.js` — three scenarios assert `totalCount(cards) === 99`.
- Banned-card filter always runs (even at bracket 5).
- Bracket ≤ 2 drops `HIGH_POWER_TAGS` (Game Changer / Combo piece / MLD / Extra Turn / Stax piece).
- Total budget enforced via post-build basic-swap loop, not just per-card cap.
- `csvImport.test.js` covers Moxfield header detection, count/foil mapping, commas in quoted names, escaped doubled-quotes.
- `pricing.test.js` pins `ownedTotal` / `toBuy` arithmetic with a collection arg.
