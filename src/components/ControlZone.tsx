import { useEffect, useRef } from "react";
import { Prompt } from "./Prompt";
import { AnswerInput } from "./AnswerInput";
import { RevealHero } from "./RevealHero";
import { StatusBar } from "./StatusBar";
import { EaseButtons } from "./EaseButtons";
import { TrainingIntro } from "./TrainingIntro";
import { CaughtUp } from "./CaughtUp";
import type { GameApi } from "../game/useGame";

type Props = {
  game: GameApi;
  // CaughtUp visibility is lifted so App can also disable map clicks
  // while the banner is up (otherwise a stray click bypasses it).
  showCaughtUp: boolean;
  onAckCaughtUp: () => void;
};

export function ControlZone({ game, showCaughtUp, onAckCaughtUp }: Props) {
  const { state } = game;
  const continueRef = useRef<HTMLButtonElement>(null);
  const isTraining = state.practiceMode === "training";
  const heroFeedback =
    state.feedback && state.feedback.kind !== "correct" ? state.feedback : null;
  const showHero = heroFeedback !== null;

  // Continue dismisses any feedback that isn't waiting on an explicit
  // ease press (Training wrong = pendingGrade). Correct feedback gets
  // auto-dismissed on the 600ms timer instead, so we hide Continue
  // there to avoid a button that lives for one blink.
  const showContinue =
    state.feedback !== null &&
    !state.pendingGrade &&
    state.feedback.kind !== "correct";

  useEffect(() => {
    if (showHero && !isTraining) {
      // preventScroll keeps a tall feedback panel from scrolling Continue
      // into view and pushing the hero off the top.
      continueRef.current?.focus({ preventScroll: true });
    }
  }, [showHero, isTraining]);

  // Show ease buttons during a Training miss reveal (pendingGrade) or
  // during a Training correct/skip overlay (so users can override the
  // auto-grade with Easy/Hard before dismissal).
  const showEaseButtons = isTraining && state.feedback !== null;
  // The intro is a teach moment. Only show it when the user actually
  // has to pick an ease (a real miss); a 600ms auto-dismiss on a
  // correct answer doesn't give them time to read.
  const showTrainingIntro =
    isTraining && state.pendingGrade && !game.seenSrsIntro;
  const skipLabel = isTraining ? "Don't know" : "Skip";

  return (
    <aside className="flex flex-col shrink-0 bg-white border-slate-200 portrait:border-t portrait:p-3 portrait:gap-3 portrait:overflow-y-auto landscape:border-l landscape:p-4 landscape:gap-4 landscape:w-72 lg:landscape:w-80 landscape:h-full landscape:overflow-y-auto">
      <StatusBar game={game} className="flex portrait:hidden" />

      <div className="landscape:flex-1 landscape:flex landscape:items-center">
        {showCaughtUp ? (
          <CaughtUp onKeepGoing={onAckCaughtUp} />
        ) : heroFeedback ? (
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

      {state.mode === "shape-to-name" && !showCaughtUp && (
        <AnswerInput
          current={state.current}
          feedback={state.feedback}
          matchTypedAnswer={game.matchTypedAnswer}
          onAnswer={game.answer}
        />
      )}

      {showTrainingIntro && (
        <TrainingIntro onDismiss={game.markSrsIntroSeen} />
      )}

      {showEaseButtons && (
        <EaseButtons
          record={state.srsStore.records[state.current.iso3] ?? null}
          onGrade={(ease) => {
            if (!game.seenSrsIntro) game.markSrsIntroSeen();
            game.grade(ease);
          }}
          keysActive
        />
      )}

      {!showCaughtUp && (
        <div className="flex gap-2">
          {showContinue ? (
            <button
              ref={showHero ? continueRef : undefined}
              type="button"
              onClick={game.dismiss}
              className="flex-1 min-h-11 px-4 rounded bg-slate-900 text-white font-medium hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Continue
            </button>
          ) : state.feedback === null ? (
            <button
              type="button"
              onClick={game.skip}
              className="flex-1 min-h-11 px-4 rounded border border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {skipLabel}
            </button>
          ) : null}
        </div>
      )}
    </aside>
  );
}
