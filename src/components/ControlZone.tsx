import { useEffect, useRef } from "react";
import { Prompt } from "./Prompt";
import { AnswerInput } from "./AnswerInput";
import { RevealHero } from "./RevealHero";
import { CorrectHero } from "./CorrectHero";
import { StatusBar, StatusChips } from "./StatusBar";
import { TaskHeader } from "./TaskHeader";
import { StudyIntro } from "./StudyIntro";
import { CaughtUp } from "./CaughtUp";
import { isTypedMode } from "../game/questionModes";
import { focusHidesProgress } from "../game/srs";
import { backAgainPlacement, type GameApi } from "../game/useGame";
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
  // A typed mode on a phone (#61): "dock" sits on the keyboard under the map,
  // with the question in App's TaskHeader above it; "rail" is a narrow column
  // beside the map that carries its own header. "panel" everywhere else.
  layout?: "panel" | "dock" | "rail";
};

export function ControlZone({
  game,
  showCaughtUp,
  onAckCaughtUp,
  themePref,
  onSetThemePref,
  layout = "panel",
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
  // A card that has come back says so, on the prompt or with the answer.
  const { onPrompt: pillOnPrompt, withAnswer: pillWithAnswer } =
    backAgainPlacement(state);
  const paused =
    roundBreak ||
    ((game.showTodayCard || game.showWelcome) && !state.sessionDone);

  const caughtUp = (
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
  );

  // A typed mode on a phone (#61): the field and its one button, the answer
  // written in the field, and nothing else that would take the map's height
  // but the first-miss explanation, an offer and the caught-up banner, which
  // come and go.
  if (layout !== "panel") {
    const rail = layout === "rail";
    return (
      <aside
        data-compact={layout}
        className={
          "flex flex-col shrink-0 gap-2 bg-parchment-base border-ink-faded/40 " +
          (rail
            ? "w-80 h-full overflow-y-auto border-l p-2.5"
            : "max-h-[60%] overflow-y-auto border-t px-2.5 py-2")
        }
      >
        {rail && (
          <TaskHeader
            game={game}
            showCount={false}
            themePref={themePref}
            onSetThemePref={onSetThemePref}
          />
        )}
        {showCaughtUp ? (
          caughtUp
        ) : (
          <>
            {/* Above the field in the dock, next to the map it explains;
                under it in the rail, where above would push the field out of
                a keyboard-short column. */}
            {showStudyIntro && !rail && (
              <StudyIntro onDismiss={game.markSrsIntroSeen} />
            )}
            <AnswerInput
              compact
              mode={state.mode}
              current={state.current}
              feedback={state.feedback}
              paused={paused}
              readTyped={game.readTyped}
              onAnswer={game.answer}
              onContinue={game.dismiss}
              onSkip={game.skip}
              detailsBelow={rail}
            />
            {showStudyIntro && rail && (
              <StudyIntro onDismiss={game.markSrsIntroSeen} />
            )}
          </>
        )}
        {rail && !(state.feedback && state.feedback.kind !== "correct") && (
          <StatusChips game={game} />
        )}
      </aside>
    );
  }

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
            caughtUp
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
