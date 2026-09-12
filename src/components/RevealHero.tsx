import { isClickMode } from "../game/questionModes";
import type { Country, Feedback, QuestionMode } from "../types";

// Narrow out the "correct" case — the hero never renders for correct
// answers (those auto-dismiss without a reveal). Caller is ControlZone,
// which already guards on `feedback.kind !== "correct"` before mounting.
type NonCorrectFeedback = Exclude<Feedback, { kind: "correct" }>;

type Props = {
  current: Country;
  feedback: NonCorrectFeedback;
  mode: QuestionMode;
  nameFromIso3: (iso3: string) => string;
};

// Every capital the country has, in the order the reveal names them. Empty
// only for the rows a capital mode can never draw.
function capitals(current: Country): string[] {
  if (current.capital === null) return [];
  return [current.capital, ...(current.capitalAlternates ?? [])];
}

export function RevealHero({ current, feedback, mode, nameFromIso3 }: Props) {
  const skipped = feedback.kind === "skipped";
  const wrong = feedback.kind === "wrong";
  // The reveal leads with the ANSWER, not the fact. Only country-to-capital
  // asks the learner to produce a capital; capital-to-click NAMES the capital
  // in the prompt and asks for the country, so leading with the capital there
  // would shout back the string they were just staring at and demote the
  // answer they actually failed to find.
  const askedForCapital = mode === "country-to-capital";
  const names = capitals(current);
  return (
    <div role="status" className="flex flex-col gap-2">
      <p className="leading-tight">
        <span className="block text-xs">
          <span
            className={
              "font-display uppercase tracking-wide " +
              (skipped ? "text-ochre" : "text-vermillion")
            }
          >
            {skipped ? "Skipped" : "You missed"}
          </span>
          {isClickMode(mode) && wrong && (
            <>
              <span className="text-ink-faded"> · </span>
              <span className="text-ink-mid">
                You picked: {nameFromIso3(feedback.answerIso3)}
              </span>
            </>
          )}
          {/* A typed capital that belongs to another country resolves to it,
              so the miss can say where the answer would have been right. */}
          {mode === "country-to-capital" && wrong && feedback.answerIso3 !== "" && (
            <>
              <span className="text-ink-faded"> · </span>
              <span className="text-ink-mid">
                That's the capital of {nameFromIso3(feedback.answerIso3)}
              </span>
            </>
          )}
        </span>
        <span className="block text-2xl sm:text-3xl landscape:text-4xl font-semibold text-ink-deep break-words">
          {askedForCapital ? names.join(", ") : current.name}
        </span>
      </p>
      {askedForCapital ? (
        <p className="text-sm text-ink-mid">
          {names.length > 1 ? "Capitals of " : "Capital of "}
          {current.name}
        </p>
      ) : (
        names.length > 0 && (
          <p className="text-sm text-ink-mid">
            {names.length > 1
              ? `Capitals: ${names.join(", ")}`
              : `Capital: ${names[0]}`}
          </p>
        )
      )}
      {current.neighbors.length > 0 && (
        <p className="text-sm text-ink-mid">
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
