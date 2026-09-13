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

The reducer (`reducer` in `useGame.ts`) handles `answer | skip | dismiss | setMode | setPracticeMode | startExpedition | syncExpedition | setContinents | setIncludeTerritories | endSession | continueRound | startReview | resetSrs | closeSummary | setSpotlight | clearSpotlight | reset` (plus the toast actions). Effects (timed auto-dismiss of correct feedback, localStorage persistence) live in the `useGame` hook itself, not in the reducer.

### Two phases, one retry queue

State has a `phase: "normal" | "review"` and a `retryQueue: { iso3, dueAt }[]`:

- **Normal phase:** wrong/skipped answers append the country to `retryQueue` with `dueAt = total + randInt(3, 5)`. `pickNext` (in `pickCountry.ts`) prefers a due retry over a fresh random pick. Score, missed list, and total only advance in normal phase. `streak` is the exception since R2.2: correct answers build it and misses break it in both phases, because it drives the ceremony copy (see Ceremony below) rather than the session summary — a run of correct answers is a live signal, and it would be incoherent for a review miss to break one that a review hit could not build.
- **Review phase:** entered via `startReview` after session end. Picks always come from the head of `retryQueue`; correct answers remove the entry, wrong answers re-queue it. When the queue empties, `dismissFeedback` flips back to normal and sets `sessionDone: true` so the summary re-opens.

`unlearnedCount` exposed on `GameApi` is just `retryQueue.length` — that's what drives the "Review N" affordance.

### Two practice modes × four question modes (M4, R3.2)

State has two orthogonal axes:

- **`practiceMode: "quiz" | "study" | "expedition"`** — selects the scheduling regime. `"expedition"` is the Daily Expedition (R3.1, below); it is entered only through `startExpedition` and never persisted as the current mode.
- **`mode: QuestionMode`** — selects the prompt type. Four since R3.2: `"name-to-click"` and `"shape-to-name"` ask where a country is, `"capital-to-click"` and `"country-to-capital"` ask what its capital is.

`src/game/questionModes.ts` holds the only three predicates any of that hangs off — `factOf` (which record the mode grades), `isClickMode` (answered on the map) and `isTypedMode` (answered by typing; also exactly the modes that highlight the target). **Don't reintroduce string-literal mode checks**; adding a fifth mode should be a change to `QUESTION_MODES` and those three functions and nowhere else.

The continent axis is persisted (`atlasaur:selectedContinents`) and so, since R3.2, is the question mode (`atlasaur:questionMode`, validated against `QUESTION_MODES` on load, falling back to `name-to-click`): it is a standing preference for which of the four things you are here to practise. The save effect writes `modeBeforeExpedition ?? mode`, so an expedition's forced Name → Click never overwrites the learner's choice, and "Erase all progress" leaves it alone, like the continent filter and the theme. `practiceMode` is **not** persisted: Study is the home and every load starts there; a Quiz round is entered deliberately and ends back in Study. `Mode` was renamed to `QuestionMode` in M4 to avoid ambiguity with the practice axis.

**Learner-facing model (R1.2 fold).** The learner never sees "Quiz" or "Study". Study is simply the app; a Quiz-mode pass is presented as a **"Test me on these"** round started from the Study summary, with its own `TestSummary` (Review N missed / Test again / Back to studying). There is no practice-mode toggle in the UI. Both axes stay in the reducer exactly as below — only the presentation changed. Don't reintroduce mode vocabulary in copy.

**Rounds of twelve.** `ROUND_SIZE = 12` (exported from `useGame.ts`). Round accounting lives in `State` as `roundCards` / `roundRight` / `roundNew` / `roundDone` / `roundsCompleted` and is advanced by `withRoundAdvance` inside `dismissFeedback` — a card counts when its feedback dismisses, so the correct flash or miss reveal always plays out first. When `roundCards` reaches `ROUND_SIZE`, `roundDone` flips and `App` renders `RoundBreak` (Keep going → `continueRound`, Done for now → `endSession`); `answer`/`skip` are ignored while it is up and the map is non-interactive. While any dialog is up (`modalOpen` in `App`: summary or round break — later PRs add their cards to it), the status bar, map and control zone are wrapped in an `inert` container, so keyboard focus cannot escape the dialog. `roundDone` is never set alongside `sessionDone` (the summary wins), but the round is still credited to `roundsCompleted`. A round is a presentation boundary only: FSRS picks, `retryQueue` and the review phase are untouched. `FRESH_ROUND` resets the counters on `continueRound`, `closeSummary`, `startReview` and `setPracticeMode`; `initialState` zeroes everything. "End session" is the **Done** button in the status bar, not in the gear.

**Cross-day streak and Today card (R1.3).** `src/game/streak.ts` owns `atlasaur:streak:v1` (`{ version: 1, days: ["YYYY-MM-DD", …] }`): local calendar days on which the learner finished at least one round. `useGame` records today whenever `state.roundsCompleted` grows (`recordDay` returns the same store when today is already present, so the save effect stays quiet) and exposes `streak: StreakInfo` (`length`, `todayPlayed`, `day`) recomputed on the hourly/visibility `nowBucket` tick. `streakInfo` is forgiving by design: an unplayed today is neither counted nor held against the learner, and one missed day per rolling 7 days is bridged; two misses close together end the streak at the gap. Copy that reads it must never scold. "Erase all progress" (`resetSrs` on `GameApi`) clears the streak store too. The **Today card** (`TodayCard`) is hook state, not reducer state: it opens once per load for a learner with any SRS record (`showTodayCard` / `dismissTodayCard`), before the first prompt, and shows `N to review · n new · Day d` with a single Begin. `RoundBreak`'s eyebrow reads `Round r · Day d`.

**First-run welcome (R1.4).** `Welcome` opens once for a learner with no SRS records and no `atlasaur:seenWelcome` flag (decided at load in `useGame`, exposed as `showWelcome` / `dismissWelcome`; the flag is written on dismiss, or when a summary is reached under it). Existing learners upgrading past it never see it; "Erase all progress" clears the flag along with the SRS store and the streak, so a learner meets the app as a stranger again on the next load. Three doors: *Start with the big ones* (`setContinents(ALL_CONTINENTS)`), *Pick a region* (inline `ContinentChip`s → `setContinents(picked)`), *Test me* (`setPracticeMode("quiz")`). `ContinentChip` is shared with the settings menu so the two scope pickers stay identical. The Today card and the welcome are mutually exclusive by construction (records present vs absent).

**Quiz mode** preserves the original loop: score, `retryQueue`, `phase: "review"`, end-of-session summary. `streak` is the one deviation — it is no longer displayed and now counts correct answers in the review pass too, because R2.2 repurposed it to drive the ceremony copy (see Ceremony below). Every Quiz `answer`/`skip` *also* writes through to the SRS store (`Correct → Good`, `Wrong → Again`, `Skip → Again`), but only in `phase === "normal"` — writing in review phase would double-count (the same miss is already tracked by `retryQueue`). No ease buttons.

**Study mode** uses FSRS for picks and **fully automatic grading** (no ease buttons, no self-grading — Atlasaur already knows the outcome objectively):

