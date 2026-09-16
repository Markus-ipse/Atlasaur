import { useEffect, useRef } from "react";
import type { Phase, PracticeMode, Subregion } from "../types";
import { tallyParts } from "./tallyParts";
import { nextBackOrNothing } from "../game/nextBack";
import { STUDY_NEW_CAP } from "../game/pickCountry";
import type { CapitalOffer } from "../game/offer";
import { CapitalsDoor } from "./CapitalsDoor";
import { testTallyParts, type TestTally } from "../game/testTally";

type Props = {
  practiceMode: PracticeMode;
  roundsCompleted: number;
  // Cross-day streak day this round belongs to; shown in the eyebrow.
  streakDay: number;
  roundCards: number;
  roundRight: number;
  roundNew: number;
  // A test round's standing in countries (testTally.ts); read only when
  // practiceMode is "quiz". A test's break is an intermission, never its end
  // (the summary is), so it speaks the test's figures, not the round's.
  test: TestTally;
  // A test's review pass ("Review N missed") asks only the misses, so its
  // break counts those alone.
  phase: Phase;
  // The scheduler has no more useful work: nothing due and the stretch's new
  // cards done, or a round that ended early because its next card would only
  // have been filler. Flips the copy to "that's everything for now" and makes
  // Done the default, so stopping feels like a reward rather than a wall.
  caughtUp: boolean;
  // The focus the learner is in, if any. A caught-up round inside a focus is
  // only out of work in that region, so the title says so.
  spotlightSubregion: Subregion | null;
  // The round's new cards are used but unseen ones remain: Keep going brings
  // more (continueRound refills the allowance), so this is no "everything".
  newCapReached: boolean;
  // Capitals worth offering, or null. Shown only on a caught-up break: inside
  // a sitting that is the moment a learner has demonstrably run out of work,
  // so the offer is earned there, as it was on the CaughtUp banner.
  capitalOffer: CapitalOffer | null;
  onTryCapitals: () => void;
  // Leaves the focus and carries on with the whole scope. Offered only on a
  // caught-up break inside one, where the region is out of work but the rest
  // of the scope may not be.
  onLeaveFocus: () => void;
  // When the next card comes back (nextBackLine), or null. Said only when
  // caught up.
  nextBack: string | null;
  onKeepGoing: () => void;
  onDone: () => void;
};

