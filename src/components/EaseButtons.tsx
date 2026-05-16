import { useEffect } from "react";
import { previewIntervalDays } from "../game/srs";
import type { Ease, SrsRecord } from "../types";

type Props = {
  record: SrsRecord | null;
  onGrade: (ease: Ease) => void;
  // Reads `1`/`2`/`3`/`4` from document-level keydown when active. The
  // parent (ControlZone) decides when this is true (currently: when a
  // miss is pending grade, or correct/skip overlays during the
  // dismiss window).
  keysActive: boolean;
};

const EASE_ORDER: Ease[] = ["Again", "Hard", "Good", "Easy"];

const STYLE_BY_EASE: Record<Ease, string> = {
  Again: "bg-red-600 hover:bg-red-700 text-white",
  Hard: "bg-amber-500 hover:bg-amber-600 text-white",
  Good: "bg-emerald-600 hover:bg-emerald-700 text-white",
  Easy: "bg-sky-600 hover:bg-sky-700 text-white",
};

export function EaseButtons({ record, onGrade, keysActive }: Props) {
  useEffect(() => {
    if (!keysActive) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept keys when the user is typing in an input or
      // contenteditable element.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx === -1) return;
      e.preventDefault();
      onGrade(EASE_ORDER[idx]);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [keysActive, onGrade]);

  const now = new Date();

  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Grade">
      {EASE_ORDER.map((ease, i) => {
        const days = previewIntervalDays(record, ease, now);
        const label = days === 0 ? "<1d" : `${days}d`;
        return (
          <button
            key={ease}
            type="button"
            onClick={() => onGrade(ease)}
            title={`${ease} · ~${label}`}
            aria-label={`${ease}, key ${i + 1}, interval about ${label}`}
            className={
              "min-h-11 px-1 rounded font-medium text-sm flex flex-col items-center justify-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 " +
              STYLE_BY_EASE[ease]
            }
          >
            <span className="flex items-center gap-1 leading-none">
              <span className="text-[10px] opacity-80 rounded bg-black/20 px-1 py-px font-mono">
                {i + 1}
              </span>
              <span>{ease}</span>
            </span>
            <span className="text-[10px] opacity-80 tabular-nums">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
