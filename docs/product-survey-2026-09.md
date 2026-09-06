# Atlasaur product survey — September 2026

Surveyed against the deployed build and a local run of commit `6dcf43b`, from a clean browser profile at 1280×800 and 390×844. Every flow was played on desktop and phone, the whole codebase was read, and the roadmap and plans were checked. 197 tests passing at the time.

The decisions taken with the owner after the survey are at the end, and the resulting implementation plan is `plans/r1-reason-to-return.md`.

## Verdict: a strong engine, a thin game

Atlasaur already teaches geography better than almost anything in its category. What it does not yet do is give someone a reason to open it tomorrow, or a moment of joy when they do.

The learning core is the product's moat and should be protected: FSRS scheduling, automatic grading, and the elaborative miss reveal (zoom, neighbours, capital) are things Seterra, GeoGuessr-style quizzes and flashcard apps do not have together. The visual identity is distinctive and worth building on.

But the goal is an app people come back to for pleasure, and today Atlasaur has almost none of the machinery that produces return: no reason to open it on a given day, no visible accumulation of progress on the map itself, a first-run experience that throws a random small country at a stranger, a 178-question session with no shape, and feedback that is correct but quiet. Two of the stats it shows are misleading.

The recommendation is three releases. First, give the learner a reason to return tomorrow. Second, make progress visible where it belongs, on the map. Third, add variety and a shareable hook. Along the way, remove a handful of things that add weight without adding joy.

## What is working

Test every change below against "does this weaken one of these?"

| Keep | Why it matters |
| --- | --- |
| Learning core | FSRS with deferred automatic grading means the learner never self-grades, and every miss comes back both within the session (3 to 5 cards later) and across days. The miss reveal teaches context, not just the answer. Best-in-class, and the roadmap's research backs it. |
| The map | Equal-Earth parchment chart, engraved ocean labels, ink-and-wax palette, IM Fell English. Looks like nothing else in the category. The night-chart dark theme is equally considered. This aesthetic is the emotional budget the rest of the plan spends. |
| Zero friction | No account, no install, no network after load, no tracking. Opens in a second. Progress persists in the browser. A genuine advantage for a "just five minutes" habit; do not trade it for sync. |
| Curated data | Hand-curated aliases, notability tiers, documented capital decisions, computed land borders. The introduction order (Russia, Canada, United States, China…) is exactly right for a beginner. |
| Engineering discipline | One reducer, injected clocks, versioned storage, written plans per milestone, a real test suite. Every recommendation below is cheap because of this. |

## What a first-time learner meets

Severity is about impact on the stated goal (return and joy), not code quality.

1. **The cold start is hostile.** A new user lands in Quiz mode with a random pick from all 178 countries (Denmark, then Vanuatu, in the surveyed run). No welcome, no sense of what the app is, no way to choose where to begin. Study mode, which introduces countries in a sensible order, exists but is not the default.
2. **The session has no shape.** Quiz is a single 178-question marathon. Nothing marks a natural stopping point, there is no interstitial, and the only way to end is the gear icon, then "End session". Most people will close the tab and never see the summary that was meant to bring them back.
3. **Progress is invisible on the map.** The app knows which countries are known, introduced, or unseen, but the map looks identical on day one and day thirty. `fillFor` has no mastery state; the SRS store is only read for counts.
4. **There is no reason to come back on a given day.** No cross-day streak, no daily goal, no "today" view on open, no home-screen presence. The one hook, a small "N due" chip, appears only once you have already opened the app and only in Quiz mode. No web app manifest or service worker.
5. **Feedback is correct but quiet.** A right answer is a 0.9 to 1.3 second flash with a floating "Correct!" badge. A streak of ten feels the same as a streak of one. Finishing a continent produces nothing.
6. **The two-axis mode model is a tax.** Practice mode (Quiz, Study) times question mode (Name → Click, Shape → Name) times continents, with question mode hidden behind the gear. The Study chips read `Due 0 · New 1/10 · 171 untouched`, which is Anki vocabulary, not a beginner's.
7. **Two stats are misleading.** After two misses in five answers the Accuracy stat read 100%. The Study summary showed "Learned 0" beside "Accuracy 100%". See bugs below.
8. **Small-country reveals lose the world.** For a far miss on a small country the two-stage zoom lands where only the answer and one neighbour label fit and the learner cannot tell which continent they are looking at. In the Denmark reveal, Germany's label was off screen.
9. **The map is missing about 28 UN member states.** Singapore, Malta, Bahrain, Maldives, Mauritius, and nearly every Caribbean and Pacific island state vanish at the 110m topology resolution. A completionist cannot finish the world.
10. **Antarctica and the French Southern Territories are quiz questions.** Reads as filler and dilutes the sense that every card matters.

