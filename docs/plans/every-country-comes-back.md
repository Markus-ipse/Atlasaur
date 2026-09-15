# Every country comes back

Teaching the learner the one idea the scheduler already runs on. No
scheduling changes: copy, one pure helper, one derived boolean, one chip.

## Why

A learner's screenshot of the Study summary asked what its four buttons
differ in. The deeper gap was that **the app never says how it works**, and
the one idea a learner needs is short and true of the code:

> Every country comes back — sooner if you miss it, later each time you
> don't; once it has come back and you place it again, it's on your map.

Why that sentence is true:

- ts-fsrs defaults (`src/game/srs.ts`): a first correct answer schedules the
  card about ten minutes out; the second correct, usually the next day, moves
  it to FSRS Review, which is what the app calls **known** (`state >= 2`),
  due about a week later and further each time after.
- A Study miss comes back within the sitting after 3–5 cards
  (`studyResurfaceQueue`), and FSRS schedules it again soon after.

So "4 to review" on a returning learner's Today card mostly meant "4 countries
you placed yesterday, back for the answer that makes them stick". Nothing on
screen said so:

- **"To review"** was Anki vocabulary for "coming back", in eleven places;
  "Review" also named the test's retry pass and the capitals door.
- **A returning card looked like a new one**, so the moment the model becomes
  visible — Portugal is back, you place it, "now on your map" — passed
  unmarked.
- The one explanation (`StudyIntro`, first Study miss) said only that misses
  come back.
- The summary's doors carried no reasons, and its hint paragraph repeated the
  primary button.
- "Focus on X" had no way out (`clearSpotlight` existed; nothing called it).
- "Come back later" was vague where the app can say exactly when.

## Learner vocabulary

- **coming back** — `dueCount`. Replaces "to review" everywhere.
- **Back again** — the pill on a Study card that has a record for its fact
  (it came back), and on every card of a test's retry pass (it came back
  because it was missed). One pill, one phrase.
- **known** — unchanged; the tile and settings word. The new StudyIntro line
  defines it by use.
- "Review" survives only on **Review N missed**, the button that opens the
  retry pass.

## Decisions

- **Returning is derived, never stored.** `pickNextStudy` partitions exactly
  on record existence: the resurface, due and most-overdue branches require a
  record, the new-introduction branch requires none. A Study grade commits in
  the same reducer step that replaces `current`, and the prompt renders only
  while there is no feedback, so at prompt time "a record exists" is the same
  as "this card came back" and cannot disagree with the counts.
  `cardIsReturning` sits beside `cardIsNew`. A scope change or same-fact mode
  switch made mid-reveal keeps the card after committing its grade, so the
  pill lands on the card just answered; it is being asked again, which is a
  return.
- **Say when the next country comes back.** `nextDueAt` is the earliest
  in-scope `due` strictly after now, the complement of `isDue`'s `<=`, so a
  record is either counted by `dueCount` or a candidate for `nextDueAt`,
  never both. `nextBackLine` turns it into one count-free line: "in a few
  minutes" under an hour (a learning step is ten, and it also covers a card
  already back that the hourly-refreshed count has missed), then "later
  today", "tomorrow", "in N days" on calendar days, not 24-hour deltas.
- **The summary's doors carry their reasons**; the hint paragraph goes. Keep
  going says what it picks next (what is coming back, new countries while the
  stretch's cap allows, or when the next ones come back). During a focus it
  says the focus instead: the counts are the whole scope's, the picks the
  region's.
- **Focus gets an exit** — a chip in the status bar — and the depletion toast
  stops saying "Spotlight" and "scope", words the learner never saw.

### The truth rule

Every new line must be true in every state it can show in.

- "Place" and "on your map" are location-only, because the map paints
  `location` and nothing else. They appear only where the fact is guaranteed
  to be location — the Welcome, which always starts there. Everywhere else:
  "get it right … until it's known".
- `dueCount === 0` is not "you got them all". A missed due card leaves the
  count for about ten minutes (Relearning) and a miss can sit in the resurface
  queue, so caught-up copy says "nothing more has come back", never an
  achievement.

## Rejected

- **"Due back"** — mechanical, and "due" was already in three lines.
- **Keep "to review" and explain it** — defines a term by use instead of
  removing the need for one.
- **A map cue for a returning card.** The tier-1 wash was collapsed in
  name-to-click precisely because a small painted set narrows the answer.
- **The pill on the Name → Click prompt.** Built first, and caught in review:
  "met before" is not one harmless bit there. It says the answer is gold or
  one of the few hidden learning cards, which early on is a handful of
  countries. In that mode the pill rides the answer panels instead; the other
  three modes leak nothing (capital-to-click has no paint, the typed modes
  highlight the country) and keep it on the prompt.
- **A count in the next-back line** — plural branching for no gain.
- **A `returning` state field** — a second source of truth that can drift
  from the counts.
- **Moving StudyIntro to the first card.** The first miss is when "back in a
  few cards" is promised and then, a few cards later, kept.

## Verification

- Unit: `nextDueAt` partitions with `dueCount`; `nextBackLine` pins the
  calendar boundary (23:30 → 01:30 reads "tomorrow", under an hour reads
  "in a few minutes"); `cardIsReturning` is
  Study-only; the pill across Study / test / retry pass / expedition; the
  summary's door reasons and tile order; the focus chip clears without
  touching the card or the round.
- In the browser, phone width too: the Welcome sentence; a first Study miss
  returning 3–5 cards later with **Back again**; a new country answered
  correctly returning about ten minutes later with the pill; capital modes
  never say "place" or "on your map"; the summary's doors; the focus chip.