- Pick precedence (in `pickNextStudy`, `src/game/pickCountry.ts`): in-session resurface (a recent miss whose gap has elapsed) → oldest due record → new country (by `notabilityTier` then `sizeTier` then iso3) subject to a soft cap of `STUDY_NEW_CAP = 10` new introductions per stretch → most-overdue fallback when the cap is hit.
- Grading is automatic and deferred to dismiss-time. A **correct** answer schedules `autoGradePending = "Good"` and auto-dismisses on the 600ms correct flash. A **miss** (wrong *or* "Don't know") shows the elaborative reveal, schedules `autoGradePending = "Again"`, and advances on a single frictionless **"Got it"** / Continue (Enter or tap) — no mandatory correction, no re-typing. `dismissFeedback` is the single commit point: it writes the queued grade to the SRS store, then picks the next card. (`endSession` also commits an in-flight `autoGradePending` so "Done for now" mid-reveal still records the `Again`.) There is intentionally **no** fast-click→`Easy` heuristic — every correct answer is `Good` (a deferred follow-up).
- **In-session resurface** (`studyResurfaceQueue` + `studyStep`, both Study-only and volatile in-memory): the Study analog of Quiz's `retryQueue`. On commit, a miss is re-queued via `withoutIso3` (dedupes repeats) with `dueAt = studyStep + randInt(3, 5)`; a correct answer drops any queued entry for that card. `studyStep` increments once per card in `dismissFeedback` and is the clock `dueAt` compares against. Kept **distinct** from `retryQueue` so it never pollutes `unlearnedCount` / the Quiz "Review N" affordance, and so a `setPracticeMode` flip (which preserves `retryQueue`) doesn't surface Study misses as Quiz review items.
- `newIntroducedThisStretch`, `studyResurfaceQueue`, and `studyStep` are volatile in-memory; they reset on `setPracticeMode("study")` and on reload.
- `state.sessionDone` is never auto-set in Study; the user exits via the status-bar **Done** button or the round break's "Done for now", which land on a Study-flavored `SessionSummary` (lifetime stats). The summary's actions: **Focus on <subregion>** when a spotlight is offered, **Test me on these** (flips `practiceMode` via `setPracticeMode("quiz")`) and **Keep studying** (calls `closeSummary`). Escape and backdrop click both dismiss via `closeSummary`. A contextual hint line above the buttons varies with `dueCount`/`newAvailableCount` to recommend the next step.

**SRS store** is one record per country **and fact** (`atlasaur:srs:v2`, shape: `{ version: 2, facts: { location: { iso3 → SrsRecord }, capital: {…} } }`). Knowing where Peru is says nothing about knowing its capital, so each is scheduled on its own. `FACTS` in `src/types.ts` is the list this build knows; `borders` (on hold) and `flag` are future facts, and adding one is **additive within version 2** — `loadStore` fills a missing fact with `{}`, and a fact key this build does *not* know is kept exactly as it is rather than dropped, so a rollback cannot save the store without a later release's records. Only `FACTS` is read and totalled, so no figure ever counts a fact the app cannot show. A record is still shared across practice modes and across the two modes of the same fact.

**Version 2 lives under a new key, and `atlasaur:srs:v1` is never written again.** Do not "upgrade" this by bumping the version inside the old key: an old build — a stale tab beside a hard-reloaded one, or a rollback — reads a v2 blob under the v1 key as empty (`loadStore` treats a version mismatch as an empty store) and its save-on-mount effect writes that empty store straight back, wiping every record. `loadStore` tries a valid v2 blob, then a migration of v1 (whenever v2 is missing **or** corrupt — a stale store beats an empty one, which would be saved over v2 on mount), then an empty store. The v1 blob is left in place; the accepted cost is that answers given in a stale old-build tab land in v1 and never reach v2. `clearStore` removes **both** keys, or the old records would be migrated back on the next load.

**Every helper below `grade` takes one fact's records, not the store and a fact**, so no helper can quietly read the wrong fact — the choice is made in the reducer, the hook and `App`. `withGrade(store, fact, iso3, record)` is the one write, and it leaves the other facts' objects untouched by identity, so a memo keyed on `facts.location` doesn't re-run after a capital answer. `totalReviews` and `lifetimeAccuracy` are the exceptions: they add up across `FACTS` and take the whole store. `hasAnyRecord(store)` is "has the learner met anything at all", across every fact.

**The reveal and the correct panel lead with the ANSWER, not the fact.** Only
`country-to-capital` asks the learner to produce a capital; `capital-to-click`
names one in the prompt and asks for the country. So `RevealHero` and
`CorrectHero` key on `mode === "country-to-capital"`, never on
`factOf(mode) === "capital"` — leading with the capital in Capital → Click
would shout back the string the learner was just staring at and demote the
country they actually failed to find.

**Two fact roles**, which differ only during an expedition (it forces Name → Click):

- **Answer fact** (`answerFact(state)` = `factOf(state.mode)`) — grades, picks (`pickNextStudy`, the spotlight), and decides `isNew`.
- **Learner fact** (`learnerFact(state)` = `factOf(state.modeBeforeExpedition ?? state.mode)`, exposed on `GameApi` as `fact`) — scopes the pool and drives **every displayed figure**: due, new, known, seen, the spotlight offer, the Today card, the Study summary. So the settings keep showing capitals to someone studying capitals while they play today's ten, the same rule the continent filter already follows.
- **Always `location`**, whatever is being asked: the ambient map paint and its continent captions, and `knownByDay` / "Known this week". The map is a map of where the learner has been.

`src/game/srs.ts` wraps `ts-fsrs@^5.3.3`: load/save with versioned schema and ISO↔Date hydration, `grade(record, ease, now)` mapping our `Ease` string union to the library's `Rating` enum, plus `dueCount` / `newAvailableCount` / `learnedCount` / `seenCount` / `totalReviews` / `lifetimeAccuracy` aggregate helpers. Each record also carries an Atlasaur-owned `hits` / `misses` tally, incremented in `grade` (Again → miss, anything else → hit); `lifetimeAccuracy` is `hits / (hits + misses)` and returns `null` when nothing has been tallied. Do not derive accuracy from FSRS `lapses` — it only counts an Again on a Review-state card, so misses on New/Learning cards are invisible to it. `loadStore` backfills the tally with zeros on records saved before it existed. `now: Date` is injected at every grade call site (action payloads carry it) so tests are deterministic.

**Mode flips** behave differently by intent:

- `setMode` (question mode) — goes through `enterQuestionMode`, the counterpart of `enterPracticeMode`, and is deliberately **not** a rebuild through `initialState`. That rebuild silently dropped a pending Study grade, reset `cardsAnswered` (losing that answer from the counters, against the every-answer-counts rule below), cleared the Study miss queue and the new-card cap *even between two modes of the same fact*, and started a fresh round — inflating `roundsStarted` every time a learner looked at another prompt. Instead it: commits a pending Study grade under the **old** mode's fact; keeps `studyResurfaceQueue` / `studyStep` / `newIntroducedThisStretch` when the fact is unchanged and resets them when it changes (they refer to the other fact's cards); keeps the Study round and the spotlight lens, since the learner is in the same sitting over the same places; restarts a test round as before, whose queue refers to the old question type; and always clears feedback, milestone and `autoGradePending`, resets `streak`, and keeps `cardsAnswered` and `roundsCompleted`. It does nothing during an expedition, and **refuses a switch whose pool would be empty** (a capital mode with only Antarctica selected) rather than widening the scope — so the reducer does not lean on the settings' disabled option, which would otherwise let Quiz's `pickRandom` throw and leave Study on a card with a blank prompt. The answer still on screen is counted by the hook's `setMode`, which calls `recordAnswer(old mode)` before dispatching — it cannot be counted through `cardsAnswered`, because the counters effect reads the mode through `modeRef`, which already holds the new one by then.
- `setPracticeMode` (new) — resets session counters (`score`/`streak`/`total`/`missed`/`autoGradePending`/`newIntroducedThisStretch`), the Study resurface state (`studyResurfaceQueue` → `[]`, `studyStep` → `0`) and the round. Flipping **into** Quiz ("Test me on these") also clears `completedSet` and `retryQueue` so every test starts clean; flipping back to Study keeps them (Study reads neither).

**Continent filter** still prunes both `retryQueue` and `studyResurfaceQueue` to the new scope but never deletes SRS records — out-of-scope due cards resurface when the user widens scope.

