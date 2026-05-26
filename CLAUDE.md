# Vault — project notes for Claude

Quick reference so future runs don't drift on the basics.

## Branch + release discipline

- All my work happens on `claude/youthful-brahmagupta-mQLkb`. Open a PR per shippable change.
- **Bump `package.json` version + add a `CHANGELOG.md` entry on every PR** that ships user-visible behaviour. Don't let drift accumulate across multiple PRs — the version chip on the landing page reads the changelog at build time, so the hover popover should always reflect what just shipped.
  - Bug-fix-only PRs: patch bump (`0.8.0 → 0.8.1`), one bullet under the latest section.
  - Feature PRs: minor bump (`0.8.0 → 0.9.0`), new section with categories (Features / Fixes / Internals).
- Squash-merge PRs from main. Rebase the branch onto main before opening the next PR (the previous squash's content is in main, the unsquashed commit is on the branch — `git rebase --onto origin/main <last-commit-already-merged>`).

## Testing + build before pushing

- `npm test` (Vitest) — currently 176 passing.
- `npm run build` (Vite) — verifies the production bundle compiles.
- Both must be green locally before push. CI will re-run them on the PR.

## Data flow quick reference

- `src/lib/storage.js` — local-only deck storage (localStorage).
- `src/lib/storage-supabase.js` — cloud deck storage. `loadDecks` MUST filter `.eq('owner_id', userId)` — RLS lets anyone read public decks, so a bare select leaks every other user's public decks into the archive grid.
- `src/lib/collection.js` — the Vault (formerly Collection). Supabase-backed when signed in, localStorage when local.
- `src/lib/autoseed.js` — random-deck build pipeline. Order: EDHREC pool → banned-card filter → bracket exclusions → per-card budget cap → archetype boost → bucket fill (`utilityReserve(colorCount)` cap on nonbasic lands) → overflow fill (EXCLUDING lands) → basic-land padding → total-budget swap loop → safety-trim to 99.
- `src/lib/profile.js` — `public.profiles` upsert. Username uniqueness enforced at DB level; `23505` maps to "already taken".

## Random-deck quirks pinned by tests

- 99-card invariant — `autoseed.test.js` checks `totalCount(cards) === 99` in 3 scenarios.
- Banned cards always filtered (even at bracket 5).
- Bracket ≤ 2 drops `HIGH_POWER_TAGS` (Game Changer / Combo piece / MLD / Extra Turn / Stax piece).
- Budget cap is enforced as a TOTAL (post-build swap loop), not just per-card.

## Drag-and-drop drop zones

Two drop targets: Vault section on the landing page + Cards tab inside any deck. Both accept:
- `application/x-vault-card+json` (internal `SCRYFALL_DRAG_MIME`) — fast path from `ScryfallSearchPanel`.
- `text/uri-list` / `text/plain` — external drag from any scryfall.com tab. URL parsed via `resolveScryfallUrl()` and resolved to a card.

## Don't

- Don't call `retag()` in PackagesTab or any read-only view. Codex flagged this: `retag` strips manually-added auto-tag overrides (e.g. user-added `Ramp` on a card whose oracle text doesn't match the patterns). Tags should be maintained at write-time via `addCardsToDeck` / `setCardCount`.
- Don't reintroduce custom CSS cursors. Tried multiple iterations (quill, V-seal, MTG card, classic arrow) — none stuck. OS defaults are the floor.
- Don't auto-publish rolled decks into the user's archive. They open as a transient session (`viewingDeck` slot, `id: 'roll:<ts>'`). User has to explicitly hit **Save to my archive →** in the editor banner to keep one.
