import type { Country, QuestionMode } from "../types";

type Props = {
  mode: QuestionMode;
  current: Country;
  // The card has come back: a Study card with a record for its fact, or any
  // card of a test's retry pass.
  returning: boolean;
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

// The pill on a card that has come back. Shared with the answer panels, which
// carry it instead of the prompt in Name → Click (see ControlZone).
export function BackAgain() {
  return (
    <span className="self-start px-2 py-0.5 font-display text-xs font-medium uppercase tracking-wide rounded-full bg-ochre/20 text-ochre">
      Back again
    </span>
  );
}

export function Prompt({ mode, current, returning }: Props) {
  const prompt = promptOf(mode, current);
  return (
    <div className="flex flex-col gap-2">
      {returning && <BackAgain />}
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
