import { useEffect, useRef, useState } from "react";
import {
  EXPEDITION_SIZE,
  GLYPH_FOUND,
  GLYPH_MISSED,
  formatDay,
  foundCount,
  glyphFor,
  glyphRow,
  shareText,
  type ExpeditionStore,
} from "../game/expedition";

type Props = {
  store: ExpeditionStore;
  // Cross-day streak day, for the eyebrow — a finished expedition is a
  // finished round, and counts as one.
  streakDay: number;
  nameFromIso3: (iso3: string) => string;
  // A second look at the countries missed, on the map (#64). It never
  // changes the result: the day's one attempt is the row above.
  onReview: () => void;
  // The look ran to its end this visit: say so, and make leaving the default.
  lookDone: boolean;
  // Leaves for studying. The card has no "try again": the second go is
  // tomorrow.
  onClose: () => void;
};

type ShareState = "idle" | "shared" | "copied" | "failed";
const DONE_MS = 2000;

// The expedition's result card, which is also its summary and its round
// break. Leads with how many of the ten were found, then the row and the
// caption exactly as they leave the app with what the glyphs mean, and the
// ten by name so the learner knows which glyph was which. The next step is
// the misses (#64): with any, "Review N missed" is the default until the
// learner has looked at them, and Share is secondary, since at 1/10 sharing
// is not what the learner came for. The text is visible and selectable so it
// can be copied by hand when both the share sheet and the clipboard are
// unavailable.
export function ExpeditionResult({
  store,
  streakDay,
  nameFromIso3,
  onReview,
  lookDone,
  onClose,
}: Props) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const found = foundCount(store);
  const missedCount = EXPEDITION_SIZE - found;
  // The misses are the default next step until they have been looked at.
  const reviewFirst = missedCount > 0 && !lookDone;
  const text = shareText(store);

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  useEffect(() => {
    if (shareState !== "shared" && shareState !== "copied") return;
    const id = window.setTimeout(() => setShareState("idle"), DONE_MS);
    return () => window.clearTimeout(id);
  }, [shareState]);

  const share = async () => {
    // The share sheet where there is one (a phone), the clipboard otherwise.
    // A dismissed sheet is not a failure and gets no fallback: the learner
    // changed their mind.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        // Acknowledged like a copy: a sheet that closed on its own after a
        // share left the button looking as if nothing had happened.
        setShareState("shared");
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
      ? `All ${EXPEDITION_SIZE} found.`
      : `${found} of ${EXPEDITION_SIZE} found.`;
  const acknowledgement =
    found === EXPEDITION_SIZE
      ? "A clean expedition."
      : found >= 7
        ? "A good day out."
        : "Expedition complete.";

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  return (
    // No Escape and no backdrop close: this is where an expedition's Done
    // lands, and like the rest card it stays at rest until the learner picks
    // Back to studying (#54).
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expedition-result-title"
        aria-describedby="expedition-result-acknowledgement expedition-result-line expedition-result-outcomes"
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
        <p
          id="expedition-result-acknowledgement"
          className="-mt-3 text-sm text-ink-mid"
        >
          {acknowledgement}
          {lookDone && missedCount > 0 && " Found again on a second look."}
        </p>
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
            {glyphRow(store.outcomes)}
          </span>{" "}
          {found}/{EXPEDITION_SIZE}
        </p>
        {/* What the squares mean, outside the selectable box so copying it
            by hand still yields exactly what Share sends. The spoken row
            below already names each outcome. */}
        <p className="-mt-2 text-xs text-ink-mid" aria-hidden>
          {GLYPH_FOUND} found · {GLYPH_MISSED} missed
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
                  {glyphFor(outcome)}
                </span>
                <span className="truncate">{nameFromIso3(iso3)}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-2">
          {/* The default comes first: the misses until they have been looked
              at, then leaving. Share is secondary either way (#64). */}
          {reviewFirst ? (
            <>
              <button
                ref={primaryRef}
                type="button"
                onClick={onReview}
                className={primaryClass}
              >
                Review {missedCount} missed
              </button>
              <p className="-mt-1 text-xs text-ink-mid text-center">
                A second look on the map. Today's result stays as it is.
              </p>
            </>
          ) : (
            <button
              ref={primaryRef}
              type="button"
              onClick={onClose}
              className={primaryClass}
            >
              Back to studying
            </button>
          )}
          <button type="button" onClick={share} className={secondaryClass}>
            {shareState === "shared"
              ? "Shared"
              : shareState === "copied"
                ? "Copied"
                : "Share"}
          </button>
          {/* The button's label changes, which a screen reader does not
              announce; the failure line below already is. */}
          {(shareState === "shared" || shareState === "copied") && (
            <p className="sr-only" role="status">
              {shareState === "shared" ? "Shared" : "Copied"}
            </p>
          )}
          {shareState === "failed" && (
            <p className="text-xs text-ink-mid text-center" role="status">
              Couldn't copy — select the text above to copy it by hand.
            </p>
          )}
          {reviewFirst ? (
            <button type="button" onClick={onClose} className={secondaryClass}>
              Back to studying
            </button>
          ) : (
            missedCount > 0 && (
              <button type="button" onClick={onReview} className={secondaryClass}>
                Review {missedCount} missed
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