The hook's `scopeSet` is memoised on the pool's **content** (a joined iso3 key), not on the fact, so a mode switch that leaves the pool identical — which, with territories off, both facts do — hands back the same `Set` and the map never re-settles because of scope.

### Two ID spaces: numeric vs iso3

- `numeric` (zero-padded ISO-3166-1 numeric, e.g. `"250"`) is what `world-atlas` topology uses as `feature.id`. The map renders against numeric.
- `iso3` (e.g. `"FRA"`) is the canonical key used everywhere in game state, in `countries.json`, and in feedback objects.

Convert at the boundary using `isoFromNumeric` / `numericFromIso3` from `GameApi`. `WorldMap` does not import `countries.json` — it gets these helpers as props so the map is decoupled from the country list.

### Country data is generated, not hand-edited

`src/data/countries.json` is the output of `scripts/build-countries.mjs`. To add aliases, fix a name, or change any country metadata, edit the `COUNTRIES` table in the script and run `npm run build:countries`. The script intersects with the topology (a `marker` row is kept without a feature) and warns about (a) entries in the table missing from the topology that are not markers (won't render at the `countries-110m` resolution) and (b) topology features missing from the table (render but inert). The continent assignments follow UN M49 with documented exceptions for transcontinental cases (Russia → Europe, Turkey/Caucasus/Kazakhstan → Asia, etc.) — preserve those conventions when editing.

Per-entry fields in the `COUNTRIES` table:

- **`iso3` / `name` / `aliases` / `continent`** — matching, display, and continent-filter scoping.
- **`capital`** — `string | null`. `null` means "no meaningful capital" (Antarctica, French Southern Territories); the miss-reveal UI omits the line on null, and `filterPool` drops the row from a capital mode's pool entirely. Multi-capital cases (Netherlands → Amsterdam, South Africa → Pretoria) take the constitutional/de jure capital, with the rest in `capitalAlternates`.
- **`capitalAlternates`** — additional *real* capitals. Accepted when typed, and **shown** in the reveal ("Capitals: Pretoria, Cape Town, Bloemfontein").
- **`capitalAliases`** — accepted spellings that are **never displayed**: historic or alternative transliterations (Kiev, Ulan Bator, Nur-Sultan, Prishtina, Laayoune) and the bare form of a "… City" capital (Mexico, Guatemala, Kuwait, Panama). Kept separate from `capitalAlternates` precisely because that field is rendered. The validator rejects an alias that normalizes to a spelling the country already has, so a dead entry cannot accumulate — "Sanaa" for "Sana'a" is already the same string after `normalize`. A separate **fatal** check rejects any normalised capital spelling shared by two countries: a typed capital resolves to the country it belongs to, so a collision would make one of the pair unanswerable.
- **`capitalLonLat`** — `[lon, lat] | null` tuple in degrees. Drives the capital-marker dot the WorldMap renders on miss-reveal. The source row omits the field when `capital === null`; the build script emits `null` to the JSON so the `Country` type can stay `[number, number] | null` instead of optional. The validator rejects entries where `capital !== null` but `capitalLonLat` is missing/malformed, and where `capital === null` but `capitalLonLat` is set.
- **`subregion`** — one of the 22 UN M49 subregions plus `"Antarctica"`. Kept in sync between `VALID_SUBREGIONS` in the script and the `Subregion` union in `src/types.ts`.
- **`landAreaKm2`** — raw input, **not emitted** to the JSON. The script buckets it into `sizeTier`: 0 (<50k), 1 (50k–500k), 2 (500k–2M), 3 (≥2M).
- **`notabilityTier`** — `0 | 1 | 2`. Hand-curated "well-known" axis independent of size (Singapore=2 despite tier-0 area; Kazakhstan=1 despite tier-3 area). Drives M5 introduction order.
- **`territory`** — `true` or omitted. Dependent territories and uninhabited land (Antarctica, French Southern Territories, Greenland, Puerto Rico, Western Sahara, French Guiana, Falkland Islands, New Caledonia). Partially recognised states (Kosovo, Taiwan, Palestine, Somaliland, Northern Cyprus) are **not** territories. Out of the pool unless the learner turns on "Include territories" (R1.7); the validator rejects any value other than `true`.
- **`neighbors`** — iso3 land-adjacency, **computed at build time** via `topojson-client`'s `neighbors()` from shared arcs. Do not hand-enter for real ISO entries.
- **`neighborsOverride`** — escape hatch when the topology's adjacency doesn't match what learners expect. Only marker rows use it (see `marker` below). For a topology row it replaces the computed list. The old France/Brazil/Suriname overrides existed to suppress France↔Brazil/Suriname adjacencies inferred via French Guiana — fixed at the topology layer now (see `build-topology.mjs`). If an override is needed in the future, both sides must be overridden for symmetric pairs.
- **`topoName`** — only for partially-recognized territories without an ISO numeric (see below).
- **`marker`** — `true` or omitted (R3.4). A country in its own right that the 110m topology does not draw: the 29 island and micro-states from Cabo Verde down to the Vatican. The map shows it as a dot at `capitalLonLat`, so a marker needs a capital, and the validator rejects a marker whose numeric *is* in the topology (drop the flag if a later world-atlas draws it). A point shares no arcs, so its land borders are hand-entered in `neighborsOverride` on the marker row and the build **mirrors** each onto the neighbour's computed list — Italy keeps its topology borders and gains Vatican City and San Marino with no override of its own. Five rows have one: Andorra, Liechtenstein, Monaco, San Marino, Vatican City.
- **`mapName`** — markers only: the short label for the dot where `name` is too long, in world-atlas's abbreviating style (`St. Vin. and Gren.`). A shape's label comes from the topology.

Partially-recognized territories (Kosovo, N. Cyprus, Somaliland) have no official ISO 3166-1 numeric and ship in the topology without a `feature.id`. They're keyed in the table by a synthetic numeric in the ISO-reserved 900–999 user-assigned range and an alpha-3 in the user-assigned `XAA–XZZ` range, with a `topoName` field that names the topology feature to match (`properties.name`). The build script enforces: synthetic numerics must be in 900–999, `topoName` must resolve to a real topology feature, no entry can have both a real numeric AND a `topoName`, and iso3s must be unique. `mapGeometry.ts` reads `countries.json` only at module load to wire the synthetic numeric onto these features (via `numericIdFor`); no game data flows from `countries.json` into the map otherwise.

The build script also validates: `capital` is non-empty string or `null`; `capitalLonLat` is a `[lon, lat]` tuple with `lon ∈ [-180, 180]` and `lat ∈ [-90, 90]` when `capital !== null`, and unset when `capital === null`; `subregion` ∈ `VALID_SUBREGIONS`; `landAreaKm2` > 0; `notabilityTier` ∈ {0, 1, 2}; every iso3 in `neighbors`/`neighborsOverride` resolves to a matched entry. Neighbor symmetry is checked as a warning (not fatal) — asymmetric pairs typically indicate an intentional override or a topology arc quirk worth a comment.

### Derived topology: `src/data/world-110m.json`

`WorldMap.tsx` and `build-countries.mjs` both consume `src/data/world-110m.json` rather than `world-atlas/countries-110m.json` directly. The derived file is produced by `scripts/build-topology.mjs` (run via `npm run build:topology`, automatically chained from `npm run build:countries`). The script reads world-atlas and splits French Guiana out of France's MultiPolygon (polygon index 0 of 3 — identified by bounding-box check) into its own `Polygon` geometry with id `"254"` and `properties.name "French Guiana"`. The TopoJSON arc-reference layer is rewired (the shared arcs between GUF and Brazil/Suriname stay shared via the underlying `topology.arcs` array), so `topojson-client.neighbors()` produces correct adjacencies (FRA: 6 European countries only; GUF: BRA, SUR) with no `neighborsOverride` needed. If world-atlas updates and France's polygon count drifts from 3, the script fails loudly rather than silently producing wrong output.

Typed-answer matching compares `normalize(input)` against the candidates for the mode's fact: `name | ...aliases` in `shape-to-name`, `capital | ...capitalAlternates | ...capitalAliases` in `country-to-capital`. `normalize` lowercases, strips diacritics, and removes **everything that is not a letter or digit** (so punctuation and whitespace go too: "Washington, D.C." and "washington dc" are the same string). Don't normalize aliases in the source table; the matcher does it. `GameApi.matchTyped` picks the matcher from the fact, so components never branch on it. The capital matcher checks the **current** country first, then every other, so a correct answer can never resolve elsewhere and a wrong capital resolves to the country it does belong to — which the map then paints and labels red, the same courtesy Shape → Name already does for a wrong country name. Djibouti's and Luxembourg's capitals share their country's name, which makes those Capital → Click prompts trivial; accepted, not special-cased.

### WorldMap: module-level projection, runtime zoom

The Equal-Earth projection, all path `d` strings, the label list, and `FEATURE_BY_NUMERIC` are computed once at module load — they only depend on the projection. Re-renders during pan/zoom apply a CSS `transform` to a single `<g>` element; the path data does not change. If you need to recompute paths, you're probably doing something wrong; consider whether the change can be expressed via fill/highlight state in `fillFor` instead.

`fillFor` is the single decision point for country color (inert / **mastery paint** / highlighted / correct / wrong / skipped / neighbor / spotlight). Add new visual states there, not in the JSX. Precedence inside a feedback reveal: correct → wrong-clicked → neighbor → highlight → spotlight → inert → mastery paint. A neighbor that's also the wrong-clicked country stays red; the neighbor tone is the lowest-priority *reveal* overlay so it never competes with primary signals. Below every reveal state sit the spotlight wash and, at the very bottom, the ambient mastery paint.

`strokeFor` (same file) is the matching decision point for the **engraved
line**. One border ink can't hold against a fill ramp that spans the whole
luminance range: in dark, `--color-map-border` is a warm faded ochre so
coastlines read against the near-black ocean, which means it all but
disappears into every bright pigment above it — known land, the spotlight
wash, a reveal's green/red/neighbour tones — and two adjacent countries under
the same paint read as one landmass. So the line has a second ink,
`--color-map-border-inverse`, and `strokeFor` reaches for it only when the
default is below `BORDER_MIN_CONTRAST` (2.5:1) against the fill *and* the
inverse does better. Light hits neither condition — its border is near-black
under parchment pigments — so that map is untouched; dark switches for the
mastery-known, spotlight, highlight, correct, wrong, skipped and neighbor
fills. Where two countries meet only one stroke wins by paint order, which is
fine: each is chosen against its own fill, so the shared edge reads against at
least one side. The milestone hatch is inked the same way, against
`palette.correct` — the only fill it is ever drawn over. Add a fill and the
line follows it automatically; add a *token* and mirror it in `fillFor.test.ts`'s
`LIGHT` / `DARK` fixtures, which pin the shipped pigments against the ink that
draws them.

### Keeping the world in the reveal (R2.3)

`computeRevealTarget` picks the tightest frame that fits the answer and its
neighbours; `widenForContext` then pulls that frame back by
`REVEAL_CONTEXT_PULLBACK`, so it covers 1.8x the width and 3.24x the area it
otherwise would. Only `k` moves — the centre is left exactly where
`computeRevealTarget` put it (the union of the answer and whichever neighbours
survived its filter), so widening can only add to what was visible, never take
away. The result is capped by the frame it was given, so it can never zoom in.

Three floors stop it going too far, and all three bind in practice:

- **The resting frame.** Pulling back past the frame the map sits at when
  nothing is revealed would zoom out of the learner's own continent filter and
  straight back into it. Passed in from `WorldMap` through a ref, so a change
  of resting frame cannot restart a reveal mid-animation.
- **`MIN_ZOOM`**, the whole map. Fourteen of the largest countries fit close
  enough to it that this is what stops them; for those the reveal is close to a
  no-op, which is the right answer — there is no more world to show.
- **`minLegibleK`**, the answer's longer axis covering at least
  `REVEAL_ANSWER_MIN_H_RATIO` of the map's short axis. Expressed against the
  projection rather than the screen, so the reveal frames identically at every
  viewport size. Whether it binds depends on the *fitted* frame, not the
  country's own size: a small country with large neighbours is already framed
  wide, so the pull-back would take it under. Ecuador, Uganda and Kosovo hit it
  today.

**Not the answer's UN subregion**, which reads like the better rule and is not.
Subregions run from the Baltics to the whole of South America, so capping at
"the subregion" turns a Guyana reveal into the world view while barely moving a
Luxembourg one. A uniform pull-back behaves the same way everywhere.

Because the final frame is now wider, the wrong-click choreography checks
itself. Stage 1 is the establishing shot and must be *wider* than where stage 2
settles (a lower `k`); a stage-1 frame of two adjacent small countries can now
be tighter than the widened final frame, which would zoom in and then straight
back out, so stage 1 is skipped in that case.

The survey's last reveal bug, a neighbour label landing off screen on a
tight reveal, was reduced by this to 26 countries and closed by R3.3a.
(R3.4 added three of the same kind — Andorra, Monaco and Vatican City, points
beside France, Spain and Italy — so the pinned list is 29.)
Those 26 are all answers next to a giant neighbour (Denmark and Germany,
the Baltics and Russia), where `computeRevealTarget` drops that neighbour
from the frame on purpose while `revealIso3s` still labels it. Framing it
would collapse the answer to a speck, so the fix changes what gets labelled,
not what gets framed: `pinOffFrameLabels` in `labelLayout.ts` moves a
neighbour label whose rect would not be wholly on screen onto **the part of
that neighbour that is** — its polygons clipped to the frame (inset by the
label's own extent), the label at the pole of inaccessibility of the visible
piece nearest the answer, the one that touches it (Kaliningrad on a Poland
reveal, not Novaya Zemlya) — and drops it when no piece is visible. **Not
the frame edge nearest the anchor**, which the plan proposed and the PR
disproved: for Azerbaijan that corner is across the Caspian, over
Kazakhstan, and a pinned label looks exactly like an anchored one. Holes are
honoured (Lesotho is the one in this topology); the labels that carry the
reveal are subtracted from the visible land before the pole is searched, so
a pinned label is clear of them by construction; a piece with no room for
the label yields to one with room; a pole polylabel could not place is
rejected.
The wrong click may move too, under the same own-land rule — Sweden clicked
for Denmark is named where it shows, Spain clicked for New Caledonia is not
on screen and gets no label. A pinned label yields to every label drawn at
its anchor that carries the reveal and is dropped rather than cover one; it
wins over an ambient in-scope label. It runs per zoom frame, outside the
collision memo, because it needs the whole transform and the measured
viewport (a portrait phone shows land above and below the 2:1 viewBox);
polygons whose bounds miss the frame are rejected before the clip. The
label can hop between pieces while the reveal animates, which is accepted.
`revealSurvey.test.ts` pins the 26 by name against the real table, at
desktop and phone label sizes, and that every one is placed inside the
frame and on its own land with none dropped — for the world resting frame;
a continent filter floors the pull-back higher and is not surveyed. The
geometry it needs lives in `mapGeometry.ts` (the projection, `LABELS`, and
`polygonsFor`, every projected polygon of a country, streamed on first use
and cached rather than built for all at load) with the planar primitives in
`polygon.ts`, so the test can import it without the component.

The reveal-zoom effect auto-frames the correct country when feedback appears (kind ≠ "correct") and zooms back out when feedback clears. `computeRevealTarget` in `src/components/revealZoom.ts` takes the answer country, optionally a wrong-clicked secondary, and optionally the answer country's neighbor bounds; it cascades the union (full → drop secondary → drop neighbors → bare primary), keeping `naturalK ≥ MIN_ZOOM` at each tier. Before the cascade, a giant neighbor is filtered out (when pairing it with the answer alone would drop the fit below `REVEAL_NEIGHBOR_K_FLOOR ×` the answer-alone fit — e.g. Russia next to Estonia) so the answer country stays visible; the dropped neighbor is still highlighted and labeled, just not framed. Both transitions honor `prefers-reduced-motion`.

### Ambient mastery paint (R2.1)

The map is the progress view. Every in-scope country is painted by how far the
learner has taken it — `masteryTiers(store)` in `src/game/srs.ts` yields
`iso3 → MasteryTier` (0 unseen, 1 introduced, 2 known), and `fillFor` resolves
that to `--color-mastery-unseen` / `--color-mastery-seen` /
`--color-mastery-known`. Tier 2 reuses `learnedCount`'s `state >= 2` predicate
and `tier >= 1` is what `seenCount` counts, so the map can never disagree with
the numbers in the settings stats. Like `learnedCount`, tier 2 includes FSRS
Relearning, so a just-lapsed country keeps its pigment until it is graded down. There is no longer a single "in-scope land" tone; the
old `--color-parchment-map` token is gone.

**A test round (`practiceMode === "quiz"`) gets no paint at all**, in any
question mode, and no percentages with it. Its picks are random rather than
scheduler-driven, so there is no tier-to-pick correlation to leak — but a test
is a measurement, and a learner near the end of a small scope could read off
the countries they know and answer by elimination instead of locating the one
they were asked for, which is the skill being scored.

**`capital-to-click` gets no paint either**, and collapsing only the wash would
not be enough there. Capital cards are introduced in the same
`introductionOrder` that built the learner's *known* map, and due ones come
from that same set, so the gold of tier 2 points at the answer as surely as a
wash would. Its counterpart `country-to-capital` keeps the full three tones:
the country is already highlighted, so there is nothing left to give away.
`paintsProgress(mode, practiceMode)` in `srs.ts` is the single rule — `App`
reads it for the continent captions so the two can never disagree.

**Finding the capital questions (R3.2).** Nothing outside the settings menu
named them, which made `answersByQuestionMode` — the figure the R3 plan wants
for the R3.5 decision — a measure of whether anyone opened the gear rather
than of appetite. `capitalOffer(store, countries, scope, now)` in
`src/game/offer.ts` answers "is there something specific to offer", and
`CapitalsDoor` is the shared button, the shape `ExpeditionDoor` established.
Two surfaces carry it: the **Today card**, and the **CaughtUp banner** — whose
old line ("Come back later — we'll have more for you") fired at exactly the
moment there was more, so it was a promise the app broke in the same breath.

The gate is the whole idea: a capital is offered only for a country the
learner can **already place** (location tier 2), plus any capital already met
and now due. **The scheduler enforces the same gate**, via `introduceFirst` on
`pickNextStudy` — `useGame` passes the tier-2 set for the capital fact, and the
new-introduction branch sorts those ahead of everything else. Without it the
door promised "6 countries you already know" and then served whatever ranked
highest by `introductionOrder`, which is a different set entirely. It is a
sort rather than a filter, so once the promised countries are used up — or for
a learner who picks a capital mode from the settings having placed nothing —
the ordinary order still applies and the mode is never left with nothing to
ask. `introduceFirst` is empty for the location fact, which has no
prerequisite. Knowing where Peru is is what makes "what is its capital" the
next sensible question, and it keeps the number small and true — three
countries in, the offer is three capitals, not the whole atlas. The door
leads to `country-to-capital`, where the country is given: the new question is
asked about familiar ground. An offer is never made to a learner already
working on capitals.

Automatic arrival — the scheduler introducing a capital on its own once the
location is known — is the natural end of this and is deliberately **not**
done here: it is a scheduling change with a real question attached about
whether capitals compete for `STUDY_NEW_CAP`'s ten new cards or get their own
budget. Offers first, arrival when that is designed.

**The small-target affordances follow the same rule.** `WorldMap`'s resting
frame and its pinch hint (R1.6) fire in `name-to-click` only, not in every
click mode: framing the answer's continent before the learner answers hands
them the region, which is most of the question when all they were given is a
capital. Tiny countries keep their hit disc there, so they stay tappable — the
learner just has to find the region themselves.

**The introduced wash is collapsed into unseen in `name-to-click`** (the memo in
`App.tsx`). `pickNextStudy` partitions its picks exactly on that boundary — the
new-introduction branch requires no record (tier 0), while the resurface, due
and most-overdue branches all require one (tier 1 or 2) — and tier 1 is by
construction tiny, the handful of cards still in FSRS learning, which is
precisely the set the scheduler resurfaces. A wash on those would narrow "find
Portugal" to three or four countries. Tiers 0 and 2 are both large, so a
two-tone map leaks nothing. `shape-to-name` keeps all three tones: the shape is
already highlighted there, and knowing you have met a country cannot supply its
name. If you add a question mode that asks the learner to *find* something on
the map, collapse the wash for it too.

The tier map is deliberately **scope-independent** — a country keeps the ink it
earned when the continent filter excludes it, and `fillFor`'s own `inScope`
branch decides whether that ink is shown. That keeps the memo in `App.tsx`
keyed on `state.srsStore` alone.

Mastery sits at the **bottom** of `fillFor`'s precedence chain, below the
spotlight wash: everything above it is either a transient reveal or a focus the
learner switched on, and ambient progress must not compete with either.

Per-continent percentages are drawn on the map from
`masteryByContinent(store, countries, scope)` at hand-placed `[lon, lat]`
anchors (`CONTINENT_ANCHOR_DATA` in `WorldMap.tsx` — computed centroids land in
the Gulf of Guinea for Africa and inside Poland for Europe). They follow the
continent filter and the territories setting, are mirrored by an
`sr-only` paragraph in the map container whenever there is progress to report (the engraved captions are
`aria-hidden`, since they are dropped on a narrow viewport and during reveals
while the text equivalent is not), ride the ocean-label sizing at
`CONTINENT_CAPTION_RATIO`, and are suppressed both during a miss reveal (so
they never compete with the reveal's own country labels) and whenever they
would render below `CONTINENT_CAPTION_MIN_PX` on screen — which is the case for
the world view on a phone, where a two-line caption is wider than the continent
it annotates. The paint carries progress on its own there, and the captions
return on a bigger map, a continent filter, or a pinch. `masteryPercent` reserves
100% for a finished continent and 0% for an untouched one, so neither is ever a
rounding artefact.

### Ceremony (R2.2)

Three moments are marked and nothing else: a run of correct answers at exactly
5, 10 and 20; a country crossing into "known" for the first time; and a
continent finished. `src/game/milestones.ts` owns all three as pure functions
(`streakNote`, `crossesIntoKnown`, `milestoneFor`) so the reducer decides *when*
and the panel decides *how*.

**A milestone is computed at answer time, not at commit time.** The ceremony
plays during the correct flash, but a Study grade is deferred to
`dismissFeedback`. `applyCorrect` therefore grades a throwaway copy with
`srsGrade` (pure) to see whether the answer crosses the card into `state >= 2`,
and stores the result in `state.milestone`; `dismissFeedback` grades again for
real and clears it. `milestones.test.ts` pins that prediction and commit agree
across every card state and the whole length of the flash — a ceremony the
commit does not deliver would be a lie. If you make the grading path stateful,
keep that test passing.

`state.streak` is the run of correct answers. It predates R2.2 but was only
maintained in Quiz's normal phase; Study now increments it on a correct answer
and resets it on a miss or a skip, and Quiz's review pass does both as well. No
counter is shown anywhere, so a broken run is silent — the streak exists only to
trigger the copy. Keep it symmetric: every path that can break a run must be
matched by one that can build it, in the same phase.

The **country and continent milestones are Study only, and `location` only**.
"Now on your map" and the engraved hatch are map ceremonies, and the map paints
where countries are — a capital answer has nothing to draw on. The streak note
is not restricted, in either direction. A test round is a
measurement and its map is neutral (see the mastery paint above), so there is
nothing for a hatch to draw on. The streak note is not restricted: a run of
correct answers means something in a test too, and a line of copy cannot help
you answer. One consequence worth knowing: a country that graduates during a
test round consumes its crossing silently, and because the transition is
one-way it never earns its hatch afterwards.

`state.milestone` is meaningful **only while the correct feedback that earned it
is on screen**. Every reducer path that ends a card clears it (`advanceCard`,
`endSession`, `startReview`, `closeSummary`, `setSpotlight`, `applyScope`,
`resetSrs`, `setPracticeMode`), and `App.tsx` states the invariant once more by
gating `hatchIso3` on `state.feedback?.kind === "correct"` — so no path added
later can strand a mark animating over a country the learner has moved on from.
`resetSrs` additionally cancels `autoGradePending`, since the store the grade
was staged against no longer exists.

Rendering rules, all in `CorrectHero`: one ceremony per answer, with a continent
seal superseding the country line and any milestone superseding a streak note.
Two marks landing together is the pile-on that "ink and wax only" rules out. The
seal is pressed in the panel rather than on the map — a seal at the continent's
map anchor is the better image but needs the continent on screen and legible,
which on a 390 px world view it is not. `WorldMap` draws the engraved hatch over
the country via an SVG pattern (`hatchIso3`), delayed 900 ms so it lands after
the correct-answer pop rather than competing with it, and
`MILESTONE_DURATION` holds the flash long enough for both.

Sound and haptics from the survey's ceremony list are **not** implemented. They
were R2.5 in `docs/plans/r2-your-map.md`; that item was dropped, and the
reasoning is recorded there. The ceremony is silent by decision, not by
omission — don't add audio or vibration to it without a licensed asset and a
fresh decision to match.

### Small countries on a phone (R1.6)

Three affordances, all in `WorldMap.tsx` with the pure thresholds in `src/components/smallTargets.ts` (unit-tested): **(1) Resting frame follows a tiny card.** `WorldMap` receives `targetIso3` (the current card, passed through feedback too so the resting frame stays stable across a correct flash) and applies the affordances in click mode only. `restingTransform` is the continent filter's frame, except when the rendered map is narrower than `NARROW_MAP_PX` and the card's largest ring would be under `TAP_TARGET_PX` on screen at that frame — then it is the card's continent frame, or its UN subregion frame when even the continent leaves it under the threshold (Europe's frame barely zooms because Russia is in it). Frames are cached per region in `regionFrame` so the memo returns stable references; a frame is adopted only if it magnifies at least `FRAME_MIN_GAIN`× over the filter's frame, so a barely-zooming region (all of South America for the Falklands) is skipped and the hit disc and hint carry that case. Every place that used `baseTransform` for settling, Reset and `isPanned` now uses `restingTransform`. This is a deliberate, bounded hint: it fires only when the alternative is an un-tappable speck, never for big countries, never on desktop widths. **(2) Hit discs.** In click mode, every in-scope country whose on-screen size is under `TAP_TARGET_PX` at the current zoom gets an invisible `<circle data-hit>` of `HIT_DISC_PX` diameter at its label anchor, drawn **beneath** the paths (land always wins where it exists, so a disc never steals a tap from a bigger neighbour; the ocean around an island catches the fingertip) and wired to the same click handler. All tiny countries get one, not just the answer, so the map gives nothing away. **(3) Pinch hint.** Once per browser (`atlasaur:seenPinchHint`, `src/components/pinchHint.ts`), on a coarse pointer, when the card's country is under `HINT_TARGET_PX` on screen after the view has settled: a small "Pinch to zoom in" pill for five seconds, taken down early if the zoom changes. `targetIso3` must never influence `fillFor`.

### Miss-reveal elaborative encoding (M2)

On wrong/skipped feedback, the map paints the correct country's land neighbors in the teal-engraving pigment (`palette.neighbor`, aliased to `--color-teal-engraving`; since R3.3a, because a warm tone was indistinguishable from the mastery paint — `fillFor.test.ts` pins a contrast floor against every ambient fill) and the `ControlZone` appends `Capital: X` and `Bordered by: Y, Z` lines below the correct-answer line. Both lines are conditional: the capital line is omitted when `state.current.capital === null` (Antarctica), the neighbors line is omitted when `state.current.neighbors.length === 0` (islands). The "Bordered by" list is sorted by display name at render time for natural reading order — `state.current.neighbors` itself stays iso3-sorted for stable JSON diffs.

The data flows through `state.current` — no new `Feedback` field, no parallel lookup helper. `App.tsx` derives `correctNeighborIso3s` from `state.current.neighbors` (using a module-level `NO_NEIGHBORS` constant when feedback is null, so the WorldMap's `neighborSet` memo doesn't churn).

Neighbors are added to `revealIso3s` so their **labels** render too (alongside the answer-country label). Reveal labels bypass scope, fit-check, and obstacle rejection, so an out-of-scope neighbor (e.g. Israel when the user has selected Africa only and missed Egypt) still gets named — the elaborative cue is meant to teach geographic context regardless of the active filter.

### Local counters (R2.4)

`src/game/counters.ts` owns `atlasaur:counters:v1`: the survey's "What to
measure" list as a handful of integers plus one figure per day the known count
moved. Local only. Nothing is sent anywhere, and if aggregate numbers are ever
wanted that has to be an explicit opt-in sending only these.

**Return is not stored here.** The cross-day streak store already records the
days with a finished round, so `returnInfo(streakStore)` derives days played
and the longest gap from it rather than keeping a second copy that could
disagree.

What is stored: `firstSessionAnswers`, `roundsStarted` / `roundsFinished`,
`answersByQuestionMode`, `roundsByPractice`, and `knownByDay`.
`answersByQuestionMode` is built from `QUESTION_MODES`, so a mode added later
loads from an older store at zero with no version bump — the same additive rule
the SRS store's facts follow. The Data view cuts those answers two ways, each
adding up to the same total: "Click / type" and "Places / capitals", the latter
appearing only once there is a capital answer to report.

**The first session ends when the tab closes, not only at a summary.** That is
the commoner ending for exactly the bouncing learner the figure measures.
`startSession` runs in the state initialiser, increments `sessionsStarted`, and
freezes the count whenever a session has already been begun on an earlier load;
`recordSessionEnded` covers the case where the learner reaches a summary within
the first sitting. `sessionsStarted` exists for one reason: a learner who opens
Atlasaur, answers nothing and closes the tab leaves no other trace at all — no
answers, no SRS record, no streak day — and that zero-card bounce is the most
important reading this metric has. A profile that had SRS records before this
key existed is frozen at zero instead, and the Data view omits the row, because
a backfilled figure would be a later session wearing the first one's label.

`cardsAnswered` counts every answer whose grade reaches the store, not only a
dismissed card: `endSession`, `applyScope` and `startExpedition` can close a
card's feedback without going through `withRoundAdvance`, and those answers
still happened. The one exception is a **question-mode switch**, where the hook
calls `recordAnswer` itself against the mode the answer was given in — the
counters effect reads `modeRef`, which already holds the new mode by then, so
bumping `cardsAnswered` in the reducer as well would count the answer twice.

**A card closed on the way out still belongs to its round.** `closeCardIntoRound`
is the shared path for the two cases that close a card's feedback and then
*carry on in the same round* — a scope change and a question-mode switch. It
commits any deferred Study grade and runs `withRoundAdvance`, so the card lands
in `roundCards` / `roundRight` / `roundNew`. Without it a twelve-card round
quietly needed thirteen answers and the round break's "N right" was short by
one. It leaves `cardsAnswered` alone (see above) and no-ops for an expedition,
which takes every credit at answer time. `endSession` and `startExpedition`
also commit a grade, but the round ends with them, so they only count the
answer and leave the round where it stopped.

`resetSrs` restarts the round (`FRESH_ROUND`, `cardsAnswered: 0`) — a round left
standing would carry on to a finish the emptied counters never saw begin, and
the Data view would read "2 of 1".

`roundsFinished` counts rounds that filled to `ROUND_SIZE`, which includes one
whose twelfth card also ended the session so no interstitial appeared — and,
since R3.1, a finished ten-card expedition, which credits `roundsCompleted`
at its tenth answer.

Days played and the longest gap are read from the streak store, which keeps at
most `MAX_DAYS`. Past that its oldest days are dropped, so `returnInfo` returns
`capped` and the Data view shows "400+" and drops the gap row rather than
reporting a floor as if it were a lifetime total.

`loadCounters` validates `knownByDay` days against the same `YYYY-MM-DD` shape
the streak store uses, then orders and de-duplicates them. Without that a
hand-edited or clock-skewed store could feed `knownGain` a `NaN` day and make
the "Known this week" row silently vanish.

Recording lives in `useGame`'s effects, not the reducer — the same division the
streak uses, so the reducer stays pure and every persisted side effect sits
together. The signal for "one card answered" is `state.cardsAnswered`, a
monotonic count incremented once per dismissed card in `withRoundAdvance`.
`total` is no substitute: it only moves in Quiz's normal phase. A rebuild
resets `cardsAnswered` to 0, which the effect reads as a shrink and skips, so a
mode flip cannot double count. The effects read `mode` and `practiceMode`
through refs, because they must fire on a card or round count and not re-run
when only the mode changes.

`knownByDay` counts across the **whole store**, not the active scope, so
changing the continent filter never looks like progress or a loss. It uses
`masteryTierOf`, so it cannot disagree with the "Known" stat or the map's
pigment.

"Erase all progress" clears the counters along with **both** SRS keys, the
streak and the welcome flag — otherwise `firstSessionAnswers` would stay frozen
against a session the learner no longer has.

The Data view in `SettingsMenu` omits a row rather than showing zero when there
is nothing to say yet, so a first-day profile does not read as a report card.

### The Daily Expedition (R3.1)

`src/game/expedition.ts` owns `atlasaur:expedition:v1` (`{ version: 1, day,
iso3s: string[10], outcomes: ("found" | "missed")[] }`) and everything pure
about the expedition: the seeded ten, the day's status, the share text.
`expeditionFor(day, pool)` sorts the pool by iso3, Fisher–Yates shuffles it
with a mulberry32 generator seeded from an FNV-1a hash of the `YYYY-MM-DD`
key, and takes the first `EXPEDITION_SIZE = 10`. The pool is
`expeditionPool(COUNTRIES)`: every entry that is neither a territory nor a
map marker, **whatever the continent filter or territories setting says** —
everyone gets the same ten, or the result cannot be compared. Growing the pool
changes every future day's ten by design; the seed is over the pool, not a
fixed table. R3.4's markers are deliberately left out (see Markers below), so
their arrival changed no day's ten.
`expedition.test.ts` pins that a date yields the same ten across runs and
across the pool's order.

**In the reducer it is a third `practiceMode`**, not a parallel axis. The
store lives in `state.expedition` in every mode (loaded by `useGame` through
`loadExpedition`, which discards a stored set this build cannot ask; saved by
an effect whenever it changes), so the Today card and the Study summary can
offer today's expedition, resume it, or open its result. `startExpedition`
(the only way in; carries the day's store, built by the hook when
`state.expedition` is from another day) forces `mode: "name-to-click"` and
stashes the learner's mode in `modeBeforeExpedition`, which `enterPracticeMode`
restores on the way out. `setMode`, `reset` and `applyScope` are guarded while
one is up: the picker is locked (`modeLocked` on `SettingsMenu`), there is no
"try again", and a scope change keeps the current card. Leaving is always
`enterPracticeMode(state, "study")` — `endSession` ("Done"), the result
card's every exit (`App` wires Escape, backdrop and "Back to studying" to
`setPracticeMode("study")`; `closeSummary` is guarded the same way) and
`resetSrs` all route there; the last also nulls the store, since "all
progress" means all.

**Every credit is taken at answer time, not at dismiss.**
`withExpeditionOutcome` in `applyCorrect` / `applyMiss` records the glyph,
increments `cardsAnswered` (so the answer is booked to the mode it was given
in even when leaving restores another) and, on the tenth, `roundsCompleted`
— the same per-tab counter the hook already reads to mark the streak day and
count a finished round, so only the tab that played the tenth answer credits
it, never one that loads or adopts the store already finished. The grade is
written through at once like a test round's (`applyImmediateSrsWriteThrough`:
`Correct → Good`, `Wrong → Again`, `Skip → Again`, normal phase only). So an
expedition abandoned mid-reveal keeps that answer and resumes on the next
card, and a tab closed on the tenth reveal has still recorded the day.
`atExpeditionCard(state, store)` is the one projection from the store to game
state — the card after the last answer, or the result card (`sessionDone`)
after the tenth, with `roundCards` / `roundRight` read off the store — shared
by starting, resuming, syncing and advancing; `dismissFeedback` routes an
expedition straight to it and skips `withRoundAdvance`, so the interstitial
never appears inside one. "Done" on the tenth card's reveal lands on the
result rather than leaving. Because a resumed expedition re-enters with
`roundCards` already at the answers given (the chip reads "6/10" after five),
the hook's round-started effect skips this mode and `startExpedition` records
the start itself, once, when today's store is first built — so an expedition
opened and left with no answer counts as begun for the started/finished
ratio, while `expeditionStatus` reads such a store as fresh so the door does
not say "resume". `roundsByPractice` gains `expedition`. `nowBucket` ticks at
local midnight as well as hourly, so the door's label turns over with the
day and agrees with what a tap does.

