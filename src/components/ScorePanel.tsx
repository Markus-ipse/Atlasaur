import type { SessionType } from "../types";

type Props = {
  sessionType: SessionType;
  score: number;
  streak: number;
  total: number;
  completedCount: number;
  totalInScope: number;
  missedCount: number;
};

export function ScorePanel({
  sessionType,
  score,
  streak,
  total,
  completedCount,
  totalInScope,
  missedCount,
}: Props) {
  if (sessionType === "marathon") {
    return (
      <div className="flex items-baseline gap-2 text-xs text-slate-500 tabular-nums">
        <span>
          Done{" "}
          <span className="font-semibold text-slate-900">
            {completedCount}/{totalInScope}
          </span>
        </span>
        <span aria-hidden>·</span>
        <span>
          Misses{" "}
          <span className="font-semibold text-slate-900">{missedCount}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          Streak <span className="font-semibold text-slate-900">{streak}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-2 text-xs text-slate-500 tabular-nums">
      <span>
        Score <span className="font-semibold text-slate-900">{score}</span>
      </span>
      <span aria-hidden>·</span>
      <span>
        Streak <span className="font-semibold text-slate-900">{streak}</span>
      </span>
      <span aria-hidden>·</span>
      <span>
        Round <span className="font-semibold text-slate-900">{total + 1}</span>
      </span>
    </div>
  );
}
