import { useEffect, useRef } from "react";
import type { Country, FeedbackKind, Mode, Phase } from "../types";

type Props = {
  mode: Mode;
  current: Country;
  feedbackKind: FeedbackKind | null;
  phase: Phase;
  onSetMode: (mode: Mode) => void;
  onSkip: () => void;
  onContinue: () => void;
  onEndSession: () => void;
};

export function PromptBar({
  mode,
  current,
  feedbackKind,
  phase,
  onSetMode,
  onSkip,
  onContinue,
  onEndSession,
}: Props) {
  const continueRef = useRef<HTMLButtonElement>(null);
  const showContinue = feedbackKind !== null && feedbackKind !== "correct";

  useEffect(() => {
    if (showContinue) continueRef.current?.focus();
  }, [showContinue]);

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-1 p-1 rounded-full border border-slate-200 bg-white self-start">
        <ModeButton
          active={mode === "name-to-click"}
          onClick={() => onSetMode("name-to-click")}
        >
          Name → Click
        </ModeButton>
        <ModeButton
          active={mode === "shape-to-name"}
          onClick={() => onSetMode("shape-to-name")}
        >
          Shape → Name
        </ModeButton>
      </div>

      <div className="flex-1 sm:text-center">
        {phase === "review" && (
          <span className="inline-block mb-1 px-2 py-0.5 text-xs font-medium uppercase tracking-wide rounded-full bg-amber-100 text-amber-800">
            Review
          </span>
        )}
        {mode === "name-to-click" ? (
          <p className="text-xl sm:text-2xl">
            Find:{" "}
            <span className="font-semibold text-slate-900">{current.name}</span>
          </p>
        ) : (
          <p className="text-base sm:text-lg text-slate-700">
            What country is highlighted?
          </p>
        )}
      </div>

      <div className="flex gap-2 self-end sm:self-auto">
        {showContinue ? (
          <button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            className="min-h-11 min-w-11 px-4 rounded bg-slate-900 text-white font-medium hover:bg-slate-800"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            disabled={feedbackKind !== null}
            className="min-h-11 min-w-11 px-4 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Skip
          </button>
        )}
        <button
          type="button"
          onClick={onEndSession}
          className="min-h-11 px-4 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
        >
          End session
        </button>
      </div>
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
      onClick={onClick}
      className={
        "min-h-9 px-4 rounded-full text-sm font-medium transition-colors " +
        (active
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:bg-slate-100")
      }
    >
      {children}
    </button>
  );
}
