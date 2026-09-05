import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useGame } from "./game/useGame";
import { WorldMap } from "./components/WorldMap";
import { ControlZone } from "./components/ControlZone";
import { SessionSummary } from "./components/SessionSummary";
import { RoundBreak } from "./components/RoundBreak";
import { TodayCard } from "./components/TodayCard";
import { Welcome } from "./components/Welcome";
import { StatusBar } from "./components/StatusBar";
import { Toast } from "./components/Toast";
import { STUDY_NEW_CAP } from "./game/pickCountry";
import countriesData from "./data/countries.json";
import { ALL_CONTINENTS, type Country } from "./types";
import { useTheme } from "./theme";
import { readPaletteFromCss } from "./components/fillFor";

const ALL_COUNTRIES = countriesData as Country[];

// Stable empty reference so WorldMap's neighborSet memo doesn't churn while
// no feedback is showing.
const NO_NEIGHBORS: readonly string[] = [];

// Stable empty reference for when no spotlight is active, so the map's fill
// computation sees a constant set rather than a fresh one each render.
const NO_SPOTLIGHT: ReadonlySet<string> = new Set();

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

  // Countries inside the active spotlight subregion — drives the ambient
  // map tint. Empty stable set when no spotlight is active.
  const spotlightIso3Set = useMemo(() => {
    if (state.spotlightSubregion === null) return NO_SPOTLIGHT;
    const out = new Set<string>();
    for (const c of ALL_COUNTRIES) {
      if (c.subregion === state.spotlightSubregion) out.add(c.iso3);
    }
    return out;
  }, [state.spotlightSubregion]);

  // Nothing due and today's new cards introduced: the scheduler has no
  // more work. Surfaced two ways — the RoundBreak's "That's everything for
  // today" variant at a round boundary, and the CaughtUp banner when a
  // fresh round starts in that state (e.g. after closing the summary). The
  // banner never interrupts a round in progress: the picker's most-overdue
  // fallback fills the remaining cards instead.
  const caughtUp =
    state.practiceMode === "study" &&
    game.dueCount === 0 &&
    state.newIntroducedThisStretch >= STUDY_NEW_CAP;
  const caughtUpEligible =
    caughtUp && !state.feedback && state.roundCards === 0 && !state.roundDone;
  const [caughtUpAck, setCaughtUpAck] = useState(false);
  useEffect(() => {
    if (!caughtUpEligible) setCaughtUpAck(false);
  }, [caughtUpEligible]);
  const showCaughtUp = caughtUpEligible && !caughtUpAck;
  const showRoundBreak = state.roundDone && !state.sessionDone;
  const showTodayCard =
    game.showTodayCard && !state.sessionDone && !showRoundBreak;
  const showWelcome = game.showWelcome && !state.sessionDone;
  const modalOpen =
    state.sessionDone || showRoundBreak || showTodayCard || showWelcome;
  const keepGoing = () => {
    // "Keep going anyway" from a caught-up break already answered the
    // question the banner would ask; don't ask twice.
    if (caughtUp) setCaughtUpAck(true);
    game.continueRound();
  };

  return (
    <div className="h-dvh w-full flex overflow-hidden bg-parchment-base text-ink-deep portrait:flex-col landscape:flex-row pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <h1 className="sr-only">Atlasaur</h1>
      {/* Everything behind a dialog is inert while one is up, so Tab can't
          reach the status bar or settings under the scrim and a keyboard
          user can only take one of the dialog's own actions. `contents`
          keeps the flex layout of the three children intact. */}
      <div className="contents" inert={modalOpen}>
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
          correctNeighborIso3s={correctNeighborIso3s}
          spotlightIso3Set={spotlightIso3Set}
          revealCapitalLonLat={revealCapitalLonLat}
          selectedContinents={state.selectedContinents}
          isoFromNumeric={game.isoFromNumeric}
          numericFromIso3={game.numericFromIso3}
          isInScope={game.isInScope}
          onCountryClick={game.answer}
          interactive={
            !showCaughtUp && !state.roundDone && !showTodayCard && !showWelcome
          }
          targetIso3={state.current.iso3}
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
      </div>
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
          scopeIso3s={game.scopeSet}
          countries={ALL_COUNTRIES}
          onReview={game.startReview}
          onPlayAgain={game.reset}
          onStartTest={() => game.setPracticeMode("quiz")}
          onBackToStudy={() => game.setPracticeMode("study")}
          onKeepStudying={game.closeSummary}
          onSetSpotlight={game.setSpotlight}
        />
      )}
      {showWelcome && (
        <Welcome
          onStartBig={() => {
            game.setPracticeMode("study");
            game.setContinents(ALL_CONTINENTS);
            game.dismissWelcome();
          }}
          onStartRegion={(continents) => {
            game.setPracticeMode("study");
            game.setContinents(continents);
            game.dismissWelcome();
          }}
          onStartTest={() => {
            // "Test me" promises everything: a scope narrowed before this
            // profile was wiped (or on a pre-welcome install) must not
            // silently shrink it.
            game.setContinents(ALL_CONTINENTS);
            game.setPracticeMode("quiz");
            game.dismissWelcome();
          }}
        />
      )}
      {showTodayCard && (
        <TodayCard
          dueCount={game.dueCount}
          newToday={Math.min(STUDY_NEW_CAP, game.newAvailableCount)}
          day={game.streak.day}
          onBegin={game.dismissTodayCard}
        />
      )}
      {showRoundBreak && (
        <RoundBreak
          practiceMode={state.practiceMode}
          roundsCompleted={state.roundsCompleted}
          streakDay={game.streak.day}
          roundCards={state.roundCards}
          roundRight={state.roundRight}
          roundNew={state.roundNew}
          caughtUp={caughtUp}
          onKeepGoing={keepGoing}
          onDone={game.endSession}
        />
      )}
      {state.transientMessage && <Toast message={state.transientMessage} />}
    </div>
  );
}
