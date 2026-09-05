import { useEffect, useRef, useState } from "react";
import { ALL_CONTINENTS, type Continent } from "../types";
import { ContinentChip } from "./ContinentChip";

type Props = {
  // Study, every continent; the introduction order does the rest.
  onStartBig: () => void;
  // Study, narrowed to the chosen continents.
  onStartRegion: (continents: readonly Continent[]) => void;
  // A "Test me on these" round over everything.
  onStartTest: () => void;
};

// The first screen a stranger sees, once. One sentence on what this is,
// then three doors. No tour, no account, no settings — the app explains
// itself by being played.
export function Welcome({ onStartBig, onStartRegion, onStartTest }: Props) {
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<Continent>>(new Set());
  const primaryRef = useRef<HTMLButtonElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  // Focus follows the step: the first door, or the first continent chip
  // once the picker opens (Begin is disabled until something is picked, and
  // a disabled button cannot take focus).
  useEffect(() => {
    if (picking) {
      chipsRef.current?.querySelector("button")?.focus();
    } else {
      primaryRef.current?.focus();
    }
  }, [picking]);

  const toggle = (c: Continent) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-line"
        className="w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <div className="self-start relative px-3 py-1 border border-ink-deep font-display">
          <div
            aria-hidden
            className="absolute inset-[3px] border border-ink-deep/70 pointer-events-none"
          />
          <h2
            id="welcome-title"
            className="relative text-lg tracking-[0.08em] text-ink-deep leading-tight"
          >
            Atlasaur
          </h2>
        </div>
        <p id="welcome-line" className="text-base text-ink-deep leading-snug">
          A world map you learn by heart. Find each country when asked; what
          you miss comes back until it sticks.
        </p>
        {picking ? (
          <>
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-ink-mid mb-2">
                Where shall we start?
              </p>
              <div
                ref={chipsRef}
                role="group"
                aria-label="Continents"
                className="flex flex-wrap gap-1"
              >
                {ALL_CONTINENTS.map((c) => (
                  <ContinentChip
                    key={c}
                    active={picked.has(c)}
                    disabled={false}
                    onClick={() => toggle(c)}
                  >
                    {c}
                  </ContinentChip>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                ref={primaryRef}
                type="button"
                disabled={picked.size === 0}
                onClick={() =>
                  onStartRegion(ALL_CONTINENTS.filter((c) => picked.has(c)))
                }
                className={primaryClass}
              >
                Begin
              </button>
              <button
                type="button"
                onClick={() => setPicking(false)}
                className={secondaryClass}
              >
                Back
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              ref={primaryRef}
              type="button"
              onClick={onStartBig}
              className={primaryClass + " flex flex-col items-center leading-tight"}
            >
              <span>Start with the big ones</span>
              <span className="text-xs font-normal text-parchment-base/70">
                The whole world, largest countries first
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className={secondaryClass}
            >
              Pick a region
            </button>
            <button
              type="button"
              onClick={onStartTest}
              className={secondaryClass + " flex flex-col items-center leading-tight"}
            >
              <span>Test me</span>
              <span className="text-xs font-normal text-ink-faded">
                I know my way around already
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