### On the phone

The portrait layout is sound: the map gets most of the screen, the prompt and Continue sit under the thumb, and tap targets meet 44px. Reveal labels get dense across Africa and Europe at phone width, and the Caribbean and Pacific are close to un-tappable at the default zoom. A "pinch to find" nudge or an auto-zoom to the continent of the current prompt would help.

## Why people come back

Returning to a learning app is rarely about learning. It comes from three loops, and the product needs all three.

- **A reason to open it today** (missing). Cards due, a streak to keep, a daily set everyone is doing. Atlasaur computes "due" but never puts it in front of you before you have already decided to play.
- **Progress you can see and show** (missing). The map is the perfect canvas: a world that fills in as you learn it. Today the only progress view is a table of numbers in a settings menu.
- **Pleasure in the moment** (partial). The map is beautiful and the reveal is satisfying, but right answers are flat, streaks do not build, and there are no milestones.

One caution runs through every recommendation. Extrinsic rewards can crowd out intrinsic motivation. Atlasaur should celebrate like a cartographer, not a slot machine: ink, stamps, wax, a well-turned line of copy. No confetti, no coins, no shame for a missed day.

## Recommendations

Effort uses the roadmap's scale: S under a day, M two to four days, L one to two weeks.

### Release one: a reason to come back tomorrow

| | Item | Impact | Effort |
| --- | --- | --- | --- |
| Add | **First-run welcome, Study as the only home.** One screen, shown once: what Atlasaur is in a sentence, then three doors: start with the big ones (Study, all continents), pick a region (continent chips framed as a choice), test me. The first card becomes Russia instead of Vanuatu. | high | S |
| Add | **"Today" card on open, cross-day streak.** Before the first prompt, one line to act on: `14 to review · 6 new · day 4`, one Begin button. Streak counts days with a completed round, own versioned key, rollover at local midnight, one free missed day a week, copy that never scolds. | high | M |
| Improve | **Rounds of twelve instead of a marathon.** Every twelve cards, a small interstitial: cards right, what was learned, Keep going (default) and Done for now. Replaces "Done 0/178", moves End session out of the gear. A round carries a type: ordinary Study, "Test me on these", or the Daily Expedition. A round is a presentation boundary, not a scheduling one. | high | M |
| Add | **Make it installable.** Web app manifest and minimal service worker. Assets are already self-hosted and the app already works offline once loaded. Unlocks an opt-in local reminder later, which should only fire when something is actually due. | medium | S |
| Improve | **Small countries on a phone.** Auto-frame the prompt's continent when a Name → Click card is drawn on a narrow viewport. Minimum hit area around tiny features. A "pinch to zoom" hint the first time a card's country is under about 12 px on screen. | medium | S–M |
| Improve | **Plain language, honest numbers.** Fix the accuracy stat. Replace `Due 0 · New 1/10 · 171 untouched` with `0 to review · 1 of 10 new`. Rename "Learned" to "Known" and show "Seen" beside it so first sessions read as progress. | medium | S |

### Release two: your map

