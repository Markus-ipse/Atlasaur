# Atlasaur — product owner review

Date: 15 September 2026

## Executive judgment

Atlasaur has a coherent promise: gradually make the world familiar through a few enjoyable minutes of recall. Its most valuable combination is a personal map, forgiving repetition, and almost no administrative friction. The antique chart can make progress feel like something the learner is creating. Keep those choices.

My recommendation is to spend the next iteration on a satisfying short session and credible evidence of remembered learning. Defer flags. Atlasaur already has sufficient material and variation to test its central retention hypothesis; another subject will not establish whether that hypothesis works.

The experience to aim for is: **I discovered something, I remembered something, and I know where I can pick up next time.**

### Evidence and limits

I read the attached brief, retrieved the live site's HTML and JavaScript, and reviewed the local implementation at commit `d1da02a` (15 September 2026). The deployed JavaScript contains the onboarding, regional focus, capitals invitation, sitting summary, weekly known count, and outcome log discussed here. This is not proof that every local implementation detail matches the deployed version byte for byte.

The browser-control runtime failed before an interactive session could begin. I therefore did not complete rounds on the live site, inspect rendered phone screens, or verify installation, offline behavior, touch accuracy, or accessibility in use. Usability conclusions below are source-grounded hypotheses, not observed participant behavior. Attempts to run the existing focused tests were blocked by Windows/Linux runtime and dependency mismatches; no passing test run is claimed. No product code or configuration was changed.

## 1. First session: understanding and an early win

### What is already good

The welcome has a clear primary route, “Start with the big ones,” and secondary routes for choosing a region and testing existing knowledge. There is no account or configuration requirement. Starting with familiar, large countries lowers both knowledge difficulty and map-control difficulty.

“Don't know” in study is a good invitation to learn. A miss supplies the answer, capital and neighbours, and waits for the learner to continue. Returning misses give an opportunity to experience a small recovery. Keep that teaching pause.

### What needs attention

**The welcome explains the scheduler before the learner has a reason to care.** Its sentence covers the product, repetition, timing and map ownership. The first-miss explanation also leads with “Nothing to grade,” answering a concern a new user may never have had.

Suggested welcome direction:

> Learn the world map, a few places at a time.
> Find a country. If you don't know it, we'll show you and bring it back.

Suggested primary action: “Start a short round,” with “Big, familiar countries first” underneath. Keep the region and experienced-user routes secondary. Explain the map's earned colour at the first relevant success.

**A correct answer is not necessarily a learning win.** Finding Brazil quickly demonstrates prior knowledge. Missing a less familiar country, seeing its position, and later placing it correctly demonstrates that Atlasaur helped. Both matter, but measure them separately. Do not deliberately manufacture an error or force everyone through a tutorial to produce the second outcome.

**Twelve questions and ten new introductions do not define five minutes.** The scheduler can select an already introduced country before it is due after the ten-new cap is reached. The app deliberately fills an unfinished round with that fallback. This may give useful practice, but it can also produce obvious repetition merely to complete twelve cards. The value needs testing, particularly for knowledgeable newcomers.

The new-item allowance is per study stretch rather than a persisted daily allowance. “Today” should describe a visit's offer without implying a fixed daily curriculum that the app does not maintain.

### Recommended first-session contract

- Show one obvious action and a bounded promise: a short round, with stopping always allowed.
- Keep the first questions easy to operate on a phone.
- Let unknown countries receive the existing reveal and a meaningful retry.
- Mark a successful recovery briefly and factually; do not call it durable mastery.
- End early when there is no useful work waiting. If retaining twelve cards, establish that those final repetitions have value.
- End with what changed for the learner, not primarily their accuracy.

**Two-minute acceptance question:** Can a stranger explain what to do, answer without help, and describe something the app has taught them? First correct answer and first miss-to-correct recovery should have separate timings. A learner who already knows the opening questions should still get a satisfying start.

## 2. Returning: what the existing hooks can and cannot do

