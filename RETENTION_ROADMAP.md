# Improving Learning & Retention in Atlasaur — Prioritized Roadmap

## Context

Atlasaur's current learning loop is minimal: a flat 3–5 question retry gap, no cross-session memory, no adaptive difficulty, no metadata beyond name/aliases/continent. There are exactly two modes (name-to-click, shape-to-name) and one one-shot remediation pass at session end. The map is decoupled from country data and re-renders cleanly on state change, which makes most of the changes below cheap to wire up.

This plan turns Atlasaur from a session-based quiz into a learning tool with measurable long-term retention — phased so that early milestones deliver value before the bigger lifts land.

## Research summary (what informs the priorities)

- **Spaced repetition is the single highest-leverage intervention.** FSRS-5/6 has decisively beaten SM-2 on a 700M-review Anki benchmark (Expertium): ~25% fewer reviews for the same 90% retention. SM-2 is simpler and still a large win over Leitner. Half-life regression (Duolingo) requires training data and is overkill here.
- **Retrieval practice / testing effect**: robust, g≈0.5–0.6 vs re-study. Already in Atlasaur. Generation effect favors recall (typing) over recognition (clicking on map / multiple choice). Keep shape-to-name central.
- **Desirable difficulties (Bjork)**: spacing, interleaving, varied conditions hurt short-term performance but boost long-term retention. The current 3–5 gap is too short and too uniform.
- **Interleaving** beats blocking for long-term retention, but **initial acquisition benefits from blocking** (Hwang 2025, Firth 2021). Implication: introduce new countries within a region, then interleave once seen ≥1×.
- **Spatial clustering & elaborative encoding**: recalling a location co-activates spatial neighbors (Manning et al., method of loci). Showing the missed country *with its neighbors highlighted* and naming the capital adds elaborative links — cheap and well-supported.
- **Feedback timing**: mixed evidence; immediate is fine for a game. Don't shorten the miss-reveal — the pause IS the encoding step.
- **Confidence grading (Anki Again/Good/Easy)** improves SR algorithm accuracy and gives FSRS the signal it needs.

## Prioritized roadmap

Each milestone is independently shippable. Sizing: **S** = ~0.5–1 day, **M** = ~2–4 days, **L** = ~1–2 weeks for a focused contributor. M1 and M4 overlap conceptually — see "Recommended sequencing" at the bottom for which subset to actually ship.

### M1 — Smarter in-session scheduler (Leitner boxes)
**Effort: S · Impact: Medium · No schema change**

Replace the flat 3–5 retry gap with per-country box levels within a session.

- Add `boxes: Map<iso3, level>` to `State`; default level 0 for new sightings, 1+ on correct, reset to 0 on miss.
- Pick logic: with prob ~0.7, pick from due retries (gap grows with level: lvl0=3–5, lvl1=8–12, lvl2=20–30, lvl3=∞). Else pick a not-yet-seen country, falling back to weighted random favoring lower-box items.
- Why first: zero data changes, isolated to `pickCountry.ts` + small reducer additions, immediately makes longer sessions feel less repetitive while reinforcing weak items.

**Files:** `src/game/pickCountry.ts`, `src/game/useGame.ts` (state + applyCorrect/applyMiss), `src/types.ts` (extend `RetryEntry` or add `BoxEntry`).

### M2 — Reveal-time elaborative encoding (metadata + miss UX)
**Effort: M · Impact: Medium-High**