| | Item | Impact | Effort |
| --- | --- | --- | --- |
| Add | **Paint mastery onto the map.** Three ambient fills from the SRS store, always on: unseen as a ghost outline, introduced as a light wash, known as full pigment. The progress view becomes the map at rest, with a per-continent percentage under each ocean label. One more branch in `fillFor` plus a memoised iso3-to-tier map. Reveal states stay on top. | very high | M |
| Add | **Milestones in the house style.** Streak escalation in the Correct hero copy at 5, 10, 20 (A steady hand. Cartographer's eye.). First time known: one-second engraved hatch fill and "Portugal, now on your map." Continent complete: a wax-seal stamp. Optional quill sound and haptics, off by default. | medium-high | S–M |
| Improve | **Keep the world in the reveal.** A floor on the reveal zoom so the frame never tightens past roughly a subregion; let neighbour labels win over the fit check. If too loose for micro-countries, a small locator inset in the corner. | medium | S |

### Release three: variety, and a hook to share

| | Item | Impact | Effort |
| --- | --- | --- | --- |
| Add | **Capital and border question modes.** Capital → Click, Country → Capital (typed), Which borders…. The point to split the SRS record per fact rather than per country. | medium-high | M |
| Add | **The Daily Expedition.** Ten countries seeded by the date, one attempt a day, a result you can copy as text (a row of ink-block glyphs and a caption). The Wordle mechanic, no backend. | high for return | M |
| Improve | **Finish the world.** Bring in the missing island and micro-states, via the 50m topology for small features or clickable point markers with the same iso3 plumbing. | medium | M–L |
| Add | **Flags, later.** A fourth question mode with its own SRS facet. After the three loops exist, not before. | medium | L |

### Remove or fold away

| | What | Why |
| --- | --- | --- |
| Remove | "Show country names after a wrong answer" toggle | Study already forces it on. Labels on a reveal are the teaching; make it always on. |
| Remove | Antarctica and French Southern Territories from the default pool | Keep behind an opt-in "territories" chip alongside Greenland, Puerto Rico, Western Sahara and French Guiana. |
| Remove | The per-session streak in the Quiz status bar | Superseded by the cross-day streak. Two streaks with the same name will confuse everyone. |
| Remove | "Reset SRS data" from the main settings menu | A destructive control should not sit two clicks from the prompt. Move it under a Data heading with the stats. |
| Fold | The Quiz/Study toggle as a top-level concept | Study is the product; Quiz is a kind of round. "Test me on these" and the Daily Expedition become round types. Both axes stay in code; the learner only ever sees one. |

## Bugs found along the way

- **Accuracy reports 100% for a learner who has missed cards.** `lifetimeAccuracy` was `1 − lapses ÷ reps`. FSRS only increments `lapses` when a card already in Review state is graded Again; a miss on a New or Learning card is not a lapse. Beginners, who miss mostly new cards, saw near-perfect accuracy. Fix: an explicit hits/misses tally per record beside the FSRS card. (Fixed in release one.)
- **"Learned 0" after a productive session.** A card reaches Review state only after graduating FSRS learning steps, typically on a later day. Not strictly a bug, but the label promised something the metric did not measure. Fix: rename to "Known" and show "Seen" beside it. (Fixed in release one.)
- **Neighbour label off screen on tight reveals.** Reveal labels bypass the fit check by design; the frame cascade does not consider label anchors. Addressed by the reveal zoom floor in release two.

## What to measure

No backend. A small, local, versioned counters key, surfaced in the Data view so the maintainer and any curious learner see the same numbers.

1. **Return.** Distinct days with a completed round, and the gap between them.
2. **First-session depth.** Cards answered before the first close. Under twelve after release one means the welcome screen is not doing its job.
3. **Round completion.** Rounds started versus finished. Tells you whether twelve is the right size.
4. **Known countries over time.** The learning outcome, and the number the map paints.
5. **Mode mix.** Which question modes and round types people choose, once there is a choice.

If the project ever wants aggregate numbers, make it an explicit opt-in that sends only these counters.

## Things to resist

- **Accounts and leaderboards.** A backend, a privacy story and a comparison anxiety the audience did not ask for. The Daily Expedition gives the social hook without any of it.
- **Multiple choice as a default.** Recognition is weaker than recall. Fine as a training wheel inside the welcome flow, never as the main loop.
- **Streak shaming.** No red counters, no "you lost your streak" modal. A missed day is a gap, and the copy says "welcome back".
- **Letting goals fight the scheduler.** When nothing is due and the day's new cards are done, "come back tomorrow" should feel like a reward, not a wall. No busywork to fill a round.
- **Generic game dressing.** Confetti, coins, XP bars and badges would break the one thing that makes Atlasaur look like itself.

## Decisions

Taken with the owner after the survey, one question at a time. These govern the plan.

| Question | Decision | What it changes |
| --- | --- | --- |
| Who is it for first? | **A curious adult**, learning for pleasure with no deadline. | Literate copy register, Study as home, restrained ceremony, the Daily Expedition as the social hook. No exam-date mode, no child on-ramp. |
| Phone or desktop first? | **Phone first.** Desktop stays fully supported. | The installable step and the small-country tapping pass move into release one. |
| How much ceremony? | **Ink and wax only.** | Milestone copy, the known-country hatch fill, a wax seal per completed continent, an optional quill sound. No confetti, coins, XP, badges or passport screen. The quill sound was later dropped, along with the haptics that had been proposed with it — see `plans/r2-your-map.md`. |
| Does the Quiz/Study split survive? | **Fold Quiz into Study.** | One home; rounds of twelve are the unit. The practice-mode toggle leaves the status bar. "Test me on these" and the Daily Expedition become round types. Both axes stay in code; only the learner-facing model changes. |
