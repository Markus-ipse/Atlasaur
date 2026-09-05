import { useEffect, useRef } from "react";

type Props = {
  dueCount: number;
  // New cards available to introduce today (already capped).
  newToday: number;
  day: number;
  onBegin: () => void;
};

// What a returning learner sees before the first prompt: one line they can
// act on and one button. Never scolds — a gap is a gap, and the greeting is
// the same on day 40 as on day 1.
export function TodayCard({ dueCount, newToday, day, onBegin }: Props) {
  const beginRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    beginRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBegin();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onBegin]);

  const nothingWaiting = dueCount === 0 && newToday === 0;
  const parts: string[] = [];
  if (dueCount > 0) parts.push(`${dueCount} to review`);
  if (newToday > 0) parts.push(`${newToday} new`);
  parts.push(`Day ${day}`);

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onBegin();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="today-card-title"
        aria-describedby="today-card-line"
        className="w-full max-w-sm bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <p className="font-display text-xs uppercase tracking-wide text-ink-mid">
          Today
        </p>
        <h2 id="today-card-title" className="text-2xl font-bold text-ink-deep">
          Welcome back.
        </h2>
        <p id="today-card-line" className="text-sm text-ink-mid tabular-nums">
          {parts.join(" · ")}
          {nothingWaiting && (
            <span className="block mt-1">
              Nothing is due. A round anyway keeps the hand in.
            </span>
          )}
        </p>
        <button
          ref={beginRef}
          type="button"
          onClick={onBegin}
          className="min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
        >
          Begin
        </button>
      </div>
    </div>
  );
}
