import { useGame } from "./game/useGame";
import { WorldMap } from "./components/WorldMap";
import { PromptBar } from "./components/PromptBar";
import { AnswerInput } from "./components/AnswerInput";
import { ScorePanel } from "./components/ScorePanel";
import { SessionSummary } from "./components/SessionSummary";

export default function App() {
  const game = useGame();
  const { state } = game;

  const highlightedIso3 =
    state.mode === "shape-to-name" ? state.current.iso3 : null;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col">
      <main className="flex-1 flex flex-col gap-4 p-4 sm:p-6">
        <ScorePanel
          score={state.score}
          streak={state.streak}
          bestStreak={state.bestStreak}
          total={state.total}
        />
        <PromptBar
          mode={state.mode}
          current={state.current}
          feedbackKind={state.feedback?.kind ?? null}
          phase={state.phase}
          onSetMode={game.setMode}
          onSkip={game.skip}
          onDismiss={game.dismiss}
          onEndSession={game.endSession}
        />
        <WorldMap
          mode={state.mode}
          highlightedIso3={highlightedIso3}
          feedback={state.feedback}
          isoFromNumeric={game.isoFromNumeric}
          numericFromIso3={game.numericFromIso3}
          onCountryClick={game.answer}
        />
        {state.mode === "shape-to-name" && (
          <AnswerInput
            current={state.current}
            feedback={state.feedback}
            matchTypedAnswer={game.matchTypedAnswer}
            onAnswer={game.answer}
          />
        )}
      </main>
      {state.sessionDone && (
        <SessionSummary
          score={state.score}
          total={state.total}
          bestStreak={state.bestStreak}
          missed={state.missed}
          unlearnedCount={game.unlearnedCount}
          onReview={game.startReview}
          onPlayAgain={game.reset}
        />
      )}
    </div>
  );
}
