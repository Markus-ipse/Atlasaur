import { useMemo } from "react";
import { ScorePanel } from "./ScorePanel";
import { SettingsMenu } from "./SettingsMenu";
import { STUDY_NEW_CAP } from "../game/pickCountry";
import { ROUND_SIZE } from "../game/useGame";
import {
  learnedCount as srsLearnedCount,
  lifetimeAccuracy as srsLifetimeAccuracy,
  seenCount as srsSeenCount,
  totalReviews as srsTotalReviews,
} from "../game/srs";
import countriesData from "../data/countries.json";
import type { Continent, Country, Phase, PracticeMode } from "../types";
import type { GameApi } from "../game/useGame";
import type { ThemePref } from "../theme";

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
  themePref: ThemePref;
  onSetThemePref: (pref: ThemePref) => void;
};

export function StatusBar({ game, className, themePref, onSetThemePref }: Props) {
  const { state } = game;
  const isStudy = state.practiceMode === "study";

  const learned = useMemo(
    () => srsLearnedCount(state.srsStore, scopeIso3s(state.selectedContinents)),
    [state.srsStore, state.selectedContinents],
  );
  const seen = useMemo(
    () => srsSeenCount(state.srsStore, scopeIso3s(state.selectedContinents)),
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
        "items-center justify-between gap-3 border-b border-ink-faded/30 pb-1 " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <RoundChip
          practiceMode={state.practiceMode}
          phase={state.phase}
          roundCards={state.roundCards}
        />
        {isStudy ? (
          <StudyChips
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
            />
            {game.dueCount > 0 && (
              <button
                type="button"
                onClick={() => game.setPracticeMode("study")}
                title="Back to studying"
                className="shrink-0 text-xs text-ink-mid tabular-nums px-1.5 py-0.5 rounded hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-deep"
              >
                <span className="font-semibold text-ink-deep">{game.dueCount}</span>{" "}
                to review
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={game.endSession}
          disabled={state.sessionDone}
          className="min-h-11 px-2.5 rounded text-xs text-ink-mid hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep disabled:opacity-50"
        >
          Done
        </button>
      <SettingsMenu
        mode={state.mode}
        onSetMode={game.setMode}
        selectedContinents={state.selectedContinents}
        onSetContinents={game.setContinents}
        dueCount={game.dueCount}
        newAvailableCount={game.newAvailableCount}
        learnedCount={learned}
        seenCount={seen}
        totalReviews={reviews}
        lifetimeAccuracy={accuracy}
        onResetSrs={game.resetSrs}
        themePref={themePref}
        onSetThemePref={onSetThemePref}
      />
      </div>
    </header>
  );
}

// Where the learner is in the current round. A test round is a run over the
// whole scope with its own Done count, so the round chip is Study-only; a
// review pass (Quiz phase "review") likewise has its own badge in Prompt.
function RoundChip({
  practiceMode,
  phase,
  roundCards,
}: {
  practiceMode: PracticeMode;
  phase: Phase;
  roundCards: number;
}) {
  if (practiceMode !== "study" || phase === "review") return null;
  return (
    <span
      className="shrink-0 font-display text-xs uppercase tracking-wide text-ink-mid tabular-nums"
      aria-label={`Card ${Math.min(roundCards + 1, ROUND_SIZE)} of ${ROUND_SIZE} this round`}
    >
      {Math.min(roundCards + 1, ROUND_SIZE)}/{ROUND_SIZE}
    </span>
  );
}

function StudyChips({
  due,
  newAvailable,
  newIntroduced,
}: {
  due: number;
  newAvailable: number;
  newIntroduced: number;
}) {
  return (
    <div className="flex items-baseline gap-2 text-xs text-ink-mid tabular-nums">
      <span>
        <span className="font-semibold text-ink-deep">{due}</span> to review
      </span>
      {newAvailable > 0 && (
        <>
          <span aria-hidden>·</span>
          <span>
            <span className="font-semibold text-ink-deep">{newIntroduced}</span>{" "}
            of {Math.min(STUDY_NEW_CAP, newIntroduced + newAvailable)} new
          </span>
        </>
      )}
    </div>
  );
}

