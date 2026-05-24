# Changelog

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
