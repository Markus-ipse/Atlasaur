# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server with HMR
- `npm run build` — `tsc -b && vite build` (typecheck is part of the production build)
- `npm run typecheck` — `tsc --noEmit` only
- `npm run lint` — ESLint (flat config, typescript-eslint + react-hooks + react-refresh)
- `npm test` — Vitest in `run` mode (jsdom env). Single test: `npx vitest run src/game/useGame.test.ts -t "answer-correct"`. Watch mode: `npx vitest`.
- `npm run build:topology` — Regenerates `src/data/world-110m.json` from `node_modules/world-atlas/countries-110m.json` via `scripts/build-topology.mjs`. The script splits French Guiana out of France's MultiPolygon at the TopoJSON arc-reference layer so GUF is its own clickable/labelable feature. The output is a committed build artifact consumed by both `WorldMap.tsx` and `build-countries.mjs`.
- `npm run build:countries` — Regenerates `src/data/countries.json` from `scripts/build-countries.mjs`. Always runs `build:topology` first so the topology is fresh. Run this any time you edit the COUNTRIES table in that script; both JSON files are committed but are build artifacts.

## Architecture

### Game state lives in one reducer

`src/game/useGame.ts` is the single source of truth. `App.tsx` calls `useGame()` once and passes the resulting `GameApi` (state + dispatchers + lookup helpers) down to `ControlZone`; `WorldMap` receives only the slices of `GameApi` it needs as individual props. Components are otherwise stateless — do not introduce parallel game state in components.

The reducer (`reducer` in `useGame.ts`) handles `answer | skip | dismiss | setMode | setContinents | endSession | startReview | reset`. Effects (timed auto-dismiss of correct feedback, localStorage persistence) live in the `useGame` hook itself, not in the reducer.

### Two phases, one retry queue

State has a `phase: "normal" | "review"` and a `retryQueue: { iso3, dueAt }[]`:

- **Normal phase:** wrong/skipped answers append the country to `retryQueue` with `dueAt = total + randInt(3, 5)`. `pickNext` (in `pickCountry.ts`) prefers a due retry over a fresh random pick. Score, streak, missed list, and total only advance in normal phase.
- **Review phase:** entered via `startReview` after session end. Picks always come from the head of `retryQueue`; correct answers remove the entry, wrong answers re-queue it. When the queue empties, `dismissFeedback` flips back to normal and sets `sessionDone: true` so the summary re-opens.

`unlearnedCount` exposed on `GameApi` is just `retryQueue.length` — that's what drives the "Review N" affordance.

### Two practice modes × two question modes (M4)

State has two orthogonal axes:

- **`practiceMode: "exam" | "training"`** — selects the scheduling regime.
- **`mode: QuestionMode = "name-to-click" | "shape-to-name"`** — selects the prompt type.

Both axes are persisted (`atlasaur:practiceMode` / `atlasaur:selectedContinents`). `Mode` was renamed to `QuestionMode` in M4 to avoid ambiguity with the new practice axis.

**Exam mode** preserves the original loop verbatim: score, streak, `retryQueue`, `phase: "review"`, end-of-session summary. Every Exam `answer`/`skip` *also* writes through to the SRS store (`Correct → Good`, `Wrong → Again`, `Skip → Again`), but only in `phase === "normal"` — writing in review phase would double-count (the same miss is already tracked by `retryQueue`). No ease buttons.

**Training mode** uses FSRS for picks and grading:

- Pick precedence (in `pickNextTraining`, `src/game/pickCountry.ts`): oldest due record → new country (by `notabilityTier` then `sizeTier` then iso3) subject to a soft cap of `TRAINING_NEW_CAP = 10` new introductions per stretch → most-overdue fallback when the cap is hit.
- Grading: on a miss, `pendingGrade = true`; the user picks Again/Hard/Good/Easy (keys 1/2/3/4) via `EaseButtons`. Correct answers and skips don't write to the SRS store immediately — they set `autoGradePending` (`Good` and `Again` respectively) and `dismissFeedback` commits that grade when the feedback panel clears. If the user presses an ease before dismiss fires, the `grade` action writes their pick and clears `autoGradePending`, so an Easy override after a correct answer is a *single* Easy grade rather than Good-then-Easy compounded. `CORRECT_DISMISS_MS` drives the auto-dismiss for correct only; skip/wrong require an ease press (or Continue → defaults to Again) to advance.
- `newIntroducedThisStretch` is volatile in-memory; resets on `setPracticeMode("training")` and on reload.
- `state.sessionDone` is never auto-set in Training; the user exits via "Done for now" (the existing End-session button, relabeled), which lands them on a Training-flavored `SessionSummary` (lifetime stats; "Keep training" disabled when due=0 and the soft cap is hit).

