import type { Country, QuestionMode, Phase } from "../types";

type Props = {
  mode: QuestionMode;
  current: Country;
  phase: Phase;
};

export function Prompt({ mode, current, phase }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {phase === "review" && (
        <span className="self-start px-2 py-0.5 text-xs font-medium uppercase tracking-wide rounded-full bg-ochre/20 text-ochre">
          Review
        </span>
      )}
      {mode === "name-to-click" ? (
        <p className="leading-tight">
          <span className="block text-xs uppercase tracking-wide text-ink-mid">
            Find
          </span>
          <span className="block text-2xl sm:text-3xl landscape:text-4xl font-semibold text-ink-deep break-words">
            {current.name}
          </span>
        </p>
      ) : (
        <p className="text-base text-ink-mid">
          What country is highlighted?
        </p>
      )}
    </div>
  );
}
