import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ALL_CONTINENTS,
  type Continent,
  type QuestionMode,
} from "../types";

type PopupCoords = {
  top: number;
  right: number;
  maxHeight: number;
};

type Props = {
  mode: QuestionMode;
  onSetMode: (mode: QuestionMode) => void;
  selectedContinents: readonly Continent[];
  onSetContinents: (continents: readonly Continent[]) => void;
  showLabelsOnReveal: boolean;
  onSetShowLabelsOnReveal: (value: boolean) => void;
  onEndSession: () => void;
};

export function SettingsMenu({
  mode,
  onSetMode,
  selectedContinents,
  onSetContinents,
  showLabelsOnReveal,
  onSetShowLabelsOnReveal,
  onEndSession,
}: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopupCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
            className="z-50 w-72 rounded-lg border border-slate-200 bg-white shadow-lg p-3 flex flex-col gap-3 overflow-y-auto"
          >
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Mode</p>
              <div
                role="radiogroup"
                aria-label="Game mode"
                className="flex gap-1 p-1 rounded-full border border-slate-200 bg-slate-50"
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
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Continents</p>
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
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Reveal</p>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLabelsOnReveal}
                  onChange={(e) => onSetShowLabelsOnReveal(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                Show country names after a wrong answer
              </label>
            </div>
            <button
              type="button"
              onClick={handleEndSession}
              className="min-h-11 px-3 rounded border border-slate-300 text-slate-700 text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              End session
            </button>
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
        "flex-1 min-h-9 px-3 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")
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
        "min-h-9 px-3 rounded-full text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100") +
        (disabled ? " cursor-not-allowed opacity-80" : "")
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