| Mechanism | Its useful role | Its limit |
| --- | --- | --- |
| Forgiving streak | Quietly acknowledges continuity | Says little about learning or the pleasure of today's visit |
| Today card | Removes the decision about what to practise | Appears only after someone remembers to open the app |
| Daily Expedition | Creates a shared occasion and a finite challenge | Can become repetitive, intimidating, or unrelated to a chosen region |
| Personal map | Makes the accumulated work tangible | Its progress slows, and its meaning needs to remain trustworthy |
| Capitals invitation | Offers a new question about familiar places | Capitals progress is not what the location map's colour measures |

These are enough mechanics to validate retention. More hooks are not currently the priority.

The missing emphasis is **personal continuity**: “This is the part of the world I am getting to know.” Regional focus already exists, so a recommendation to add it from scratch would be misplaced. Strengthen what it means across visits. The current suggestion ranks the least-known eligible subregion, and focus is temporary. That can be useful for coverage, but it is not the same as continuing a region the learner chose for a trip, a book, or curiosity.

A future Today card could prioritize one relevant action: continue a chosen region, revisit returning places, or try capitals of places already familiar. Present only a small number of alternatives. An illustrative line is “Back to Southern Africa — revisit a few places, then meet another.” The actual content must match what the scheduler will deliver.

Do not make a returning learner clear a visible backlog before they may enjoy the app. After a long absence, offer a manageable round. Full due counts can remain available without defining the emotional tone of the visit.

### The clearest immediate contradiction: stopping

“Done for now” opens a summary with up to six aggregate figures and actions to focus, keep going, take a full-scope test, or start an Expedition. It has no finish action. Clicking outside the summary or pressing Escape resumes studying. This creates a fresh decision point precisely when the learner has said they are finished.

Create a resting state that actually acknowledges completion:

> A little more of the world is familiar.
> You found two places you missed earlier.
> Your progress is saved in this browser.

Use that wording only when the underlying events support it. Show one optional next step and leave the app at rest. The user can close a tab or put away the phone without needing to interpret another activity menu. No attempt to programmatically close the browser is required.

If this change reduces rounds per sitting but improves satisfaction and later returns, that is success.

## 3. Progress: day one versus day thirty

### “Known” needs a clear contract

The implementation uses FSRS state >= 2 for “Known.” This includes Review and Relearning; a recently missed country can remain known. This is a reasonable choice for preserving earned map colour. It does not prove that the learner can currently recall every coloured country.

The location and capital subjects have separate records. The two directions within each subject share a record. Consequently, knowing a country by clicking it and producing its name from a highlighted shape are not independently certified. Do not present broad mastery claims that exceed the evidence.

Keep two ideas distinct:

1. **Earned map:** the territory the learner has worked into familiarity. It need not disappear after a lapse.
2. **Recent recall evidence:** what they actually remembered after time away.

This distinction can stay simple in the UI. There is no need to expose the learning algorithm or add another dense dashboard.

### What should feel different over time

| Stage | Useful felt progress | Appropriate evidence |
| --- | --- | --- |
| First visit | “I can place something I couldn't place before” | A real miss followed by a correct answer later in the sitting |
| First week | “It is sticking between visits” | First attempts answered correctly after a recorded delay |
| Around day thirty | “This region is becoming familiar” | Region coverage plus recall on returns, with places and capitals distinguished |
| Advanced | “I can keep this knowledge without much effort” | Successful occasional revisits and self-chosen challenges |

The existing weekly known counter and outcome log are useful foundations. The log records answer time, country, question type, practice type, outcome, and resolved wrong-country answer. Use it before adding more instrumentation.

Examples of worthwhile progress copy, when true:

- “You remembered all four places that came back today.”
- “Last time Ghana was unfamiliar. Today you found it.”
- “Eight more places on your map this week.”

Specify the fact and comparison where necessary. A same-session retry is not evidence of remembering for a week. Time since a recorded answer is also not proof that the learner had no other exposure.

Lifetime accuracy should be secondary. It mixes early mistakes, easy familiar countries and newer difficult material. Getting better and choosing harder questions can make this number look worse.

## 4. Enjoyment and phone usability

The antique atlas is a meaningful product choice, not disposable decoration. It supports the idea of gradually knowing a world worth exploring. Preserve the restrained tone and the visual reward of the map.

