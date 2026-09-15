import type { Country, QuestionMode } from "../types";
import type { Milestone } from "../game/milestones";
import { streakNote } from "../game/milestones";
import { BackAgain } from "./Prompt";

// Shown for a correct answer, in the same hero slot RevealHero uses for
// misses. RevealHero excludes `kind: "correct"` by type, so the correct
// case gets its own small component rather than being shoehorned in.
// Mirrors RevealHero's structure/classes so the panel reads consistently.
// Pops in on mount via `correct-pop` (reduced-motion gated in index.css).
//
// Ceremony (R2.2) rides in the same slot rather than interrupting: at most
// one extra line under the country name, and a wax seal when a continent is
// finished. Ink and wax only — a milestone is marked once and never
// mentioned again.
type Props = {
  current: Country;
  mode: QuestionMode;
  // Consecutive correct answers including this one. Only exact thresholds
  // say anything; the number itself is never shown.
  streak: number;
  // Set when this answer carried the country into "known". Null otherwise,
  // which is almost always.
  milestone: Milestone | null;
  // The card had come back, marked here rather than on the prompt in
  // Name → Click (see ControlZone).
  returning?: boolean;
};

export function CorrectHero({
  current,
  mode,
  streak,
  milestone,
  returning = false,
}: Props) {
  const note = streakNote(streak);
  const sealed = milestone?.continentComplete ?? null;
  // Lead with the ANSWER, as the miss reveal does. Only country-to-capital
  // asks for a capital; capital-to-click names one in the prompt and asks for
  // the country, so echoing it here would leave the panel saying nothing the
  // learner did not already have. Every capital is named, not just the
  // primary — typing "Cape Town" and being congratulated with "Pretoria"
  // reads as a correction rather than a tick.
  const askedForCapital = mode === "country-to-capital";
  const capitals =
    current.capital === null
      ? []
      : [current.capital, ...(current.capitalAlternates ?? [])];
  return (
    <div role="status" className="correct-pop flex flex-col gap-2">
      {returning && <BackAgain />}
      <p className="leading-tight">
        <span className="block text-xs">
          <span className="font-display uppercase tracking-wide text-sap-green">
            Correct
          </span>{" "}
          <span aria-hidden="true" className="text-sap-green">
            ✓
          </span>
        </span>
        <span className="block text-2xl sm:text-3xl landscape:text-4xl font-semibold text-ink-deep break-words">
          {askedForCapital ? capitals.join(", ") : current.name}
        </span>
      </p>
      {askedForCapital && (
        <p className="text-sm text-ink-mid">
          {capitals.length > 1 ? "Capitals of " : "Capital of "}
          {current.name}
        </p>
      )}
      {milestone && !sealed && (
        <p className="milestone-in text-sm italic text-ochre">
          {milestone.name}, now on your map.
        </p>
      )}
      {sealed && <WaxSeal continent={sealed} />}
      {note && !milestone && (
        <p className="milestone-in text-sm italic text-ink-mid">{note}</p>
      )}
    </div>
  );
}

// A continent finished. Pressed once, in wax, at the size of a real seal on
// a chart — not a badge that goes on to live in a trophy case somewhere. The
// impression is the continent's initial, the way a seal carries a monogram
// rather than a word; the sentence beside it says which continent in full.
function WaxSeal({ continent }: { continent: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="wax-seal shrink-0 grid place-items-center size-12 rounded-full bg-wax-red text-seal-ink"
      >
        <span className="font-display text-xl leading-none">
          {continent.charAt(0)}
        </span>
      </span>
      <p className="milestone-in text-sm italic text-wax-red">
        {continent} complete.
      </p>
    </div>
  );
}
