import { useEffect, useRef, useState } from "react";
import {
  EXPEDITION_SIZE,
  formatDay,
  foundCount,
  GLYPH_FOUND,
  GLYPH_MISSED,
  shareText,
  type ExpeditionStore,
} from "../game/expedition";

type Props = {
  store: ExpeditionStore;
  // Cross-day streak day, for the eyebrow — a finished expedition is a
  // finished round, and counts as one.
  streakDay: number;
  nameFromIso3: (iso3: string) => string;
  // Leaves for studying. The card has no "try again": the second go is
  // tomorrow.
  onClose: () => void;
};

type ShareState = "idle" | "copied" | "failed";
const COPIED_MS = 2000;

// The expedition's result card, which is also its summary and its round
// break. Shows the row and the caption exactly as they leave the app, the
// ten by name so the learner knows which glyph was which, and one Share
// button. The text is visible and selectable so it can be copied by hand
// when both the share sheet and the clipboard are unavailable.
export function ExpeditionResult({ store, streakDay, nameFromIso3, onClose }: Props) {
  const shareRef = useRef<HTMLButtonElement>(null);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const found = foundCount(store);
  const text = shareText(store);

  useEffect(() => {
    shareRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (shareState !== "copied") return;
    const id = window.setTimeout(() => setShareState("idle"), COPIED_MS);
    return () => window.clearTimeout(id);
  }, [shareState]);

  const share = async () => {
    // The share sheet where there is one (a phone), the clipboard otherwise.
    // A dismissed sheet is not a failure and gets no fallback: the learner
    // changed their mind.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareState("copied");
    } catch {
      setShareState("failed");
    }
  };

  const title =
    found === EXPEDITION_SIZE
      ? "All ten."
      : found >= 7
        ? "A good day out."
        : "Expedition done.";

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expedition-result-title"
        aria-describedby="expedition-result-line expedition-result-outcomes"
        className="w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <p className="font-display text-xs uppercase tracking-wide text-ink-mid">
          Expedition · Day {streakDay}
        </p>
        <h2
          id="expedition-result-title"
          className="text-2xl font-bold text-ink-deep"
        >
          {title}
        </h2>
        {/* The row and the caption, exactly as they leave the app. Selectable
            so a learner can copy them by hand if Share can do nothing —
            which is why the spoken version of the row lives outside it. */}
        <p
          id="expedition-result-line"
          className="select-all whitespace-pre-line rounded border border-ink-faded/40 px-3 py-2 text-sm text-ink-mid tabular-nums leading-relaxed"
        >
          Atlasaur · {formatDay(store.day)}
          {"\n"}
          <span className="text-xl tracking-[0.15em] text-ink-deep" aria-hidden>
            {store.outcomes
              .map((o) => (o === "found" ? GLYPH_FOUND : GLYPH_MISSED))
              .join("")}
          </span>{" "}
          {found}/{EXPEDITION_SIZE}
        </p>
        <p id="expedition-result-outcomes" className="sr-only">
          {store.outcomes
            .map(
              (o, i) =>
                `${nameFromIso3(store.iso3s[i])} ${o === "found" ? "found" : "missed"}`,
            )
            .join(", ")}
          .
        </p>
        <ol
          className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-ink-mid"
          aria-hidden
        >
          {store.iso3s.map((iso3, i) => {
            const outcome = store.outcomes[i];
            return (
              <li key={iso3} className="flex gap-1.5 min-w-0">
                <span className="shrink-0 text-ink-deep">
                  {outcome === "found" ? GLYPH_FOUND : GLYPH_MISSED}
                </span>
                <span className="truncate">{nameFromIso3(iso3)}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-2">
          <button
            ref={shareRef}
            type="button"
            onClick={share}
            className={primaryClass}
          >
            {shareState === "copied" ? "Copied" : "Share"}
          </button>
          {shareState === "failed" && (
            <p className="text-xs text-ink-mid text-center" role="status">
              Couldn't copy — select the text above to copy it by hand.
            </p>
          )}
          <button type="button" onClick={onClose} className={secondaryClass}>
            Back to studying
          </button>
        </div>
      </div>
    </div>
  );
}
