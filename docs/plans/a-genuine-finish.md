# A genuine finish

Issue #54, priority 1 of the product-owner review
(`../product-owner-review-2026-09-15.md`): make a short visit satisfying from
the first answer to a finish that actually finishes.

## Why

Three things, all read off the source:

- **Stopping never stopped.** "Done" and "Done for now" landed on the Study
  summary: six figures and four doors, every one of them more activity, and no
  finish. Escape and a backdrop click called `closeSummary` and quietly
  resumed studying. On the round break, Escape kept going too. The learner
  said they were done and got another menu.
- **Rounds were padded.** Once nothing was due and the stretch's ten new cards
  were used, `pickNextStudy` fell through to the most-overdue record, due or
  not, and kept serving those until the round reached twelve. A knowledgeable
  newcomer could see the same few countries again purely to fill a quota.
- **The welcome explained the scheduler before the first answer**, and the
  first-miss intro opened with "Nothing to grade", answering a worry the
  learner had not had.

## Decisions

### Pacing: retries, then an early finish

- **A pending miss comes forward.** `pickNextStudy` gains branch 2b between
  new introductions and the fallback: when nothing is due and no new card may
  be introduced, the soonest in-pool `resurfaceQueue` entry is asked even
  though its 3–5 card gap has not elapsed. A retry is useful work; a card that
  is not due is not.
- **Filler is derived, never stored.** `cardIsFiller(state, now)` sits beside
  `cardIsReturning`: a Study card with a record for its fact, not due, and not
  in the resurface queue. On `pickNextStudy`'s partition that is exactly the
  most-overdue fallback (or the no-pick case, which keeps the card just
  answered).
- **The round ends where the useful work ends.** `advanceCard` sets
  `roundEndedEarly` when the card it just picked is filler, and
  `withRoundAdvance` treats that like a full round: the break opens and
  `roundsCompleted` is credited. The break reads "That's everything for now."
  (or "That's all in <subregion> for now." during a focus, where the rest of
  the scope may still have work) with Done for now as the default.
- **A short round counts.** It credits the streak day and `roundsFinished`.
  The learner did everything there was; withholding the day would punish a
  quick, complete visit. Fewer or shorter rounds per sitting is an accepted
  outcome of this issue.
- **Keep going anyway holds for the sitting.** `fillerAccepted` is set by
  Keep going from a caught-up break (`continueRound`), by Keep going anyway on
  the CaughtUp banner (`acceptFiller`), or by Begin on a Today card with
  nothing waiting (which has already offered "a round anyway"; its Escape and
  backdrop only close it), and reset with the sitting. It is also cleared when
  the learner leaves a focus or changes scope — the choice was for the pool as
  it was — and it never holds a round open against a spent new-card allowance
  with unseen cards left (decided in the second and third reviews). Without it
  every filler card would end its own one-card round.
- **The banner asks before a round opens on filler.** It shows on
  `nothingUseful && !fillerAccepted` with no card answered in the round, and
  only where no earlier screen has asked: the round break, the rest card
  (closing it onto filler accepts it) and the Today card (Begin with nothing
  waiting accepts it) each count as the choice, since both reviewers flagged
  the second ask. Never inside a round (the reducer ends the round instead). App's local
  acknowledgement state is gone.
- **A focus only speaks for its region.** The pick and `cardIsFiller` see the
  focus's subregion while `dueCount` and `nextBack` count the whole scope, so
  during a focus the banner reads "Nothing more in <subregion> for now." and
  neither it nor the break says when the next ones come back.
- **"Nothing useful" is a question about the pool.** The third review found
  the banner, the early end and the rest card judging it from the card on
  screen alone, so a wider scope, a focus left or cards coming due could
  leave "Nothing more has come back" standing, and closing the rest card
  could resume a stale filler card and quietly accept filler. `nothingUseful`
  now also requires that no queued miss is waiting and that nothing else in
  the pool is due or allowed as new; a scope change and leaving a focus move
  off a filler card when that is no longer true, and the rest card's
  "anyway" wording counts a queued miss as waiting.
- **Every focus has a way out.** Because the Focus door counts only what it
  can ask, every focus ends by running out, and the status-bar chip is
  unreachable behind the break. The in-focus break and banner offer **Back to
  all regions**, which leaves the focus and, on the break, carries on with the
  whole scope (decided in the third review).
