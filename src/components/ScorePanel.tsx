type Props = {
  score: number;
  streak: number;
  bestStreak: number;
  total: number;
};

// Compact inline status line. `bestStreak` is still accepted (callers pass
// it through from game state) but isn't rendered here — it shows up in
// SessionSummary instead. Keeping it on the prop type avoids ripple
// changes elsewhere; if it stays unused for another change cycle it can
// be removed.
export function ScorePanel({ score, streak, total }: Props) {
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
