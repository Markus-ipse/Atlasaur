import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useGame } from "./game/useGame";
import { WorldMap } from "./components/WorldMap";
import { ControlZone } from "./components/ControlZone";
import { SessionSummary } from "./components/SessionSummary";
import { RoundBreak } from "./components/RoundBreak";
import { ExpeditionResult } from "./components/ExpeditionResult";
import { TodayCard } from "./components/TodayCard";
import { Welcome } from "./components/Welcome";
import { StatusBar } from "./components/StatusBar";
import { Toast } from "./components/Toast";
import { STUDY_NEW_CAP } from "./game/pickCountry";
import countriesData from "./data/countries.json";
import { ALL_CONTINENTS, type Continent, type Country } from "./types";
import { useTheme } from "./theme";
import { readPaletteFromCss } from "./components/fillFor";
import { masteryByContinent, paintTiers } from "./game/srs";

const ALL_COUNTRIES = countriesData as Country[];

// Stable empty reference so WorldMap's neighborSet memo doesn't churn while
// no feedback is showing.
const NO_NEIGHBORS: readonly string[] = [];

// Stable empty reference for when no spotlight is active, so the map's fill
// computation sees a constant set rather than a fresh one each render.
const NO_SPOTLIGHT: ReadonlySet<string> = new Set();

// Stable empty reference for a test round, where the map reports no progress.
const NO_CONTINENT_PROGRESS: ReadonlyMap<
  Continent,
  { known: number; total: number }
> = new Map();

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

  // Ambient mastery paint (R2.1). The tier map is scope-independent — a
  // country keeps the ink it earned even when filtered out, and the map's own
  // inert branch decides whether that ink is shown. The per-continent
  // percentages are scoped, so they follow the continent filter and the
  // territories setting; they count tier 2 only and are unaffected by the
  // collapse below.
  const masteryByIso3 = useMemo(
    () => paintTiers(state.srsStore, state.mode, state.practiceMode),
    [state.srsStore, state.mode, state.practiceMode],
  );
  // The percentages follow the paint: a test round gets a neutral map, and a
  // caption claiming "Europe 46%" over a blank one would contradict it. They
  // cannot leak an answer themselves — they are aggregates — so this is for
  // coherence, not safety.
  const continentProgress = useMemo(
    () =>
      state.practiceMode !== "study"
        ? NO_CONTINENT_PROGRESS
        : masteryByContinent(state.srsStore, ALL_COUNTRIES, game.scopeSet),
    [state.srsStore, game.scopeSet, state.practiceMode],
  );

  // The expedition ignores the continent filter: its ten come from anywhere,
  // so the map frames the world and every country in its own right is
  // clickable (game.isInScope already says so; game.scopeSet stays the
  // learner's own). The selection is untouched and comes back with Study.
  const isExpedition = state.practiceMode === "expedition";
  const frameContinents = isExpedition
    ? ALL_CONTINENTS
    : state.selectedContinents;

  // The engraved hatch belongs to the correct-answer flash that earned it.
  // Gating on the feedback rather than on `state.milestone` alone means no
  // reducer path can strand a mark animating over a country the learner has
  // already moved on from — the reducer clears the field too, but this is the
  // invariant, stated once.
  const hatchIso3 =
    state.feedback?.kind === "correct" ? (state.milestone?.iso3 ?? null) : null;

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
          masteryByIso3={masteryByIso3}
          continentProgress={continentProgress}
          hatchIso3={hatchIso3}
          revealCapitalLonLat={revealCapitalLonLat}
          selectedContinents={frameContinents}
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
      {state.sessionDone && isExpedition && state.expedition && (
        <ExpeditionResult
          store={state.expedition}
          streakDay={game.streak.day}
          nameFromIso3={game.nameFromIso3}
          onClose={() => game.setPracticeMode("study")}
        />
      )}
      {state.sessionDone && !isExpedition && (
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
          expedition={game.expeditionToday}
          onExpedition={game.startExpedition}
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
          expedition={game.expeditionToday}
          onExpedition={() => {
            game.dismissTodayCard();
            game.startExpedition();
          }}
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