**The map is neutral**, as in a test round: `paintTiers` returns nothing for
any non-Study mode, `App` withholds the continent percentages, and no
milestone is computed (the streak note still is). Scope splits in two while
one is up: `isInScope`, which the map reads, becomes the expedition pool
(every country in its own right; territories stay inert) and `App` frames
`ALL_CONTINENTS`, while `scopeSet` / `totalInScope` — and every figure
derived from them: due, known, seen, not yet seen, the test's Done count —
stay the learner's own filter, so the settings never show world-wide numbers
beside the learner's chips. `isInScope` is keyed on the expedition boolean,
not the practice mode, so a Study / test flip keeps the same predicate and
the map does not re-settle. A stored ten is validated against the same pool,
so a set this build cannot ask is discarded rather than presented as an
inert card. Every answer writes a record whether or not the country is in
the learner's scope; out-of-scope records resurface when the scope widens, as
they always have.

**One attempt a day holds across tabs.** Each tab keeps its own copy of the
store and would otherwise save its snapshot over the other's answers. The
hook listens for the `storage` event on the expedition key (raised in every
*other* tab on a write) and dispatches `syncExpedition`; the reducer adopts
the incoming store only when `supersedes` says it is further along — a later
day, or the same day with more answers — and a run in progress jumps to the
card after the other tab's last answer, closing any reveal here. While a run
or its result is on screen only the same day's store can move this tab: a
later day's (a tab that opened tomorrow's past midnight) is ignored for
now; the hook's `startExpedition` re-reads storage before deciding whether
today's store is fresh, so it is picked up the next time the learner opens
the door rather than a second, competing expedition being built for the same
day. Ties and older stores
are ignored, so the two converge on whichever got further, never on a row
stitched from both. A removed key ("Erase all progress" in another tab)
drops this tab's store too and leaves a run in progress. The adopted store
round-trips through the save effect unchanged, which raises no event, so
tabs cannot ping-pong. The other stores (SRS, streak, counters) still save
last-write-wins per tab; only the expedition carries a one-attempt promise
that divergence would break.

