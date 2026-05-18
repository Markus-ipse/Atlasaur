import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ALL_CONTINENTS,
  type Continent,
  type PracticeMode,
  type QuestionMode,
} from "../types";
import type { ThemePref } from "../theme";

type PopupCoords = {
  top: number;
  right: number;
  maxHeight: number;
};

type Props = {
  mode: QuestionMode;
  onSetMode: (mode: QuestionMode) => void;
  practiceMode: PracticeMode;
  selectedContinents: readonly Continent[];
  onSetContinents: (continents: readonly Continent[]) => void;
  showLabelsOnReveal: boolean;
  onSetShowLabelsOnReveal: (value: boolean) => void;
  onEndSession: () => void;
  // SRS surface
  dueCount: number;
  newAvailableCount: number;
  learnedCount: number;
  totalReviews: number;
  lifetimeAccuracy: number;
  onResetSrs: () => void;
  themePref: ThemePref;
  onSetThemePref: (pref: ThemePref) => void;
};

export function SettingsMenu({
  mode,
  onSetMode,
  practiceMode,
  selectedContinents,
  onSetContinents,
  showLabelsOnReveal,
  onSetShowLabelsOnReveal,
  onEndSession,
  dueCount,
  newAvailableCount,
  learnedCount,
  totalReviews,
  lifetimeAccuracy,
  onResetSrs,
  themePref,
  onSetThemePref,
}: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopupCoords | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open && confirmReset) setConfirmReset(false);
  }, [open, confirmReset]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const right = Math.max(8, window.innerWidth - rect.right);
      // Always open downward — the gear is now at the top of the viewport in
      // portrait (under the status bar) and at the top of the sidebar in
      // landscape, so down has space in both cases. Constrain max-height so
      // the menu never extends past the viewport; let it scroll internally
      // if its content doesn't fit (e.g. short landscape phones).
      const top = rect.bottom + 8;
      const maxHeight = Math.max(160, window.innerHeight - top - 8);
      setCoords({ top, right, maxHeight });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const handleSetMode = (next: QuestionMode) => {
    onSetMode(next);
    close();
  };

  const handleEndSession = () => {
    onEndSession();
    setOpen(false);
  };

  const selectedSet = new Set(selectedContinents);
  const handleToggleContinent = (continent: Continent) => {
    const isSelected = selectedSet.has(continent);
    if (isSelected && selectedSet.size === 1) return;
    const next = new Set(selectedSet);
    if (isSelected) next.delete(continent);
    else next.add(continent);
    onSetContinents(ALL_CONTINENTS.filter((c) => next.has(c)));
  };

  return (
    <div ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full border border-ink-faded text-ink-mid hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
      >
        <GearIcon />
      </button>
      {open && coords &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            style={{
              position: "fixed",
              top: coords.top,
              right: coords.right,
              maxHeight: coords.maxHeight,
            }}
            className="z-50 w-72 rounded-lg border border-ink-faded/40 bg-parchment-base shadow-lg p-3 flex flex-col gap-3 overflow-y-auto"
          >
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-ink-mid mb-1">Question</p>
              <div
                role="radiogroup"
                aria-label="Question mode"
                className="flex gap-1 p-1 rounded-full border border-ink-faded/40 bg-parchment-shadow"
              >
                <ModeButton
                  active={mode === "name-to-click"}
                  onClick={() => handleSetMode("name-to-click")}
                >
                  Name → Click
                </ModeButton>
                <ModeButton
                  active={mode === "shape-to-name"}
                  onClick={() => handleSetMode("shape-to-name")}
                >
                  Shape → Name
                </ModeButton>
              </div>
            </div>
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-ink-mid mb-1">Continents</p>
              <div role="group" aria-label="Continents" className="flex flex-wrap gap-1">
                {ALL_CONTINENTS.map((continent) => {
                  const active = selectedSet.has(continent);
                  const lockedLast = active && selectedSet.size === 1;
                  return (
                    <ContinentChip
                      key={continent}
                      active={active}
                      disabled={lockedLast}
                      title={
                        lockedLast ? "At least one continent must be selected" : undefined
                      }
                      onClick={() => handleToggleContinent(continent)}
                    >
                      {continent}
                    </ContinentChip>
                  );
                })}
              </div>
            </div>
            {practiceMode !== "study" && (
              <div>
                <p className="font-display text-xs uppercase tracking-wide text-ink-mid mb-1">Reveal</p>
                <label className="flex items-center gap-2 text-sm text-ink-deep cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLabelsOnReveal}
                    onChange={(e) => onSetShowLabelsOnReveal(e.target.checked)}
                    className="h-4 w-4 rounded border-ink-faded text-ink-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep"
                  />
                  Show country names after a wrong answer
                </label>
              </div>
            )}
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-ink-mid mb-1">Theme</p>
              <div
                role="radiogroup"
                aria-label="Theme"
                className="flex gap-1 p-1 rounded-full border border-ink-faded/40 bg-parchment-shadow"
              >
                <ModeButton
                  active={themePref === "system"}
                  onClick={() => onSetThemePref("system")}
                >
                  System
                </ModeButton>
                <ModeButton
                  active={themePref === "light"}
                  onClick={() => onSetThemePref("light")}
                >
                  Light
                </ModeButton>
                <ModeButton
                  active={themePref === "dark"}
                  onClick={() => onSetThemePref("dark")}
                >
                  Dark
                </ModeButton>
              </div>
            </div>
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-ink-mid mb-1">Stats</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-mid tabular-nums">
                <span>Learned</span>
                <span className="text-ink-deep font-medium text-right">
                  {learnedCount}
                </span>
                <span>Due today</span>
                <span className="text-ink-deep font-medium text-right">
                  {dueCount}
                </span>
                <span>New available</span>
                <span className="text-ink-deep font-medium text-right">
                  {newAvailableCount}
                </span>
                <span>Reviews</span>
                <span className="text-ink-deep font-medium text-right">
                  {totalReviews}
                </span>
                <span>Accuracy</span>
                <span className="text-ink-deep font-medium text-right">
                  {totalReviews === 0
                    ? "—"
                    : `${Math.round(lifetimeAccuracy * 100)}%`}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEndSession}
              className="min-h-11 px-3 rounded border border-ink-faded text-ink-mid text-sm hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
            >
              {practiceMode === "study" ? "Done for now" : "End session"}
            </button>
            <div className="pt-2 mt-1 border-t border-ink-faded/30">
              {confirmReset ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-ink-mid">
                    This will erase all spaced-repetition progress.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onResetSrs();
                        setConfirmReset(false);
                      }}
                      className="flex-1 min-h-11 px-3 rounded bg-vermillion text-parchment-base text-sm font-medium hover:bg-wax-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:ring-offset-1"
                    >
                      Reset SRS
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="flex-1 min-h-11 px-3 rounded border border-ink-faded text-ink-mid text-sm hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="w-full min-h-11 px-3 rounded border border-vermillion/40 text-vermillion text-sm hover:bg-vermillion/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:ring-offset-1"
                >
                  Reset SRS data…
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={
        "flex-1 min-h-9 px-3 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep " +
        (active ? "bg-ink-deep text-parchment-base" : "text-ink-mid hover:bg-parchment-base")
      }
    >
      {children}
    </button>
  );
}

function ContinentChip({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      aria-disabled={disabled || undefined}
      title={title}
      onClick={disabled ? undefined : onClick}
      className={
        "min-h-9 px-3 rounded-full text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep " +
        (active
          ? "bg-ink-deep text-parchment-base border-ink-deep"
          : "bg-parchment-base text-ink-mid border-ink-faded hover:bg-parchment-shadow") +
        (disabled ? " cursor-not-allowed opacity-70" : "")
      }
    >
      {children}
    </button>
  );
}

function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
