import { useEffect, useRef, useState } from "react";
import { ALL_CONTINENTS, type Continent } from "../types";
import { continentAskable } from "../game/useGame";
import { ContinentChip } from "./ContinentChip";

type Props = {
  // The territories setting, so the chips here match the settings menu's.
  // A first-run learner has it off, which hides Antarctica — it holds only
  // territories, and a chip with nothing behind it is a dead end.
  includeTerritories: boolean;
  // Study, every continent; the introduction order does the rest.
  onStartBig: () => void;
  // Study, narrowed to the chosen continents.
  onStartRegion: (continents: readonly Continent[]) => void;
  // A "Test me on these" round over everything.
  onStartTest: () => void;
};

// The first screen a stranger sees, once. What this is and what to do, then
// one obvious way in, with a region and a test as quieter alternatives. No
// tour, no account, no settings, and nothing about how the scheduler works —
// StudyIntro says that on the first miss, when there is a reason to care.
export function Welcome({
  includeTerritories,
  onStartBig,
  onStartRegion,
  onStartTest,
}: Props) {
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
  // The alternatives to the one route: still a full tap target, but read as
  // links rather than as competing buttons.
  const quietClass =
    "min-h-11 px-3 rounded text-sm text-ink-mid underline underline-offset-4 decoration-ink-faded hover:text-ink-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

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
          {/* "Places" and "find a country" are safe here: every door out of
              the welcome starts on Name → Click. */}
          Learn the world map, a few places at a time.
          <span className="block mt-1 text-sm text-ink-mid">
            Find a country. If you don't know it, we'll show you and bring it
            back.
          </span>
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
                {ALL_CONTINENTS.filter((c) =>
                  // The welcome always starts a Study stretch on locations.
                  continentAskable(c, includeTerritories, "location"),
                ).map((c) => (
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
              <span>Start a short round</span>
              <span className="text-xs font-normal text-parchment-base/70">
                Big, familiar countries first
              </span>
            </button>
            <div className="flex flex-wrap justify-center gap-x-2">
              <button
                type="button"
                onClick={() => setPicking(true)}
                className={quietClass}
              >
                Pick a region
              </button>
              <button type="button" onClick={onStartTest} className={quietClass}>
                I know my way around — test me
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
