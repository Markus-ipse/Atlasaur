import { useEffect, useRef, useState } from "react";
import { ALL_CONTINENTS, type Continent, type Mode } from "../types";

type Props = {
  mode: Mode;
  onSetMode: (mode: Mode) => void;
  selectedContinents: readonly Continent[];
  onSetContinents: (continents: readonly Continent[]) => void;
  onEndSession: () => void;
};

export function SettingsMenu({
  mode,
  onSetMode,
  selectedContinents,
  onSetContinents,
  onEndSession,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
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

  const handleSetMode = (next: Mode) => {
    onSetMode(next);
    close();
  };

  const handleEndSession = () => {
    onEndSession();
    setOpen(false);
  };

  const selectedSet = new Set(selectedContinents);
  const handleToggleContinent = (continent: Continent) => {
    if (selectedSet.has(continent)) {
      if (selectedSet.size === 1) return;
      onSetContinents(selectedContinents.filter((c) => c !== continent));
    } else {
      onSetContinents([...selectedContinents, continent]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
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
      {open && (
        <div className="absolute right-0 z-20 w-72 rounded-lg border border-slate-200 bg-white shadow-lg p-3 flex flex-col gap-3 portrait:bottom-full portrait:mb-2 landscape:top-full landscape:mt-2">
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
                    onClick={() => handleToggleContinent(continent)}
                  >
                    {continent}
                  </ContinentChip>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={handleEndSession}
            className="min-h-11 px-3 rounded border border-slate-300 text-slate-700 text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            End session
          </button>
        </div>
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
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      aria-disabled={disabled || undefined}
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
