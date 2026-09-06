# R3 — Variety, and a hook to share

Release three of the September 2026 product survey (`../product-survey-2026-09.md`).
Release one made a second session happen; release two made the map itself the
reason to return. This release gives the returning learner something new to do
with the map — a second and third kind of question — and one thing to show
someone else.

This file is the progress tracker for the release. Each item ships as its own
pull request against `main`, in the order below, and gets ticked here when it
merges. An item that is dropped rather than shipped keeps its place in the list
without a checkbox. The decisions that govern the work are in the survey's
Decisions section: curious adult, phone first, ink and wax only, fold Quiz into
Study. Its "Things to resist" list applies in full, and two entries bind
especially hard here: no accounts or leaderboards (the expedition is the social
hook precisely so those never need to exist) and no multiple choice as a main
loop.

## Items

- [ ] **R3.1 The Daily Expedition.** Ten countries seeded by the local date, the same ten for everyone, one attempt a day, Name → Click. Each miss gets the ordinary reveal, because the reveal is the teaching; there is no retry pass and no second go. The round ends on a result card: a row of ten ink-block glyphs, one per country in order, a caption with the date and the count, and a Share button that hands the row and the caption to `navigator.share` where it exists and to the clipboard otherwise, always as plain text. Reopening the app that day shows the result, not a replay. Reached from the Today card and the Study summary. Persisted under `atlasaur:expedition:v1`. This document committed.
- [ ] **R3.2 A record per fact, and the capital modes.** The SRS store goes to version 2 with one record per country *and fact* — `location`, `capital`, later `borders` and `flag` — and every existing version-1 record migrates to the `location` facet, so nobody loses a day of progress. Two new question modes grade the `capital` facet: *Capital → Click* ("Find the country whose capital is Lima") and *Country → Capital* (typed, accepting `capitalAlternates` through the same `normalize` matcher). The mode picker grows from two to four; the mastery paint keeps reading `location` only.
- [ ] **R3.3 Which borders….** A fifth mode: "Tap a country that borders Mongolia." Any land neighbour is a correct answer; a wrong tap gets the existing neighbour reveal, which is exactly the elaboration this question needs. Grades the `borders` facet. Islands have no neighbours and are out of this mode's pool. Also carries release two's open follow-up (below): the neighbour label that lands off frame beside a giant neighbour.
- [ ] **R3.4 Finish the world.** The island and micro-states the 110m topology does not carry — from Cabo Verde and Mauritius down to Singapore, and Bahrain, which is already in the COUNTRIES table and dropped by the topology intersection — via the 50m topology for the small features, or clickable point markers with the same iso3 plumbing; the PR decides after measuring the payload. Every entry new to the table gets the full row (capital, coordinates, subregion, tiers), so the modes from R3.2 and R3.3 cover it on arrival.
- [ ] **R3.5 Flags.** A sixth question mode (the survey's "fourth", counting the two capital modes as one) with its own `flag` facet, after the location, capital and border questions above all exist and not before. Needs a licensing audit for the image assets and a decision on how a flag is drawn in an ink-and-wax app; both are questions for its own plan section, written when R3.1–R3.3 have shipped and the mode-mix counters say how much a fourth kind of question is wanted.

## Also in this release (fold into the item that touches the code)

- The last of the survey's reveal bugs. R2.3 left 26 countries whose neighbour label anchors outside the final frame, all of them answers beside a giant neighbour that `computeRevealTarget` excludes from the frame on purpose. The fix is to change what gets labelled, not what gets framed: a neighbour dropped from the frame is still painted but its label is pinned to the edge of the frame nearest its anchor, or dropped when even that would overlap the answer. Goes with R3.3, whose whole question is neighbours.
- The neighbour blue's contrast, noted in `m2-followups.md`. R3.3 makes that colour carry a correct answer for the first time, so it is the moment to check it against both themes and the mastery ramp rather than leaving it as a later palette pass.
- `roundsByPractice` and `answersByQuestionMode` in the counters grow with each round type and question mode as it lands, so the survey's "mode mix" figure is real from the day there is a choice.

## Order and dependencies

R3.1 comes first. It is the release's "high for return" item, it needs no
change to the SRS store, and R1.2 reserved its place: the plan named the
Daily Expedition as the third round type, and "Test me on these" already
proves a scored pass over a fixed set. The reservation is in the plan rather
than the code — a round's kind is still `practiceMode: "quiz" | "study"`, and
`roundsByPractice` is typed to match — so R3.1 widens that union rather than
adding a parallel axis. Starting with the schema migration instead would delay the
one item that brings a learner back tomorrow behind the one that is hardest to
get right.

R3.2 comes second and is the structural core of the rest. R3.3 and R3.5 grade
facets that only exist once the store is per fact, and R3.4's new countries
should arrive into a store that already has a place for their capitals. R3.2
lands as one PR — migration and the two capital modes together — because a
migration with nothing reading the new facet is a change nobody can verify in
the app.

R3.3 follows R3.2 directly. It is small, it reuses the M2 neighbour data and
reveal without new metadata, and it closes the last open bug from the survey.

R3.4 is independent of the modes in code, but goes after them so the new
entries land with every fact filled in once rather than being backfilled twice.
It is also the riskiest change in the release — the topology is a committed
build artefact consumed by both the map and the country build — and it should
not sit underneath the release's return hook.

R3.5 is last by the survey's own instruction: flags come after the other
question kinds exist, not before.

## Decisions this plan takes

Written before the code, to be amended by the PR that proves them wrong.

- **The expedition ignores the continent filter and the territories setting.** Everyone gets the same ten countries on the same day, or the result cannot be compared with anyone else's, and comparison is the whole point of a result you can copy. The ten are drawn from the full non-territory pool by a seeded shuffle over the iso3-sorted list, so the set for a date is a function of the date and the pool only. R3.4 will grow the pool and so change every future day's ten; that is fine, and it is why the seed is over the pool rather than a fixed table. Two learners on different service-worker builds could see different sets for the same day for as long as one of them keeps a tab open; the update model chosen in R1.5 makes this rare and short, and it is not worth a version stamp in the caption.
- **Name → Click only.** A copied row of glyphs has to mean one thing. A typed mode brings alias and spelling ambiguity into a score that is being shown to someone, and the click mode is the one the map is for. Which glyph means what is the one thing the caption never has to explain: filled is found, empty is missed.
- **Every answer writes through to the SRS store, as a test round does.** A country the learner was asked to find and could not is a fact the scheduler should know, wherever the continent filter sits. It creates records outside the current scope; the existing rule already handles that, they resurface when the scope widens. "Don't know" stays available, as it is on every other card. Grading is `Correct → Good`, `Wrong → Again`, `Skip → Again`, with no review phase to double-count; a skip is an empty glyph like a miss.
- **The expedition is a round of ten, not twelve, and it is a finished round.** The interstitial does not appear inside it; the result card is its round break. Finishing one records the day in the cross-day streak, since the survey's own measure is "a completed round" and this is one. `roundsByPractice` gains an `expedition` count.
- **One attempt means one attempt.** The store keeps the day and the ten outcomes; an expedition abandoned halfway keeps the answers given so far and resumes on return, and a finished one shows its result card until local midnight. There is no "try again" — the second go is tomorrow, which is the mechanic.
- **The result is text, not an image.** Ten glyphs and two short lines survive every messaging app and need no share sheet. `navigator.share` is used on a phone when it exists, the clipboard otherwise, and the text is always visible and selectable on the card so a learner can copy it by hand if both fail.
- **`location` is one fact, whichever way it is asked.** Name → Click and Shape → Name both test whether the learner can connect a country's name to its place on the map, so both keep grading the `location` facet after the split. Splitting them would halve the history every existing learner has built, for no fact they do not already share.
- **The map paints `location` only.** Knowing a capital is not having a country on your map. If a second layer of paint is ever wanted for capitals it is a separate decision, and probably a separate view; the ambient paint stays a single fact so that it stays legible.
- **No multiple choice, including in "Which borders…".** The temptation is to offer four names. The map is the answer sheet: the learner taps a neighbour, and every neighbour is right. Recall, not recognition.

## Verification per PR

Every PR runs `npm run lint`, `npm run typecheck`, `npm test` and
`npm run build` in CI and includes tests for any reducer, scheduling, seeding
or migration change. R3.1 pins that a date yields the same ten across runs and
across the pool's sort order; R3.2 pins that a version-1 store migrates
losslessly into the `location` facet and that a fresh store starts at version
2. PRs that change what the learner sees also include a short manual checklist
in the description covering desktop and a 390 px viewport, both themes, and a
fresh profile versus a profile with existing SRS data.

## What "done" looks like

A learner opens Atlasaur, sees today's expedition waiting under the Today card,
finds eight of ten, and sends the row to a friend who found six. Tomorrow they
switch the question to capitals and discover that the map they have mostly
inked in is, by that fact, mostly blank again. Their progress from the first
two releases is exactly where they left it.
