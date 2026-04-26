import { useGame } from "./game/useGame";
import { WorldMap } from "./components/WorldMap";
import { ControlZone } from "./components/ControlZone";
import { SessionSummary } from "./components/SessionSummary";

export default function App() {
  const game = useGame();
  const { state } = game;

  const highlightedIso3 =
    state.mode === "shape-to-name" ? state.current.iso3 : null;

  return (
    <div className="h-dvh w-full flex overflow-hidden bg-slate-50 text-slate-900 portrait:flex-col landscape:flex-row pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className="relative flex-1 min-h-0 min-w-0">
        <WorldMap
          mode={state.mode}
          highlightedIso3={highlightedIso3}
          feedback={state.feedback}
          isoFromNumeric={game.isoFromNumeric}
          numericFromIso3={game.numericFromIso3}
          onCountryClick={game.answer}
        />
      </div>
      <ControlZone game={game} />
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
