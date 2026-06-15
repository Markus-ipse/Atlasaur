import type { Country } from "../types";

// Shown for a correct answer, in the same hero slot RevealHero uses for
// misses. RevealHero excludes `kind: "correct"` by type, so the correct
// case gets its own small component rather than being shoehorned in.
// Mirrors RevealHero's structure/classes so the panel reads consistently.
// Pops in on mount via `correct-pop` (reduced-motion gated in index.css).
type Props = {
  current: Country;
};

export function CorrectHero({ current }: Props) {
  return (
    <div role="status" className="correct-pop flex flex-col gap-2">
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
          {current.name}
        </span>
      </p>
    </div>
  );
}
