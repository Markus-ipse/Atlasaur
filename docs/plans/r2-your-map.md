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

- [x] **R2.1 Paint mastery onto the map.** Three ambient fills driven by the SRS store, always on: unseen as a ghost outline, introduced as a light wash, known as full pigment. A per-continent percentage engraved on the map beside each continent. One more branch in `fillFor` plus a memoised iso3-to-tier map; reveal, neighbour, highlight and spotlight states all stay on top. This document committed.
- [x] **R2.2 Milestones in the house style.** Streak escalation in the correct-answer hero copy at 5, 10 and 20 ("A steady hand." / "Cartographer's eye." / "Drawn from memory."). The first time a country becomes known, a one-second engraved hatch on the map and "Portugal, now on your map." A wax seal when a continent completes. Sound and haptics split out into R2.5 — see below.
- [x] **R2.3 Keep the world in the reveal.** Every reveal frame is pulled back so the answer is shown in a world rather than alone, floored by the resting frame, by the whole map, and by the answer staying findable. Neighbour labels already won over the fit check. This reduces the survey's last open bug rather than closing it: countries with a neighbour label outside the frame go from 36 to 26, and the rest are answers beside a giant neighbour that the frame deliberately excludes. Closing that gap means changing what gets labelled, not what gets framed — noted as a follow-up.
- [ ] **R2.4 Count what we cannot see.** The survey's "What to measure" list as one local, versioned counters key, surfaced under the Data heading in settings: distinct days with a completed round and the gaps between them, cards answered before the first close, rounds started versus finished, known countries over time, and the mode mix. No backend, no network, no opt-in to write locally.
- [ ] **R2.5 Quill sound and haptics.** Both optional, both off by default. Split out of R2.2: there is no audio asset in the repo and the fonts policy says everything is self-hosted, so this needs either a licensed sample committed under `public/` or a synthesised scratch via Web Audio, and `navigator.vibrate` is unsupported on iOS, which is the phone-first target. Neither question should hold up the visual ceremony.

## Design decisions taken in this release

- **A milestone is computed at answer time, not at commit time.** The ceremony plays during the correct flash, but a Study grade is not committed until the card is dismissed. `applyCorrect` therefore grades a throwaway copy with `srsGrade` (which is pure) to decide what to mark, and `dismissFeedback` grades again for real. A test pins that the two agree across every card state and the length of the flash, because a ceremony the commit does not deliver would be a lie.
- **The wax seal is pressed in the panel, not on the map.** A seal stamped at the continent's map anchor is the more evocative image, but it needs the continent to be on screen and legible, which on a 390 px world view it is not. The panel is where the learner is already reading the answer.
- **One ceremony per answer.** A continent seal supersedes the country line, and any milestone supersedes a streak note. Two marks landing together is the pile-on that "ink and wax only" exists to rule out.

- **The mastery paint is always on, not a separate progress screen.** The survey's phrase is "the progress view becomes the map at rest". Every dialog in the app sits behind a full-screen scrim, so a paint that only showed while a dialog was open would be a paint nobody sees. The three fills are therefore ambient and permanent, and the reveal states keep their existing precedence above them.
- **Mastery sits at the bottom of the `fillFor` precedence chain**, below the spotlight wash. Spotlight is a deliberate, transient focus the learner switched on; ambient progress must not compete with it.
- **The introduced wash is collapsed into unseen in `name-to-click`.** The Study scheduler partitions its picks exactly on that boundary: the new-introduction branch requires no SRS record, while the resurface, due and most-overdue branches all require one. Tier 1 is by construction tiny — the cards still in FSRS learning, which is precisely the set the scheduler resurfaces — so a wash on those countries would narrow "find Portugal" to three or four. Tiers 0 and 2 are both large, so a two-tone map leaks nothing. `shape-to-name` keeps all three tones, because the shape is already highlighted there and knowing you have met a country cannot supply its name. A welcome side effect: in click mode the paint changes only when a country becomes known, which is exactly the moment R2.2 marks.
- **A test round gets a neutral map.** No paint, no percentages, in either question mode. A test's picks are random, so there is no tier-to-pick correlation to leak, but a test is a measurement and elimination off the map would substitute for the locating skill being scored.
- **The reveal floor is a uniform pull-back, not the answer's subregion.** Capping at the subregion is the reading the survey's wording invites, and it was the first implementation, but subregions run from the Baltics to the whole of South America: measured against the real country table it turned a Guyana reveal into the world view while barely moving a Luxembourg one. Pulling every fitted frame back by the same factor behaves consistently at every size. The survey's fallback of a corner locator inset was not needed: the pull-back stops short of making the answer unfindable rather than pushing past it.
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