The implementation already has small-country framing, enlarged touch targets, a pinch hint, marker countries, safe-area layout, light/dark themes, reduced-motion handling, and modal focus management. Those are substantial investments. Their presence does not establish that they work comfortably on an actual phone.

The highest-priority hands-on checks are:

- Can a learner tap a small country without answering a neighbour accidentally?
- Does the map retain enough space when the keyboard opens in either typed mode?
- Can the answer and its neighbouring context be understood before continuing?
- Are small text, low-contrast colours, and brief success messages comfortably readable?
- Can someone stop and later resume without feeling they lost work?
- Is the visual map usable with keyboard and assistive technology to the extent the product promises?

Automatic grading makes fairness especially important. Typed answers accept aliases and normalized case, accents and punctuation, but matching is otherwise exact. A plausible spelling error can therefore become a knowledge failure. Test this with real participants before adding broad fuzzy matching. A narrowly unambiguous typo allowance may help; it must not accept a different real country or capital. No self-rating control is needed.

Repeated confusion is also an opportunity. Atlasaur already compares wrong and correct locations during reveals, so the next extension would be to notice recurring pairs and give them a short, specific follow-up. The existing outcome log supports resolved country confusion; it does not preserve every unmatched typed string. This is a promising later experiment rather than a prerequisite for the first release of this review's priorities.

## 5. Long-term value and the flags decision

The product does not need to demand daily use forever. A learner who acquires the knowledge and returns occasionally to keep it is a successful customer. Separate successful completion from abandonment.

There is already a progression path:

1. Find countries.
2. Know particular regions more confidently.
3. Answer the reverse question about familiar shapes.
4. Learn capitals for familiar places.
5. Maintain the knowledge and occasionally take an Expedition or a chosen test.

Make that path discoverable through relevant invitations, not a locked curriculum. An advanced learner should still be free to choose capitals immediately.

“Test me on these” currently means the entire active scope, not merely the twelve cards just answered. Its subline makes this explicit, which helps, but a whole-world test does not fit a five-minute expectation. Keep the comprehensive test as a deliberate option; a short clearly named check could serve people who only want to see what stayed with them. Do not quietly substitute another sprawling mode.

### Flags: worthwhile later, premature now

Flags fit adult curiosity and provide visual variety. A flag-to-country typing question could preserve recall and work without map targeting. There is a plausible product extension here.

However, flags introduce a third learning subject, with its own scheduling, assets, progress semantics and introductory decisions. They do not repair an unsatisfying ending, prove that the current learning feels effective, or make a shared result easier to join. They can also compete with the capital questions already present.

**Decision:** defer a full flags implementation until evidence identifies a content-variety problem among people who like the core app.

Useful evidence would be advanced learners reaching their chosen location goals, understanding the capital option, and still asking for visual identification; or a limited optional flags prototype producing voluntary later returns and clear enjoyment. A one-session spike in clicks is insufficient. Start any prototype with flags of familiar countries and explicit choice, rather than adding another obligatory queue.

## 6. Growth without a backend

### The weakest link is concrete

The current Expedition share text contains Atlasaur, the date, result glyphs and score. It contains no URL. The native share call passes only that text, and the clipboard fallback copies the same text. An interested recipient cannot tap through from it.

Even after finding the app, a new visitor reaches the generic welcome, which has no Expedition entrance. The sharing path therefore has two breaks: getting to Atlasaur, then finding the thing a friend shared.

Fix this before elaborating share graphics or adding more challenge types.

Suggested share format:

> Atlasaur · Daily Expedition · 15 September 2026
> ■■□■■■□■■■ 8/10
> Find today's ten countries: [play link]

The link should open a concise Expedition introduction, with an easy route to ordinary learning. Keep the attempt explicit. Define how old dated links behave: explain that today's Expedition differs, or intentionally support the dated challenge without silently confusing comparable scores. A static URL parameter or hash can carry the routing information; no backend is necessary.

Add explicit social preview metadata and an appropriate preview image. The current HTML has a description and icons but no explicit Open Graph/Twitter card metadata. Verify the preview on actual sharing destinations after implementation.