Add lightweight metadata, surface it only on miss/skip (don't clutter the prompt).

- Extend `scripts/build-countries.mjs` table with: `capital`, `neighbors: iso3[]`, `subregion` (UN M49 subregion or similar), `sizeTier: 0|1|2|3` (log-scale of land area; bucket on build), and `notabilityTier: 0|1|2` (hand-curated — captures "well-known" independent of size, so Singapore/Israel rank with mid-tier even though they're small, and Kazakhstan doesn't lead the queue just because it's large).
- Regenerate `countries.json` via `npm run build:countries`. Validate in the script that each `neighbors` entry resolves.
- **Data sources** (keep the spirit of the existing hand-curated table):
  - **Capital**: hand-enter in the `COUNTRIES` table alongside `name`. ~200 entries; one-time effort. Cross-check against Wikipedia/REST Countries during PR review. **Multi-capital cases** (Netherlands → Amsterdam, South Africa → Pretoria/Cape Town/Bloemfontein) take the de jure constitutional capital and document aliases that should also be accepted in `capital-to-country` mode.
  - **Neighbors**: compute at build time from the topology itself using `d3-geo`'s adjacency or a simple shared-arc check in `world-atlas`'s TopoJSON. Maritime neighbors (e.g., UK ↔ France via Channel) are out of scope for v1 — land borders only is well-defined and matches what learners expect. Falls back to manual override field for the partially-recognized territories (Kosovo/N. Cyprus/Somaliland) which already use synthetic numerics.
  - **Subregion / sizeTier**: hand-enter or pull from a UN M49 + area table in the build script. Keep the existing UN M49 conventions (Russia → Europe, etc.) documented at the top of the file.
- `WorldMap.tsx`: extend `fillFor` with a "neighbor" color state; when feedback kind ≠ "correct", paint the correct country's neighbors at a muted highlight tone.
- **Reveal framing also needs to expand**: `computeRevealTarget` in `src/components/revealZoom.ts` currently fits the primary country + optional secondary (wrong-click). For neighbors to actually be visible, pass the union of `primary ∪ neighbors` as the primary bounds when computing the frame, or add a third `tertiary` bounds list. Without this change neighbors will be off-screen on small countries.
- `ControlZone.tsx`: append "Capital: X" and "Bordered by: Y, Z, …" below the correct-answer line. One short line each; keep dismissible.
- Why second: spatial clustering and elaborative encoding research is among the most consistent in the literature; this turns every miss into a richer encoding event without changing the question.

**Files:** `scripts/build-countries.mjs`, `src/data/countries.json` (regenerated), `src/types.ts` (Country fields), `src/components/WorldMap.tsx` (`fillFor`), `src/components/ControlZone.tsx`, `src/components/revealZoom.ts` (if framing needs to expand to include neighbors — optional).

### M3 — New question modes for variety (interleaving across tasks)
**Effort: M · Impact: Medium**

Once M2 metadata exists, three new modes are cheap.

- `capital-to-country` — show capital, user clicks or types country. Pure recall, leverages new data.
- `country-to-capital` — inverse, builds capital recall.
- `multiple-choice` (4 options drawn from same subregion) — opt-in "easy mode" for early acquisition, with the explicit understanding that recall modes are stronger.
- Wire mode selection in `SettingsMenu`. Reuse `AnswerInput` for typed modes; add a small choice-buttons component for MC.
- Why third: interleaving across task types is a separate axis of desirable difficulty from interleaving across items. Also opens "capital + location" pairing, which the cognitive-mapping literature shows reinforces both.

**Files:** `src/types.ts` (Mode union), `src/game/useGame.ts` (mode handling), `src/components/Prompt.tsx`, `src/components/ControlZone.tsx`, `src/components/SettingsMenu.tsx`, new `src/components/MultipleChoice.tsx`.

### M4 — Cross-session persistence with FSRS (the big one) — *shipped*
**Effort: L · Impact: High · Status: implemented (see `docs/plans/m4-dual-mode.md`)**

> **Note:** The original spec below replaced the existing loop with
> FSRS. The shipped implementation instead introduces a new
> **Training** practice mode alongside a preserved **Exam** mode (the
> current loop). Both modes write to a single shared SRS store keyed
> by iso3, so Exam answers contribute to the learning algorithm without
> requiring users to opt in to Training. See `src/game/srs.ts` and the
> `practiceMode` axis in `src/game/useGame.ts`. The historical spec
> stays here for context.

The retention payoff. Make every visit pick up where the last one left off, with intervals that scale to days/weeks for well-known items.

- New `src/game/srs.ts` module wrapping `ts-fsrs` (open-spaced-repetition/ts-fsrs, MIT, FSRS-6, verified May 2026). It works out of the box with default parameters — no per-user training needed for v1. Tracks Difficulty / Stability / Retrievability per card. If we'd rather not add a dep, the algorithm is small and well-documented and can be reimplemented in ~150 lines.
- Persisted shape in localStorage (`atlasaur:srs:v1`):
  ```
  { [iso3]: { D: number, S: number, lastReview: ISOdate, due: ISOdate, reps: number } }
  ```
- Pick logic precedence: due items (oldest-due first) → not-yet-introduced (in `notabilityTier` then `sizeTier` order, biggest/most-famous first) → random in-scope.
- **Cold start**: a fresh user has zero SRS records. Introduce up to ~10 items in the first session (no due items yet); after that, the cap continues to apply per session. Don't stall the session at 10 — once the cap is hit, fall back to re-reviewing already-introduced items.
- After answer, prompt for an ease rating: Again / Hard / Good / Easy (keyboard 1/2/3/4). Map binary answers (current behavior) to Again/Good as a fallback so users who never grade still get value. **Skips map to Again** (not knowing is the same signal as the FSRS "fail" grade).
- Session structure: opens with a "Due today: N" banner. Soft cap on new introductions per session (~10) — well-established in Anki defaults; prevents review-debt blowups.
- Add a stats view (per-country D/S, mastery level) and a "reset SRS" affordance in settings.
- localStorage schema is versioned; on missing fields, treat as new.
- **Interaction with existing review phase**: deprecate `phase: "review"` and `startReview` once SRS is in. Every session is implicitly a review session because due items drive picks. Keep `state.missed` as a per-session list for the summary screen but stop using it for scheduling.
- **Interaction with mode switching**: `setMode` currently calls `initialState()` which wipes everything. Change it so SRS state persists across mode changes (only `score`/`streak`/`total`/`missed`/`current` reset).
- **SRS state shape**: one record per country (`iso3`), **shared across modes** for v1. Rationale: "knowing France" is a single concept; per-mode records would 3–4× the state size and dilute the signal. Trade-off: ease in `capital-to-country` updates the same record as `name-to-click`. Accept this; revisit if user feedback says e.g. "I know the shape but not the capital".
- **Continent filter interaction**: pick logic respects `selectedContinents` (out-of-scope countries are skipped even if due). The due record itself is preserved across scope changes — switching back to a continent later resurfaces correctly-aged items.
- Why fourth: comes after M2 so that the elaborative miss UX is already in place when reviews become the dominant interaction. M1 is **redundant** once M4 lands — the box scheduler is just a coarser, in-memory version of FSRS. If you commit to M4 within the same quarter, **skip M1 entirely**; if M4 will slip, M1 is the cheap stopgap.

**Files:** new `src/game/srs.ts`, `src/game/pickCountry.ts` (integrate due-first), `src/game/useGame.ts` (load/save, ease action, due banner), `src/components/EaseButtons.tsx` (new), `src/components/ControlZone.tsx`, `src/components/SettingsMenu.tsx` (stats + reset).

### M5 — Adaptive introduction & "spotlight" regions
**Effort: S–M · Impact: Medium**

Polishing layer that leans on M2's `sizeTier` + `subregion` and M4's SRS state.

- Introduce new countries in tier order (large/well-known first) within whatever continents are selected — matches the "block-then-interleave" finding: initial acquisition is easier in a constrained set.
- Optional "spotlight a region" affordance in the session summary: "You've got Europe at 85%. Try Southern Africa next?" Picks a subregion with ≥N still-due/unseen items and offers to narrow scope.
- Streak tracking stays as engagement, not retention metric. Optional daily-goal indicator (review queue size for today).

**Files:** `src/game/pickCountry.ts`, `src/components/SessionSummary.tsx`, `src/game/useGame.ts` (subregion narrowing).

## Cross-cutting design principles

- **Keep typed recall central.** Don't make multiple choice the default — recognition is weaker than recall. MC is opt-in for early exposure.
- **Don't speed up the miss reveal.** The reveal IS the encoding step; the current "Continue" button is already correct. Adding capital + neighbors makes the pause more productive, not longer.
- **One source of truth.** Boxes (M1) and FSRS state (M4) should not coexist — M4 replaces M1's in-memory boxes with persisted SRS state. M1 is intentionally a stepping-stone whose code is largely thrown away.
- **No silent breaking changes to localStorage.** Version every key. Migrate or reset on version mismatch.
- **Continent filter still wins.** When user narrows scope, prune the due/new queues to in-scope just as `setContinents` already prunes `retryQueue` today (`useGame.ts` lines 257–275).

## Deliberately deferred

Things considered and excluded from this roadmap, with reasons:

- **Flags**: image assets per country, licensing audit, layout work. Adds engagement but evidence for elaborative encoding via flags specifically is thin compared to capital/neighbors. Consider as a v2 polish, possibly as a 4th mode (`flag-to-country`).
- **Shape mnemonics ("Italy is a boot")**: hard to source consistently, easy to mis-curate, and the spatial-clustering literature suggests neighbor highlighting does similar work more reliably. Skip unless a contributor wants to hand-curate.
- **Trivia / fun facts**: risk of distracting from the retrieval cue at high speed; mixed evidence on retention impact. Skip.
- **Per-mode SRS state**: see M4 note — accepted trade-off for v1.
- **Maritime neighbors** (UK↔France via Channel, US↔Russia via Bering): ambiguous and dataset-dependent. Land borders only.
- **Per-user FSRS parameter training**: requires hundreds of reviews per user before it helps; default parameters from the 700M-review benchmark are excellent out-of-the-box.
- **Server-side sync / accounts**: localStorage is sufficient for a single-device learner. Account sync is a separate product decision.
- **GeoGuessr-style street view / photo-based modes**: completely different game; out of scope.

## Test invariants that must not regress

The existing `src/game/useGame.test.ts` encodes hard-won behavior; keep all of it green:

- Continent narrowing prunes `retryQueue` (M4: prune the SRS due-pool similarly) and re-picks `current` if out of scope.
- Wrong/skipped answers append to `missed` exactly once (dedup via `missedSet`).
- `dismiss` is the only path that advances `current`; correct auto-dismisses after 600 ms.
- `setMode` resets session state (M4: relax this so SRS state survives, but session counters still reset).
- Empty continent selection is a no-op.

## Verification

Per milestone:

- **M1**: extend `src/game/useGame.test.ts` — assert box promotion on correct, demotion on miss, and that picks prefer due lower-box items. Manual: long session shows weak items resurfacing on a varying cadence.
- **M2**: build-countries script validates `neighbors` resolve and `capital` is non-empty. Manual: miss a country, confirm neighbors highlight in muted blue and capital appears in the control zone within the reveal frame.
- **M3**: unit-test the matcher in capital modes via `matchTypedAnswer` analogue. Manual: cycle modes via SettingsMenu, confirm prompts and answer inputs render correctly per mode.
- **M4**: unit-test `srs.ts` against the FSRS reference vectors (the algorithm is deterministic given inputs). Persistence test: dispatch a few answers, reload, confirm `due` and `lastReview` survive. Manual: complete a session, close tab, reopen next day — due items appear first.
- **M5**: unit-test the introduction-order picker. Manual: fresh state with all continents selected — first few prompts should be large/well-known countries.

End-to-end smoke: `npm run dev`, play 20 questions per mode after each milestone; `npm test` and `npm run build` clean throughout.

## Critical files (at a glance)

- `src/game/useGame.ts` — reducer, state shape, persistence hooks
- `src/game/pickCountry.ts` — scheduling, the heart of every milestone
- `src/types.ts` — Mode, Country, RetryEntry, new SRS types
- `src/data/countries.json` + `scripts/build-countries.mjs` — data layer (M2)
- `src/components/{ControlZone,WorldMap,Prompt,SessionSummary,SettingsMenu}.tsx` — UX surface
- new `src/game/srs.ts` — M4 algorithm + persistence

## Recommended sequencing if you want results fast

If only one milestone ships: **M2** (metadata + neighbor reveal). Cheapest learning-science win, no behavioral change required from the user.

If two ship: **M2 + M4**. M4 needs `ts-fsrs` (one dep) and gives the long-term retention curve everyone is here for.

M1, M3, M5 are quality-of-life and breadth — valuable, but secondary to the encoding (M2) and the schedule (M4).

## Sources

- FSRS vs SM-2 benchmark (700M Anki reviews): [Expertium FSRS benchmark](https://expertium.github.io/Benchmark.html), [Brainscape: Comparing Spaced Repetition Algorithms](https://www.brainscape.com/academy/comparing-spaced-repetition-algorithms/), [Mindomax: FSRS vs SM-2](https://www.mindomax.com/fsrs-vs-sm2-spaced-repetition-algorithm)
- `ts-fsrs` library: [open-spaced-repetition/ts-fsrs on GitHub](https://github.com/open-spaced-repetition/ts-fsrs)
- Retrieval practice / testing effect: [Roediger & Karpicke 2006 (Power of Testing Memory)](http://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Roediger-Karpicke-2006_PPS.pdf), [Evidence Based Education: Retrieval and Spaced Practice](https://evidencebased.education/resource/retrieval-and-spaced-practice-study-strategies-that-must-be-combined/)
- Desirable difficulties (Bjork): [Bjork Learning & Forgetting Lab](https://bjorklab.psych.ucla.edu/research/), [Retrieval Practice and Spacing Effects in Young and Older Adults (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4480221/)
- Interleaving vs blocking: [Firth 2021 systematic review (Wiley)](https://bera-journals.onlinelibrary.wiley.com/doi/10.1002/rev3.3266), [Hwang 2025 — initial blocked practice helps low-achievers (Language Learning)](https://onlinelibrary.wiley.com/doi/10.1111/lang.12659), [Whether Interleaving or Blocking Is More Effective (MDPI 2025)](https://www.mdpi.com/2076-328X/15/5/662)
- Generation effect: [Bertsch et al. meta-analytic review (Psychonomic Bulletin & Review)](https://link.springer.com/article/10.3758/s13423-020-01762-3), [Wikipedia: Generation effect](https://en.wikipedia.org/wiki/Generation_effect)
- Feedback timing: [Ryan et al. 2024 — immediate and delayed equally beneficial (Medical Education)](https://asmepublications.onlinelibrary.wiley.com/doi/full/10.1111/medu.15287), [Corral, Carpenter, Clingan-Siverly 2021 (Sage)](https://journals.sagepub.com/doi/abs/10.1177/1747021820977739)
- Spatial clustering & method of loci: [Reactivated Spatial Context Guides Episodic Recall (J Neurosci)](https://www.jneurosci.org/content/40/10/2119), [Spatial Clustering During Memory Search (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8409224/)
- Half-life regression (Duolingo, considered and skipped): [Settles & Meeder, ACL 2016](https://research.duolingo.com/papers/settles.acl16.pdf), [duolingo/halflife-regression on GitHub](https://github.com/duolingo/halflife-regression)
