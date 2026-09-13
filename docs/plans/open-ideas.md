# Open ideas

Ideas and findings that no release plan has taken on yet. Salvaged from an
abandoned "learning-first" roadmap drafted on 2026-09-05, which the product
survey (`../product-survey-2026-09.md`) and the R1–R3 plans superseded the same
day. Most of that draft has since shipped in another form (honest accuracy,
"Known" / "Seen", rounds of twelve, the Today card, the welcome). What is left
here is not a backlog — each item needs its own plan before it is built.

## Measuring learning, not activity

- **Delayed recall is the real outcome.** The survey's "Known countries over
  time" figure reads FSRS state, and same-session accuracy measures the
  moment. Neither shows that a country is remembered days later. Samples the
  scheduler picks are also biased: it resurfaces exactly the cards it expects
  to be shaky. Read the R2.4 counters with that in mind, and do not claim a
  change improved learning on their strength alone.
- **A per-answer outcome log.** The counters are aggregates, so nothing stored
  today can answer "does a missed country get easier on later days?". A
  versioned local log of answers — country, time, question mode, practice
  mode, phase, correct / wrong / skipped — would. It needs a documented size
  bound or aggregation policy rather than growing without limit, and should be
  local only, like the counters. A remediation attempt in a review pass is an
  observation even though it is deliberately not graded into FSRS again.

## Question kinds

- **"Which borders…"**, held from R3 on 2026-09-12. The reasons and the
  shape worth reviving are in the Decisions of `r3-variety-and-a-hook.md`;
  this entry is only so the idea is findable from here.

## Remediation

- **Confusion pairs.** Notice when a learner repeatedly clicks one country
  when asked for another (Slovakia for Slovenia, Niger for Nigeria) and teach
  the two side by side, rather than revealing each miss in isolation. Builds
  on the miss reveal. Wants the outcome log above, since the wrong-clicked
  country is held only for the current reveal and never persisted.

## Findings still true in the code (checked 2026-09-11)

- **"Known" includes FSRS Relearning.** Deliberate (CLAUDE.md: the map and the
  stat share `learnedCount`'s `state >= 2` predicate), but it means a country
  just missed can still read as known until it is graded down. Worth revisiting
  if "known" is ever meant to promise retention rather than graduation.
