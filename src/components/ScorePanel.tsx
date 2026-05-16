const SHELL =
  "flex items-baseline gap-2 text-xs text-slate-500 tabular-nums";
const VALUE = "font-semibold text-slate-900";

export function FreeplayScorePanel({
  score,
  streak,
  total,
}: {
  score: number;
  streak: number;
  total: number;
}) {
  return (
    <div className={SHELL}>
      <span>
        Score <span className={VALUE}>{score}</span>
      </span>
      <span aria-hidden>·</span>
      <span>
        Streak <span className={VALUE}>{streak}</span>
      </span>
      <span aria-hidden>·</span>
      <span>
        Round <span className={VALUE}>{total + 1}</span>
      </span>
    </div>
  );
}

export function MarathonScorePanel({
  completedCount,
  totalInScope,
  missedCount,
  streak,
}: {
  completedCount: number;
  totalInScope: number;
  missedCount: number;
  streak: number;
}) {
  return (
    <div className={SHELL}>
      <span>
        Done{" "}
        <span className={VALUE}>
          {completedCount}/{totalInScope}
        </span>
      </span>
      <span aria-hidden>·</span>
      <span>
        Misses <span className={VALUE}>{missedCount}</span>
      </span>
      <span aria-hidden>·</span>
      <span>
        Streak <span className={VALUE}>{streak}</span>
      </span>
    </div>
  );
}
