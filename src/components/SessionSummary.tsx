import type { Country } from "../types";

type Props = {
  score: number;
  total: number;
  bestStreak: number;
  missed: Country[];
  onPlayAgain: () => void;
};

export function SessionSummary({
  score,
  total,
  bestStreak,
  missed,
  onPlayAgain,
}: Props) {
  const accuracy = total === 0 ? 0 : Math.round((score / total) * 100);

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6 flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Session complete</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Summary label="Score" value={`${score}/${total}`} />
          <Summary label="Accuracy" value={`${accuracy}%`} />
          <Summary label="Best streak" value={String(bestStreak)} />
        </div>
        {missed.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              Missed ({missed.length}):
            </p>
            <ul className="max-h-48 overflow-y-auto text-sm text-slate-700 border border-slate-200 rounded p-3 flex flex-wrap gap-x-4 gap-y-1">
              {missed.map((c) => (
                <li key={c.iso3}>{c.name}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-600">No misses — clean run!</p>
        )}
        <button
          type="button"
          onClick={onPlayAgain}
          className="min-h-11 px-5 rounded bg-slate-900 text-white font-medium"
        >
          Play again
        </button>
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
