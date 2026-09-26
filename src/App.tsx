import { useLayoutEffect, useMemo, useState } from "react";
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
import {
  focusHidesProgress,
  masteryByContinent,
  paintsProgress,
  paintTiers,
} from "./game/srs";
import { isTypedMode } from "./game/questionModes";

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

  // The typed modes are exactly the ones that highlight: both name a country
  // the learner is being asked ABOUT, so showing which one is the question,
  // not the answer.
  const highlightedIso3 = isTypedMode(state.mode) ? state.current.iso3 : null;

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

  // Countries inside the active spotlight subregion — the map sets the rest
  // of the scope back (fillFor). Empty stable set when no spotlight is active.
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
  // Keyed on the location records rather than the whole store, which is what
  // withGrade's identity preservation is for: a capital answer leaves this
  // memo — and so every fill on the map — untouched.
  const locationRecords = state.srsStore.facts.location;
  const masteryByIso3 = useMemo(
    () =>
      paintTiers(
        locationRecords,
        state.mode,
        state.practiceMode,
        state.spotlightSubregion,
      ),
    [locationRecords, state.mode, state.practiceMode, state.spotlightSubregion],
  );
  // The percentages follow the paint, through the same predicate: a test
  // round, Capital → Click and a Name → Click focus all get a neutral map,
  // and a caption claiming
  // "Europe 46%" over a blank one would contradict it. They cannot leak an
  // answer themselves — they are aggregates — so this is for coherence, not
  // safety.
  const continentProgress = useMemo(
    () =>
      !paintsProgress(state.mode, state.practiceMode, state.spotlightSubregion)
        ? NO_CONTINENT_PROGRESS
        : masteryByContinent(locationRecords, ALL_COUNTRIES, game.scopeSet),
    [
      locationRecords,
      game.scopeSet,
      state.mode,
      state.practiceMode,
      state.spotlightSubregion,
    ],
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
  // invariant, stated once. No hatch during a Name → Click focus either: the
  // map carries no progress then, so no pigment would land after it.
  const hatchIso3 =
    state.feedback?.kind === "correct" &&
    !focusHidesProgress(state.mode, state.spotlightSubregion)
      ? (state.milestone?.iso3 ?? null)
      : null;

  // Nothing due and no new card can be asked: the scheduler has no more
  // work. Not when unseen cards wait only on the new-card allowance, which
  // Keep going refills (game.newCapReached). Drives the summary's Keep going
  // copy and, with a round that ended early, the RoundBreak's "That's
  // everything for now" variant.
  const caughtUp =
    state.practiceMode === "study" &&
    game.dueCount === 0 &&
    state.newIntroducedThisStretch >= STUDY_NEW_CAP &&
    !game.newCapReached &&
    // A queued miss is the next card, so there is something to go on to.
    !game.missQueued;
  // The CaughtUp banner asks before a fresh round opens on a filler card,
  // where no earlier screen has asked already (the round break, the rest card
  // and the Today card each count as the choice). Inside a round the reducer
  // ends the round instead, so the banner never interrupts one. Keep going anyway
  // — here or on an early break — accepts filler for the rest of the sitting,
  // which is also what stops the banner asking twice.
  const showCaughtUp =
    game.onlyFiller &&
    !state.fillerAccepted &&
    !state.feedback &&
    state.roundCards === 0 &&
    !state.roundDone &&
    !state.sessionDone;
  const showRoundBreak = state.roundDone && !state.sessionDone;
  const showTodayCard =
    game.showTodayCard && !state.sessionDone && !showRoundBreak;
  const showWelcome = game.showWelcome && !state.sessionDone;
  const modalOpen =
    state.sessionDone || showRoundBreak || showTodayCard || showWelcome;

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
        onAckCaughtUp={game.acceptFiller}
        themePref={themePref}
        onSetThemePref={setThemePref}
      />
      </div>
      {state.sessionDone && isExpedition && state.expedition && (
        <ExpeditionResult
          store={state.expedition}
          streakDay={game.streak.day}
          nameFromIso3={game.nameFromIso3}
          lookDone={state.expeditionLookDone}
          onReview={game.startReview}
          onClose={() => game.setPracticeMode("study")}
        />
      )}
      {state.sessionDone && !isExpedition && (
        <SessionSummary
          practiceMode={state.practiceMode}
          test={game.testTally}
          missed={state.missed}
          foundIso3s={state.completedSet}
          unlearnedCount={game.unlearnedCount}
          totalInScope={game.totalInScope}
          dueCount={game.dueCount}
          nextBack={game.nextBack}
          caughtUp={caughtUp}
          spotlightSubregion={state.spotlightSubregion}
          newAvailableCount={game.newAvailableCount}
          srsStore={state.srsStore}
          sittingCards={state.sittingCards}
          sittingRight={state.sittingRight}
          sittingNew={state.sittingNew}
          sittingRecovered={state.sittingRecovered.size}
          missQueued={game.missQueued}
          progressSaved={game.progressSaved}
          fact={game.fact}
          scopeIso3s={game.scopeSet}
          selectedContinents={state.selectedContinents}
          includeTerritories={state.includeTerritories}
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
          includeTerritories={state.includeTerritories}
          onStartBig={() => {
            // Every door starts on locations, which is what the welcome's own
            // chip filter assumes. The question mode is a preference that
            // survives "Erase all progress", so without this a learner who
            // erased from a capital mode would meet the welcome and be dropped
            // straight into capital prompts.
            game.setMode("name-to-click");
            game.setPracticeMode("study");
            game.setContinents(ALL_CONTINENTS);
            game.dismissWelcome();
          }}
          onStartRegion={(continents) => {
            game.setMode("name-to-click");
            game.setPracticeMode("study");
            game.setContinents(continents);
            game.dismissWelcome();
          }}
          onStartTest={() => {
            // The door promises "test all N countries", counted by Welcome
            // over every continent in Name → Click: a scope narrowed before this
            // profile was wiped (or on a pre-welcome install) must not
            // silently shrink it, and a question mode carried over from
            // before the wipe must not change what is being tested.
            game.setMode("name-to-click");
            game.setContinents(ALL_CONTINENTS);
            game.setPracticeMode("quiz");
            game.dismissWelcome();
          }}
        />
      )}
      {showTodayCard && (
        <TodayCard
          dueCount={game.dueCount}
          nextBack={game.nextBack}
          newToday={Math.min(STUDY_NEW_CAP, game.newAvailableCount)}
          day={game.streak.day}
          expedition={game.expeditionToday}
          onExpedition={() => {
            game.dismissTodayCard();
            game.startExpedition();
          }}
          capitalOffer={game.capitalOffer}
          onTryCapitals={() => {
            game.dismissTodayCard();
            game.setMode("country-to-capital");
          }}
          // Escape and the backdrop close the card without choosing anything.
          onDismiss={game.dismissTodayCard}
          onBegin={() => {
            // With nothing waiting the card has already said a round anyway
            // keeps the hand in; Begin is that choice, so the CaughtUp banner
            // must not ask it again.
            if (game.onlyFiller) game.acceptFiller();
            game.dismissTodayCard();
          }}
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
          test={game.testTally}
          phase={state.phase}
          caughtUp={(caughtUp || state.roundEndedEarly) && !game.newCapReached}
          newCapReached={game.newCapReached}
          // Not in a focus: the offer counts the whole scope's countries, and
          // picks would stay in the region.
          capitalOffer={
            state.spotlightSubregion === null ? game.capitalOffer : null
          }
          onTryCapitals={() => {
            // Switch first, so the round carries on with capital cards rather
            // than continuing onto the location filler picked for the break.
            game.setMode("country-to-capital");
            game.continueRound();
          }}
          spotlightSubregion={state.spotlightSubregion}
          onLeaveFocus={() => {
            // Leave first, so the next round starts on the whole scope's
            // work rather than on the region filler picked for the break.
            game.clearSpotlight();
            game.continueRound();
          }}
          nextBack={game.nextBack}
          onKeepGoing={game.continueRound}
          onDone={game.endSession}
        />
      )}
      {state.transientMessage && <Toast message={state.transientMessage} />}
    </div>
  );
}
