import { useMemo } from "react";
import { ScorePanel } from "./ScorePanel";
import { SettingsMenu } from "./SettingsMenu";
import { STUDY_NEW_CAP } from "../game/pickCountry";
import { ROUND_SIZE } from "../game/useGame";
import { EXPEDITION_SIZE } from "../game/expedition";
import {
  learnedCount as srsLearnedCount,
  lifetimeAccuracy as srsLifetimeAccuracy,
  seenCount as srsSeenCount,
  totalReviews as srsTotalReviews,
} from "../game/srs";
import type { Fact, Phase, PracticeMode } from "../types";
import type { GameApi } from "../game/useGame";
import type { ThemePref } from "../theme";

type Props = {
  game: GameApi;
  className?: string;
  themePref: ThemePref;
  onSetThemePref: (pref: ThemePref) => void;
};

export function StatusBar({ game, className, themePref, onSetThemePref }: Props) {
  const { state } = game;
  const isStudy = state.practiceMode === "study";
  const isExpedition = state.practiceMode === "expedition";

  // The learner's own fact, so an expedition's forced Name → Click never
  // shows location figures to someone studying capitals. The two lifetime
  // rows below are across every fact, and say so.
  const factRecords = state.srsStore.facts[game.fact];
  const learned = useMemo(
    () => srsLearnedCount(factRecords, game.scopeSet),
    [factRecords, game.scopeSet],
  );
  const seen = useMemo(
    () => srsSeenCount(factRecords, game.scopeSet),
    [factRecords, game.scopeSet],
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
        "flex-wrap items-center justify-between gap-x-3 border-b border-ink-faded/30 pb-1 " +
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
            fact={game.fact}
          />
        ) : isExpedition ? null : (
          <>
            <ScorePanel tally={game.testTally} />
            {game.dueCount > 0 && (
              <button
                type="button"
                onClick={() => game.setPracticeMode("study")}
                title="Back to studying"
                className="shrink-0 text-xs text-ink-mid tabular-nums px-1.5 py-0.5 rounded hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-deep"
              >
                <span className="font-semibold text-ink-deep">{game.dueCount}</span>{" "}
                coming back
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
        fact={game.fact}
        onSetMode={game.setMode}
        modeLocked={isExpedition}
        selectedContinents={state.selectedContinents}
        onSetContinents={game.setContinents}
        includeTerritories={state.includeTerritories}
        onSetIncludeTerritories={game.setIncludeTerritories}
        dueCount={game.dueCount}
        newAvailableCount={game.newAvailableCount}
        learnedCount={learned}
        seenCount={seen}
        totalReviews={reviews}
        lifetimeAccuracy={accuracy}
        counters={game.counters}
        returns={game.returns}
        onResetSrs={game.resetSrs}
        themePref={themePref}
        onSetThemePref={onSetThemePref}
      />
      </div>
      {isStudy && state.spotlightSubregion && (
        <FocusChip
          spotlight={state.spotlightSubregion}
          onClear={game.clearSpotlight}
        />
      )}
    </header>
  );
}

// Where the learner is in the current round. A test round is a run over the
// whole scope with its own Done count, so the round chip is Study-only; a
// review pass (Quiz phase "review") likewise has its own badge in Prompt. An
// expedition is a round of ten and says so.
function RoundChip({
  practiceMode,
  phase,
  roundCards,
}: {
  practiceMode: PracticeMode;
  phase: Phase;
  roundCards: number;
}) {
  if (practiceMode === "quiz" || phase === "review") return null;
  const size = practiceMode === "expedition" ? EXPEDITION_SIZE : ROUND_SIZE;
  const card = Math.min(roundCards + 1, size);
  return (
    <span
      className="shrink-0 font-display text-xs uppercase tracking-wide text-ink-mid tabular-nums"
      aria-label={`Card ${card} of ${size} this ${practiceMode === "expedition" ? "expedition" : "round"}`}
    >
      {practiceMode === "expedition" && (
        <>
          Expedition<span aria-hidden> · </span>
        </>
      )}
      {card}/{size}
    </span>
  );
}

function StudyChips({
  due,
  newAvailable,
  newIntroduced,
  fact,
}: {
  due: number;
  newAvailable: number;
  newIntroduced: number;
  fact: Fact;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-mid tabular-nums">
      {/* These count the learner's fact, which is not always what the prompt
          beside them is asking. Name it, so the numbers can't be read as the
          other fact's. */}
      {fact === "capital" && (
        <>
          <span className="italic">capitals</span>
          <span aria-hidden>·</span>
        </>
      )}
      <span>
        <span className="font-semibold text-ink-deep">{due}</span> coming back
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

// The way out of "Focus on …": until this, nothing but a change of continents
// ended one. Clearing keeps the card and the round; the next pick reads the
// whole scope again, and the chip going away is the only feedback needed. Its
// own row, only while a focus is on: squeezed in beside the counts it wrapped
// them onto three lines on a phone and was too small to tap.
function FocusChip({
  spotlight,
  onClear,
}: {
  spotlight: string;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`Focus: ${spotlight}, stop`}
      className="basis-full min-h-11 -mx-1.5 px-1.5 rounded text-left text-xs text-ink-mid hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-deep"
    >
      Focus: <span className="text-ink-deep">{spotlight}</span>{" "}
      <span aria-hidden>×</span>
    </button>
  );
}
