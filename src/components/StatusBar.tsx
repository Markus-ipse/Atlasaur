import { useMemo } from "react";
import { ScorePanel } from "./ScorePanel";
import { SettingsMenu } from "./SettingsMenu";
import { PracticeModeToggle } from "./PracticeModeToggle";
import { TRAINING_NEW_CAP } from "../game/pickCountry";
import {
  learnedCount as srsLearnedCount,
  lifetimeAccuracy as srsLifetimeAccuracy,
  totalReviews as srsTotalReviews,
} from "../game/srs";
import countriesData from "../data/countries.json";
import type { Continent, Country } from "../types";
import type { GameApi } from "../game/useGame";

const ALL_COUNTRIES = countriesData as Country[];

function scopeIso3s(continents: readonly Continent[]): Set<string> {
  const cset = new Set(continents);
  const out = new Set<string>();
  for (const c of ALL_COUNTRIES) {
    if (cset.has(c.continent)) out.add(c.iso3);
  }
  return out;
}

type Props = {
  game: GameApi;
  className?: string;
};

export function StatusBar({ game, className }: Props) {
  const { state } = game;
  const isTraining = state.practiceMode === "training";

  const learned = useMemo(
    () => srsLearnedCount(state.srsStore, scopeIso3s(state.selectedContinents)),
    [state.srsStore, state.selectedContinents],
  );
  const reviews = useMemo(
    () => srsTotalReviews(state.srsStore),
    [state.srsStore],
  );
  const accuracy = useMemo(
    () => srsLifetimeAccuracy(state.srsStore),
    [state.srsStore],
  );

  return (
    <header
      className={
        "items-center justify-between gap-3 border-b border-slate-200 pb-1 " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <PracticeModeToggle
          mode={state.practiceMode}
          onChange={game.setPracticeMode}
        />
        {isTraining ? (
          <TrainingChips
            due={game.dueCount}
            newAvailable={game.newAvailableCount}
            newIntroduced={state.newIntroducedThisStretch}
          />
        ) : (
          <>
            <ScorePanel
              completedCount={game.completedInScopeCount}
              totalInScope={game.totalInScope}
              missedCount={state.missed.length}
              streak={state.streak}
            />
            {game.dueCount > 0 && (
              <button
                type="button"
                onClick={() => game.setPracticeMode("training")}
                title="Switch to Training mode to review"
                className="shrink-0 text-xs text-slate-500 tabular-nums px-1.5 py-0.5 rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="font-semibold text-slate-900">{game.dueCount}</span>{" "}
                due
              </button>
            )}
          </>
        )}
      </div>
      <SettingsMenu
        mode={state.mode}
        onSetMode={game.setMode}
        practiceMode={state.practiceMode}
        selectedContinents={state.selectedContinents}
        onSetContinents={game.setContinents}
        showLabelsOnReveal={game.showLabelsOnReveal}
        onSetShowLabelsOnReveal={game.setShowLabelsOnReveal}
        onEndSession={game.endSession}
        dueCount={game.dueCount}
        newAvailableCount={game.newAvailableCount}
        learnedCount={learned}
        totalReviews={reviews}
        lifetimeAccuracy={accuracy}
        onResetSrs={game.resetSrs}
      />
    </header>
  );
}

function TrainingChips({
  due,
  newAvailable,
  newIntroduced,
}: {
  due: number;
  newAvailable: number;
  newIntroduced: number;
}) {
  return (
    <div className="flex items-baseline gap-2 text-xs text-slate-500 tabular-nums">
      <span>
        Due <span className="font-semibold text-slate-900">{due}</span>
      </span>
      <span aria-hidden>·</span>
      <span>
        New{" "}
        <span className="font-semibold text-slate-900">
          {newIntroduced}/{TRAINING_NEW_CAP}
        </span>
      </span>
      {newAvailable > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="text-slate-400">
            {newAvailable} untouched
          </span>
        </>
      )}
    </div>
  );
}

