import { useEffect, useRef } from "react";
import { ScorePanel } from "./ScorePanel";
import { Prompt } from "./Prompt";
import { AnswerInput } from "./AnswerInput";
import { SettingsMenu } from "./SettingsMenu";
import type { Country, Feedback, Mode, Phase } from "../types";

type Props = {
  mode: Mode;
  current: Country;
  feedback: Feedback | null;
  phase: Phase;
  score: number;
  streak: number;
  bestStreak: number;
  total: number;
  matchTypedAnswer: (input: string) => string;
  onAnswer: (iso3: string) => void;
  onSetMode: (mode: Mode) => void;
  onSkip: () => void;
  onDismiss: () => void;
  onEndSession: () => void;
};

export function ControlZone({
  mode,
  current,
  feedback,
  phase,
  score,
  streak,
  bestStreak,
  total,
  matchTypedAnswer,
  onAnswer,
  onSetMode,
  onSkip,
  onDismiss,
  onEndSession,
}: Props) {
  const continueRef = useRef<HTMLButtonElement>(null);
  const showContinue = feedback !== null && feedback.kind !== "correct";

  useEffect(() => {
    if (showContinue) continueRef.current?.focus();
  }, [showContinue]);

  return (
    <aside
      className="
        flex shrink-0 bg-white border-slate-200
        portrait:flex-col portrait:border-t portrait:p-3 portrait:gap-3
        landscape:flex-col landscape:border-l landscape:p-4 landscape:gap-4
        landscape:w-72 lg:landscape:w-80 landscape:h-full landscape:overflow-y-auto
      "
    >
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold tracking-tight text-slate-900">
          Atlasaur
        </h1>
        <SettingsMenu
          mode={mode}
          onSetMode={onSetMode}
          onEndSession={onEndSession}
        />
      </header>

      <ScorePanel
        score={score}
        streak={streak}
        bestStreak={bestStreak}
        total={total}
      />

      <div className="landscape:flex-1 landscape:flex landscape:flex-col landscape:justify-center">
        <Prompt mode={mode} current={current} phase={phase} />
      </div>

      {mode === "shape-to-name" && (
        <AnswerInput
          current={current}
          feedback={feedback}
          matchTypedAnswer={matchTypedAnswer}
          onAnswer={onAnswer}
        />
      )}

      <div className="flex gap-2">
        {showContinue ? (
          <button
            ref={continueRef}
            type="button"
            onClick={onDismiss}
            className="flex-1 min-h-11 px-4 rounded bg-slate-900 text-white font-medium hover:bg-slate-800"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            disabled={feedback !== null}
            className="flex-1 min-h-11 px-4 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Skip
          </button>
        )}
      </div>
    </aside>
  );
}
