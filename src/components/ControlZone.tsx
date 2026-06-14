import { useEffect, useRef } from "react";
import { Prompt } from "./Prompt";
import { AnswerInput } from "./AnswerInput";
import { RevealHero } from "./RevealHero";
import { StatusBar } from "./StatusBar";
import { StudyIntro } from "./StudyIntro";
import { CaughtUp } from "./CaughtUp";
import type { GameApi } from "../game/useGame";
import type { ThemePref } from "../theme";

type Props = {
  game: GameApi;
  // CaughtUp visibility is lifted so App can also disable map clicks
  // while the banner is up (otherwise a stray click bypasses it).
  showCaughtUp: boolean;
  onAckCaughtUp: () => void;
  themePref: ThemePref;
  onSetThemePref: (pref: ThemePref) => void;
};

export function ControlZone({
  game,
  showCaughtUp,
  onAckCaughtUp,
  themePref,
  onSetThemePref,
}: Props) {
  const { state } = game;
  const continueRef = useRef<HTMLButtonElement>(null);
  const isStudy = state.practiceMode === "study";
  const heroFeedback =
    state.feedback && state.feedback.kind !== "correct" ? state.feedback : null;

  // Continue dismisses any miss reveal (wrong/skipped) in both Quiz and
  // Study mode. Correct feedback gets auto-dismissed on the 600ms timer
  // instead, so we hide Continue there to avoid a button that lives for
  // one blink. In Study the dismiss commits the queued auto-Again.
  const showContinue =
    state.feedback !== null && state.feedback.kind !== "correct";

  useEffect(() => {
    // preventScroll keeps a tall feedback panel from scrolling Continue
    // into view and pushing the hero off the top. Focus whenever the
    // Continue button is shown — including Study-skip, so Enter
    // commits the queued Again like users expect.
    if (showContinue) continueRef.current?.focus({ preventScroll: true });
  }, [showContinue]);

  // Intro shows whenever the user is paused on a Study miss reveal (wrong
  // or skip). The 600ms correct flash is too short to read.
  const showStudyIntro =
    isStudy && heroFeedback !== null && !game.seenSrsIntro;
  const skipLabel = isStudy ? "Don't know" : "Skip";

  return (
    <aside className="flex flex-col shrink-0 bg-parchment-base border-ink-faded/40 portrait:border-t portrait:p-3 portrait:gap-3 portrait:overflow-y-auto landscape:border-l landscape:p-4 landscape:gap-4 landscape:w-72 lg:landscape:w-80 landscape:h-full landscape:overflow-y-auto">
      <StatusBar
        game={game}
        className="flex portrait:hidden"
        themePref={themePref}
        onSetThemePref={onSetThemePref}
      />

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

      {showStudyIntro && (
        <StudyIntro onDismiss={game.markSrsIntroSeen} />
      )}

      {!showCaughtUp && (
        <div className="flex gap-2">
          {showContinue ? (
            <button
              ref={continueRef}
              type="button"
              onClick={game.dismiss}
              className="flex-1 min-h-11 px-4 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
            >
              {isStudy ? "Got it" : "Continue"}
            </button>
          ) : state.feedback === null ? (
            <button
              type="button"
              onClick={game.skip}
              className="flex-1 min-h-11 px-4 rounded border border-ink-faded text-ink-mid hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
            >
              {skipLabel}
            </button>
          ) : null}
        </div>
      )}
    </aside>
  );
}