`ExpeditionResult` is the expedition's summary and its round break: the row
and the caption exactly as they leave the app (selectable, so they can be
copied by hand), the ten by name, and one Share button — `navigator.share`
where it exists (a dismissed sheet is not a failure and gets no fallback),
`navigator.clipboard` otherwise, a pointer at the text when neither works.
The text is plain: `Atlasaur · 6 September 2026` over `■■□■■■□■■■ 8/10`,
formatted by `formatDay` in fixed English so two phones read the same.
`ExpeditionDoor` is the shared button on the Today card and the Study summary;
its label says what waits (fresh, resume with the count so far, or the
result). There is no second go — that is tomorrow.

### Markers: the countries the topology cannot draw (R3.4)

Twenty-nine countries in their own right have no feature at 110m — most are a
pixel or less across even in the 50m data, and Tuvalu exists only at 10m — so
they are drawn as **dots at their capitals**, not shapes. The topology
artefact is untouched. Everything else treats them as ordinary countries:
the pool, the scheduler, both capital modes, the mastery store, the continent
captions (which count them), the settings figures.

`mapGeometry.ts` pushes one `Label` per marker row (`marker: true`) at the
projected capital, with a nominal `MARKER_EXTENT_SVG` square for bounds and
area 0, so the reveal zoom, hit discs, the R1.6 small-card framing, the pinch
hint and the label pass all take a marker with no branch of their own. The
extent is chosen against those consumers: under labelLayout's microstate
width, so the fit check never hides the label; always a speck on a phone, so
it always has a hit disc; and small enough that the reveal settles on
`minLegibleK`, about a dozen degrees around the dot. `polygonsFor` has nothing
for a marker, so an off-screen marker label is dropped rather than pinned.

