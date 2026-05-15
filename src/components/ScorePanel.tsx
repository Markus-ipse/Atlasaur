type Props = {
  score: number;
  streak: number;
  total: number;
};

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
