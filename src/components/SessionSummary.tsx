import { useEffect, useRef } from "react";
import type { Country, PracticeMode, SrsStore, Subregion } from "../types";
import {
  lifetimeAccuracy as srsLifetimeAccuracy,
  learnedCount as srsLearnedCount,
  seenCount as srsSeenCount,
  masteryBySubregion,
  totalReviews as srsTotalReviews,
} from "../game/srs";
import { pickSpotlight } from "../game/pickCountry";

type Props = {
  practiceMode: PracticeMode;
  score: number;
  total: number;
  missed: Country[];
  unlearnedCount: number;
  completedCount: number;
  totalInScope: number;
  dueCount: number;
  newAvailableCount: number;
  srsStore: SrsStore;
  scopeIso3s: ReadonlySet<string>;
  countries: readonly Country[];
  onReview: () => void;
  onPlayAgain: () => void;
  onStartTest: () => void;
  onBackToStudy: () => void;
  onKeepStudying: () => void;
  onSetSpotlight: (subregion: Subregion) => void;
};

export function SessionSummary(props: Props) {
  return props.practiceMode === "study" ? (
    <StudySummary {...props} />
  ) : (
    <TestSummary {...props} />
  );
}

// Summary for a "Test me on these" round (practiceMode "quiz" in code).
function TestSummary({
  score,
  total,
  missed,
  unlearnedCount,
  completedCount,
  totalInScope,
  dueCount,
  onReview,
  onPlayAgain,
  onBackToStudy,
}: Props) {
  const accuracy = total === 0 ? 0 : Math.round((score / total) * 100);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  const showReview = unlearnedCount > 0;
  const cleared = unlearnedCount === 0 && completedCount === totalInScope;
  const title = cleared ? "Complete!" : "Test over";

  useEffect(() => {
    (showReview ? reviewRef : playAgainRef).current?.focus();
  }, [showReview]);

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-summary-title"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <h2 id="session-summary-title" className="text-2xl font-bold text-ink-deep">
          {title}
        </h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Tile label="Done" value={`${completedCount}/${totalInScope}`} />
          <Tile label="Right" value={`${accuracy}%`} />
          <Tile label="Missed" value={String(missed.length)} />
        </div>
        {dueCount > 0 && (
          <p className="text-xs text-ink-mid text-center">
            {dueCount} to review when you go back to studying.
          </p>
        )}
        {missed.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-ink-deep mb-2">
              Missed ({missed.length}):
            </p>
            <ul className="max-h-[28dvh] overflow-y-auto text-sm text-ink-mid border border-ink-faded/40 rounded p-3 flex flex-wrap gap-x-4 gap-y-1">
              {missed.map((c) => (
                <li key={c.iso3}>{c.name}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-ink-mid">No misses — clean run!</p>
        )}
        <div className="flex flex-col gap-2">
          {showReview && (
            <button
              ref={reviewRef}
              type="button"
              onClick={onReview}
              className={primaryClass}
            >
              Review {unlearnedCount} missed
            </button>
          )}
          <button
            ref={playAgainRef}
            type="button"
            onClick={onPlayAgain}
            className={showReview ? secondaryClass : primaryClass}
          >
            Test again
          </button>
          <button
            type="button"
            onClick={onBackToStudy}
            className={secondaryClass}
          >
            Back to studying
          </button>
        </div>
      </div>
    </div>
  );
}

function StudySummary({
  dueCount,
  newAvailableCount,
  totalInScope,
  srsStore,
  scopeIso3s,
  countries,
  onStartTest,
  onKeepStudying,
  onSetSpotlight,
}: Props) {
  const learned = srsLearnedCount(srsStore, scopeIso3s);
  const seen = srsSeenCount(srsStore, scopeIso3s);
  const reviews = srsTotalReviews(srsStore);
  const accuracy = srsLifetimeAccuracy(srsStore);
  // Recommend the most-neglected subregion in scope, if any clears the gate.
  const spotlight = pickSpotlight(
    masteryBySubregion(srsStore, countries, scopeIso3s),
  );
  // Auto-focus the recommended action: the Focus CTA when a spotlight is
  // offered, otherwise Start quiz.
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKeepStudying();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKeepStudying]);

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium flex flex-col items-center justify-center leading-tight hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  const hint = spotlight
    ? `${spotlight.subregion} has ${spotlight.remaining} left to learn — focus there?`
    : dueCount > 0
    ? `${dueCount} to review — keep going, or test yourself on what you know.`
    : newAvailableCount > 0
    ? `${newAvailableCount} ${
        newAvailableCount === 1 ? "country" : "countries"
      } still to meet — keep going, or test yourself.`
    : "All caught up for now — test yourself, or come back tomorrow.";

  const scopeLabel = `${totalInScope} ${totalInScope === 1 ? "country" : "countries"}`;

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onKeepStudying();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-summary-title"
        aria-describedby="study-summary-hint"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <h2 id="study-summary-title" className="text-2xl font-bold text-ink-deep">
          Nice work
        </h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Tile label="Known" value={String(learned)} />
          <Tile label="Seen" value={String(seen)} />
          <Tile label="To review" value={String(dueCount)} />
          <Tile label="Not yet seen" value={String(newAvailableCount)} />
          <Tile label="Answers" value={String(reviews)} />
          <Tile
            label="Right"
            value={accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`}
          />
        </div>
        <p
          id="study-summary-hint"
          className="text-sm text-ink-mid text-center"
        >
          {hint}
        </p>
        <div className="flex flex-col gap-2">
          {spotlight && (
            <button
              ref={focusRef}
              type="button"
              onClick={() => onSetSpotlight(spotlight.subregion)}
              className={primaryClass}
            >
              <span>Focus on {spotlight.subregion}</span>
            </button>
          )}
          <button
            ref={spotlight ? undefined : focusRef}
            type="button"
            onClick={onStartTest}
            className={
              spotlight
                ? secondaryClass +
                  " flex flex-col items-center justify-center leading-tight"
                : primaryClass
            }
          >
            <span>Test me on these</span>
            <span
              className={
                spotlight
                  ? "text-xs font-normal text-ink-faded"
                  : "text-xs font-normal text-parchment-base/70"
              }
            >
              {scopeLabel}
            </span>
          </button>
          <button
            type="button"
            onClick={onKeepStudying}
            className={secondaryClass}
          >
            Keep studying
          </button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-xs uppercase tracking-wide text-ink-mid">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums text-ink-deep">
        {value}
      </span>
    </div>
  );
}
