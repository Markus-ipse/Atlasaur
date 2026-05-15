import { useEffect, useRef } from "react";
import { ScorePanel } from "./ScorePanel";
import { Prompt } from "./Prompt";
import { AnswerInput } from "./AnswerInput";
import { SettingsMenu } from "./SettingsMenu";
import { RevealHero } from "./RevealHero";
import type { GameApi } from "../game/useGame";

type Props = {
  game: GameApi;
};

export function ControlZone({ game }: Props) {
  const { state } = game;
  const continueRef = useRef<HTMLButtonElement>(null);
  // Bind the narrowed feedback once so the JSX doesn't re-check truthiness
  // for TypeScript's benefit. `showHero` stays a stable boolean for the
  // focus useEffect's dep array.
  const heroFeedback =
    state.feedback && state.feedback.kind !== "correct" ? state.feedback : null;
  const showHero = heroFeedback !== null;

  useEffect(() => {
    // preventScroll keeps a tall feedback panel from scrolling Continue
    // into view and pushing the hero off the top.
    if (showHero) continueRef.current?.focus({ preventScroll: true });
  }, [showHero]);

  return (
    <aside className="flex flex-col shrink-0 bg-white border-slate-200 portrait:border-t portrait:p-3 portrait:gap-3 portrait:overflow-y-auto landscape:border-l landscape:p-4 landscape:gap-4 landscape:w-72 lg:landscape:w-80 landscape:h-full landscape:overflow-y-auto">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-1">
        <ScorePanel
          score={state.score}
          streak={state.streak}
          total={state.total}
        />
        <SettingsMenu
          mode={state.mode}
          onSetMode={game.setMode}
          selectedContinents={state.selectedContinents}
          onSetContinents={game.setContinents}
          showLabelsOnReveal={game.showLabelsOnReveal}
          onSetShowLabelsOnReveal={game.setShowLabelsOnReveal}
          onEndSession={game.endSession}
        />
      </header>

      <div className="landscape:flex-1 landscape:flex landscape:items-center">
        {heroFeedback ? (
          <RevealHero
            current={state.current}
            feedback={heroFeedback}
            mode={state.mode}
            nameFromIso3={game.nameFromIso3}
          />
        ) : (
          <Prompt mode={state.mode} current={state.current} phase={state.phase} />
        )}
      </div>

      {state.mode === "shape-to-name" && (
        <AnswerInput
          current={state.current}
          feedback={state.feedback}
          matchTypedAnswer={game.matchTypedAnswer}
          onAnswer={game.answer}
        />
      )}

      <div className="flex gap-2">
        {showHero ? (
          <button
            ref={continueRef}
            type="button"
            onClick={game.dismiss}
            className="flex-1 min-h-11 px-4 rounded bg-slate-900 text-white font-medium hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={game.skip}
            disabled={state.feedback !== null}
            className="flex-1 min-h-11 px-4 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Skip
          </button>
        )}
      </div>
    </aside>
  );
}
