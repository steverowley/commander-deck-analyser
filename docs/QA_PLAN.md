# Vault — Automated QA Plan

How we keep Vault from shipping bugs. Three automated layers run on every push
and pull request to `main`; a short manual pass covers the things a machine
can't see. This doc is the single reference for what's tested, how to run it,
and where the gaps are.

---

## The three automated layers

| Layer | Tool | What it catches | Runs |
| --- | --- | --- | --- |
| **Unit / integration** | Vitest | Logic bugs in `src/lib/*` — pricing math, autoseed invariants, tag classification, CSV parsing, health scoring, gallery data-shape | Every PR + push to `main` (CI), and locally |
| **Production build** | Vite | Render-time import errors, broken bundles, missing exports — anything that compiles in dev but breaks the shipped build | Every push to `main` before deploy, and locally |
| **End-to-end smoke** | Playwright (Chromium) | Integration glue that unit tests can't see — boot the real app, build a deck, walk all 7 editor tabs without hitting an error boundary | Every PR + push to `main` (CI), and locally |

### Layer 1 — Unit / integration (Vitest)

```bash
npm test          # one-shot run (what CI runs)
npm run test:watch # re-runs on file change while developing
```

- **490 tests across 39 files** as of v0.39.0.
- Convention: each `src/lib/<module>.js` has a sibling `src/lib/<module>.test.js`.
- Pure-logic only — no network, no real Supabase. Modules that touch the
  Supabase client are tested at their pure boundary (e.g. username rules live
  in `profileValidation.js`; pod math in `podsAgg.js`, split out of `pods.js`
  precisely so tests don't import the Realtime client).
- Runs in the `node` environment (see `vite.config.js` → `test`).
- **CI runs Node 20; dev machines often run Node 22+.** The Supabase client
  constructs its Realtime client eagerly, and `@supabase/realtime-js` throws at
  import on Node < 22 when there's no global `WebSocket`. `vitest.setup.js`
  stubs a no-op `WebSocket` (via `setupFiles`) so any test that transitively
  imports `supabase.js` passes on both. **Don't remove this stub** — without it
  the suite is green locally on Node 22 and red on the Node 20 runner.

### Layer 2 — Production build (Vite)

```bash
npm run build     # compiles the prod bundle into dist/
```

A passing `npm test` does **not** guarantee the app builds — Vitest runs
modules in isolation, while the build resolves the whole import graph and the
CSP-injection plugin. This layer is the gate in `deploy.yml`: a deck that
fails to build never reaches GitHub Pages. Two **non-fatal** warnings are
expected and are not bugs:

- One JS chunk is ~970 kB (a code-splitting opportunity, tracked under Known
  gaps — not a correctness issue).
- A few modules are both statically and dynamically imported (a chunking
  advisory from Rollup).

### Layer 3 — End-to-end smoke (Playwright)

```bash
npm run e2e:install   # one-time: download the Chromium binary + OS libs
npm run e2e           # boot the app + run e2e/smoke.spec.js
```

- Four smoke tests in `e2e/smoke.spec.js`: landing page renders, build-a-deck
  walks all 7 tabs crash-free, inline rename, share-link copy.
- **Deterministic anywhere** — Scryfall + EDHREC calls are intercepted and
  answered from `e2e/fixtures.js`, so the suite never hits the live APIs (no
  rate limits, no version drift, runs offline).
- The dev server boots automatically via Playwright's `webServer` block.
- On CI: 2 retries (absorbs the occasional first-paint flake without masking a
  real failure — a genuinely broken test fails all three attempts) and
  `forbidOnly` (a committed `test.only` fails the run instead of silently
  narrowing the suite). HTML report + traces upload as an artifact on failure.

---

## What CI does

Two workflows under `.github/workflows/`:

- **`test.yml`** (every PR + push to `main`): a `unit` job (`npm ci` → `npm test`)
  and an `e2e` job (`npm ci` → cached `playwright install` → `npm run e2e`).
  The Chromium binary is cached on the Playwright version, so most runs skip
  the ~150 MB download.
- **`deploy.yml`** (push to `main` only): `npm ci` → `npm test` → `npm run build`
  → publish `dist/` to GitHub Pages. Tests gate the deploy; a red suite blocks
  the release.

**Definition of green:** all unit tests pass, the production build compiles,
and all e2e smoke tests pass. Only then does `main` deploy.

---

## Coverage map

**Well covered** (unit + e2e): pricing, autoseed/random-deck invariants, tag
classification, CSV import, health scoring, legality, bracket assessment,
buylist, deck export/import, combos, antipatterns, landbase, stats, settings,
geo, affiliate, backup, compare, share, pod aggregation, archetype matching,
username validation, changelog/version sync.

**Lighter coverage — exercised but not unit-tested:**

- **React components** (`src/components/*.jsx`) — verified only by the e2e
  smoke walk, not unit-rendered. The smoke test is the safety net here.
- **Supabase I/O paths** (`storage-supabase.js`, `collection.js` cloud
  branches, `storage.js`) — the privacy-critical `owner_id` filter and the
  cloud read/write logic aren't unit-tested because they need a live client or
  a mock harness that doesn't exist yet. The pure helpers around them are
  tested; the I/O is reviewed by hand against the invariants in `CLAUDE.md`.
- **`strategy.js`** (548 lines) and **`ruleZeroImage.js`** — no direct tests.

---

## Manual pass (per release)

The automated layers don't cover visual layout, real third-party behaviour, or
auth. Before tagging a release, spot-check:

1. **Auth round-trip** — sign in (magic link / Google), confirm decks + Vault
   sync, sign out.
2. **Cloud privacy invariant** — signed in, confirm the archive shows *only
   your* decks (the `owner_id` filter — see `CLAUDE.md`). A public deck from
   another account must not appear in your archive.
3. **Drag-and-drop** — drag a card from a real scryfall.com tab onto the
   window; drop a Moxfield `.csv`. Both should light up the drop zones and
   land in the right place.
4. **Real Scryfall / EDHREC** — build a small deck against the live APIs (the
   e2e suite mocks these) and confirm recs + images load.
5. **Mobile / responsive** — the editor tabs and modals on a narrow viewport.
6. **Release discipline** — `package.json` version, the top `CHANGELOG.md`
   section, and the landing-page version chip all agree. (The unit suite now
   pins package.json ↔ CHANGELOG; the chip reads the same source.)

---

## Known gaps / future work

- **No lint step.** There's no ESLint config, so style/unused-import problems
  aren't caught automatically. Adding `eslint` + a CI job is the next QA
  increment.
- **Supabase I/O is untested.** A mock-client harness (or `@supabase/supabase-js`
  stub) would let us assert the `owner_id` filter and upsert payloads in unit
  tests instead of by review.
- **Component unit tests.** The heavy components (`Tabs.jsx`, `Modals.jsx`,
  `DeckList.jsx`) lean entirely on the e2e smoke walk. Targeted
  React Testing Library tests would catch regressions the smoke path misses.
- **Bundle size.** The ~970 kB main chunk is a perf item — code-splitting via
  dynamic imports or `manualChunks` would cut first-load time.

---

*Keep this current: when you add a `src/lib/*` module, add its sibling
`*.test.js`; when you change the CI shape, update "What CI does".*
