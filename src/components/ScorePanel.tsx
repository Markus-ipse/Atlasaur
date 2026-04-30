type Props = {
  score: number;
  streak: number;
  bestStreak: number;
  total: number;
};

export function ScorePanel({ score, streak, bestStreak, total }: Props) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
      <Stat label="Score" value={score} />
      <Stat label="Streak" value={streak} sub={`/${bestStreak}`} />
      <Stat label="Round" value={total + 1} muted />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: number;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      <span className={(muted ? "text-slate-600 dark:text-slate-400" : "text-slate-900 dark:text-slate-100") + " font-semibold"}>
        {value}
      </span>
      {sub && <span className="text-slate-500 dark:text-slate-400">{sub}</span>}
    </div>
  );
}