`WorldMap` draws `MARKER_LABELS` as circles of constant on-screen radius
(`MARKER_RADIUS_PX`), painted by the same `fillFor` / `strokeFor` chain as a
path and clickable under the same rule. On a touch screen each dot also
gets an invisible `HIT_DISC_PX` tap circle (`data-marker-hit`), capped at half
the gap to the nearest in-scope dot and drawn above the land but beneath every
dot: the ordinary hit disc lies beneath the land, so an enclave's would answer
Italy or France and leave a 7 px dot to tap. A mouse gets no such circle, so a
click on Rome still answers Italy. And a tap on any dot, tap circle or dot's
hit disc answers the in-scope dot **nearest the pointer** (`nearestPoint`), not
the element drawn last: at a phone's world view the Antilles dots overlap, and
paint order let Saint Vincent's dot answer for Grenada, Saint Lucia and
Barbados. They are drawn **above the land and the
labels**: on an enclave the dot sits on its neighbour and is the only thing to
tap. Every in-scope marker is drawn, never only the card's, so the dots give
nothing away. A dot a typed question is asking about gets an ochre ring
(`data-marker-ring`), since a few pixels of highlight cannot be found by
colour. There is no capital dot on a marker's reveal (it has no drawn bounds
for the gate, and the marker is already at the capital) and no engraved hatch
(no path to hatch); the panel's ceremony still plays. A marker's label is
anchored **below** its dot by `labelAnchor` in `labelLayout.ts`, which both the
collision pass and the pin pass measure from, so the rects are where the text
is drawn.