**SRS store** is one record per country (`atlasaur:srs:v1`, shape: `{ version: 1, records: { iso3 → SrsRecord } }`). One record is **shared across both practice modes and both question modes** for v1 — a design choice noted in the roadmap follow-ups. `src/game/srs.ts` wraps `ts-fsrs@^5.3.3`: load/save with versioned schema and ISO↔Date hydration, `grade(record, ease, now)` mapping our `Ease` string union to the library's `Rating` enum, plus `dueCount` / `newAvailableCount` / `learnedCount` / `totalReviews` / `lifetimeAccuracy` aggregate helpers. `now: Date` is injected at every grade call site (action payloads carry it) so tests are deterministic.

**Mode flips** behave differently by intent:

- `setMode` (question mode) — preserves today's behavior of wiping in-session state (`retryQueue`, `completedSet`, `score`), because the queue entries refer to the old question type. `srsStore` and `practiceMode` are passed through `initialState`'s extended signature so they survive.
- `setPracticeMode` (new) — resets only session counters (`score`/`streak`/`total`/`missed`/`pendingGrade`/`autoGradePending`/`newIntroducedThisStretch`). `retryQueue` and `completedSet` survive so a Training detour doesn't nuke an Exam in-session review queue.

**Continent filter** still prunes `retryQueue` but never deletes SRS records — out-of-scope due cards resurface when the user widens scope.

### Two ID spaces: numeric vs iso3

- `numeric` (zero-padded ISO-3166-1 numeric, e.g. `"250"`) is what `world-atlas` topology uses as `feature.id`. The map renders against numeric.
- `iso3` (e.g. `"FRA"`) is the canonical key used everywhere in game state, in `countries.json`, and in feedback objects.

Convert at the boundary using `isoFromNumeric` / `numericFromIso3` from `GameApi`. `WorldMap` does not import `countries.json` — it gets these helpers as props so the map is decoupled from the country list.

### Country data is generated, not hand-edited

