import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PromptLine, BackAgain } from "./Prompt";
import { ceremonyOf } from "./ceremony";
import { RoundChip, StatusBar } from "./StatusBar";
import { focusHidesProgress } from "../game/srs";
import { backAgainPlacement, type GameApi } from "../game/useGame";
import type { ThemePref } from "../theme";

type Props = {
  game: GameApi;
  // The round count beside the prompt: in portrait, where nothing else on
  // screen says it. The landscape rail has room for the full status line.
  showCount: boolean;
  themePref: ThemePref;
  onSetThemePref: (pref: ThemePref) => void;
  className?: string;
};

// The question in one line over a phone's map in a typed mode (#61), with the
// round count and a ⋯ menu that holds what the status bar holds — the
// figures, Done and Settings — so the map keeps the height. Through the
// correct flash it says the ceremony line instead, if the answer earned one.
export function TaskHeader({
  game,
  showCount,
  themePref,
  onSetThemePref,
  className = "",
}: Props) {
  const { state } = game;
  const ceremony =
    state.feedback?.kind === "correct"
      ? ceremonyOf(
          state.milestone,
          state.streak,
          !focusHidesProgress(state.mode, state.spotlightSubregion),
        )
      : null;
  return (
    <header
      data-task-header
      className={`relative flex items-center gap-2 bg-parchment-base ${className}`}
    >
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        {backAgainPlacement(state).onPrompt && <BackAgain />}
        {ceremony ? (
          <p
            role="status"
            className={`milestone-in text-lg leading-tight italic ${ceremony.className}`}
          >
            {ceremony.text}
          </p>
        ) : (
          <PromptLine mode={state.mode} current={state.current} />
        )}
      </div>
      {showCount && (
        <RoundChip
          practiceMode={state.practiceMode}
          phase={state.phase}
          roundCards={state.roundCards}
          lookLeft={state.retryQueue.length}
        />
      )}
      <TaskMenu
        game={game}
        themePref={themePref}
        onSetThemePref={onSetThemePref}
      />
    </header>
  );
}

function TaskMenu({
  game,
  themePref,
  onSetThemePref,
}: {
  game: GameApi;
  themePref: ThemePref;
  onSetThemePref: (pref: ThemePref) => void;
}) {
  const [open, setOpen] = useState(false);
  // Placed against the button and portalled, since the landscape rail
  // scrolls and would clip a menu drawn inside it.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { sessionDone, roundDone } = game.state;

  // Focus moves into the menu, as it does into Settings, so a screen reader
  // lands on what opened.
  useLayoutEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Done inside the menu opens the summary over it; the menu is not still
  // open underneath when the learner comes back.
  useEffect(() => {
    if (sessionDone || roundDone) setOpen(false);
  }, [sessionDone, roundDone]);

  return (
    <div className="shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Round and settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const r = buttonRef.current?.getBoundingClientRect();
          if (r)
            setAt({ top: r.bottom + 4, right: window.innerWidth - r.right });
          setOpen((v) => !v);
        }}
        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full border border-ink-faded text-ink-deep hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
      >
        <MoreIcon />
      </button>
      {open &&
        createPortal(
          <>
            {/* The same rule as the Settings scrim: a tap outside only closes
              the menu, and never goes on to answer a card on the map. */}
            <div
              aria-hidden="true"
              data-task-menu-scrim
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-30 bg-scrim/25"
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Round and settings"
              tabIndex={-1}
              style={
                at
                  ? { ...at, maxHeight: `calc(100dvh - ${at.top + 8}px)` }
                  : undefined
              }
              className="fixed z-30 w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-ink-faded/40 bg-parchment-base shadow-lg p-3 focus:outline-none"
            >
              <StatusBar
                game={game}
                className="flex"
                themePref={themePref}
                onSetThemePref={onSetThemePref}
              />
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="4" cy="10" r="1.75" fill="currentColor" />
      <circle cx="10" cy="10" r="1.75" fill="currentColor" />
      <circle cx="16" cy="10" r="1.75" fill="currentColor" />
    </svg>
  );
}
