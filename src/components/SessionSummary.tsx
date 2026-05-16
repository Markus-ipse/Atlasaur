import { useEffect, useRef } from "react";
import type { Country, SessionType } from "../types";

type Props = {
  sessionType: SessionType;
  score: number;
  total: number;
  bestStreak: number;
  missed: Country[];
  unlearnedCount: number;
  completedCount: number;
  totalInScope: number;
  onReview: () => void;
  onPlayAgain: () => void;
};

export function SessionSummary({
  sessionType,
  score,
  total,
  bestStreak,
  missed,
  unlearnedCount,
  completedCount,
  totalInScope,
  onReview,
  onPlayAgain,
}: Props) {
  const accuracy = total === 0 ? 0 : Math.round((score / total) * 100);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  const showReview = unlearnedCount > 0;
  const isMarathon = sessionType === "marathon";
  const marathonCleared =
    isMarathon && unlearnedCount === 0 && completedCount === totalInScope;
  const title = isMarathon
    ? marathonCleared
      ? "Marathon complete"
      : "Marathon finished"
    : "Session complete";

  useEffect(() => {
    (showReview ? reviewRef : playAgainRef).current?.focus();
  }, [showReview]);

  const primaryClass = "min-h-11 px-5 rounded bg-slate-900 text-white font-medium";
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
          {isMarathon ? (
            <>
              <Summary label="Done" value={`${completedCount}/${totalInScope}`} />
              <Summary label="Accuracy" value={`${accuracy}%`} />
              <Summary label="Misses" value={String(missed.length)} />
            </>
          ) : (
            <>
              <Summary label="Score" value={`${score}/${total}`} />
              <Summary label="Accuracy" value={`${accuracy}%`} />
              <Summary label="Best streak" value={String(bestStreak)} />
            </>
          )}
        </div>
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}
