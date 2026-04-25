type Props = {
  score: number;
  streak: number;
  bestStreak: number;
  total: number;
};

export function ScorePanel({ score, streak, bestStreak, total }: Props) {
  return (
    <div className="w-full max-w-5xl mx-auto flex items-center justify-between gap-4 text-sm sm:text-base">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
        Atlasaur
      </h1>
      <div className="flex gap-4 sm:gap-6 text-slate-700">
        <Stat label="Score" value={score} />
        <Stat label="Streak" value={streak} sub={`best ${bestStreak}`} />
        <Stat label="Round" value={total + 1} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}
