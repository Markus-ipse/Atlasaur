# R2 — Your map

Release two of the September 2026 product survey (`../product-survey-2026-09.md`).
Release one made a second session happen at all. This release makes the map
itself the reason to keep coming back: what you know is painted onto the world,
and the app marks the moments worth marking.

This file is the progress tracker for the release. Each item ships as its own
pull request against `main`, in the order below, and gets ticked here when it
merges. The decisions that govern the work are in the survey's Decisions
section: curious adult, phone first, ink and wax only, fold Quiz into Study.

## Items

- [ ] **R2.1 Paint mastery onto the map.** Three ambient fills driven by the SRS store, always on: unseen as a ghost outline, introduced as a light wash, known as full pigment. A per-continent percentage engraved on the map beside each continent. One more branch in `fillFor` plus a memoised iso3-to-tier map; reveal, neighbour, highlight and spotlight states all stay on top. This document committed.
- [ ] **R2.2 Milestones in the house style.** Streak escalation in the correct-answer hero copy at 5, 10 and 20 ("A steady hand." / "Cartographer's eye."). The first time a country becomes known, a one-second engraved hatch fill and "Portugal, now on your map." A wax-seal stamp when a continent completes. Optional quill sound and haptics, both off by default.
- [ ] **R2.3 Keep the world in the reveal.** A floor on the reveal zoom so the frame never tightens past roughly a subregion, and neighbour labels win over the fit check. Closes the last open bug in the survey: a neighbour label landing off screen on a tight reveal.
- [ ] **R2.4 Count what we cannot see.** The survey's "What to measure" list as one local, versioned counters key, surfaced under the Data heading in settings: distinct days with a completed round and the gaps between them, cards answered before the first close, rounds started versus finished, known countries over time, and the mode mix. No backend, no network, no opt-in to write locally.

## Design decisions taken in this release

- **The mastery paint is always on, not a separate progress screen.** The survey's phrase is "the progress view becomes the map at rest". Every dialog in the app sits behind a full-screen scrim, so a paint that only showed while a dialog was open would be a paint nobody sees. The three fills are therefore ambient and permanent, and the reveal states keep their existing precedence above them.
- **Mastery sits at the bottom of the `fillFor` precedence chain**, below the spotlight wash. Spotlight is a deliberate, transient focus the learner switched on; ambient progress must not compete with it.
- **The introduced wash is collapsed into unseen in `name-to-click`.** The Study scheduler partitions its picks exactly on that boundary: the new-introduction branch requires no SRS record, while the resurface, due and most-overdue branches all require one. Tier 1 is by construction tiny — the cards still in FSRS learning, which is precisely the set the scheduler resurfaces — so a wash on those countries would narrow "find Portugal" to three or four. Tiers 0 and 2 are both large, so a two-tone map leaks nothing. `shape-to-name` keeps all three tones, because the shape is already highlighted there and knowing you have met a country cannot supply its name. A welcome side effect: in click mode the paint changes only when a country becomes known, which is exactly the moment R2.2 marks.
- **The mastery ramp has two ordering constraints in both themes.** Every tier must stay clear of the out-of-scope `inert` fill, or the continent filter stops reading on the map; and `known` must stay below `spotlight`, which sits directly above it in the precedence chain. The dark palette needed a wider ramp than light to hold the first, and the dark spotlight had to be lifted to hold the second.
- **"Known" reuses `learnedCount`'s predicate** (FSRS state ≥ 2, graduated past Learning/Relearning) so the map and the "Known" stat can never disagree. "Introduced" is any record at all, matching `seenCount`.

## Order and dependencies

R2.1 comes first: it is the highest-impact item in the release and R2.2's
first-time-known hatch animates the tier change R2.1 introduces. R2.3 and R2.4
are independent of both and can land in any order.

## Verification per PR

Every PR runs `npm run lint`, `npm run typecheck`, `npm test` and
`npm run build` in CI and includes tests for any reducer, scheduling or
aggregate change. PRs that change what the learner sees also include a short
manual checklist in the description covering desktop and a 390 px viewport,
both themes, and a fresh profile versus a profile with existing SRS data.

## What "done" looks like

A learner who has played for a week opens Atlasaur and sees, without pressing
anything, how much of the world they have taken: Europe mostly inked in, Africa
still ghosted, a percentage under each. Getting a country right for the first
time is marked once, in ink, and never mentioned again.
