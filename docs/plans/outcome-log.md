# A per-answer outcome log

Taken from `open-ideas.md` ("Measuring learning, not activity"). Nothing is
built yet; this is the plan the PR works from, to be amended by the PR that
proves any of it wrong.

## Why

The R2.4 counters are aggregates, and the SRS store holds only each card's
current FSRS state and a lifetime hit/miss tally. Neither can answer the
questions that say whether Atlasaur teaches anything:

- Does a country missed today get easier on later days, not just later in the
  same sitting?
- Is the first attempt at a card on a new day (delayed recall) improving over
  weeks, separately from same-session accuracy?
- Which wrong country does a learner reach for when asked for a given one?
  Confusion pairs (`open-ideas.md`, Remediation) depend on this, and the
  wrong-clicked country today lives only as long as the reveal.

All three need the individual answers, with times, kept across days.

## What one entry holds

One entry per answer or skip, written the moment feedback appears:

| Field | Source | Notes |
|---|---|---|
| time | `now` of the answer | epoch seconds; local day is derived when read |
| asked | `feedback.correctIso3` | the card |
| mode | `state.mode` | fact is `factOf(mode)`, so not stored |
| practice | `state.practiceMode` | `study` / `quiz` / `expedition` |
| phase | `state.phase` | a review-pass attempt is an observation even though FSRS is not graded again |
| outcome | `feedback.kind` | `correct` / `wrong` / `skipped` |
| given | `feedback.answerIso3` when `wrong` | the clicked country or the country a typed answer resolved to; empty when a typed answer matched nothing |

It is stored as a fixed-position array, not an object, e.g.
`[1789300000,"SVN","nc","s","n","w","SVK"]`, which is about 40 bytes.
Mode, practice, phase and outcome are short codes from fixed tables in
`outcomes.ts`, typed `Record<QuestionMode, string>` and so on. A mode added
later fails to compile until it has a code. **Codes are not positions:**
reordering `QUESTION_MODES` changes nothing in the store. Changing an existing
code would, and a test pins every code and checks none repeats. An entry with
a code this build does not know (written by a later build) is kept on disk as
it is and skipped when read.

Deliberately not stored:

- **The card's FSRS state before the answer.** It is not available at one
  point for every practice mode: Study defers its grade to dismiss, while
  quiz and expedition have already written the grade when feedback appears.
  Getting it would mean putting it on `Feedback` or a new reducer field. It
  can be rebuilt by replaying the log for any card first met after the log
  exists, which is enough for the questions above. Revisit only if an
  analysis needs it for older cards.
- **Response time.** A different question (fluency, not recall). It needs a
  card-shown timestamp the reducer does not keep.
- **The typed text.** Unbounded, personal, and not needed: a typed miss that
  resolves to a country is already recorded as `given`.

## Storage

- **One key per local month**, `atlasaur:outcomes:v1:YYYY-MM`, each holding
  JSON `{ version: 1, entries: Entry[] }`. The code lives in a new
  `src/game/outcomes.ts` beside `counters.ts`. The month comes from the
  answer's own time, so a tab left open across month-end writes to the right
  key. Local only: nothing leaves the device, and any export is a later,
  explicit decision.
- **Why not one key:** a write has to parse and save the whole key.
  Measured in Node on a desktop, a 10,000-entry key (400 KB) costs 2.1 ms per
  answer and a 5,000-entry key 1.0 ms. Both are several times that on a phone,
  land during the correct flash, and grow with the learner's history. A month
  key costs the same on day one as in year two: about 75 KB at a heavy 60
  answers a day.
- **Bound:** the latest **6 month keys** are kept. When a write opens a new
  month, keys older than that are removed. One key also stops at **5,000
  entries**, dropping its oldest, so a runaway month cannot grow without
  limit. Worst case is about 1.2 MB, against the usual 5 MB origin quota and
  an SRS store of about 100 KB. Six months is far longer than any window these
  analyses use.
- Rejected: **aggregating dropped entries** into per-card summaries. It keeps
  a second, lossy format alive for history nobody has yet asked about, and
  whatever it summarised would be fixed before the questions are.
- A write that throws (quota, private mode) is swallowed like every other
  store's. The log is the least important thing in the app.

## Recording

- In `useGame`, from an effect on `state.feedback`, not in the reducer, the
  same division as the counters and the streak. `feedback` is set only by
  `applyCorrect` and `applyMiss`, as a new object for each answer, so "a new
  non-null `feedback`" means exactly one answer. That holds in every practice
  mode and in the review pass, which `cardsAnswered` does not cover as cleanly.
  The mode, practice mode and phase read from the same render are the ones
  the answer was given in, so this effect needs no refs.
- A ref holds the last feedback object logged, so a re-render or StrictMode's
  double effect in development cannot log one answer twice.
- **Read, append, write at the moment of the answer.** The log is not held in
  React state at all, because nothing in the app reads it on a render path.
  That is also what makes several tabs work (below).

## Several tabs

Every other store saves one tab's in-memory copy, so the last write wins. An
append-only log cannot work that way: two tabs would each save a snapshot
without the other's answers. `appendOutcome` therefore re-reads the
month's key, pushes, trims and writes back in one synchronous call, so each tab
appends onto whatever the other last wrote. Two appends in the same millisecond from
two tabs could still lose one. That is accepted: it needs two answers landing
at once, and the log is for trends.

A stale old build never reads or writes these keys, so unlike the SRS key
there is no rollback risk.

## Erase and the Data view

- "Erase all progress" (`resetSrs` in the hook) removes every
  `atlasaur:outcomes:v1:` key, found by prefix, along with the SRS keys, the
  streak, the counters and the welcome flag. The log describes
  the history the learner just erased.
- One row under Data in `SettingsMenu`: "Answers logged: N since 12 Sept". It
  is omitted when the log is empty, like the other rows, and read when the
  menu opens rather than kept live.
- No analysis in the UI in this PR. Confusion pairs and a delayed-recall
  figure are their own plans, and each will be the log's first real reader.

## Tests

- `outcomes.test.ts`:
  - encoding round-trips every mode, practice mode, phase and outcome;
  - every code is pinned and none repeats;
  - an entry with an unknown code is skipped when read and kept on disk;
  - malformed and wrong-version blobs load as empty;
  - an answer lands in the key for its own local month;
  - a new month removes all but the latest 6 month keys;
  - one key trims to its newest 5,000;
  - an append re-reads storage, so a write made in between by "another tab"
    is kept.
- `useGame` tests:
  - one entry for each answer in study, quiz normal, quiz review and
    expedition, and one for a skip;
  - a typed miss that matches nothing logs `wrong` with empty `given`;
  - dismiss, a mode switch, a scope change and `syncExpedition` add nothing;
  - `resetSrs` removes every month key.

## Verification

CI as usual (lint, typecheck, tests, build). By hand, at desktop and 390 px:
- play a round in each practice mode and check this month's key in devtools;
- check the Data row appears and counts;
- erase and check every month key is gone;
- answer in two tabs and check both tabs' answers are in the log.

In the PR, time `appendOutcome` on a 5,000-entry month key under devtools'
CPU throttling (phone profile). That is the worst case the bound allows. If
it is noticeable during the correct flash, the fallback is to defer the write
to idle time with `requestIdleCallback` and a `setTimeout` fallback. A write
lost when the tab closes during idle time is accepted; the log is for trends.