### Further distribution worth testing

- Let people share a small earned milestone, such as a region they learned, as an optional atlas image and link. This expresses personal value even for people who do not want to share a score.
- Give travel, map, reading, and adult-learning communities a specific use case: a few minutes getting to know places they care about. Observe which audiences actually return before broad promotion.
- After a successful repeat visit, offer a quiet route to adding Atlasaur to the home screen. Installation is a practical return path; it is not a prerequisite to play.
- Add explicit download/restore of progress. The existing Data panel exposes figures and erasure, but no user-facing backup/restore. This supports ownership without accounts or cloud synchronization.

The growth path is: a meaningful result → a usable invitation → a matching first experience → an enjoyable small success → an easy route back. Share taps alone measure only the start.

## 7. Measurement without compromising the product

### Define success in product terms

The main outcome is people willingly returning to useful learning and feeling that it sticks. No single activity counter establishes that. Use a small scorecard covering return, learning, and satisfaction; use session length as a constraint rather than something to maximize.

| Question | Suggested measure | Limitation |
| --- | --- | --- |
| Can newcomers start? | Time to first answer and first correct answer; welcome-to-answer conversion | Requires an opening/prompt timestamp; answer counts alone cannot supply timing |
| Does the app teach in visit one? | Miss-to-correct recoveries later in the sitting | Short-term recovery, not durable retention |
| Is the session manageable? | Deliberate finishes, interruptions, round completion, active duration | Stopping early can be success, not abandonment |
| Do people return? | Any-answer return day, completed-round return day, and week-two participation | A streak records only completed rounds and applies forgiveness |
| Does learning persist? | First-attempt accuracy after recorded gaps, by question type and interval band | Adaptive scheduling changes the sample being tested |
| Does progress feel rewarding? | Occasional voluntary “Did this feel worthwhile?” plus interviews | Self-selection and response bias |
| Does sharing lead anywhere? | Share-link entry → first answer → a later learning visit | Share-button activation is not delivery or a recipient visit |

### Interpret the current counters carefully

- **Rounds finished / started:** ordinary rounds start counting after the first card completes; an Expedition starts when opened. Do not pool these denominators as if they mean the same thing. The aggregate finished counter also lacks a matching per-practice breakdown.
- **Days played:** comes from completed-round dates. It misses useful shorter visits. Keep the streak rule if desired, but measure any-answer days separately.
- **Sessions started:** currently counts page loads, not a consistent amount of active learning time.
- **First-session cards:** useful for diagnosis, but zero-answer histories are not shown in the current Data display. Screenshots collected only from satisfied returners will conceal the most important early failures.
- **Known per day:** location-only, global rather than current filter, and recorded when the count changes. Good properties for tracking map growth; insufficient for capital learning or day-specific activity. Missing entries are not zero-activity days.
- **Longest gap:** needs a later return to close the gap. It cannot tell you who has left forever, and its meaning changes with profile age.

For delayed recall, use the existing outcome log to identify the first recorded attempt after at least a day since the previous relevant answer. Separate question directions, practice types, and intervals such as 1–3, 4–7 and 8+ days. Count misses and skips in the denominator. Exclude same-sitting retries from the delayed measure. Describe this as performance on returned questions, not an unbiased test of the entire map. Preserve the distinction between a recorded answer gap and exposure outside the log.

### What an opt-in report should be

Start with a user-initiated report that is computed locally, previewed, and explicitly shared. Include only what answers a product question:

- Report/schema version and app version.
- Profile-age or observation-window information, including whether a seven- or fourteen-day window is complete.
- First-session answer and completion facts, with unknown distinguished from zero.
- Counts of any-answer days and completed-round days in defined windows.
- Round starts and finishes by practice type, once recorded consistently.
- Delayed recall successes and attempts by fact/mode and interval band.
- A voluntary usefulness response, if collected.

Keep raw typed text, exact timestamps, country-level history and persistent device identifiers out of the default shared summary. For a small research panel, a consented participant code can support longitudinal comparison, but that changes the report from an unlinked summary to pseudonymous research data and should be explained.