`src/data/countries.json` is the output of `scripts/build-countries.mjs`. To add aliases, fix a name, or change any country metadata, edit the `COUNTRIES` table in the script and run `npm run build:countries`. The script intersects with the topology and warns about (a) entries in the table missing from the topology (won't render at the `countries-110m` resolution) and (b) topology features missing from the table (render but inert). The continent assignments follow UN M49 with documented exceptions for transcontinental cases (Russia → Europe, Turkey/Caucasus/Kazakhstan → Asia, etc.) — preserve those conventions when editing.

Per-entry fields in the `COUNTRIES` table:

- **`iso3` / `name` / `aliases` / `continent`** — matching, display, and continent-filter scoping.
- **`capital`** — `string | null`. `null` means "no meaningful capital" (Antarctica, French Southern Territories); the miss-reveal UI omits the line on null. Multi-capital cases (Netherlands → Amsterdam, South Africa → Pretoria) take the constitutional/de jure capital; M3 will add `capitalAliases` for the de facto names.
- **`subregion`** — one of the 22 UN M49 subregions plus `"Antarctica"`. Kept in sync between `VALID_SUBREGIONS` in the script and the `Subregion` union in `src/types.ts`.
- **`landAreaKm2`** — raw input, **not emitted** to the JSON. The script buckets it into `sizeTier`: 0 (<50k), 1 (50k–500k), 2 (500k–2M), 3 (≥2M).
- **`notabilityTier`** — `0 | 1 | 2`. Hand-curated "well-known" axis independent of size (Singapore=2 despite tier-0 area; Kazakhstan=1 despite tier-3 area). Drives M5 introduction order.
- **`neighbors`** — iso3 land-adjacency, **computed at build time** via `topojson-client`'s `neighbors()` from shared arcs. Do not hand-enter for real ISO entries.
- **`neighborsOverride`** — escape hatch when the topology's adjacency doesn't match what learners expect. No entries currently use it. The old France/Brazil/Suriname overrides existed to suppress France↔Brazil/Suriname adjacencies inferred via French Guiana — fixed at the topology layer now (see `build-topology.mjs`). If an override is needed in the future, both sides must be overridden for symmetric pairs.
- **`topoName`** — only for partially-recognized territories without an ISO numeric (see below).

Partially-recognized territories (Kosovo, N. Cyprus, Somaliland) have no official ISO 3166-1 numeric and ship in the topology without a `feature.id`. They're keyed in the table by a synthetic numeric in the ISO-reserved 900–999 user-assigned range and an alpha-3 in the user-assigned `XAA–XZZ` range, with a `topoName` field that names the topology feature to match (`properties.name`). The build script enforces: synthetic numerics must be in 900–999, `topoName` must resolve to a real topology feature, no entry can have both a real numeric AND a `topoName`, and iso3s must be unique. `WorldMap.tsx` reads `countries.json` only at module load to wire the synthetic numeric onto these features (via `numericIdFor`); no game data flows from `countries.json` into the map otherwise.

The build script also validates: `capital` is non-empty string or `null`; `subregion` ∈ `VALID_SUBREGIONS`; `landAreaKm2` > 0; `notabilityTier` ∈ {0, 1, 2}; every iso3 in `neighbors`/`neighborsOverride` resolves to a matched entry. Neighbor symmetry is checked as a warning (not fatal) — asymmetric pairs typically indicate an intentional override or a topology arc quirk worth a comment.

### Derived topology: `src/data/world-110m.json`

`WorldMap.tsx` and `build-countries.mjs` both consume `src/data/world-110m.json` rather than `world-atlas/countries-110m.json` directly. The derived file is produced by `scripts/build-topology.mjs` (run via `npm run build:topology`, automatically chained from `npm run build:countries`). The script reads world-atlas and splits French Guiana out of France's MultiPolygon (polygon index 0 of 3 — identified by bounding-box check) into its own `Polygon` geometry with id `"254"` and `properties.name "French Guiana"`. The TopoJSON arc-reference layer is rewired (the shared arcs between GUF and Brazil/Suriname stay shared via the underlying `topology.arcs` array), so `topojson-client.neighbors()` produces correct adjacencies (FRA: 6 European countries only; GUF: BRA, SUR) with no `neighborsOverride` needed. If world-atlas updates and France's polygon count drifts from 3, the script fails loudly rather than silently producing wrong output.

Typed-answer matching (shape-to-name mode) compares `normalize(input)` against `normalize(name | ...aliases)` — `normalize` strips diacritics, lowercases, removes apostrophes, collapses whitespace. Don't normalize aliases in the source table; the matcher does it.

### WorldMap: module-level projection, runtime zoom

The Equal-Earth projection, all path `d` strings, the label list, and `FEATURE_BY_NUMERIC` are computed once at module load — they only depend on the projection. Re-renders during pan/zoom apply a CSS `transform` to a single `<g>` element; the path data does not change. If you need to recompute paths, you're probably doing something wrong; consider whether the change can be expressed via fill/highlight state in `fillFor` instead.

`fillFor` is the single decision point for country color (default / inert / in-scope / highlighted / correct / wrong / skipped / **neighbor**). Add new visual states there, not in the JSX. Precedence inside a feedback reveal: correct → wrong-clicked → neighbor → highlight → default. A neighbor that's also the wrong-clicked country stays red; the neighbor tone is the lowest-priority overlay so it never competes with primary signals.

The reveal-zoom effect auto-frames the correct country when feedback appears (kind ≠ "correct") and zooms back out when feedback clears. `computeRevealTarget` in `src/components/revealZoom.ts` takes the answer country, optionally a wrong-clicked secondary, and optionally the answer country's neighbor bounds; it cascades the union (full → drop secondary → drop neighbors → bare primary), keeping `naturalK ≥ MIN_ZOOM` at each tier. Both transitions honor `prefers-reduced-motion`.

### Miss-reveal elaborative encoding (M2)

On wrong/skipped feedback, the map paints the correct country's land neighbors in a muted blue (`COLOR_NEIGHBOR`) and the `ControlZone` appends `Capital: X` and `Bordered by: Y, Z` lines below the correct-answer line. Both lines are conditional: the capital line is omitted when `state.current.capital === null` (Antarctica), the neighbors line is omitted when `state.current.neighbors.length === 0` (islands). The "Bordered by" list is sorted by display name at render time for natural reading order — `state.current.neighbors` itself stays iso3-sorted for stable JSON diffs.

The data flows through `state.current` — no new `Feedback` field, no parallel lookup helper. `App.tsx` derives `correctNeighborIso3s` from `state.current.neighbors` (using a module-level `NO_NEIGHBORS` constant when feedback is null, so the WorldMap's `neighborSet` memo doesn't churn).

Neighbors are added to `revealIso3s` so their **labels** render too (alongside the answer-country label). Reveal labels bypass scope, fit-check, and obstacle rejection, so an out-of-scope neighbor (e.g. Israel when the user has selected Africa only and missed Egypt) still gets named — the elaborative cue is meant to teach geographic context regardless of the active filter.

### Continent filter

`state.selectedContinents` is persisted in localStorage (`atlasaur:selectedContinents`) and `showLabelsOnReveal` in `atlasaur:showLabelsOnReveal`. Loaders fall back to `ALL_CONTINENTS` / `true` on parse errors or unavailable storage (private mode, SSR — wrapped in try/catch). The `setContinents` action prunes `retryQueue` to the new scope and, if review-phase queue is now empty, auto-ends the review.

## Stack notes

- Tailwind v4 via `@tailwindcss/vite` — no `postcss.config` / `tailwind.config`. Styles are imported via `@import "tailwindcss"` in `src/index.css`.
- Vite `base: "./"` so the build works under any subpath; required for the GitHub Pages deploy at `/Atlasaur/` (workflow: `.github/workflows/deploy.yml`, triggers on push to `main`).
- React 19, TypeScript ~5.7, ESLint 9 flat config. Tests run in jsdom via Vitest 4.
