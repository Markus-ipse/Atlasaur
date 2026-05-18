import { useEffect, useRef } from "react";
import type { Country, PracticeMode, SrsStore } from "../types";
import {
  lifetimeAccuracy as srsLifetimeAccuracy,
  learnedCount as srsLearnedCount,
  totalReviews as srsTotalReviews,
} from "../game/srs";

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
  onReview: () => void;
  onPlayAgain: () => void;
  onStartQuiz: () => void;
  onKeepStudying: () => void;
};

export function SessionSummary(props: Props) {
  return props.practiceMode === "study" ? (
    <StudySummary {...props} />
  ) : (
    <QuizSummary {...props} />
  );
}

function QuizSummary({
  score,
  total,
  missed,
  unlearnedCount,
  completedCount,
  totalInScope,
  dueCount,
  onReview,
  onPlayAgain,
}: Props) {
  const accuracy = total === 0 ? 0 : Math.round((score / total) * 100);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  const showReview = unlearnedCount > 0;
  const cleared = unlearnedCount === 0 && completedCount === totalInScope;
  const title = cleared ? "Complete!" : "Session ended";

  useEffect(() => {
    (showReview ? reviewRef : playAgainRef).current?.focus();
  }, [showReview]);

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink-deep/55 p-4">
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
          <Tile label="Accuracy" value={`${accuracy}%`} />
          <Tile label="Misses" value={String(missed.length)} />
        </div>
        {dueCount > 0 && (
          <p className="text-xs text-ink-mid text-center">
            {dueCount} due in your SRS — switch to Study to review.
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
            Play again
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
  onStartQuiz,
  onKeepStudying,
}: Props) {
  const learned = srsLearnedCount(srsStore, scopeIso3s);
  const reviews = srsTotalReviews(srsStore);
  const accuracy = srsLifetimeAccuracy(srsStore);
  const quizRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    quizRef.current?.focus();
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

  const hint =
    dueCount > 0
      ? `You have ${dueCount} due — keep going, or test yourself.`
      : newAvailableCount > 0
      ? `You can introduce ${newAvailableCount} more ${
          newAvailableCount === 1 ? "country" : "countries"
        }, or switch to quiz.`
      : "All caught up for now — try a quiz, or take a break and come back later.";

  const scopeLabel = `${totalInScope} ${totalInScope === 1 ? "country" : "countries"}`;

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-ink-deep/55 p-4"
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <Tile label="Learned" value={String(learned)} />
          <Tile label="Due today" value={String(dueCount)} />
          <Tile label="New" value={String(newAvailableCount)} />
          <Tile label="Reviews" value={String(reviews)} />
          <Tile
            label="Accuracy"
            value={reviews === 0 ? "—" : `${Math.round(accuracy * 100)}%`}
          />
        </div>
        <p
          id="study-summary-hint"
          className="text-sm text-ink-mid text-center"
        >
          {hint}
        </p>
        <div className="flex flex-col gap-2">
          <button
            ref={quizRef}
            type="button"
            onClick={onStartQuiz}
            className={primaryClass}
          >
            <span>Start quiz</span>
            <span className="text-xs font-normal text-parchment-base/70">
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
      <span className="text-xs uppercase tracking-wide text-ink-mid">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums text-ink-deep">
        {value}
      </span>
    </div>
  );
}
