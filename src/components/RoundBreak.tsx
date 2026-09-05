import { useEffect, useRef } from "react";
import type { PracticeMode } from "../types";

type Props = {
  practiceMode: PracticeMode;
  roundsCompleted: number;
  // Cross-day streak day this round belongs to; shown in the eyebrow.
  streakDay: number;
  roundCards: number;
  roundRight: number;
  roundNew: number;
  // Nothing due and today's new cards done: the scheduler has no more work.
  // Flips the copy to "that's everything for today" and makes Done the
  // default, so stopping feels like a reward rather than a wall.
  caughtUp: boolean;
  onKeepGoing: () => void;
  onDone: () => void;
};

// The interstitial between rounds. Deliberately small: a line of numbers
// and two buttons. Enter follows the focused default (Keep going, or Done
// when caught up); Escape always keeps going; "Done for now" lands on the
// session summary.
export function RoundBreak({
  practiceMode,
  roundsCompleted,
  streakDay,
  roundCards,
  roundRight,
  roundNew,
  caughtUp,
  onKeepGoing,
  onDone,
}: Props) {
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKeepGoing();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKeepGoing]);

  const title = caughtUp
    ? "That's everything for today."
    : roundRight === roundCards
    ? "A clean round."
    : roundRight >= roundCards - 2
    ? "A steady hand."
    : "Round done.";

  const parts = [`${roundRight} of ${roundCards} right`];
  if (practiceMode === "study" && roundNew > 0) {
    parts.push(`${roundNew} newly seen`);
  }
  if (caughtUp) parts.push("nothing more is due");

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onKeepGoing();
      }}
    >
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