**Region frames fit shapes only** (`frameFor` in `mapGeometry.ts`). Samoa and
Tonga lie just east of the antimeridian, which Equal Earth draws at the map's
left edge, while the rest of Oceania is at its right; fitting them would make
Oceania's filter frame the whole world. Every other marker falls inside its
continent's and its subregion's frame through the frame's padding —
`mapGeometry.test.ts` pins that, and pins Samoa and Tonga as the two that do
not. Micronesia and Polynesia have no shapes and so no frame; a small card there keeps the filter's frame and its hit disc. A continent
filter's **resting** frame goes one step further (`restingFrameFor`): when a
marker in scope would be off that frame it rests on the whole map instead,
because a frame that hides a question's answer is worse than no zoom. Oceania
is the one continent that does; `mapGeometry.test.ts` pins it.

**Out of the Daily Expedition.** It is one attempt a day with no retry, and
most markers are a few pixels of ocean on a phone; admitting them would put
one or two "find the dot" cards into the average day. Study introduces them
late on its own: `sizeTier` 0 puts each at the tail of its notability tier, so
the tier-0 dots come last, Malta, Monaco and the other tier-1 dots after the
larger tier-1 shapes, and Singapore (tier 2) early.

Three accepted consequences. The end-of-session spotlight ranks Micronesia and
Polynesia, which have no frame, after every other subregion that clears its
gate (`markerOnlySubregions` → `pickSpotlight`'s `lastResort`), so they are
offered only once nothing else is. Monaco, San Marino, Singapore and Vatican
City share their capital's name, so their Capital → Click cards are trivial,
accepted as Djibouti's and Luxembourg's are. And a country spread over an
ocean is one point, Kiribati at Tarawa, so a tap on its other islands is not
an answer.

### Scope: continent filter × territories

`state.selectedContinents` is persisted in localStorage (`atlasaur:selectedContinents`) and `state.includeTerritories` in `atlasaur:includeTerritories` (default `false`). Loaders fall back to `ALL_CONTINENTS` / `false` on parse errors or unavailable storage (private mode, SSR — wrapped in try/catch). Reveal labels are always on (the old `showLabelsOnReveal` toggle and its storage key were removed in R1.2 — labels on a reveal are the teaching).

`filterPool(continents, includeTerritories, fact)` in `useGame.ts` is the **single scope predicate**: selected continents, minus `territory` countries unless opted in, minus anything the fact cannot be asked about — for `capital` that drops the handful of rows with `capital === null` (Antarctica, the French Southern Territories), without which a capital test round with territories on could never finish. Picks pass the **answer** fact; scope and `normalizeScope` pass the **learner** fact, so a scope change made mid-expedition is checked against the fact the learner returns to. A mode switch never rewrites the saved selection: the settings disable the two capital options instead, with a one-line reason, when nothing in scope has a capital. `GameApi.scopeSet` / `isInScope` / `totalInScope` derive from it, and components must read scope from `game.scopeSet` rather than recomputing it from continents (StatusBar and App used to have their own copies; they are gone). `setContinents` and `setIncludeTerritories` both go through `applyScope`, which first commits any deferred Study grade (a miss reveal open at the moment of the change still counts), prunes `retryQueue` and `studyResurfaceQueue` to the new scope, replaces a current card that fell out of it (by the next queued retry during a review pass; in Study by the scheduler, so "Pick a region" on the welcome still starts with the region's big ones rather than a random island; otherwise at random), auto-ends an emptied review or a completed Quiz pool, and normalises the selection via `normalizeScope` (also applied in `initialState`, so persisted pre-setting state loads cleanly): the continent selection is kept as-is across the toggle — Antarctica stays selected while its chip is hidden, so switching territories back on restores the old scope — and only a selection whose pool is empty (Antarctica alone, territories off) falls back to `ALL_CONTINENTS`. One predicate decides which continent chips appear: `continentAskable(c, includeTerritories, fact)` — a continent with nothing askable has no chip, which generalises what used to be a hard-coded Antarctica case and is shared by `SettingsMenu` and `Welcome`. The "keep at least one continent" lock counts visible chips only. `WorldMap.computeBaseTransform` frames only in-scope countries, so an inert Greenland doesn't drag North America's frame to the pole. SRS records are never deleted by a scope change.

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
