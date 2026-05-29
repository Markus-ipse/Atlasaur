import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useGame } from "./game/useGame";
import { WorldMap } from "./components/WorldMap";
import { ControlZone } from "./components/ControlZone";
import { SessionSummary } from "./components/SessionSummary";
import { StatusBar } from "./components/StatusBar";
import { STUDY_NEW_CAP } from "./game/pickCountry";
import countriesData from "./data/countries.json";
import type { Country } from "./types";
import { useTheme } from "./theme";
import { readPaletteFromCss } from "./components/fillFor";

const ALL_COUNTRIES = countriesData as Country[];

// Stable empty reference so WorldMap's neighborSet memo doesn't churn while
// no feedback is showing.
const NO_NEIGHBORS: readonly string[] = [];

export default function App() {
  const game = useGame();
  const { state } = game;
  const { pref: themePref, theme, setPref: setThemePref } = useTheme();
  // Palette is resolved from the @theme CSS custom properties at mount and
  // re-read whenever the theme flips. Initial mount sees the right tokens
  // because index.html's pre-paint script sets data-theme synchronously
  // before React mounts. On theme toggle, useTheme's useLayoutEffect runs
  // before this one (declaration order within App) so getComputedStyle
  // sees the new tokens.
  const [palette, setPalette] = useState(readPaletteFromCss);
  useLayoutEffect(() => {
    setPalette(readPaletteFromCss());
  }, [theme]);

  const highlightedIso3 =
    state.mode === "shape-to-name" ? state.current.iso3 : null;

  // True during a wrong/skipped reveal — drives all the elaborative-encoding
  // cues (neighbor tint, capital dot). False when no feedback or a correct
  // answer (which gets only the ephemeral flash).
  const isMissReveal =
    state.feedback !== null && state.feedback.kind !== "correct";

  const correctNeighborIso3s = isMissReveal
    ? state.current.neighbors
    : NO_NEIGHBORS;

  const revealCapitalLonLat = isMissReveal
    ? state.current.capitalLonLat
    : null;

  const scopeIso3s = useMemo(() => {
    const cset = new Set(state.selectedContinents);
    const out = new Set<string>();
    for (const c of ALL_COUNTRIES) {
      if (cset.has(c.continent)) out.add(c.iso3);
    }
    return out;
  }, [state.selectedContinents]);

  // CaughtUp banner state — lifted so the map can also gate clicks
  // while it's showing. Auto-clears once the user picks up work
  // (something becomes due, or they flip practice mode).
  const caughtUpEligible =
    state.practiceMode === "study" &&
    !state.feedback &&
    game.dueCount === 0 &&
    state.newIntroducedThisStretch >= STUDY_NEW_CAP;
  const [caughtUpAck, setCaughtUpAck] = useState(false);
  useEffect(() => {
    if (!caughtUpEligible) setCaughtUpAck(false);
  }, [caughtUpEligible]);
  const showCaughtUp = caughtUpEligible && !caughtUpAck;

  return (
    <div className="h-dvh w-full flex overflow-hidden bg-parchment-base text-ink-deep portrait:flex-col landscape:flex-row pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <h1 className="sr-only">Atlasaur</h1>
      <StatusBar
        game={game}
        className="hidden portrait:flex px-3 pt-3 bg-parchment-base"
        themePref={themePref}
        onSetThemePref={setThemePref}
      />
      <div className="relative flex-1 min-h-0 min-w-0">
        <WorldMap
          mode={state.mode}
          highlightedIso3={highlightedIso3}
          feedback={state.feedback}
          showLabelsOnReveal={
            // Study mode forces reveal labels on for elaborative encoding.
            state.practiceMode === "study" ? true : game.showLabelsOnReveal
          }
          correctNeighborIso3s={correctNeighborIso3s}
          revealCapitalLonLat={revealCapitalLonLat}
          selectedContinents={state.selectedContinents}
          isoFromNumeric={game.isoFromNumeric}
          numericFromIso3={game.numericFromIso3}
          isInScope={game.isInScope}
          onCountryClick={game.answer}
          interactive={!showCaughtUp}
          palette={palette}
        />
      </div>
      <ControlZone
        game={game}
        showCaughtUp={showCaughtUp}
        onAckCaughtUp={() => setCaughtUpAck(true)}
        themePref={themePref}
        onSetThemePref={setThemePref}
      />
      {state.sessionDone && (
        <SessionSummary
          practiceMode={state.practiceMode}
          score={state.score}
          total={state.total}
          missed={state.missed}
          unlearnedCount={game.unlearnedCount}
          completedCount={game.completedInScopeCount}
          totalInScope={game.totalInScope}
          dueCount={game.dueCount}
          newAvailableCount={game.newAvailableCount}
          srsStore={state.srsStore}
          scopeIso3s={scopeIso3s}
          onReview={game.startReview}
          onPlayAgain={game.reset}
          onStartQuiz={() => game.setPracticeMode("quiz")}
          onKeepStudying={game.closeSummary}
        />
      )}
    </div>
  );
}
