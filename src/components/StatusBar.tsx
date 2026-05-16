import { FreeplayScorePanel, MarathonScorePanel } from "./ScorePanel";
import { SettingsMenu } from "./SettingsMenu";
import type { GameApi } from "../game/useGame";

type Props = {
  game: GameApi;
  className?: string;
};

export function StatusBar({ game, className }: Props) {
  const { state } = game;
  return (
    <header
      className={
        "items-center justify-between gap-3 border-b border-slate-200 pb-1 " +
        (className ?? "")
      }
    >
      {state.sessionType === "marathon" ? (
        <MarathonScorePanel
          completedCount={state.completedSet.size}
          totalInScope={game.totalInScope}
          missedCount={state.missed.length}
          streak={state.streak}
        />
      ) : (
        <FreeplayScorePanel
          score={state.score}
          streak={state.streak}
          total={state.total}
        />
      )}
      <SettingsMenu
        mode={state.mode}
        onSetMode={game.setMode}
        sessionType={state.sessionType}
        onSetSessionType={game.setSessionType}
        selectedContinents={state.selectedContinents}
        onSetContinents={game.setContinents}
        showLabelsOnReveal={game.showLabelsOnReveal}
        onSetShowLabelsOnReveal={game.setShowLabelsOnReveal}
        onEndSession={game.endSession}
      />
    </header>
  );
}
