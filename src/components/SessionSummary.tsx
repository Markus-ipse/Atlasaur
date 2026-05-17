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
  canKeepTraining: boolean;
  onReview: () => void;
  onPlayAgain: () => void;
  onKeepTraining: () => void;
  onBackToMap: () => void;
};

export function SessionSummary(props: Props) {
  return props.practiceMode === "training" ? (
    <TrainingSummary {...props} />
  ) : (
    <ExamSummary {...props} />
  );
}

function ExamSummary({
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
    "min-h-11 px-5 rounded bg-slate-900 text-white font-medium";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-slate-300 text-slate-700 font-medium hover:bg-slate-100";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-summary-title"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-white rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <h2 id="session-summary-title" className="text-2xl font-bold">
          {title}
        </h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Tile label="Done" value={`${completedCount}/${totalInScope}`} />
          <Tile label="Accuracy" value={`${accuracy}%`} />
          <Tile label="Misses" value={String(missed.length)} />
        </div>
        {dueCount > 0 && (
          <p className="text-xs text-slate-500 text-center">
            {dueCount} due in your SRS — switch to Training to review.
          </p>
        )}
        {missed.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              Missed ({missed.length}):
            </p>
            <ul className="max-h-[28dvh] overflow-y-auto text-sm text-slate-700 border border-slate-200 rounded p-3 flex flex-wrap gap-x-4 gap-y-1">
              {missed.map((c) => (
                <li key={c.iso3}>{c.name}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-600">No misses — clean run!</p>
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

function TrainingSummary({
  dueCount,
  newAvailableCount,
  srsStore,
  scopeIso3s,
  canKeepTraining,
  onKeepTraining,
  onBackToMap,
}: Props) {
  const learned = srsLearnedCount(srsStore, scopeIso3s);
  const reviews = srsTotalReviews(srsStore);
  const accuracy = srsLifetimeAccuracy(srsStore);
  const keepRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (canKeepTraining ? keepRef : backRef).current?.focus();
  }, [canKeepTraining]);

  const primaryClass =
    "min-h-11 px-5 rounded bg-slate-900 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-slate-300 text-slate-700 font-medium hover:bg-slate-100";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-summary-title"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-white rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <h2 id="training-summary-title" className="text-2xl font-bold">
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
        <p className="text-xs text-slate-500 text-center">
          Atlasaur scheduled each country to come back when it'll do you
          the most good.
        </p>
        <div className="flex flex-col gap-2">
          <button
            ref={keepRef}
            type="button"
            disabled={!canKeepTraining}
            onClick={onKeepTraining}
            className={primaryClass}
          >
            Keep training
          </button>
          <button
            ref={backRef}
            type="button"
            onClick={onBackToMap}
            className={secondaryClass}
          >
            Back to map
          </button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}