// The interstitial between rounds. Deliberately small: a line of numbers
// and two buttons. Enter follows the focused default (Keep going, or Done
// when caught up); "Done for now" lands on the rest card. Escape and a click
// on the backdrop do nothing: either could be a learner trying to put the
// app down, and neither should start another round.
export function RoundBreak({
  practiceMode,
  roundsCompleted,
  streakDay,
  roundCards,
  roundRight,
  roundNew,
  test,
  phase,
  caughtUp,
  spotlightSubregion,
  newCapReached,
  capitalOffer,
  onTryCapitals,
  onLeaveFocus,
  nextBack,
  onKeepGoing,
  onDone,
}: Props) {
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  if (practiceMode === "quiz") {
    return (
      <TestBreak
        test={test}
        phase={phase}
        onKeepGoing={onKeepGoing}
        onDone={onDone}
      />
    );
  }

  const title = newCapReached
    ? `${STUDY_NEW_CAP} new ones met.`
    : caughtUp
    ? spotlightSubregion !== null
      ? `That's all in ${spotlightSubregion} for now.`
      : "That's everything for now."
    : roundRight === roundCards
    ? "A clean round."
    : roundRight >= roundCards - 2
    ? "A steady hand."
    : "Round done.";

  const parts = tallyParts(
    roundRight,
    roundCards,
    practiceMode === "study" ? roundNew : 0,
  );

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="round-break-title"
        aria-describedby="round-break-line"
        className="w-full max-w-sm bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <p className="font-display text-xs uppercase tracking-wide text-ink-mid">
          Round {roundsCompleted} · Day {streakDay}
        </p>
        <h2 id="round-break-title" className="text-2xl font-bold text-ink-deep">
          {title}
        </h2>
        <p id="round-break-line" className="text-sm text-ink-mid tabular-nums">
          {parts.join(" · ")}
          {/* A sentence on its own line, never inside the " · " tally. Not
              in a focus: nextBack counts the whole scope, which can already
              have cards back outside the region. */}
          {caughtUp && spotlightSubregion === null && (
            <span className="block mt-1">
              {`${nextBackOrNothing(nextBack)}.`}
            </span>
          )}
          {newCapReached && (
            <span className="block mt-1">Keep going for more, or rest here.</span>
          )}
        </p>
        <div className="flex flex-col gap-2">
          {caughtUp ? (
            <>
              <button
                ref={focusRef}
                type="button"
                onClick={onDone}
                className={primaryClass}
              >
                Done for now
              </button>
              <button
                type="button"
                onClick={onKeepGoing}
                className={secondaryClass}
              >
                Keep going anyway
              </button>
              {capitalOffer && (
                <CapitalsDoor
                  offer={capitalOffer}
                  onClick={onTryCapitals}
                  className={secondaryClass}
                  subClassName="text-ink-faded"
                />
              )}
              {spotlightSubregion !== null && (
                <button
                  type="button"
                  onClick={onLeaveFocus}
                  className={secondaryClass}
                >
                  Back to all regions
                </button>
              )}
            </>
          ) : (
            <>
              <button
                ref={focusRef}
                type="button"
                onClick={onKeepGoing}
                className={primaryClass}
              >
                Keep going
              </button>
              <button
                type="button"
                onClick={onDone}
                className={secondaryClass}
              >
                Done for now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// The twelve-card break inside a test. Twelve answers are not the test: a
// retry can still be waiting, and a scope larger than twelve has more to ask.
// So it leads with progress, "11 of 197 done." (found, as the status bar
// counts it), rather than a "185 to go" that daunts a world test, gives the
// same per-country figures as the summary it leads to, and names ending the
// test as a choice rather than calling it a round done.
//
// A review pass asks only the misses and returns to the summary when they
// are gone, so its break counts those and promises nothing about countries
// never asked.
function TestBreak({
  test,
  phase,
  onKeepGoing,
  onDone,
}: {
  test: TestTally;
  phase: Phase;
  onKeepGoing: () => void;
  onDone: () => void;
}) {
  const reviewing = phase === "review";
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  const found = test.firstTry + test.recovered;
  const title = reviewing
    ? test.stillMissed === 1
      ? "1 miss left to review."
      : `${test.stillMissed} misses left to review.`
    : `${found} of ${test.size} done.`;
  // The review pass drops the parts it cannot move: the first-try score is
  // fixed and it never asks a country that was not asked.
  const parts = reviewing
    ? testTallyParts({ ...test, notAsked: 0 }).slice(1)
    : testTallyParts(test);

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="round-break-title"
        aria-describedby="round-break-line"
        className="w-full max-w-sm bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <p className="font-display text-xs uppercase tracking-wide text-ink-mid">
          {reviewing ? "Test · Review" : "Test · A short break"}
        </p>
        <h2 id="round-break-title" className="text-2xl font-bold text-ink-deep">
          {title}
        </h2>
        <p id="round-break-line" className="text-sm text-ink-mid tabular-nums">
          {parts.join(" · ")}
          {!reviewing && (
            <span className="block mt-1">
              Keep going to finish the test, or end it here.
            </span>
          )}
        </p>
        <div className="flex flex-col gap-2">
          <button
            ref={focusRef}
            type="button"
            onClick={onKeepGoing}
            className={primaryClass}
          >
            Keep going
          </button>
          <button type="button" onClick={onDone} className={secondaryClass}>
            {reviewing ? "End the review here" : "End the test here"}
          </button>
        </div>
      </div>
    </div>
  );
}