- **Leaving a focus or changing scope starts a fresh allowance** while unseen
  cards remain, like Keep going. Otherwise doing either right when a round's
  ten new cards were spent left the newly reachable countries held back: one
  repeat, then a "10 new ones met." break over no new card. The accepted cost
  is that toggling scope can surface more new countries in one sitting
  (decided in the third review).
- **The recovery line uses digits** ("You got 1 right that you'd missed
  earlier."), like the sitting's tally directly below it.
- **The capitals offer moves to the break.** With the banner now mostly
  skipped, the caught-up round break is where a learner has demonstrably run
  out of work, so it carries the `CapitalsDoor` (R3.2) as a quiet third
  option when there is an offer. The door switches to Country → Capital, then
  continues the round; `continueRound` accepts filler only when it actually
  lands on a filler card, so taking the door does not switch early finishes
  off for the rest of the sitting.
- **A queued miss holds the round open.** If the last useful card is itself a
  miss, it cannot be asked straight back. Rather than end with it still
  queued, the round stays open while an in-pool miss is waiting: a met card
  runs, the miss comes back, then the round ends. The least familiar card is
  the likeliest miss and the one whose recovery matters most. (Decided in
  review; ending at once was the alternative.)
- **The new-card cap refills on an explicit Keep going.** Ending on filler
  made `STUDY_NEW_CAP` look like "everything": a newcomer's first round
  stopped after ten new cards with ~190 unseen, and nothing refilled the cap,
  so Keep going anyway served repeats. Now, when the cap is used and unseen
  cards remain in the pool (`newCapReached`), the break reads "10 new ones
  met." with Keep going as the default, and Keep going — on the break
  (`continueRound`) or the rest card (`closeSummary`) — resets
  `newIntroducedThisStretch` and moves off a filler card. Every explicit Keep
  going does this while unseen cards remain, not only once the cap is spent:
  the allowance is per round, so a newcomer who met nine in round one is not
  cut off one card into round two (decided in the second review). At most ten
  new per round, retries still first. "That's everything for now." is kept for a pool
  with nothing unseen. (Decided in review over keeping the cap per sitting.)

### The rest card

Done and Done for now land on a resting state, not a menu:

- **"That's it for now."** — no "Nice work" over a sitting of misses.
- The sitting line as before (`tallyParts`).
- **Recoveries**: "You got N right that you'd missed earlier." The sitting
  keeps `sittingMissed` and `sittingRecovered`, keyed `${fact}:${iso3}` by the
  fact the answer graded, counting distinct cards. A card closed by Done
  mid-reveal counts. The key is read before the card advance replaces
  `current`.
- **"Kept in this browser — no account needed."** — only once there is a
  record to keep and the latest `saveStore` landed (it returns whether the
  write did). Decided in the second
  review: a one-byte probe passed while a nearly full quota refused the real
  store, and "saved" over-promised on phones, where a private window discards
  writes on close and iOS Safari clears script storage after seven days away.
- One **Keep going** button, keeping its reason sub-line.
- **The recovery line comes first**, above the sitting tally, so the ending
  leads with what changed rather than with accuracy (decided in the second
  review).
- **The Focus door counts what it can ask now.** "N left to learn there"
  counted countries not yet known, including ones still in FSRS learning and
  not due, so tapping it could open straight onto a "Nothing more in X for
  now." banner. It now reads "N waiting there", ranked and gated on
  `askableBySubregion` — unseen or due now (decided in the second review).
- Everything else — the Places/Capitals and All time figures, Focus, Test me
  on these, the expedition — under a closed disclosure (`<details>`) labelled
  "Figures, focus and tests", so a learner looking for a test knows where it
  went (named in review; a bare "More" said nothing).
- **At rest**: focus lands on the dialog, so Enter starts nothing; Escape and
  the backdrop do nothing. The same holds on the round break and on the Daily
  Expedition's result card, where Back to studying is the way out (decided in
  review; it predates this change). The learner can
  close the tab or put the phone away.

### Welcome and first miss

- The welcome says what to do: "Learn the world map, a few places at a time.
  Find a country. If you don't know it, we'll show you and bring it back."
  One primary door, **Start a short round** ("Big, familiar countries first"),
  and two quieter text-style alternatives, Pick a region and "I know my way
  around — test me".
- `StudyIntro` now carries the scheduler idea alone, without "Nothing to
  grade": "Miss one and it's back in a few cards. Get it right and it comes
  back later, further out each time, until it's known." The seen flag stays
  `atlasaur:srs:seenIntro:v2`: the change is a trim of text learners already
  dismissed, not a rewrite worth reshowing (decided in the second review).

## Truth rules for the new lines

