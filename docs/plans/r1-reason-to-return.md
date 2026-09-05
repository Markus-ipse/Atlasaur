# R1 — A reason to come back tomorrow

Release one of the September 2026 product survey (`../product-survey-2026-09.md`). The goal of the release is that a second session happens at all: fix the front door and the back door, then give the learner one line to act on when they return.

This file is the progress tracker for the release. Each item ships as its own pull request against `main`, in the order below, and gets ticked here when it merges. The decisions that govern the work are in the survey's Decisions section: curious adult, phone first, ink and wax only, fold Quiz into Study.

## Items

- [x] **R1.1 Trust the loop.** CI on pull requests (lint, typecheck, tests, build). Honest accuracy stat via a per-record hits/misses tally. Plain-language stats: "Known" and "Seen" replace "Learned", Study chips read `N to review · n of 10 new`. This document and the survey committed.
- [x] **R1.2 Fold Quiz into Study; rounds of twelve.** Study becomes the only home. The practice-mode toggle leaves the status bar. Every twelve cards, an interstitial (right this round, newly seen, Keep going as default, Done for now). "End session" leaves the gear. A round carries a type: `study` (FSRS-driven), `test` ("Test me on these": a Quiz-style pass over a chosen set with score and misses). The Daily Expedition type is reserved for release three. Both state axes stay in the reducer; only the learner-facing model changes. Removes the per-session streak from the status bar.
- [x] **R1.3 Today card and cross-day streak.** On open for a returning learner: `14 to review · 6 new · day 4` with one Begin button. Streak persisted under `atlasaur:streak:v1`, counts local days with at least one completed round, rollover at local midnight, one free missed day per rolling week. Copy never scolds; a gap reads "welcome back".
- [x] **R1.4 First-run welcome.** One screen, shown once (`atlasaur:seenWelcome`): what Atlasaur is in a sentence, then three doors: start with the big ones (all continents, introduction order does the rest), pick a region (continent chips as a choice), test me (a `test` round). The one-line intro banner on the first miss stays: it explains automatic grading at the moment it matters.
- [x] **R1.5 Installable.** Web app manifest, icons, a minimal service worker that precaches the built assets and serves them offline. No push, no background sync. Confirm the GitHub Pages subpath works with `base: "./"`.
- [x] **R1.6 Small countries on a phone.** Auto-frame the prompt's continent when a Name → Click card is drawn on a narrow viewport. Minimum hit area around tiny features. A one-time "pinch to zoom" hint when the target is under about 12 px on screen.

## Also in this release (fold into the item that touches the code)

- Remove the "Show country names after a wrong answer" toggle; labels on reveal are always on (R1.2).
- Move "Reset SRS data" under a Data heading with the stats (R1.2 or R1.3, whichever touches the settings menu first).
- Antarctica and the French Southern Territories leave the default pool behind an opt-in territories chip. Split out of R1.4 into its own item, R1.7 below, because it touches the country data and every place scope is computed rather than the welcome screen.

- [x] **R1.7 Territories opt-in.** A `territory` flag in the country table (Antarctica, French Southern Territories, Greenland, Puerto Rico, Western Sahara, French Guiana and the like), a persisted `includeTerritories` setting defaulting to off, and one shared scope computation on `GameApi` that every count and picker uses. The Antarctica continent chip disappears when territories are off.

## Order and dependencies

R1.1 is independent and comes first so every later PR has CI. R1.2 is the structural core and must land before R1.3 and R1.4, which both assume Study is the home and a round is the unit. R1.5 and R1.6 are independent of the rest and can go in any order after R1.1.

## Verification per PR

Every PR runs `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` in CI and includes tests for any reducer or scheduling change. PRs that change the learner-facing flow (R1.2, R1.3, R1.4) also include a short manual checklist in the description covering desktop and a 390 px viewport, both themes, and a fresh profile versus a profile with existing SRS data.

## What "done" looks like

A stranger opens the app on a phone, sees what it is, starts with Russia, plays a round of twelve, sees what they learned, closes it. Tomorrow they open it, see what is waiting and that it is day two, and play another round. Every number they see is one they can trust.