**Fundamental limit:** local-only counters do not give the owner population retention. Voluntary exports collected from people who return are biased toward survivors. If you later transmit events automatically, an external collector is required and the promise that usage data never leaves the browser must change for that opt-in group. A manually shared file avoids adding a telemetry backend, but does not eliminate selection bias.

A practical first study is 8–12 target adults using their own phones, followed for two weeks with explicit agreement. Observe the initial session, invite use when they feel like it, and contact everyone at the end, including non-returners. Ask what they remember, what felt worthwhile, and why they stopped. Treat this as discovery, not statistical proof of a retention uplift.

## 8. Top five recommendations

Ranked by expected product impact, with uncertainty made explicit. Effort is relative scope, not an engineering estimate.

| Rank | Recommendation | Expected impact | Evidence / confidence | Effort | What would validate it |
| --- | --- | --- | --- | --- | --- |
| 1 | Deliver a satisfying short session: clarify the first action, retain useful retries, remove quota-driven filler, and make Done a genuine finish | High: activation, enjoyment, repeat use | High confidence in the ending mismatch; user testing needed for pacing | Medium | Newcomers start unaided and feel finished within their intended time; later return holds or improves even if rounds per visit fall |
| 2 | Make remembered learning visible and continue a personally meaningful region across visits | High: perceived value and longer-term motivation | Strong source basis; magnitude unmeasured | Medium | Learners can name what improved, understand earned colour, and voluntarily resume a chosen path |
| 3 | Validate and repair phone answer friction, especially small targets, keyboard layout, readable feedback and unambiguous spelling slips | Potentially high: protects trust in automatic grading | Important but unverified in a live phone session | Small discovery pass; fixes variable | Few interface-caused wrong answers or interruptions across actual target phones |
| 4 | Complete the sharing path: URL, direct Expedition entrance and social preview | Medium overall; high for share-driven acquisition | High confidence: current share text has no URL | Small–medium | A recipient can open the shared experience and answer without searching or guidance |
| 5 | Make returning and keeping progress reliable: contextual home-screen guidance and explicit backup/restore | Medium: return convenience and long-term ownership | Clear product gap; usage impact unmeasured | Medium | Learners can reopen easily and move/restore their atlas without an account |

None of these recommendations requires accounts, cloud sync, leaderboards, multiple-choice as the main loop, guilt, generic rewards, sound or haptics. Removing purposeless repetition directly honours the no-filler constraint. Automatic telemetry would be a deliberate change to the privacy promise, so it is not the default measurement recommendation.

### Sequence

Start with a short observed phone study and the definite finishing/sharing fixes. Add trustworthy progress feedback using the outcome log already present. Follow the same participants through their return decisions. Consider flags once the evidence distinguishes a content shortage from friction, unclear value, or successful completion.

## Implementation evidence index

- `src/components/Welcome.tsx`: first-run explanation and three entry routes.
- `src/components/TodayCard.tsx`, `CapitalsDoor.tsx`, `src/game/offer.ts`: return offer and contextual capital progression.
- `src/components/RoundBreak.tsx:112`, `SessionSummary.tsx:263`: stopping flow and continuation-only summary.
- `src/game/pickCountry.ts:148`: new-card allowance and early fallback repetition.
- `src/App.tsx:134`: caught-up gate and round-boundary behavior.
- `src/game/srs.ts:299`: definition of known; `src/game/questionModes.ts`: two fact tracks shared across four prompt types.
- `src/game/expedition.ts:256`, `src/components/ExpeditionResult.tsx:59`: share text and native share payload.
- `src/components/SettingsMenu.tsx:321`: local data display and erasure.
- `src/game/counters.ts`, `outcomes.ts`, `useGame.ts:1856`: metric definitions and recording points.
- `src/game/useGame.ts:254`, `src/data/normalize.ts`, `src/components/AnswerInput.tsx`: typed-answer acceptance and input behavior.
- `src/components/WorldMap.tsx`, `smallTargets.ts`, `pinchHint.ts`: existing map interaction provisions.
- `index.html`: title, description, icon and sharing metadata.