- "That's everything for now." — shown only when the next card is filler or
  App's caught-up heuristic holds; inside a focus it names the region instead.
- "You got N right that you'd missed earlier." — same sitting, same fact, a
  miss followed by a correct answer. Never "known", "learned" or "remembered":
  a same-sitting recovery says nothing about next week.
- "Kept in this browser — no account needed." — only when the real save of the
  learning records landed; it says where progress lives, not that it survives
  every browser's clean-up.
- "Find a country" and "places" on the welcome — every door starts on
  Name → Click.

## Phone checklist (390 px)

- **Fresh**: clear site data → welcome → Start a short round → first card with
  no setup.
- **Partial**: answer a few, Done → rest card; Escape and a backdrop tap leave
  it up; reload keeps records; Keep going resumes.
- **Completed**: a full or early round → break → Done for now → rest card;
  streak day recorded.
- **Caught up**: a scope whose countries are all met and none due → the round
  ends early after the last retry; Keep going anyway runs a full round; the
  banner does not ask twice.
- **Recovery**: miss a country, get it right when it returns, Done → the
  recovery line.

### Results, 15 September 2026

Run against the dev build in desktop Chrome, the app in a 390 × 844 iframe
(an emulated phone width, not a physical phone):

- **Fresh**: the welcome showed one dark primary button and the two quiet
  links wrapped cleanly; the first card followed with no setup.
- **Partial**: two misses then Done → "That's it for now.", "This sitting:
  0 of 2 right · 2 newly seen", the saved line, one Keep going, the disclosure closed.
  Focus was on the dialog; Escape and a backdrop click left it up. The
  disclosure opened to the figures, Focus, the test and the expedition.
- **Caught up**: Oceania seeded all met, one due → Today card "1 coming back"
  → missing it ended the round after one card with "That's everything for
  now." and Done for now as the default; Keep going anyway ran on with no
  banner and no further break.
- **Recovery**: missed Argentina, found it on the map when it came back →
  Done showed "You got one right that you'd missed earlier."

Rerun after the second review, same setup:

- **A newcomer's round**: missed Argentina, found the next nine; Argentina
  came back as the early retry and was found. The round broke at 11 cards:
  "10 new ones met." · "10 of 11 right · 10 newly seen" · "Keep going for
  more, or rest here.", with Keep going focused. Keep going brought Colombia,
  not met before, and the new-card count was back at 0 of 10.
- **The rest card**: "You got one right that you'd missed earlier." above
  "This sitting: 10 of 11 right · 10 newly seen", then "Kept in this browser —
  no account needed."; the disclosure reads "Figures, focus and tests" and its
  door "Focus on Eastern Africa · 19 waiting there".
- **Caught up, with capitals**: Oceania all known, Australia due → found it →
  "That's everything for now." · "1 of 1 right" · "The next ones come back
  tomorrow.", with Done for now, Keep going anyway and "Try capitals · 14
  countries you already know".

Not rerun in the browser, and covered by unit tests instead: a round held
open when its last useful card is missed, the focus copy on the banner and
the break, and the Daily Expedition result card at rest.

## Still open

- **A newcomer who never misses** never sees `StudyIntro`, so nothing tells
  them countries come back or what the map's colour means. The review wants
  that explained "at the first relevant success" (a first return, a first
  country turning known); that is a new moment to design, not part of this
  change.
- **The Daily Expedition is harder to find** for a new learner, who has no
  Today card: its door is now only inside the rest card's disclosure. Review
  recommendation #4 (a direct expedition entrance) covers it.

- **Real phones.** The checks above used an emulated width. Touch accuracy,
  the keyboard in typed modes and readability on actual devices are unchecked.
- **Counters.** A short round that ends early credits the streak day and
  `roundsFinished`; a long sitting ended with Done before any round filled
  credits neither. Decided ("a short round counts"), but `roundsFinished` now
  pools rounds of very different lengths.
- **Doors under the disclosure.** Test me on these, Focus and the expedition sit behind
  a closed disclosure, so test rounds, expedition starts and capital answers
  may fall. Don't read that as lost appetite when deciding on flags (R3.5).


Recording feedback from target adults on their own phones (clarity,
usefulness, stopping) is an acceptance criterion of #54 that code cannot meet.
Suggested prompts after a first visit: *What did you think you were meant to
do first?* · *Is there a place you can find now that you couldn't before?* ·
*When you pressed Done, did it feel finished?* · *Did any question feel like
filler?* · *Would you open it again tomorrow — why or why not?*
