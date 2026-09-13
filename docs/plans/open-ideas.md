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

## Question kinds

- **"Which borders…"**, held from R3 on 2026-09-12. The reasons and the
  shape worth reviving are in the Decisions of `r3-variety-and-a-hook.md`;
  this entry is only so the idea is findable from here.

## Remediation

- **Confusion pairs.** Notice when a learner repeatedly clicks one country
  when asked for another (Slovakia for Slovenia, Niger for Nigeria) and teach
  the two side by side, rather than revealing each miss in isolation. Builds
  on the miss reveal. Reads the outcome log (`outcome-log.md`), which persists
  the wrong-clicked country that the reveal only holds for a moment.

## Findings still true in the code (checked 2026-09-11)

- **"Known" includes FSRS Relearning.** Deliberate (CLAUDE.md: the map and the
  stat share `learnedCount`'s `state >= 2` predicate), but it means a country
  just missed can still read as known until it is graded down. Worth revisiting
  if "known" is ever meant to promise retention rather than graduation.
