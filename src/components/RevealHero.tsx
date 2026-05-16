import type { Country, Feedback, Mode } from "../types";

// Narrow out the "correct" case — the hero never renders for correct
// answers (those auto-dismiss without a reveal). Caller is ControlZone,
// which already guards on `feedback.kind !== "correct"` before mounting.
type NonCorrectFeedback = Exclude<Feedback, { kind: "correct" }>;

type Props = {
  current: Country;
  feedback: NonCorrectFeedback;
  mode: Mode;
  nameFromIso3: (iso3: string) => string;
};

export function RevealHero({ current, feedback, mode, nameFromIso3 }: Props) {
  const skipped = feedback.kind === "skipped";
  return (
    <div role="status" className="flex flex-col gap-2">
      <p className="leading-tight">
        <span className="block text-xs">
          <span
            className={
              "uppercase tracking-wide " +
              (skipped ? "text-amber-800" : "text-red-600")
            }
          >
            {skipped ? "Skipped" : "You missed"}
          </span>
          {mode === "name-to-click" && feedback.kind === "wrong" && (
            <>
              <span className="text-slate-400"> · </span>
              <span className="text-slate-600">
                You picked: {nameFromIso3(feedback.answerIso3)}
              </span>
            </>
          )}
        </span>
        <span className="block text-2xl sm:text-3xl landscape:text-4xl font-semibold text-slate-900 break-words">
          {current.name}
        </span>
      </p>
      {current.capital !== null && (
        <p className="text-sm text-slate-600">
          {current.capitalAlternates && current.capitalAlternates.length > 0
            ? `Capitals: ${[current.capital, ...current.capitalAlternates].join(", ")}`
            : `Capital: ${current.capital}`}
        </p>
      )}
      {current.neighbors.length > 0 && (
        <p className="text-sm text-slate-600">
          Bordered by:{" "}
          {current.neighbors
            .map(nameFromIso3)
            .sort((a, b) => a.localeCompare(b))
            .join(", ")}
        </p>
      )}
    </div>
  );
}
