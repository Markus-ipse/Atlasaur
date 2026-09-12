import type { Country, QuestionMode, Phase } from "../types";

type Props = {
  mode: QuestionMode;
  current: Country;
  phase: Phase;
};

// Three of the four prompts are an eyebrow over the thing being asked about;
// shape-to-name is the one with nothing to name, since the map is the prompt.
// `capital` is non-null for every card a capital mode can draw — filterPool
// drops the handful of rows without one.
function promptOf(
  mode: QuestionMode,
  current: Country,
): { eyebrow: string; subject: string } | null {
  switch (mode) {
    case "name-to-click":
      return { eyebrow: "Find", subject: current.name };
    case "capital-to-click":
      return {
        eyebrow: "Find the country whose capital is",
        subject: current.capital ?? "",
      };
    case "country-to-capital":
      return { eyebrow: "Capital of", subject: current.name };
    case "shape-to-name":
      return null;
  }
}

export function Prompt({ mode, current, phase }: Props) {
  const prompt = promptOf(mode, current);
  return (
    <div className="flex flex-col gap-2">
      {phase === "review" && (
        <span className="self-start px-2 py-0.5 font-display text-xs font-medium uppercase tracking-wide rounded-full bg-ochre/20 text-ochre">
          Review
        </span>
      )}
      {prompt ? (
        <p className="leading-tight">
          <span className="block font-display text-xs uppercase tracking-wide text-ink-mid">
            {prompt.eyebrow}
          </span>
          <span className="block text-2xl sm:text-3xl landscape:text-4xl font-semibold text-ink-deep break-words">
            {prompt.subject}
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
