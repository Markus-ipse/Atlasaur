# R3 — Variety, and a hook to share

Release three of the September 2026 product survey (`../product-survey-2026-09.md`).
Release one made a second session happen; release two made the map itself the
reason to return. This release gives the returning learner something new to do
with the map — a second kind of question, capitals, with a third held for
later — and one thing to show someone else.

This file is the progress tracker for the release. Each item ships as its own
pull request against `main`, in the order below, and gets ticked here when it
merges. An item that is dropped rather than shipped keeps its place in the list
without a checkbox; one that is held — not built, not dropped — does the same
and says so in italics with the date. The decisions that govern the work are in the survey's
Decisions section: curious adult, phone first, ink and wax only, fold Quiz into
Study. Its "Things to resist" list applies in full, and two entries bind
especially hard here: no accounts or leaderboards (the expedition is the social
hook precisely so those never need to exist) and no multiple choice as a main
loop.

## Items

- [x] **R3.1 The Daily Expedition.** Ten countries seeded by the local date, the same ten for everyone, one attempt a day, Name → Click. Each miss gets the ordinary reveal, because the reveal is the teaching; there is no retry pass and no second go. The round ends on a result card: a row of ten ink-block glyphs, one per country in order, a caption with the date and the count, and a Share button that hands the row and the caption to `navigator.share` where it exists and to the clipboard otherwise, always as plain text. Reopening the app that day shows the result, not a replay. Reached from the Today card and the Study summary. Persisted under `atlasaur:expedition:v1`. This document committed.
- [x] **R3.2 A record per fact, and the capital modes.** The SRS store goes to version 2 with one record per country *and fact* — `location`, `capital`, later `borders` and `flag` — and every existing version-1 record migrates to the `location` facet, so nobody loses a day of progress. Two new question modes grade the `capital` facet: *Capital → Click* ("Find the country whose capital is Lima") and *Country → Capital* (typed, accepting `capitalAlternates` through the same `normalize` matcher). The mode picker grows from two to four; the mastery paint keeps reading `location` only.
- **R3.3 Which borders…** — *held, 2026-09-12.* A fifth mode: "Tap a country that borders Mongolia." Any land neighbour is a correct answer; a wrong tap gets the existing neighbour reveal. Grades the `borders` facet. Not dropped, not built: the reasons are one entry under Decisions below. Revisit after R3.4, with the capital counters in hand. The two follow-ups it was carrying move to R3.3a.
- [x] **R3.3a The neighbour reveal, finished.** The two release-two follow-ups that were folded into R3.3, shipped on their own because they are bugs whatever happens to the mode. **(a)** *Shipped.* The off-frame neighbour label: R2.3 left 26 countries whose neighbour label anchors outside the final reveal frame, all of them answers beside a giant neighbour that `computeRevealTarget` drops on purpose. Change what gets labelled, not what gets framed: a neighbour dropped from the frame is still painted, and its label moves onto the part of it that is on screen — its polygons clipped to the frame, the label at the pole of the visible piece nearest the answer — or is dropped when nothing of it is visible or the label would cover one that carries the reveal. The plan said "pinned to the edge of the frame nearest its anchor"; the PR disproved that (Azerbaijan's nearest corner is over Kazakhstan). Measured against the real table: all 26 placed on their own land, none dropped, and the survey is now a test. **(b)** *Shipped.* The neighbour tone's contrast. `m2-followups.md` raised it against Tailwind blues that no longer shipped; the warm ochre that replaced them was checked against inert land and every step of the mastery ramp in both themes, and failed (1.02 against the spotlight, 1.2 against known, in light). The neighbour fill is now the teal-engraving pigment and a test pins the floor.
- [x] **R3.4 Finish the world.** The 29 countries in their own right that the 110m topology does not carry, from Cabo Verde and Mauritius down to Singapore and Tuvalu, and Bahrain, which was already in the COUNTRIES table and dropped by the topology intersection. **Point markers, not 50m geometry**, measured: the 50m shapes for the 28 that world-atlas has at that resolution cost 10 KB (3.4 KB gzipped), so payload decided nothing — but 20 of them are under 3 px across on a 1000 px world view and several stay sub-pixel at `MAX_ZOOM`, so a shape would have been a dot anyway; Kiribati spans the antimeridian, which breaks every bounds-based routine; Tuvalu is only in the 10m data; and the European enclaves do not share arcs with the 110m Italy or France, so the one argument for geometry — computed neighbours — did not hold either. Each is a dot at its capital, painted and clicked like a shape, with the full row (capital, coordinates, subregion, tiers) so the capital modes cover it on arrival, and hand-entered borders for the five enclaves, mirrored onto their neighbours by the build. The topology artefact is untouched. Three decisions below.
- [ ] **R3.5 Flags.** Another question mode, a third kind of question counting the two capital modes as one, with its own `flag` facet, after the location and capital questions above exist — and the borders question, if it is ever taken off hold — and not before. That reads the survey's "after the three loops exist" as two loops plus a held third; the hold entry under Decisions says why. Needs a licensing audit for the image assets and a decision on how a flag is drawn in an ink-and-wax app; both are questions for its own plan section, written when R3.1, R3.2 and R3.4 have shipped and the mode-mix counters say how much a fourth kind of question is wanted.

## Also in this release (fold into the item that touches the code)

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

R3.2 comes second and is the structural core of the rest. R3.5, and R3.3 if it is
revived, grade facets that only exist once the store is per fact, and R3.4's
new countries should arrive into a store that already has a place for their capitals. R3.2
lands as one PR — migration and the two capital modes together — because a
migration with nothing reading the new facet is a change nobody can verify in
the app.

R3.3 was to follow R3.2 directly; it was put on hold on 2026-09-12 (see
Decisions). R3.3a — the two reveal follow-ups it was carrying — goes next
instead, as a small PR with no new mode in it.

R3.4 is independent of the modes in code, but goes after them so the new
entries land with every fact filled in once rather than being backfilled twice.
It is also the riskiest change in the release — the topology is a committed
build artefact consumed by both the map and the country build — and it should
not sit underneath the release's return hook.

R3.5 is last by the survey's own instruction: flags come after the other
question kinds exist, not before.

## Decisions this plan takes

Written before the code, to be amended by the PR that proves them wrong.

- **The expedition ignores the continent filter and the territories setting.** Everyone gets the same ten countries on the same day, or the result cannot be compared with anyone else's, and comparison is the whole point of a result you can copy. The ten are drawn from the full non-territory pool by a seeded shuffle over the iso3-sorted list, so the set for a date is a function of the date and the pool only. A grown pool changes every future day's ten; that is fine, and it is why the seed is over the pool rather than a fixed table. (R3.4 then chose not to grow it; see below.) Two learners on different service-worker builds could see different sets for the same day for as long as one of them keeps a tab open; the update model chosen in R1.5 makes this rare and short, and it is not worth a version stamp in the caption.
- **Name → Click only.** A copied row of glyphs has to mean one thing. A typed mode brings alias and spelling ambiguity into a score that is being shown to someone, and the click mode is the one the map is for. Which glyph means what is the one thing the caption never has to explain: filled is found, empty is missed.
- **Every answer writes through to the SRS store, as a test round does.** A country the learner was asked to find and could not is a fact the scheduler should know, wherever the continent filter sits. It creates records outside the current scope; the existing rule already handles that, they resurface when the scope widens. "Don't know" stays available, as it is on every other card. Grading is `Correct → Good`, `Wrong → Again`, `Skip → Again`, with no review phase to double-count; a skip is an empty glyph like a miss.
- **The expedition is a round of ten, not twelve, and it is a finished round.** The interstitial does not appear inside it; the result card is its round break. Finishing one records the day in the cross-day streak, since the survey's own measure is "a completed round" and this is one. `roundsByPractice` gains an `expedition` count.
- **One attempt means one attempt.** The store keeps the day and the ten outcomes; an expedition abandoned halfway keeps the answers given so far and resumes on return, and a finished one shows its result card until local midnight. There is no "try again" — the second go is tomorrow, which is the mechanic.
- **The result is text, not an image.** Ten glyphs and two short lines survive every messaging app and need no share sheet. `navigator.share` is used on a phone when it exists, the clipboard otherwise, and the text is always visible and selectable on the card so a learner can copy it by hand if both fail.
- **`location` is one fact, whichever way it is asked.** Name → Click and Shape → Name both test whether the learner can connect a country's name to its place on the map, so both keep grading the `location` facet after the split. Splitting them would halve the history every existing learner has built, for no fact they do not already share.
- **The map paints `location` only.** Knowing a capital is not having a country on your map. If a second layer of paint is ever wanted for capitals it is a separate decision, and probably a separate view; the ambient paint stays a single fact so that it stays legible.
- **No multiple choice, including in "Which borders…".** The temptation is to offer four names. The map is the answer sheet: the learner taps a neighbour, and every neighbour is right. Recall, not recognition. Still binds if the mode is revived, whatever shape the question takes.
- **"Which borders…" is held, not built (2026-09-12).** The survey gave it one line, bundled with the capital modes, and the tracker's case for it was that it is cheap. Against it: once the learner can find Mongolia, tapping Russia or China is the easy half, so the `borders` facet would largely track `location`; the M2 reveal already paints and labels every neighbour on every miss, so the fact is taught without a mode; "any of several answers is right" is a new concept for the reducer's grading, the correct flash and the reveal, all of which assume one; islands and thin continents (Oceania) leave the pool near empty; and PR #43 exists because the capital modes were not being found from inside the gear — a fifth kind before the second is discovered is more choice, not more play. The R3.5 rule, wait for the mode-mix counters before adding a question kind, applies here too, and the hold reads the survey's "flags after the three loops" as two loops plus a held third. If revived, prefer a design that is a distinct skill from location — a specific neighbour asked for by clue, say — over "any neighbour".

Taken by R3.2, in the code:

- **Version 2 goes under a new key and version 1 is left in place, read-only.** Bumping the version inside `atlasaur:srs:v1` looks tidier and is unsafe: an old build — a stale tab beside a hard-reloaded one, or a rollback — reads a v2 blob there as an empty store and its save-on-mount effect writes that back, wiping everything. The accepted cost is that answers given in such a tab land in v1 and never reach v2. A fact key a build does not know is kept rather than dropped, for the same reason in the other direction.
- **Two fact roles, not one.** The *answer* fact grades and picks; the *learner* fact scopes and drives every displayed figure. They differ only during an expedition, which forces Name → Click — and the settings must keep showing capitals to someone studying capitals, the same rule the continent filter already follows there.
- **Capital → Click gets a blank map, like a test round.** Collapsing only the introduced wash is not enough: capital cards are introduced in the same order that built the learner's *known* map, so tier 2 points at the answer too. Country → Capital keeps the full paint, because the country is already highlighted.
- **No country or continent milestone in a capital mode.** "Now on your map" and the hatch are map ceremonies and the map paints `location`. The streak note still plays — a run of correct answers means something whatever is being asked.
- **The pool depends on the fact.** `filterPool` drops rows with no capital, or a capital test round with territories on could never finish. `continentAskable` generalises the old Antarctica special case into the one predicate behind every continent chip. A mode switch never rewrites the saved selection; the settings disable the two capital options instead.
- **The question mode is persisted** (`atlasaur:questionMode`), unlike `practiceMode`: it is a standing preference for what you are here to practise. An expedition's forced Name → Click never overwrites it, and "Erase all progress" leaves it alone.
- **Switching question mode is a step, not a rebuild.** `enterQuestionMode` commits a pending grade, keeps the Study round and the miss queue when the fact is unchanged, and keeps `cardsAnswered` — the old `initialState` rebuild dropped all three.

Taken by R3.4, in the code:

- **Markers stay out of the Daily Expedition.** Twenty of the new arrivals are a few pixels or less on a phone, and the expedition is one attempt a day with no retry. Admitting them would put one or two "find the dot" cards into the average day for everyone and change the difficulty the result row was designed around. Excluding them also leaves every day's ten exactly as it was: checked over sixty days. Revisit if the expedition ever gets a mode where a small target is fair.
- **The continent captions count markers.** Oceania's denominator goes from 6 to 14 (7 to 15 with territories on), most of it atolls, so "Oceania 100%" becomes much harder. The alternative, counting only shaped land, would make the caption disagree with the settings' Known figure, and the rule since R2.1 is that the map and the numbers never disagree. An existing learner therefore sees their figures fall on upgrade, a finished continent reopen and new cards arrive, with no in-app note: the atlas grew, which is true, and the continent seal can be earned again. The PR says so rather than a new surface.
- **Region frames fit shapes, not dots.** Every dot falls inside its continent's and subregion's frame through the padding. At R3.4's merge Samoa and Tonga did not — they sat across the antimeridian from the rest of Oceania, and the Oceania filter fell back to the whole world to show them. A follow-up recentred the projection on 11.6°E, with the cut at 168.4°W in the Bering Strait, which brought them home (and drew Fiji and Chukotka whole) at the cost of moving every shape and label once; the fall-back is gone.

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
