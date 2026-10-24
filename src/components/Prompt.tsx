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
    // The click modes say where the answer goes (#61): "Find Peru" alone
    // leaves a first-time learner looking for somewhere to type.
    case "name-to-click":
      return { eyebrow: "Find on the map", subject: current.name };
    case "capital-to-click":
      return {
        eyebrow: "On the map, find the country whose capital is",
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

// The prompt as one line, for the strip above a phone's map in a typed mode
// (#61), where the panel's eyebrow-over-subject would cost the map two lines.
export function PromptLine({
  mode,
  current,
}: {
  mode: QuestionMode;
  current: Country;
}) {
  const prompt = promptOf(mode, current);
  return (
    <p className="text-lg leading-tight text-ink-deep break-words">
      {prompt ? (
        <>
          <span className="text-ink-mid">{prompt.eyebrow}</span>{" "}
          <span className="text-xl">{prompt.subject}</span>
        </>
      ) : (
        "What country is highlighted?"
      )}
    </p>
  );
}

export function Prompt({ mode, current, returning }: Props) {
  const prompt = promptOf(mode, current);
  return (
    <div className="flex flex-col gap-2">
      {returning && <BackAgain />}
      {prompt ? (
        <p className="leading-tight">
          {/* The eyebrow is the question in three modes, so it is read at 14 px
              (#61); the other eyebrows stay at 12. */}
          <span className="block font-display text-sm uppercase tracking-wide text-ink-mid">
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
