const SHELL =
  "flex items-baseline gap-2 text-xs text-ink-mid tabular-nums";
const VALUE = "font-semibold text-ink-deep";

// Test-round chips. The per-session streak used to live here; it left when
// the cross-day streak arrived so there is only one thing called a streak.
export function ScorePanel({
  completedCount,
  totalInScope,
  missedCount,
}: {
  completedCount: number;
  totalInScope: number;
  missedCount: number;
}) {
  return (
    <div className={SHELL}>
      <span>
        <span className={VALUE}>
          {completedCount}/{totalInScope}
        </span>{" "}
        done
      </span>
      <span aria-hidden>·</span>
      <span>
        <span className={VALUE}>{missedCount}</span> missed
      </span>
    </div>
  );
}
