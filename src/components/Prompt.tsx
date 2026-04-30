import type { Country, Mode, Phase } from "../types";

type Props = {
  mode: Mode;
  current: Country;
  phase: Phase;
};

export function Prompt({ mode, current, phase }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {phase === "review" && (
        <span className="self-start px-2 py-0.5 text-xs font-medium uppercase tracking-wide rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          Review
        </span>
      )}
      {mode === "name-to-click" ? (
        <p className="leading-tight">
          <span className="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Find
          </span>
          <span className="block text-2xl sm:text-3xl landscape:text-4xl font-semibold text-slate-900 dark:text-slate-100 break-words">
            {current.name}
          </span>
        </p>
      ) : (
        <p className="text-base text-slate-700 dark:text-slate-200">
          What country is highlighted?
        </p>
      )}
    </div>
  );
}
