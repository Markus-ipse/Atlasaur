# M5 — Spotlight subregions

## Context

The retention roadmap's M5 ("Adaptive introduction & spotlight regions") is the last unshipped milestone. Two of its three threads have already landed:

- **Adaptive introduction order** — new countries surface in `notabilityTier` → `sizeTier` order with a soft cap, in M4's `pickNextStudy` ([src/game/pickCountry.ts:76-137](../../src/game/pickCountry.ts#L76-L137)).
- **Daily goal indicator** — the top bar already shows `{dueCount} due` as a clickable button in Quiz mode (one-tap switch to Study) at [StatusBar.tsx:77-87](../../src/components/StatusBar.tsx#L77-L87), and a `Due N · New M/10` chip in Study mode at [StatusBar.tsx:113-144](../../src/components/StatusBar.tsx#L113-L144).

The remaining thread is **subregion spotlight** in the Study summary — turn the end-of-session reflection into an actionable recommendation ("Western Africa has 11 left to learn — focus there?"). Today's hint line ([SessionSummary.tsx:153-160](../../src/components/SessionSummary.tsx#L153-L160)) varies only on global `dueCount`/`newAvailableCount`; it doesn't recognise that one continent is at 85% while a neighbour is at 0%.

Cross-session streak is deliberately deferred — it needs its own localStorage key and date-rollover logic that's out of proportion to the engagement gain.

The intended outcome: a learner who clears their Study queue gets pointed at a specific underserved subregion rather than a generic "all caught up".

## Approach

### 1. Subregion mastery helper

Add to [src/game/srs.ts](../../src/game/srs.ts) (after `learnedCount`):

```ts
masteryBySubregion(store, countries, scope): Map<Subregion, { learned, total }>
```

Walks `countries` once, bucketing each in-scope iso3 into its subregion bucket. **Reuse the exact predicate already in `srs.ts`** — `learned` is `record.state >= 2` (the same expression [learnedCount](../../src/game/srs.ts#L155-L163) uses; do not reintroduce a second `stateOf(record) >= State.Review` spelling for the same concept). No `now` parameter is needed: the only metric the feature consumes is time-independent (see below), so the helper stays pure and its test is a plain structural assertion with no injected clock.

Returns one entry per subregion with at least one in-scope country (so subregions with zero countries at this topology resolution — see note below — never appear). `total` is the denominator for the mastery ratio.

**"Remaining to learn" is the single metric `total − learned`** (the complement of `learned`). It drives both the spotlight threshold and the headline number. We deliberately do *not* track a separate `new` (no-record) count or a per-subregion `due` count: `total − learned` is the exact complement of the existing "Learned" tile and of the picker's `learned/total` ratio, so the whole feature speaks one concept (mastered vs not). The summary shows remaining as a **single number** — see §4. (The "Due > 0" hint branch in §4 uses the existing global continent-scoped `dueCount`, not a subregion breakdown, which is why no per-subregion `due` is computed here.)

### 2. Spotlight picker

New pure function in [src/game/pickCountry.ts](../../src/game/pickCountry.ts) (or a sibling `src/game/spotlight.ts` if `pickCountry.ts` is getting crowded):

```ts
pickSpotlight(masteryMap): { subregion, remaining } | null
```

where `remaining = total - learned`.

Rule: **filter, then rank density-first.**

1. **Filter** to subregions with `remaining >= SPOTLIGHT_MIN_REMAINING`. This gate runs *before* ranking — otherwise a low-ratio subregion that's below the gate would be chosen, fail the size check, and return `null` even though a higher-ratio subregion above the gate existed. Concretely with `SPOTLIGHT_MIN_REMAINING = 3`: Southern Africa at 4/5 learned (ratio .80, remaining **1**) has the lowest ratio but fails the gate; Eastern Africa at 13/16 (ratio .8125, remaining **3**) clears it. Rank-then-null-check would pick Southern Africa, fail the gate, and return `null`; filter-first drops Southern Africa and correctly surfaces Eastern Africa. Rank-then-null-check makes the feature go dark in exactly the late-game state where it's most useful, so the gate must come first.
2. **Rank** the survivors by **lowest `learned / total` ratio** (most-neglected proportionally), tiebroken by highest `remaining` (largest pool), then alphabetically for determinism. A 0/12 region wins over a 5/50 region.
3. Return `null` only if *no* subregion clears the gate.

Threshold lives as a named constant alongside `STUDY_NEW_CAP`. Against the real distribution (178 countries, 21 subregions present; smallest real ones are Northern America = 3, Australia & NZ = 2, Antarctica = 2, then Central Asia / Melanesia / Southern Africa = 5), **`SPOTLIGHT_MIN_REMAINING = 3`** excludes the 2–3-country regions without nuking the 5-country ones. Confirm against the chosen `remaining` metric, not raw totals, when records exist.

### 3. Temporary subregion focus

Add `spotlightSubregion: Subregion | null` to `State` in [src/game/useGame.ts](../../src/game/useGame.ts). **Not persisted** — initial value is always `null`. Cleared automatically by:

- Page reload (it's not in `loadPersistedState`)
- `setContinents` (already prunes scope; just null out spotlight in the same action)
- `setPracticeMode("quiz")` (see below)
- The depletion fallback (auto-clear, see below)
- A `clearSpotlight` action — wired for the auto-clear paths and tests. No manual dismiss control ships in v1: the only entry point is the summary CTA, and a user-facing "clear spotlight" affordance is deferred alongside the top-bar banner (Out of scope). The map tint (§5) is the active-state signal; spotlight clears on its own via the paths above.

Add `setSpotlight(subregion)` action. **Spotlight applies to Study mode only** — it's a SRS-practice lens, not a Quiz scope. Concretely:

- **`setSpotlight` resets `newIntroducedThisStretch` to 0.** Activating a spotlight is conceptually a fresh study stretch. Without this reset the feature self-cancels in its most common trigger state: the natural path to the spotlight CTA is `dueCount === 0`, which is also when the per-stretch new-introduction cap (`STUDY_NEW_CAP`) is typically already hit ([App.tsx:63-67](../../src/App.tsx#L63-L67) gates the caught-up banner on exactly this). Focusing on an all-unseen region with the cap exhausted would make the pick return `null` immediately (no due records, fresh blocked by cap, no existing records in an all-unseen subregion) and instantly fire the depletion toast. Resetting the stretch lets the user introduce up to `STUDY_NEW_CAP` new countries in the focused region, so the CTA reliably delivers.
- **Narrow the pool in `nextCurrent`, not in `filterPool` or `pickNextStudy`.** `filterPool` is shared by Quiz's `pickNext`, `pickInitialCountry`, and `nextCurrent`; extending it would risk leaking the spotlight into Quiz. `pickNextStudy` stays a pure, spotlight-agnostic picker. The narrowing lives in [nextCurrent](../../src/game/useGame.ts#L252-L275): when `practiceMode === "study"` and `spotlightSubregion !== null`, build `filterPool(state.selectedContinents).filter(c => c.subregion === state.spotlightSubregion)` and pass that pool to `pickNextStudy`. `pickInitialCountry` is unaffected (spotlight is always `null` at init).
- `setPracticeMode("quiz")` clears `spotlightSubregion` so a learner flipping into Quiz never gets a silently narrowed pool. (Flipping back to Study lands them on full continent scope; they can re-spotlight from the next summary.)
- Counters (`dueCount`, `newAvailableCount`, ScorePanel) stay continent-scoped. The spotlight only changes which country is *picked*, not which counts the user sees. This keeps ambient stats stable and avoids confusing the user into thinking they've lost progress on other subregions.

**Spotlight depletion (BLOCKER fix):** `pickNextStudy` returning `null` does NOT end the Study session today — `nextCurrent` returns `picked ?? state.current`, which would leave the user stuck on the same prompt. With a spotlight, depletion is easy to hit (e.g. user spotlights a 5-country region and learns the lot).

Fix: when the narrowed pick returns `null` and `state.spotlightSubregion !== null`, auto-clear the spotlight, re-run the pick against the full continent pool, and write a transient toast ("Spotlight cleared — back to full scope") so the user isn't surprised by the suddenly out-of-region prompt — all in the same reducer step.

**This is not a localized change — mind the blast radius.** `nextCurrent` currently returns a bare `Country` and swallows the null case as `picked ?? state.current`, so it can't signal "depleted." Rather than thread that through every caller, extract a shared helper:

```ts
pickStudyWithSpotlightFallback(state, now): { current, spotlightSubregion, transientMessage }
```

It tries the narrowed pool; on `null` with a spotlight active, it clears the spotlight, re-picks from the full continent pool, and sets the toast. Route **both** `dismissFeedback` and `closeSummary` through it (and `setPracticeMode`, which already nulls the spotlight, so it's a no-op there).

**Call it with the post-grade state, not the original `state`.** In `dismissFeedback`'s study branch the `srsStore` is updated (the deferred auto-grade is committed) *before* the next pick — `nextCurrent` is called today with the `updated` object at [useGame.ts:443](../../src/game/useGame.ts#L443), not `state`. The fallback helper must receive that same post-grade state, or the re-pick runs against a stale store and can re-surface the country just graded.

The primary depletion case is **mid-session** via `dismissFeedback`, after the user works through the focused region. The `closeSummary` routing is **defensive**: because `setSpotlight` resets the stretch cap and `pickSpotlight` only ever offers a region with `remaining >= SPOTLIGHT_MIN_REMAINING` learnable cards, a freshly-activated spotlight can't actually deplete on the first pick — but routing both paths through the one helper keeps the contract uniform and guards against future entry points (e.g. a settings picker) that don't share `setSpotlight`'s reset.

**New toast primitive.** No toast component exists in the codebase. Add a minimal one for this milestone:

- A new `<Toast>` component in `src/components/Toast.tsx` — positioned (e.g. top-center, below the StatusBar), parchment palette, auto-dismisses after ~3s.
- A `transientMessage: string | null` slice in `State` plus `setTransientMessage(msg)` / `clearTransientMessage` actions. The `useGame` hook owns the auto-dismiss timer (mirrors how `FEEDBACK_DURATION.correct` triggers an auto-`dismiss` effect at [useGame.ts:690-697](../../src/game/useGame.ts#L690-L697)).
- The depletion reducer step writes `transientMessage: "Spotlight cleared — back to full scope"` alongside clearing the spotlight.
- Honour `prefers-reduced-motion` for the fade in/out.
- Scope to this single use case; don't generalize to a queue/stack of toasts. If a second feature wants toasts later, generalize then.

### 4. Study summary wiring

In [src/components/SessionSummary.tsx:122-220](../../src/components/SessionSummary.tsx#L122-L220) (the Study branch):

- Compute `masteryBySubregion` and `pickSpotlight` from the props already in scope (`srsStore`, `scopeIso3s` → needs `countries` lookup too; thread `lookupCountry` from `GameApi` or pass the country list).
- Replace the hint line at [SessionSummary.tsx:153-160](../../src/components/SessionSummary.tsx#L153-L160) with a four-way branch (preserves the existing `newAvailableCount > 0` "introduce more" nudge):
  - **Spotlight available** → "{Subregion} has {remaining} left to learn — focus there?" (single number — `remaining = total − learned`; don't pair it with a separate `due` count, since the two overlap and would double-count a not-yet-mastered card that's also due) plus a primary CTA button **"Focus on {Subregion}"** that calls `setSpotlight(...)` then `closeSummary()`. Place beside the existing "Start quiz" / "Keep studying" buttons (this becomes the third button when present, and the recommended-action focus moves to it).
  - **Due > 0** → current "keep going" copy.
  - **`newAvailableCount > 0`** → current "introduce N more" copy.
  - **All caught up, no spotlight candidate** → current "all caught up" copy.

Wire the new action through `GameApi` like other dispatchers.

### 5. Map-level spotlight cue

When `state.spotlightSubregion !== null`, the WorldMap tints countries inside the spotlight subregion with a subtle highlight so the learner has a contextual signal of where they're focused. This replaces what would otherwise be an invisible feature.

- Compute a `spotlightIso3Set` in `App.tsx` from `state.spotlightSubregion` (module-level lookup against the countries list).
- Pass it through to `WorldMap` as a new prop.
- Add a new visual state in [src/components/fillFor.ts](../../src/components/fillFor.ts) — a low-priority overlay placed after the `highlightedIso3` check and before the `inScope` default. Precedence for a *feedback-involved* country: feedback states → neighbor → highlight → **spotlight** → in-scope default. Note the precise behavior: the early `if (feedback)` block in `fillFor` only returns for the correct/wrong/neighbor countries and falls through for everyone else, so during a miss-reveal a spotlight country that *isn't* the answer or a neighbor will still show the spotlight tint. That's fine (spotlight is ambient), but assert that in the test rather than claiming a blanket "spotlight loses to all feedback states." The spotlight tint must be distinguishable from the existing `COLOR_NEIGHBOR` blue (neighbors are a transient reveal cue; spotlight is a persistent ambient cue) — pick a different hue from the parchment palette (e.g. an ochre wash) and add it to `@theme` in `src/index.css`.
- Update `readPaletteFromCss()` to pull the new token, mirroring how the existing palette colors are resolved at runtime.
- Add a `fillFor` test case for the new precedence rules.

### 6. Tests

Extend [src/game/useGame.test.ts](../../src/game/useGame.test.ts):

- `setSpotlight` narrows Study picks to the subregion **and resets `newIntroducedThisStretch` to 0**; clears on `setContinents`; clears on `clearSpotlight`; clears on `setPracticeMode("quiz")`.
- `setMode` (question-mode flip) does not carry spotlight (goes through `initialState`, which defaults to `null`).
- Reload (re-init from persisted state) does not carry spotlight.
- `pickSpotlight` **filters to `remaining >= SPOTLIGHT_MIN_REMAINING` first, then ranks** by lowest `learned/total` ratio (tiebroken by largest remaining, then alphabetical). Include the late-game case: a tiny low-ratio subregion below the gate must NOT suppress a larger above-gate subregion (the rank-then-null-check bug). Returns `null` only when no subregion clears the gate; ignores out-of-scope subregions.
- Spotlight pool exhausted → shared `pickStudyWithSpotlightFallback` auto-clears spotlight, re-picks from the full continent pool, writes `transientMessage`. Cover **both** paths: mid-session via `dismissFeedback` (fixture: spotlight subregion all due-in-future, no fresh introductions) **and** activation-time via `closeSummary` (fixture: "Focus on X" lands on an already-depleted region).
- Toast auto-dismiss timer clears `transientMessage` after the configured interval.
- `masteryBySubregion` aggregates `learned`/`total` correctly across a small fixture store (pure structural assertion, no clock); `learned` matches `learnedCount`'s `state >= 2` predicate.
- Quiz mode ignores `spotlightSubregion` even if state has one (defense-in-depth — `setPracticeMode` should clear it, but verify Quiz picks are continent-scoped if state somehow carries one).

Run `npm test` and `npm run build` to confirm clean.

## Critical files

- [src/game/srs.ts](../../src/game/srs.ts) — add `masteryBySubregion`
- [src/game/pickCountry.ts](../../src/game/pickCountry.ts) — add `pickSpotlight` (`pickNextStudy` stays spotlight-agnostic; do **not** touch the shared `filterPool`)
- [src/game/useGame.ts](../../src/game/useGame.ts) — `spotlightSubregion` slice on `State`, `transientMessage` slice + timer, `setSpotlight` (resets `newIntroducedThisStretch`)/`clearSpotlight`/`setTransientMessage`/`clearTransientMessage` actions, `pickStudyWithSpotlightFallback` helper routed through `dismissFeedback` + `closeSummary`, narrow the pool in `nextCurrent`, expose new dispatchers on `GameApi`, clear spotlight on `setContinents`. (Both `State` and `GameApi` are defined here, not in `types.ts`.)
- [src/components/SessionSummary.tsx](../../src/components/SessionSummary.tsx) — four-way hint branch + Focus CTA
- [src/components/WorldMap.tsx](../../src/components/WorldMap.tsx) — accept `spotlightIso3Set` prop, thread to `fillFor`
- [src/components/fillFor.ts](../../src/components/fillFor.ts) — new spotlight-tint visual state + precedence
- [src/index.css](../../src/index.css) — new spotlight tint token in `@theme`
- [src/App.tsx](../../src/App.tsx) — derive `spotlightIso3Set` from `state.spotlightSubregion`, pass to WorldMap; render `<Toast>` when `state.transientMessage` is set
- `src/components/Toast.tsx` (new) — minimal one-shot toast for the spotlight-cleared notification
- [src/types.ts](../../src/types.ts) — already exports `Subregion`; no change needed unless a shared spotlight type is extracted (`State`/`GameApi` live in `useGame.ts`, not here)
- [src/game/useGame.test.ts](../../src/game/useGame.test.ts) — coverage for the above

## Out of scope

- Cross-session streak (deferred per design discussion).
- Persistent subregion filter — focus is temporary by design.
- SettingsMenu subregion picker — only end-of-session entry point for v1.
- Top-bar persistent "Spotlight active" banner — visibility is handled by the map tint instead (§5).

## Verification

1. `npm test` — new tests for spotlight scoping, mastery aggregation, persistence-on-reload behaviour. All existing tests stay green.
2. `npm run build` — typecheck + production build clean.
3. `npm run dev` smoke:
   - Fresh state, Africa selected, study until summary appears → confirm spotlight recommends the densest unmastered subregion; "Focus on …" narrows picks to that subregion on next round.
   - With spotlight active, change continents → spotlight clears, scope expands as expected.
   - Reload during a spotlight session → spotlight gone, full continent scope restored.
4. Manual edge: smallest *real* subregions in the dataset — Antarctica (ATA + ATF = 2), Australia & New Zealand (2), Northern America (3). Confirm `SPOTLIGHT_MIN_REMAINING = 3` keeps these from being recommended. Note: **Micronesia and Polynesia have zero countries** at 110m resolution (only 21 of the 23 `Subregion` values appear in `countries.json`), so `masteryBySubregion`'s "≥1 in-scope country" guard already drops them — they need no special handling.
