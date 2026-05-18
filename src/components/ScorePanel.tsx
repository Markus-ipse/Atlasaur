const SHELL =
  "flex items-baseline gap-2 text-xs text-ink-mid tabular-nums";
const VALUE = "font-semibold text-ink-deep";

export function ScorePanel({
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
