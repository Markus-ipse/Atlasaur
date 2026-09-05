# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server with HMR
- `npm run build` — `tsc -b && vite build` (typecheck is part of the production build)
- `npm run typecheck` — `tsc -b` only (build mode, matching the `build` script's project-references setup)
- `npm run lint` — ESLint (flat config, typescript-eslint + react-hooks + react-refresh)
- `npm test` — Vitest in `run` mode (jsdom env). Single test: `npx vitest run src/game/useGame.test.ts -t "answer-correct"`. Watch mode: `npx vitest`.
- `npm run build:topology` — Regenerates `src/data/world-110m.json` from `node_modules/world-atlas/countries-110m.json` via `scripts/build-topology.mjs`. The script splits French Guiana out of France's MultiPolygon at the TopoJSON arc-reference layer so GUF is its own clickable/labelable feature. The output is a committed build artifact consumed by both `WorldMap.tsx` and `build-countries.mjs`.
- `npm run build:countries` — Regenerates `src/data/countries.json` from `scripts/build-countries.mjs`. Always runs `build:topology` first so the topology is fresh. Run this any time you edit the COUNTRIES table in that script; both JSON files are committed but are build artifacts.

## Architecture

### Game state lives in one reducer

`src/game/useGame.ts` is the single source of truth. `App.tsx` calls `useGame()` once and passes the resulting `GameApi` (state + dispatchers + lookup helpers) down to `ControlZone`; `WorldMap` receives only the slices of `GameApi` it needs as individual props. Components are otherwise stateless — do not introduce parallel game state in components.

The reducer (`reducer` in `useGame.ts`) handles `answer | skip | dismiss | setMode | setPracticeMode | setContinents | endSession | continueRound | startReview | resetSrs | closeSummary | setSpotlight | clearSpotlight | reset` (plus the toast actions). Effects (timed auto-dismiss of correct feedback, localStorage persistence) live in the `useGame` hook itself, not in the reducer.

### Two phases, one retry queue

State has a `phase: "normal" | "review"` and a `retryQueue: { iso3, dueAt }[]`:

- **Normal phase:** wrong/skipped answers append the country to `retryQueue` with `dueAt = total + randInt(3, 5)`. `pickNext` (in `pickCountry.ts`) prefers a due retry over a fresh random pick. Score, streak, missed list, and total only advance in normal phase.
- **Review phase:** entered via `startReview` after session end. Picks always come from the head of `retryQueue`; correct answers remove the entry, wrong answers re-queue it. When the queue empties, `dismissFeedback` flips back to normal and sets `sessionDone: true` so the summary re-opens.

`unlearnedCount` exposed on `GameApi` is just `retryQueue.length` — that's what drives the "Review N" affordance.

### Two practice modes × two question modes (M4)

State has two orthogonal axes:

- **`practiceMode: "quiz" | "study"`** — selects the scheduling regime.
- **`mode: QuestionMode = "name-to-click" | "shape-to-name"`** — selects the prompt type.

Only the continent axis is persisted (`atlasaur:selectedContinents`). `practiceMode` is **not** persisted: Study is the home and every load starts there; a Quiz round is entered deliberately and ends back in Study. `Mode` was renamed to `QuestionMode` in M4 to avoid ambiguity with the practice axis.

**Learner-facing model (R1.2 fold).** The learner never sees "Quiz" or "Study". Study is simply the app; a Quiz-mode pass is presented as a **"Test me on these"** round started from the Study summary, with its own `TestSummary` (Review N missed / Test again / Back to studying). There is no practice-mode toggle in the UI. Both axes stay in the reducer exactly as below — only the presentation changed. Don't reintroduce mode vocabulary in copy.

**Rounds of twelve.** `ROUND_SIZE = 12` (exported from `useGame.ts`). Round accounting lives in `State` as `roundCards` / `roundRight` / `roundNew` / `roundDone` / `roundsCompleted` and is advanced by `withRoundAdvance` inside `dismissFeedback` — a card counts when its feedback dismisses, so the correct flash or miss reveal always plays out first. When `roundCards` reaches `ROUND_SIZE`, `roundDone` flips and `App` renders `RoundBreak` (Keep going → `continueRound`, Done for now → `endSession`); `answer`/`skip` are ignored while it is up and the map is non-interactive. While any dialog is up (`modalOpen` in `App`: summary or round break — later PRs add their cards to it), the status bar, map and control zone are wrapped in an `inert` container, so keyboard focus cannot escape the dialog. `roundDone` is never set alongside `sessionDone` (the summary wins), but the round is still credited to `roundsCompleted`. A round is a presentation boundary only: FSRS picks, `retryQueue` and the review phase are untouched. `FRESH_ROUND` resets the counters on `continueRound`, `closeSummary`, `startReview` and `setPracticeMode`; `initialState` zeroes everything. "End session" is the **Done** button in the status bar, not in the gear.

**Cross-day streak and Today card (R1.3).** `src/game/streak.ts` owns `atlasaur:streak:v1` (`{ version: 1, days: ["YYYY-MM-DD", …] }`): local calendar days on which the learner finished at least one round. `useGame` records today whenever `state.roundsCompleted` grows (`recordDay` returns the same store when today is already present, so the save effect stays quiet) and exposes `streak: StreakInfo` (`length`, `todayPlayed`, `day`) recomputed on the hourly/visibility `nowBucket` tick. `streakInfo` is forgiving by design: an unplayed today is neither counted nor held against the learner, and one missed day per rolling 7 days is bridged; two misses close together end the streak at the gap. Copy that reads it must never scold. The **Today card** (`TodayCard`) is hook state, not reducer state: it opens once per load for a learner with any SRS record (`showTodayCard` / `dismissTodayCard`), before the first prompt, and shows `N to review · n new · Day d` with a single Begin. `RoundBreak`'s eyebrow reads `Round r · Day d`.

**Quiz mode** preserves the original loop verbatim: score, streak (kept in state for later milestone copy; no longer displayed), `retryQueue`, `phase: "review"`, end-of-session summary. Every Quiz `answer`/`skip` *also* writes through to the SRS store (`Correct → Good`, `Wrong → Again`, `Skip → Again`), but only in `phase === "normal"` — writing in review phase would double-count (the same miss is already tracked by `retryQueue`). No ease buttons.

**Study mode** uses FSRS for picks and **fully automatic grading** (no ease buttons, no self-grading — Atlasaur already knows the outcome objectively):

- Pick precedence (in `pickNextStudy`, `src/game/pickCountry.ts`): in-session resurface (a recent miss whose gap has elapsed) → oldest due record → new country (by `notabilityTier` then `sizeTier` then iso3) subject to a soft cap of `STUDY_NEW_CAP = 10` new introductions per stretch → most-overdue fallback when the cap is hit.
- Grading is automatic and deferred to dismiss-time. A **correct** answer schedules `autoGradePending = "Good"` and auto-dismisses on the 600ms correct flash. A **miss** (wrong *or* "Don't know") shows the elaborative reveal, schedules `autoGradePending = "Again"`, and advances on a single frictionless **"Got it"** / Continue (Enter or tap) — no mandatory correction, no re-typing. `dismissFeedback` is the single commit point: it writes the queued grade to the SRS store, then picks the next card. (`endSession` also commits an in-flight `autoGradePending` so "Done for now" mid-reveal still records the `Again`.) There is intentionally **no** fast-click→`Easy` heuristic — every correct answer is `Good` (a deferred follow-up).
- **In-session resurface** (`studyResurfaceQueue` + `studyStep`, both Study-only and volatile in-memory): the Study analog of Quiz's `retryQueue`. On commit, a miss is re-queued via `withoutIso3` (dedupes repeats) with `dueAt = studyStep + randInt(3, 5)`; a correct answer drops any queued entry for that card. `studyStep` increments once per card in `dismissFeedback` and is the clock `dueAt` compares against. Kept **distinct** from `retryQueue` so it never pollutes `unlearnedCount` / the Quiz "Review N" affordance, and so a `setPracticeMode` flip (which preserves `retryQueue`) doesn't surface Study misses as Quiz review items.
- `newIntroducedThisStretch`, `studyResurfaceQueue`, and `studyStep` are volatile in-memory; they reset on `setPracticeMode("study")` and on reload.
- `state.sessionDone` is never auto-set in Study; the user exits via the status-bar **Done** button or the round break's "Done for now", which land on a Study-flavored `SessionSummary` (lifetime stats). The summary's actions: **Focus on <subregion>** when a spotlight is offered, **Test me on these** (flips `practiceMode` via `setPracticeMode("quiz")`) and **Keep studying** (calls `closeSummary`). Escape and backdrop click both dismiss via `closeSummary`. A contextual hint line above the buttons varies with `dueCount`/`newAvailableCount` to recommend the next step.

**SRS store** is one record per country (`atlasaur:srs:v1`, shape: `{ version: 1, records: { iso3 → SrsRecord } }`). One record is **shared across both practice modes and both question modes** for v1 — a design choice noted in the roadmap follow-ups. `src/game/srs.ts` wraps `ts-fsrs@^5.3.3`: load/save with versioned schema and ISO↔Date hydration, `grade(record, ease, now)` mapping our `Ease` string union to the library's `Rating` enum, plus `dueCount` / `newAvailableCount` / `learnedCount` / `seenCount` / `totalReviews` / `lifetimeAccuracy` aggregate helpers. Each record also carries an Atlasaur-owned `hits` / `misses` tally, incremented in `grade` (Again → miss, anything else → hit); `lifetimeAccuracy` is `hits / (hits + misses)` and returns `null` when nothing has been tallied. Do not derive accuracy from FSRS `lapses` — it only counts an Again on a Review-state card, so misses on New/Learning cards are invisible to it. `loadStore` backfills the tally with zeros on records saved before it existed. `now: Date` is injected at every grade call site (action payloads carry it) so tests are deterministic.

**Mode flips** behave differently by intent:

- `setMode` (question mode) — preserves today's behavior of wiping in-session state (`retryQueue`, `completedSet`, `score`), because the queue entries refer to the old question type. `srsStore` and `practiceMode` are passed through `initialState`'s extended signature so they survive.
- `setPracticeMode` (new) — resets session counters (`score`/`streak`/`total`/`missed`/`autoGradePending`/`newIntroducedThisStretch`), the Study resurface state (`studyResurfaceQueue` → `[]`, `studyStep` → `0`) and the round. Flipping **into** Quiz ("Test me on these") also clears `completedSet` and `retryQueue` so every test starts clean; flipping back to Study keeps them (Study reads neither).

**Continent filter** still prunes both `retryQueue` and `studyResurfaceQueue` to the new scope but never deletes SRS records — out-of-scope due cards resurface when the user widens scope.

### Two ID spaces: numeric vs iso3

- `numeric` (zero-padded ISO-3166-1 numeric, e.g. `"250"`) is what `world-atlas` topology uses as `feature.id`. The map renders against numeric.
- `iso3` (e.g. `"FRA"`) is the canonical key used everywhere in game state, in `countries.json`, and in feedback objects.

Convert at the boundary using `isoFromNumeric` / `numericFromIso3` from `GameApi`. `WorldMap` does not import `countries.json` — it gets these helpers as props so the map is decoupled from the country list.

### Country data is generated, not hand-edited

`src/data/countries.json` is the output of `scripts/build-countries.mjs`. To add aliases, fix a name, or change any country metadata, edit the `COUNTRIES` table in the script and run `npm run build:countries`. The script intersects with the topology and warns about (a) entries in the table missing from the topology (won't render at the `countries-110m` resolution) and (b) topology features missing from the table (render but inert). The continent assignments follow UN M49 with documented exceptions for transcontinental cases (Russia → Europe, Turkey/Caucasus/Kazakhstan → Asia, etc.) — preserve those conventions when editing.

Per-entry fields in the `COUNTRIES` table:

- **`iso3` / `name` / `aliases` / `continent`** — matching, display, and continent-filter scoping.
- **`capital`** — `string | null`. `null` means "no meaningful capital" (Antarctica, French Southern Territories); the miss-reveal UI omits the line on null. Multi-capital cases (Netherlands → Amsterdam, South Africa → Pretoria) take the constitutional/de jure capital; M3 will add `capitalAliases` for the de facto names.
- **`capitalLonLat`** — `[lon, lat] | null` tuple in degrees. Drives the capital-marker dot the WorldMap renders on miss-reveal. The source row omits the field when `capital === null`; the build script emits `null` to the JSON so the `Country` type can stay `[number, number] | null` instead of optional. The validator rejects entries where `capital !== null` but `capitalLonLat` is missing/malformed, and where `capital === null` but `capitalLonLat` is set.
- **`subregion`** — one of the 22 UN M49 subregions plus `"Antarctica"`. Kept in sync between `VALID_SUBREGIONS` in the script and the `Subregion` union in `src/types.ts`.
- **`landAreaKm2`** — raw input, **not emitted** to the JSON. The script buckets it into `sizeTier`: 0 (<50k), 1 (50k–500k), 2 (500k–2M), 3 (≥2M).
- **`notabilityTier`** — `0 | 1 | 2`. Hand-curated "well-known" axis independent of size (Singapore=2 despite tier-0 area; Kazakhstan=1 despite tier-3 area). Drives M5 introduction order.
- **`neighbors`** — iso3 land-adjacency, **computed at build time** via `topojson-client`'s `neighbors()` from shared arcs. Do not hand-enter for real ISO entries.
- **`neighborsOverride`** — escape hatch when the topology's adjacency doesn't match what learners expect. No entries currently use it. The old France/Brazil/Suriname overrides existed to suppress France↔Brazil/Suriname adjacencies inferred via French Guiana — fixed at the topology layer now (see `build-topology.mjs`). If an override is needed in the future, both sides must be overridden for symmetric pairs.
- **`topoName`** — only for partially-recognized territories without an ISO numeric (see below).

Partially-recognized territories (Kosovo, N. Cyprus, Somaliland) have no official ISO 3166-1 numeric and ship in the topology without a `feature.id`. They're keyed in the table by a synthetic numeric in the ISO-reserved 900–999 user-assigned range and an alpha-3 in the user-assigned `XAA–XZZ` range, with a `topoName` field that names the topology feature to match (`properties.name`). The build script enforces: synthetic numerics must be in 900–999, `topoName` must resolve to a real topology feature, no entry can have both a real numeric AND a `topoName`, and iso3s must be unique. `WorldMap.tsx` reads `countries.json` only at module load to wire the synthetic numeric onto these features (via `numericIdFor`); no game data flows from `countries.json` into the map otherwise.

The build script also validates: `capital` is non-empty string or `null`; `capitalLonLat` is a `[lon, lat]` tuple with `lon ∈ [-180, 180]` and `lat ∈ [-90, 90]` when `capital !== null`, and unset when `capital === null`; `subregion` ∈ `VALID_SUBREGIONS`; `landAreaKm2` > 0; `notabilityTier` ∈ {0, 1, 2}; every iso3 in `neighbors`/`neighborsOverride` resolves to a matched entry. Neighbor symmetry is checked as a warning (not fatal) — asymmetric pairs typically indicate an intentional override or a topology arc quirk worth a comment.

### Derived topology: `src/data/world-110m.json`

`WorldMap.tsx` and `build-countries.mjs` both consume `src/data/world-110m.json` rather than `world-atlas/countries-110m.json` directly. The derived file is produced by `scripts/build-topology.mjs` (run via `npm run build:topology`, automatically chained from `npm run build:countries`). The script reads world-atlas and splits French Guiana out of France's MultiPolygon (polygon index 0 of 3 — identified by bounding-box check) into its own `Polygon` geometry with id `"254"` and `properties.name "French Guiana"`. The TopoJSON arc-reference layer is rewired (the shared arcs between GUF and Brazil/Suriname stay shared via the underlying `topology.arcs` array), so `topojson-client.neighbors()` produces correct adjacencies (FRA: 6 European countries only; GUF: BRA, SUR) with no `neighborsOverride` needed. If world-atlas updates and France's polygon count drifts from 3, the script fails loudly rather than silently producing wrong output.

Typed-answer matching (shape-to-name mode) compares `normalize(input)` against `normalize(name | ...aliases)` — `normalize` strips diacritics, lowercases, removes apostrophes, collapses whitespace. Don't normalize aliases in the source table; the matcher does it.

### WorldMap: module-level projection, runtime zoom

The Equal-Earth projection, all path `d` strings, the label list, and `FEATURE_BY_NUMERIC` are computed once at module load — they only depend on the projection. Re-renders during pan/zoom apply a CSS `transform` to a single `<g>` element; the path data does not change. If you need to recompute paths, you're probably doing something wrong; consider whether the change can be expressed via fill/highlight state in `fillFor` instead.

`fillFor` is the single decision point for country color (default / inert / in-scope / highlighted / correct / wrong / skipped / **neighbor**). Add new visual states there, not in the JSX. Precedence inside a feedback reveal: correct → wrong-clicked → neighbor → highlight → default. A neighbor that's also the wrong-clicked country stays red; the neighbor tone is the lowest-priority overlay so it never competes with primary signals.

The reveal-zoom effect auto-frames the correct country when feedback appears (kind ≠ "correct") and zooms back out when feedback clears. `computeRevealTarget` in `src/components/revealZoom.ts` takes the answer country, optionally a wrong-clicked secondary, and optionally the answer country's neighbor bounds; it cascades the union (full → drop secondary → drop neighbors → bare primary), keeping `naturalK ≥ MIN_ZOOM` at each tier. Before the cascade, a giant neighbor is filtered out (when pairing it with the answer alone would drop the fit below `REVEAL_NEIGHBOR_K_FLOOR ×` the answer-alone fit — e.g. Russia next to Estonia) so the answer country stays visible; the dropped neighbor is still highlighted and labeled, just not framed. Both transitions honor `prefers-reduced-motion`.

### Small countries on a phone (R1.6)

Three affordances, all in `WorldMap.tsx` with the pure thresholds in `src/components/smallTargets.ts` (unit-tested): **(1) Resting frame follows a tiny card.** `WorldMap` receives `targetIso3` (the current card, passed through feedback too so the resting frame stays stable across a correct flash) and applies the affordances in click mode only. `restingTransform` is the continent filter's frame, except when the rendered map is narrower than `NARROW_MAP_PX` and the card's largest ring would be under `TAP_TARGET_PX` on screen at that frame — then it is the card's continent frame, or its UN subregion frame when even the continent leaves it under the threshold (Europe's frame barely zooms because Russia is in it). Frames are cached per region in `regionFrame` so the memo returns stable references; a frame is adopted only if it magnifies at least `FRAME_MIN_GAIN`× over the filter's frame, so a barely-zooming region (all of South America for the Falklands) is skipped and the hit disc and hint carry that case. Every place that used `baseTransform` for settling, Reset and `isPanned` now uses `restingTransform`. This is a deliberate, bounded hint: it fires only when the alternative is an un-tappable speck, never for big countries, never on desktop widths. **(2) Hit discs.** In click mode, every in-scope country whose on-screen size is under `TAP_TARGET_PX` at the current zoom gets an invisible `<circle data-hit>` of `HIT_DISC_PX` diameter at its label anchor, drawn **beneath** the paths (land always wins where it exists, so a disc never steals a tap from a bigger neighbour; the ocean around an island catches the fingertip) and wired to the same click handler. All tiny countries get one, not just the answer, so the map gives nothing away. **(3) Pinch hint.** Once per browser (`atlasaur:seenPinchHint`, `src/components/pinchHint.ts`), on a coarse pointer, when the card's country is under `HINT_TARGET_PX` on screen after the view has settled: a small "Pinch to zoom in" pill for five seconds, taken down early if the zoom changes. `targetIso3` must never influence `fillFor`.

### Miss-reveal elaborative encoding (M2)

On wrong/skipped feedback, the map paints the correct country's land neighbors in a muted blue (`COLOR_NEIGHBOR`) and the `ControlZone` appends `Capital: X` and `Bordered by: Y, Z` lines below the correct-answer line. Both lines are conditional: the capital line is omitted when `state.current.capital === null` (Antarctica), the neighbors line is omitted when `state.current.neighbors.length === 0` (islands). The "Bordered by" list is sorted by display name at render time for natural reading order — `state.current.neighbors` itself stays iso3-sorted for stable JSON diffs.

The data flows through `state.current` — no new `Feedback` field, no parallel lookup helper. `App.tsx` derives `correctNeighborIso3s` from `state.current.neighbors` (using a module-level `NO_NEIGHBORS` constant when feedback is null, so the WorldMap's `neighborSet` memo doesn't churn).

Neighbors are added to `revealIso3s` so their **labels** render too (alongside the answer-country label). Reveal labels bypass scope, fit-check, and obstacle rejection, so an out-of-scope neighbor (e.g. Israel when the user has selected Africa only and missed Egypt) still gets named — the elaborative cue is meant to teach geographic context regardless of the active filter.

### Continent filter

`state.selectedContinents` is persisted in localStorage (`atlasaur:selectedContinents`). The loader falls back to `ALL_CONTINENTS` on parse errors or unavailable storage (private mode, SSR — wrapped in try/catch). Reveal labels are always on (the old `showLabelsOnReveal` toggle and its storage key were removed in R1.2 — labels on a reveal are the teaching). The `setContinents` action prunes `retryQueue` to the new scope and, if review-phase queue is now empty, auto-ends the review.

## Stack notes

- Tailwind v4 via `@tailwindcss/vite` — no `postcss.config` / `tailwind.config`. Styles are imported via `@import "tailwindcss"` in `src/index.css`.
- **Installable / offline (R1.5).** `vite-plugin-pwa` in `vite.config.ts` generates `manifest.webmanifest` and a Workbox service worker (`generateSW`, `registerType: "prompt"`) that precaches every built asset (hashed JS/CSS, `public/fonts` including `OFL.txt`, `public/icons`, `index.html`) with `navigateFallback: "index.html"`. `src/main.tsx` calls `registerSW({ immediate: true, onRegisterError })` and passes **no** `onNeedRefresh`: a new service worker waits and takes over on the next visit (all tabs closed) rather than reloading a learner mid-card — do not switch to `autoUpdate`, which force-reloads open tabs when a deploy lands. The plugin's dev SW is off, so nothing registers under `npm run dev`; test with `npm run build` and a static server (the GitHub Pages subpath works because `start_url`/`scope` are `./`, like `base`). There is deliberately no runtime caching, no push, no update prompt. The manifest's `background_color`/`theme_color` literals mirror `--color-parchment-base`/`--color-ink-deep` — the same contract as the pre-paint script in `index.html`. Icons live in `public/icons/` (192, 512, 512 maskable, 180 apple-touch, 64 favicon), rendered from the cartouche "A" in IM Fell English SC; regenerate all five together if the mark changes.
- Vite `base: "./"` so the build works under any subpath; required for the GitHub Pages deploy at `/Atlasaur/` (workflow: `.github/workflows/deploy.yml`, triggers on push to `main`). `.github/workflows/ci.yml` runs lint, typecheck, tests and a build on every pull request and on pushes to `main`.
- React 19, TypeScript ~5.7, ESLint 9 flat config. Tests run in jsdom via Vitest 4.

## Design tokens

Color and typography tokens live in Tailwind v4's `@theme` block at the top of `src/index.css`. The names follow **period-pigment vocabulary** — `parchment-base/shadow/deep` for surfaces, `ink-deep/mid/faded` for neutrals, `vermillion / wax-red / ochre / teal-engraving` for accents. The cartography-examination aesthetic is the design language, so pigments are referenced directly in components (`bg-parchment-base`, `text-ink-deep`, `text-vermillion`). No semantic alias layer — when you need a danger color, reach for `text-vermillion`, not `text-danger`.

When adding a new color, add it to `@theme` first so a Tailwind utility (`bg-foo`, `text-foo`, `border-foo`) is generated automatically. Don't drop raw hex into components or new `@theme` tokens elsewhere — keep all tokens in `src/index.css` so the palette stays auditable in one place.

`var(--color-*)` references work in arbitrary CSS contexts (custom styles, inline `style={}`). SVG `fill`/`stroke` attributes set from JS need literal hex strings because CSS transitions don't interpolate `var()` references reliably — but those literals are **resolved from the CSS tokens at runtime** via `readPaletteFromCss()` in `src/components/fillFor.ts`, not duplicated by hand. On initial mount, the pre-paint script in `index.html` sets `data-theme` synchronously before React mounts, so the lazy `useState(readPaletteFromCss)` initializer in `App.tsx` reads the right tokens. On theme toggle, `useTheme` flips `data-theme` in a layout effect that runs before `App.tsx`'s palette-reading layout effect (declaration order). CSS stays the single source of truth.

The one unavoidable duplication is the pre-paint script in `index.html` that sets the mobile-chrome `theme-color` meta — it runs before stylesheets are parsed, so it can't read CSS vars. Those two hex literals must mirror `--color-parchment-base` (dark) and `--color-ink-deep` (light); the script has a comment marking this contract.

Typography: the only loaded face is **IM Fell English** by Igino Marini (OFL 1.1, self-hosted under `public/fonts/`). Regular + italic, plus the separate **IM Fell English SC** small-caps face used for `--font-display` (eyebrow labels, the wordmark, the app icon). No bold: for emphasis use italic, size or small caps, not synthetic bold. The token is `--font-serif`; Tailwind exposes it as `font-serif`. If you add another face, update `public/fonts/OFL.txt` with the license/attribution.

## Fonts (`public/fonts/`)

Self-hosted so the app stays offline-capable and makes no third-party runtime requests. The `.woff2` files are referenced from `src/index.css` `@font-face` blocks; Vite serves them from the project root under `/fonts/...` thanks to `public/` being its static asset directory. To add or update fonts: drop the new `.woff2` into `public/fonts/`, add a matching `@font-face` block at the top of `src/index.css`, update `public/fonts/OFL.txt` with the attribution.
