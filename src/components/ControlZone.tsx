import { useEffect, useRef } from "react";
import { Prompt } from "./Prompt";
import { AnswerInput } from "./AnswerInput";
import { RevealHero } from "./RevealHero";
import { CorrectHero } from "./CorrectHero";
import { StatusBar } from "./StatusBar";
import { StudyIntro } from "./StudyIntro";
import { CaughtUp } from "./CaughtUp";
import { isTypedMode } from "../game/questionModes";
import { focusHidesProgress, hidesIntroduced } from "../game/srs";
import { cardIsReturning, type GameApi } from "../game/useGame";
import type { ThemePref } from "../theme";
import { PRIMARY, SECONDARY } from "./buttonStyles";
import { KEEP_FOCUS } from "./keepFocus";

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
  const correctFeedback =
    state.feedback?.kind === "correct" ? state.feedback : null;

  // Continue dismisses any miss reveal (wrong/skipped) in both Quiz and
  // Study mode. Correct feedback gets auto-dismissed on the correct-flash
  // timer instead, so we hide Continue there to avoid a button that lives
  // for one blink. In Study the dismiss commits the queued auto-Again.
  const showContinue =
    state.feedback !== null && state.feedback.kind !== "correct";

  const typed = isTypedMode(state.mode);

  useEffect(() => {
    // preventScroll keeps a tall feedback panel from scrolling Continue
    // into view and pushing the hero off the top. Focus whenever the
    // Continue button is shown — including Study-skip, so Enter
    // commits the queued Again like users expect. Not in a typed mode: the
    // input keeps focus through the reveal and Enter there continues, so a
    // phone keyboard stays up from card to card (#61).
    if (showContinue && !typed)
      continueRef.current?.focus({ preventScroll: true });
  }, [showContinue, typed]);

  // Intro shows whenever the user is paused on a Study miss reveal (wrong
  // or skip). The correct flash is too brief to read.
  const showStudyIntro =
    isStudy && heroFeedback !== null && !game.seenSrsIntro;
  const roundBreak = state.roundDone && !state.sessionDone;
  // A card that has come back says so. In Name → Click it says so with the
  // answer, not the prompt: before the answer, "met before" narrows "find X"
  // to the known gold and the few learning cards the map's collapsed wash
  // hides, which is the leak that collapse exists to prevent. The retry pass
  // keeps it on the prompt, where every card is a retry and it tells nothing.
  const returning = cardIsReturning(state);
  const pillWithAnswer = returning && hidesIntroduced(state.mode);
  const pillOnPrompt =
    state.phase === "review" || (returning && !pillWithAnswer);
  const paused =
    roundBreak ||
    ((game.showTodayCard || game.showWelcome) && !state.sessionDone);

  return (
    <aside className="flex flex-col shrink-0 bg-parchment-base border-ink-faded/40 portrait:border-t portrait:p-3 portrait:gap-3 portrait:overflow-y-auto landscape:border-l landscape:p-4 landscape:gap-4 landscape:w-72 lg:landscape:w-80 landscape:h-full landscape:overflow-y-auto">
      <StatusBar
        game={game}
        className="flex portrait:hidden"
        themePref={themePref}
        onSetThemePref={onSetThemePref}
      />

      {/* The task is one unit (#61): what is asked, the way to answer and
          the one way on, together at the top of the panel. A reveal or a
          correct flash takes the prompt's place, so the result lands where
          the learner was already reading. */}
      <div
        data-answer-group
        className="flex flex-col gap-3 landscape:gap-4 landscape:rounded landscape:border landscape:border-ink-faded/40 landscape:p-3"
      >
        <div>
          {showCaughtUp ? (
            <CaughtUp
              onKeepGoing={onAckCaughtUp}
              capitalOffer={
                // Not in a focus: the offer counts the whole scope's countries.
                state.spotlightSubregion === null ? game.capitalOffer : null
              }
              onTryCapitals={() => game.setMode("country-to-capital")}
              nextBack={game.nextBack}
              newLeft={game.newAvailableCount > 0}
              spotlightSubregion={state.spotlightSubregion}
              onLeaveFocus={game.clearSpotlight}
            />
          ) : heroFeedback ? (
            <RevealHero
              current={state.current}
              feedback={heroFeedback}
              mode={state.mode}
              nameFromIso3={game.nameFromIso3}
              returning={pillWithAnswer}
            />
          ) : correctFeedback ? (
            <CorrectHero
              current={state.current}
              mode={state.mode}
              streak={state.streak}
              milestone={state.milestone}
              onMap={
                !focusHidesProgress(state.mode, state.spotlightSubregion)
              }
              returning={pillWithAnswer}
            />
          ) : (
            <Prompt
              mode={state.mode}
              current={state.current}
              returning={pillOnPrompt}
            />
          )}
        </div>

        {typed && !showCaughtUp && (
          <AnswerInput
            mode={state.mode}
            current={state.current}
            feedback={state.feedback}
            paused={paused}
            readTyped={game.readTyped}
            onAnswer={game.answer}
            onContinue={game.dismiss}
          />
        )}

        {showStudyIntro && (
          <StudyIntro onDismiss={game.markSrsIntroSeen} />
        )}

        {!showCaughtUp && !paused && (
          <div className="flex gap-2">
            {showContinue ? (
              <button
                ref={continueRef}
                type="button"
                {...(typed ? KEEP_FOCUS : {})}
                onClick={game.dismiss}
                className={`flex-1 ${PRIMARY}`}
              >
                Continue
              </button>
            ) : state.feedback === null ? (
              <button
                type="button"
                {...(typed ? KEEP_FOCUS : {})}
                onClick={game.skip}
                className={`flex-1 ${SECONDARY}`}
              >
                {/* The same words in every mode (#61): a test's skip is graded
                    as a miss, exactly as Study's is. */}
                {"Don't know"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
