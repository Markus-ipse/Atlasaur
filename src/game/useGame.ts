import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import countriesData from "../data/countries.json";
import { normalize } from "../data/normalize";
import { pickRandom, pickNext, pickNextStudy, STUDY_NEW_CAP } from "./pickCountry";
import {
  dueCount as srsDueCount,
  emptyStore,
  grade as srsGrade,
  loadSeenIntro,
  loadSeenWelcome,
  loadStore,
  masteryTierOf,
  newAvailableCount as srsNewAvailableCount,
  nextDueAt as srsNextDueAt,
  saveSeenIntro,
  saveSeenWelcome,
  saveStore,
  clearStore,
  hasAnyRecord,
  withGrade,
  isDue,
} from "./srs";
import { factOf, isClickMode } from "./questionModes";
import { nextBackLine } from "./nextBack";
import { capitalOffer, type CapitalOffer } from "./offer";
import { milestoneFor, streakNote, type Milestone } from "./milestones";
import {
  EXPEDITION_STORAGE_KEY,
  expeditionPool,
  expeditionStatus,
  foundCount,
  isFinished as expeditionFinished,
  loadExpedition,
  newExpedition,
  parseExpedition,
  recordOutcome,
  saveExpedition,
  supersedes as expeditionSupersedes,
  type ExpeditionStatus,
  type ExpeditionStore,
} from "./expedition";
import {
  emptyCounters,
  loadCounters,
  recordAnswer,
  recordKnown,
  recordRoundFinished,
  recordRoundStarted,
  recordSessionEnded,
  returnInfo,
  saveCounters,
  startSession,
  type Counters,
  type ReturnInfo,
} from "./counters";
import { appendOutcome, clearOutcomes } from "./outcomes";
import { testTally as computeTestTally, type TestTally } from "./testTally";
import {
  dayKey,
  emptyStreak,
  loadStreak,
  recordDay,
  saveStreak,
  streakInfo,
  type StreakInfo,
} from "./streak";
import {
  ALL_CONTINENTS,
  QUESTION_MODES,
  type Continent,
  type Country,
  type Ease,
  type Fact,
  type Feedback,
  type FeedbackKind,
  type PracticeMode,
  type QuestionMode,
  type Phase,
  type RetryEntry,
  type SrsRecords,
  type SrsStore,
  type Subregion,
} from "../types";

const COUNTRIES = countriesData as Country[];
const ISO3_BY_NUMERIC = new Map(COUNTRIES.map((c) => [c.numeric, c.iso3]));
const NUMERIC_BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c.numeric]));
const COUNTRY_BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));
// The Daily Expedition draws from every country in its own right, whatever
// the learner's continent filter or territories setting says: everyone gets
// the same ten. Territories are never asked.
const EXPEDITION_POOL = expeditionPool(COUNTRIES);
const EXPEDITION_ISO3S: ReadonlySet<string> = new Set(
  EXPEDITION_POOL.map((c) => c.iso3),
);
// What the map can ask during an expedition; also what a stored ten is
// validated against, so a set this build cannot ask (a country since tagged
// as a territory, say) is discarded rather than presented as an inert card.
const isExpeditionIso3 = (iso3: string) => EXPEDITION_ISO3S.has(iso3);

const CONTINENTS_STORAGE_KEY = "atlasaur:selectedContinents";
const TERRITORIES_STORAGE_KEY = "atlasaur:includeTerritories";
const QUESTION_MODE_STORAGE_KEY = "atlasaur:questionMode";

function loadIncludeTerritories(): boolean {
  try {
    return window.localStorage.getItem(TERRITORIES_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveIncludeTerritories(value: boolean): void {
  try {
    window.localStorage.setItem(TERRITORIES_STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
}

// A round is a presentation boundary, not a scheduling one: every
// ROUND_SIZE cards the app pauses on a small interstitial (RoundBreak) with
// "Keep going" / "Done for now". FSRS picks and the Quiz retry queue are
// untouched by it.
export const ROUND_SIZE = 12;

// The learnable pool: the selected continents, minus dependent territories
// and uninhabited land unless the learner has opted them in, minus anything
// the fact cannot be asked about. The single scope predicate — every count,
// picker and map fill derives from it.
//
// The fact matters because a handful of rows have no capital at all
// (Antarctica, the French Southern Territories). Without dropping them, a
// capital test round with territories on could never finish.
export function filterPool(
  continents: readonly Continent[],
  includeTerritories: boolean,
  fact: Fact,
): Country[] {
  const set = new Set(continents);
  return COUNTRIES.filter(
    (c) =>
      set.has(c.continent) &&
      (includeTerritories || !c.territory) &&
      (fact !== "capital" || c.capital !== null),
  );
}

// Whether a continent has anything to ask under this setting and fact. One
// predicate behind every chip: it hides a chip with nothing askable and
// drives the settings menu's "keep at least one" lock. Generalises what used
// to be a hard-coded Antarctica case.
export function continentAskable(
  continent: Continent,
  includeTerritories: boolean,
  fact: Fact,
): boolean {
  return filterPool([continent], includeTerritories, fact).length > 0;
}

// The selection is the learner's choice of continents and is kept as-is
// across the territories toggle (Antarctica stays selected while hidden, so
// switching territories back on restores exactly what they had). The one
// correction: a selection whose pool is empty (Antarctica alone, territories
// off) falls back to the whole world rather than stranding the learner.
// Used at load and on every scope change, so persisted state from before
// the setting existed loads cleanly too.
function normalizeScope(
  continents: readonly Continent[],
  includeTerritories: boolean,
  fact: Fact,
): { continents: readonly Continent[]; pool: Country[] } {
  const pool = filterPool(continents, includeTerritories, fact);
  if (pool.length > 0) return { continents, pool };
  return {
    continents: ALL_CONTINENTS,
    pool: filterPool(ALL_CONTINENTS, includeTerritories, fact),
  };
}

function loadContinents(): readonly Continent[] {
  const valid = new Set<Continent>(ALL_CONTINENTS);
  try {
    const raw = window.localStorage.getItem(CONTINENTS_STORAGE_KEY);
    if (!raw) return ALL_CONTINENTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ALL_CONTINENTS;
    const filtered = parsed.filter(
      (v): v is Continent => valid.has(v),
    );
    return filtered.length > 0 ? filtered : ALL_CONTINENTS;
  } catch {
    return ALL_CONTINENTS;
  }
}

function saveContinents(continents: readonly Continent[]): void {
  try {
    window.localStorage.setItem(
      CONTINENTS_STORAGE_KEY,
      JSON.stringify(continents),
    );
  } catch {
    // localStorage may be unavailable (private mode, SSR); ignore.
  }
}

// The question mode IS persisted, unlike practiceMode: it is a standing
// preference (which of the four things you are here to practise), where the
// practice mode is a round you enter deliberately and leave. "Erase all
// progress" leaves it alone, like the continent filter and the theme.
function loadQuestionMode(): QuestionMode {
  try {
    const raw = window.localStorage.getItem(QUESTION_MODE_STORAGE_KEY);
    const valid: readonly string[] = QUESTION_MODES;
    return raw && valid.includes(raw) ? (raw as QuestionMode) : "name-to-click";
  } catch {
    return "name-to-click";
  }
}

function saveQuestionMode(mode: QuestionMode): void {
  try {
    window.localStorage.setItem(QUESTION_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

// name-to-click correct answers hold longer: the on-map "✔ Correct!" badge +
// glow get a beat to land at the click point, and the map's return-to-base
// settle (which fires on dismiss) is delayed with it. shape-to-name (typing)
// keeps the shorter hold — there's no click/zoom there to wait on.
const FEEDBACK_DURATION = { correct: 900, correctNameToClick: 1300 } as const;
// A correct answer that earns a ceremony holds longer, so the hatch has time
// to draw and the line under the country name can actually be read. The
// survey's figure is "a one-second engraved hatch"; this is that plus the
// ordinary flash it replaces.
const MILESTONE_DURATION = 2400;
// A streak note is one short line, so it needs less than the hatch does — but
// more than the ordinary flash, which can be gone before the eye reaches it.
const STREAK_NOTE_DURATION = 1700;
const TOAST_DURATION = 3000;
const RETRY_GAP_MIN = 3;
const RETRY_GAP_MAX = 5;

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const isoFromNumeric = (numeric: string) => ISO3_BY_NUMERIC.get(numeric);
const numericFromIso3 = (iso3: string) => NUMERIC_BY_ISO3.get(iso3);
const nameFromIso3 = (iso3: string): string =>
  COUNTRY_BY_ISO3.get(iso3)?.name ?? iso3;

export function matchTypedName(input: string): string {
  const n = normalize(input);
  if (!n) return "";
  for (const country of COUNTRIES) {
    const candidates = [country.name, ...country.aliases];
    if (candidates.some((c) => normalize(c) === n)) return country.iso3;
  }
  return "";
}

// Every spelling of a country's capital that counts as typing it: the
// capital, any additional capitals (which are real answers, and shown in the
// reveal), and the aliases, which are accepted but never displayed.
function capitalSpellings(country: Country): string[] {
  if (country.capital === null) return [];
  return [
    country.capital,
    ...(country.capitalAlternates ?? []),
    ...(country.capitalAliases ?? []),
  ];
}

// The country a typed capital names, or "" for no match. `current` is checked
// first so a correct answer never resolves elsewhere; after that the whole
// list, so a wrong capital resolves to the country it actually belongs to and
// the map can paint and label THAT country red — the same courtesy
// Shape → Name already does for a wrong country name.
export function matchTypedCapital(input: string, current: Country): string {
  const n = normalize(input);
  if (!n) return "";
  if (capitalSpellings(current).some((c) => normalize(c) === n)) {
    return current.iso3;
  }
  for (const country of COUNTRIES) {
    if (country.iso3 === current.iso3) continue;
    if (capitalSpellings(country).some((c) => normalize(c) === n)) {
      return country.iso3;
    }
  }
  return "";
}


export type State = {
  mode: QuestionMode;
  practiceMode: PracticeMode;
  selectedContinents: readonly Continent[];
  // Persisted (atlasaur:includeTerritories), default off. See filterPool.
  includeTerritories: boolean;
  current: Country;
  score: number;
  streak: number;
  // Ceremony (R2.2): the country that just crossed into "known" on this
  // answer, and the continent it finished if it was the last one in scope.
  // Computed at answer time so the correct-flash can carry it, cleared when
  // the card is dismissed. Study only — a test round is a measurement.
  milestone: Milestone | null;
  total: number;
  missed: Country[];
  missedSet: Set<string>;
  retryQueue: RetryEntry[];
  completedSet: Set<string>;
  phase: Phase;
  feedback: Feedback | null;
  sessionDone: boolean;
  // Study: Done was pressed with no answer given to the card on screen, so
  // closing the summary resumes on it rather than picking past it. The
  // summary's counts include that card, so Keep going's promise ("1 coming
  // back first") holds only if it comes back. Every endSession rewrites it,
  // and Study reaches its summary only through endSession.
  resumeCurrent: boolean;
  srsStore: SrsStore;
  newIntroducedThisStretch: number;
  // Study-only in-session resurface: missed cards come back a few cards
  // later within the same session (the Study analog of Quiz's retryQueue).
  // Kept distinct from retryQueue so it never pollutes unlearnedCount or
  // the Quiz "Review N" affordance. Volatile / in-memory only — not
  // persisted; resets on setPracticeMode and reload.
  studyResurfaceQueue: RetryEntry[];
  // Monotonic count of Study cards advanced this stretch — the clock the
  // resurface queue's `dueAt` compares against. Volatile like the queue.
  studyStep: number;
  // Study-only: a grade scheduled to commit when feedback dismisses
  // (auto-Good on correct, auto-Again on any miss — wrong or "Don't know").
  // Grading is automatic; the user never self-grades. dismissFeedback is
  // the single commit point.
  autoGradePending: Ease | null;
  // Study-only temporary lens: when set, Study picks are narrowed to this
  // subregion. Not persisted — always null on reload. Cleared by
  // setContinents, setPracticeMode("quiz"), clearSpotlight, and the
  // depletion fallback.
  spotlightSubregion: Subregion | null;
  // One-shot toast message (e.g. a focus running out). Auto-dismissed by a
  // timer in the useGame hook; null when nothing is showing.
  transientMessage: string | null;
  // Round accounting (both practice modes). A card counts when its feedback
  // is dismissed, so the correct flash / miss reveal always plays out before
  // a round boundary. All volatile — reset on closeSummary, startReview,
  // setPracticeMode, setMode, reset and reload.
  roundCards: number;
  roundRight: number;
  // Study only: cards introduced for the first time this round.
  roundNew: number;
  // True while the RoundBreak interstitial is up. Never true alongside
  // sessionDone — the summary wins.
  roundDone: boolean;
  // Study: this round stopped short of ROUND_SIZE because the next card
  // would only have been filler (cardIsFiller). Counts as a finished round.
  roundEndedEarly: boolean;
  // Rounds finished this session. The unit R1.3's cross-day streak counts.
  roundsCompleted: number;
  // The sitting: every card since the last summary closed (or the load), as
  // the Study summary reports it. Advanced wherever a round is, plus a card
  // "Done" closes mid-reveal; carried across round breaks, question-mode
  // switches and scope changes; reset wherever a fresh stretch begins
  // (closeSummary, setSpotlight, startReview, setPracticeMode, resetSrs).
  sittingCards: number;
  sittingRight: number;
  // Study only, like roundNew.
  sittingNew: number;
  // Cards missed this sitting, and those of them later answered right in the
  // same sitting — the summary's recovery line. Keyed `${fact}:${iso3}` by
  // the fact the answer graded, so a missed capital followed by a found
  // country is not a recovery. Distinct cards, not answers.
  sittingMissed: ReadonlySet<string>;
  sittingRecovered: ReadonlySet<string>;
  // The learner chose to keep going with nothing useful left (Keep going
  // anyway, from an early round break or the CaughtUp banner). Rounds run to
  // ROUND_SIZE again for the rest of the sitting, or every filler card would
  // end its own one-card round.
  fillerAccepted: boolean;
  // Every card whose feedback has been dismissed, across the profile's life.
  // Monotonic and never reset by a round, a session or a mode flip — the
  // counters (R2.4) read its growth as "one more card answered". `total` is
  // no substitute: it only moves in Quiz's normal phase.
  cardsAnswered: number;
  // The Daily Expedition (R3.1): today's ten and the outcomes so far, or the
  // most recent day's if today has not been started. Persisted by the hook
  // under atlasaur:expedition:v1 whenever it changes, and kept in state in
  // every practice mode so the Today card and the Study summary can offer
  // today's expedition, resume it, or show its result. null on a fresh
  // profile and after "Erase all progress".
  expedition: ExpeditionStore | null;
  // The question mode the learner was in when the expedition started, so
  // leaving it lands them back where they were. An expedition is Name → Click
  // only. null outside an expedition.
  modeBeforeExpedition: QuestionMode | null;
  // The second look at today's misses (#64) ran to its end: every miss was
  // found again. The result card says so and stops offering the look as the
  // default. Volatile; cleared by starting a look and by leaving.
  expeditionLookDone: boolean;
};

export type Action =
  | { type: "answer"; iso3: string; now?: Date }
  | { type: "skip"; now?: Date }
  | { type: "dismiss"; now?: Date }
  | { type: "setMode"; mode: QuestionMode; now?: Date }
  // An expedition is entered only through startExpedition, which carries the
  // day's store; setPracticeMode leaves one, never enters it.
  | { type: "setPracticeMode"; mode: Exclude<PracticeMode, "expedition">; now?: Date }
  | { type: "startExpedition"; store: ExpeditionStore; now?: Date }
  // Another tab wrote the expedition store. Adopted only when it is further
  // along (see `supersedes`); a run in progress here jumps to its card.
  | { type: "syncExpedition"; store: ExpeditionStore | null; now?: Date }
  | { type: "setContinents"; continents: readonly Continent[]; now?: Date }
  | { type: "setIncludeTerritories"; value: boolean; now?: Date }
  | { type: "endSession" }
  | { type: "continueRound"; now?: Date }
  | { type: "acceptFiller" }
  | { type: "startReview" }
  | { type: "resetSrs" }
  | { type: "closeSummary"; now?: Date }
  | { type: "setSpotlight"; subregion: Subregion; now?: Date }
  // Carries a time: leaving a focus can move off a filler card, which
  // depends on what is due.
  | { type: "clearSpotlight"; now?: Date }
  | { type: "setTransientMessage"; message: string }
  | { type: "clearTransientMessage" }
  | { type: "reset" };

// Two fact roles, which differ only during an expedition.
//
// The ANSWER fact is what the card on screen grades and picks against.
export function answerFact(state: Pick<State, "mode">): Fact {
  return factOf(state.mode);
}

// The LEARNER fact is the one they chose to work on. It scopes the pool and
// every figure the app displays — due, new, known, seen, the spotlight offer.
// An expedition forces Name → Click, so while one is up the settings keep
// showing the learner's own fact over the learner's own scope, the same rule
// CLAUDE.md already states for the continent filter.
export function learnerFact(
  state: Pick<State, "mode" | "modeBeforeExpedition">,
): Fact {
  return factOf(state.modeBeforeExpedition ?? state.mode);
}

// The records the current card grades into and is picked from.
function recordsFor(state: State): SrsRecords {
  return state.srsStore.facts[answerFact(state)];
}

function nowOf(action: Action): Date {
  // Reducer-level fallback so tests can dispatch without supplying a
  // clock. Production call sites in `useGame` always pass `now`.
  return "now" in action && action.now ? action.now : new Date();
}

type InitOptions = {
  mode?: QuestionMode;
  practiceMode?: PracticeMode;
  selectedContinents?: readonly Continent[];
  includeTerritories?: boolean;
  srsStore?: SrsStore;
  retryQueue?: RetryEntry[];
  completedSet?: Set<string>;
  expedition?: ExpeditionStore | null;
};

export function initialState(
  modeOrOptions: QuestionMode | InitOptions = {},
  selectedContinentsArg?: readonly Continent[],
): State {
  // Back-compat: tests still call `initialState("name-to-click")` or
  // `initialState("name-to-click", continents)`. New call sites use the
  // options object.
  const options: InitOptions =
    typeof modeOrOptions === "string"
      ? {
          mode: modeOrOptions,
          ...(selectedContinentsArg
            ? { selectedContinents: selectedContinentsArg }
            : {}),
        }
      : modeOrOptions;
  const mode = options.mode ?? "name-to-click";
  // Tests default to "quiz" (the original loop); production always passes
  // an explicit practiceMode from useGame, where Study is the home.
  const practiceMode = options.practiceMode ?? "quiz";
  const includeTerritories = options.includeTerritories ?? false;
  const { continents: selectedContinents, pool } = normalizeScope(
    options.selectedContinents ?? ALL_CONTINENTS,
    includeTerritories,
    factOf(mode),
  );
  const srsStore = options.srsStore ?? emptyStore();
  const current = pickInitialCountry(
    pool,
    practiceMode,
    srsStore.facts[factOf(mode)],
    options.retryQueue ?? [],
    factOf(mode) === "capital"
      ? new Set(
          Object.keys(srsStore.facts.location).filter(
            (iso3) => masteryTierOf(srsStore.facts.location[iso3]) === 2,
          ),
        )
      : NO_PREREQUISITE,
  );
  return {
    mode,
    practiceMode,
    selectedContinents,
    includeTerritories,
    current,
    score: 0,
    streak: 0,
    milestone: null,
    total: 0,
    missed: [],
    missedSet: new Set(),
    retryQueue: options.retryQueue ?? [],
    completedSet: options.completedSet ?? new Set(),
    phase: "normal",
    feedback: null,
    sessionDone: false,
    resumeCurrent: false,
    srsStore,
    newIntroducedThisStretch: 0,
    studyResurfaceQueue: [],
    studyStep: 0,
    autoGradePending: null,
    spotlightSubregion: null,
    transientMessage: null,
    ...FRESH_STRETCH,
    roundsCompleted: 0,
    // Not carried across a rebuild: the persisted counters hold the lifetime
    // total, and the hook records growth, so restarting from 0 is a no-op
    // rather than a double count.
    cardsAnswered: 0,
    expedition: options.expedition ?? null,
    modeBeforeExpedition: null,
    expeditionLookDone: false,
  };
}

const FRESH_ROUND = {
  roundCards: 0,
  roundRight: 0,
  roundNew: 0,
  roundDone: false,
  roundEndedEarly: false,
} as const;

const NO_CARDS: ReadonlySet<string> = new Set();

const FRESH_SITTING = {
  sittingCards: 0,
  sittingRight: 0,
  sittingNew: 0,
  sittingMissed: NO_CARDS,
  sittingRecovered: NO_CARDS,
  fillerAccepted: false,
} as const;

// A fresh stretch (load, leaving a summary, a practice-mode flip, erasing
// progress) starts both a round and a sitting. continueRound and a test
// round's question-mode switch start a round only.
const FRESH_STRETCH = { ...FRESH_ROUND, ...FRESH_SITTING } as const;

// Whether the card whose feedback is open is met for the first time: a Study
// grade is still staged against it and it has no record yet. The one
// definition of "newly seen" for the round and the sitting.
function cardIsNew(state: State): boolean {
  return (
    state.practiceMode === "study" &&
    state.autoGradePending !== null &&
    !recordsFor(state)[state.current.iso3]
  );
}

// Whether the Study card being asked has come back: it already has a record
// for the fact being asked. Derived, never stored, so it cannot drift from
// the counts — pickNextStudy's resurface, due and most-overdue branches all
// require a record and its new-introduction branch requires none, and a
// grade commits in the same step that replaces `current`, so while the
// prompt shows "has a record" is exactly "came back".
//
// Two paths put it on the card just answered: a scope change or a same-fact
// question-mode switch made mid-reveal commits the grade and keeps the card.
// That card is being asked again, which is a return; don't "fix" it with a
// state field.
//
// The pill it drives is one bit about the card and none about any country,
// unlike the tier-1 map wash, which name-to-click collapses because a small
// painted set narrows the answer. A test round and an expedition never show
// it (the retry pass has its own reason, read in ControlZone).
export function cardIsReturning(state: State): boolean {
  return (
    state.practiceMode === "study" &&
    recordsFor(state)[state.current.iso3] !== undefined
  );
}

// Whether the Study card being asked is filler: met before, not due, and not
// a miss from this sitting waiting to come back. Derived, never stored, on
// the same partition as cardIsReturning — the due branch requires isDue, the
// resurface and early-retry branches require a queue entry, the new branch
// requires no record, so only pickNextStudy's most-overdue fallback (or the
// no-pick case, which keeps the card just answered) yields one. advanceCard
// ends the round rather than serve it; the CaughtUp banner asks first when a
// fresh round would open on one.
export function cardIsFiller(state: State, now: Date): boolean {
  if (state.practiceMode !== "study") return false;
  const iso3 = state.current.iso3;
  const rec = recordsFor(state)[iso3];
  return (
    rec !== undefined &&
    !isDue(rec, now) &&
    !state.studyResurfaceQueue.some((e) => e.iso3 === iso3)
  );
}

// Study: the stretch's new-card allowance is what stands between the learner
// and more new cards — STUDY_NEW_CAP is used and unseen cards are still in
// the pool. An explicit Keep going refills it (continueRound, closeSummary),
// so the cap limits new cards per go rather than making a newcomer's ten look
// like "everything".
export function newCapReached(state: State): boolean {
  if (state.practiceMode !== "study") return false;
  if (state.newIntroducedThisStretch < STUDY_NEW_CAP) return false;
  return unseenInPool(state);
}

// Study: the pool still holds a card with no record for the answer fact.
function unseenInPool(state: State): boolean {
  const records = recordsFor(state);
  return studyPool(state).some((c) => !records[c.iso3]);
}

// Whether an explicit Keep going starts a fresh new-card allowance: some of
// it has been used and unseen cards remain. Per round, not only once it is
// spent — otherwise a newcomer who met nine in round one reaches the tenth on
// round two's first card and is cut off after one card.
function allowanceRefills(state: State): boolean {
  return (
    state.practiceMode === "study" &&
    state.newIntroducedThisStretch > 0 &&
    unseenInPool(state)
  );
}

// Start a fresh new-card allowance when allowanceRefills says so. For the
// other explicit ways of carrying on over a different pool — leaving a focus
// and changing scope — so unseen countries they bring in are not held back by
// an allowance spent on the old pool. (Keep going refills through
// withNewAllowance, which also moves off a filler card.)
function withFreshAllowance(state: State): State {
  return allowanceRefills(state)
    ? { ...state, newIntroducedThisStretch: 0 }
    : state;
}

// Study: a miss from this sitting is still queued for a card in the pool.
// It holds a round open even when the card on screen is filler, since the
// pick after it brings the miss back (pickNextStudy's early retry).
function missWaiting(state: State): boolean {
  if (state.studyResurfaceQueue.length === 0) return false;
  const inPool = new Set(studyPool(state).map((c) => c.iso3));
  return state.studyResurfaceQueue.some((e) => inPool.has(e.iso3));
}

// Study: nothing useful is left to ask — the card on screen is filler and no
// miss is waiting to come back after it. The one test for ending a round
// early, for the CaughtUp banner, and for a screen's Keep going counting as
// Keep going anyway.
export function nothingUseful(state: State, now: Date): boolean {
  return (
    cardIsFiller(state, now) && !missWaiting(state) && !usefulInPool(state, now)
  );
}

// Study: something besides the card on screen is worth asking now — a card
// due, or an unseen one while the new-card allowance lasts. Judged over the
// pool, not the card on screen: a scope change, a focus left or time passing
// can bring useful work in without replacing a filler card already picked.
function usefulInPool(state: State, now: Date): boolean {
  const records = recordsFor(state);
  const allowNew = state.newIntroducedThisStretch < STUDY_NEW_CAP;
  return studyPool(state).some((c) => {
    if (c.iso3 === state.current.iso3) return false;
    const rec = records[c.iso3];
    return rec ? isDue(rec, now) : allowNew;
  });
}

// Move off a filler card on screen once something useful is waiting — after
// a scope change or leaving a focus, which keep the card they find.
function offFiller(state: State, now: Date): State {
  if (state.practiceMode !== "study" || state.feedback || state.sessionDone) {
    return state;
  }
  if (!cardIsFiller(state, now)) return state;
  if (!usefulInPool(state, now) && !missWaiting(state)) return state;
  const { current, spotlightSubregion, transientMessage } =
    pickStudyWithSpotlightFallback(state, now);
  return { ...state, current, spotlightSubregion, transientMessage };
}

// Refill the new-card allowance on an explicit Keep going, and move off a
// filler card that was picked while it was spent. Returns `state` itself when
// there is nothing to refill.
function withNewAllowance(state: State, now: Date): State {
  if (!allowanceRefills(state)) return state;
  const refilled: State = { ...state, newIntroducedThisStretch: 0 };
  if (!cardIsFiller(refilled, now)) return refilled;
  const { current, spotlightSubregion, transientMessage } =
    pickStudyWithSpotlightFallback(refilled, now);
  return { ...refilled, current, spotlightSubregion, transientMessage };
}

// The card whose feedback is open, as the sitting keys it. Read from the
// state BEFORE a card advance replaces `current`.
function sittingKey(state: State): string {
  return `${answerFact(state)}:${state.current.iso3}`;
}

// Count one answered card into the sitting. `key` is the answered card's
// sittingKey, taken before any advance.
function withSittingCard(
  state: State,
  kind: FeedbackKind,
  isNew: boolean,
  key: string,
): State {
  const missed = kind !== "correct";
  const recovered = !missed && state.sittingMissed.has(key);
  return {
    ...state,
    sittingCards: state.sittingCards + 1,
    sittingRight: state.sittingRight + (kind === "correct" ? 1 : 0),
    sittingNew: state.sittingNew + (isNew ? 1 : 0),
    sittingMissed:
      missed && !state.sittingMissed.has(key)
        ? new Set(state.sittingMissed).add(key)
        : state.sittingMissed,
    sittingRecovered:
      recovered && !state.sittingRecovered.has(key)
        ? new Set(state.sittingRecovered).add(key)
        : state.sittingRecovered,
  };
}

// Count the card whose feedback just dismissed against the current round,
// and open the interstitial when the round fills. A state that has already
// ended the session (Quiz pool complete, review queue drained) keeps its
// summary; the round is still counted so a "Done for now" straight after
// still credits it.
function withRoundAdvance(
  state: State,
  kind: FeedbackKind,
  isNew: boolean,
  key: string,
): State {
  const roundCards = state.roundCards + 1;
  // A round cut short by advanceCard (nothing useful left) finishes here like
  // a full one: it credits roundsCompleted, so the streak day and the
  // finished-rounds counter treat "you did everything there was" as done.
  const filled = roundCards >= ROUND_SIZE || state.roundEndedEarly;
  return {
    ...withSittingCard(state, kind, isNew, key),
    roundCards,
    cardsAnswered: state.cardsAnswered + 1,
    roundRight: state.roundRight + (kind === "correct" ? 1 : 0),
    roundNew: state.roundNew + (isNew ? 1 : 0),
    roundDone: filled && !state.sessionDone,
    roundsCompleted: filled ? state.roundsCompleted + 1 : state.roundsCompleted,
  };
}

function pickInitialCountry(
  pool: Country[],
  practiceMode: PracticeMode,
  records: SrsRecords,
  retryQueue: readonly RetryEntry[],
  introduceFirst: ReadonlySet<string> = NO_PREREQUISITE,
): Country {
  if (practiceMode === "study") {
    const picked = pickNextStudy({
      pool,
      byIso3: COUNTRY_BY_ISO3,
      excludeIso3: "",
      records,
      introduceFirst,
      now: new Date(),
      newIntroducedThisStretch: 0,
      resurfaceQueue: [],
      step: 0,
    });
    if (picked) return picked;
  }
  return pickRandom(pool, retryQueue[0]?.iso3 ?? null);
}

const NO_PREREQUISITE: ReadonlySet<string> = new Set();

// Countries whose capital is worth introducing now: the ones the learner can
// already place. Knowing where Peru is is what makes "what is its capital"
// the next sensible question, and it is what the capitals door promises
// ("6 countries you already know") — so the scheduler has to serve the same
// set, or the offer is a lie. Empty for the location fact, which has no such
// prerequisite. Matches capitalOffer's `ready` exactly.
function introduceFirst(state: State): ReadonlySet<string> {
  if (answerFact(state) !== "capital") return NO_PREREQUISITE;
  const location = state.srsStore.facts.location;
  const out = new Set<string>();
  for (const iso3 in location) {
    if (masteryTierOf(location[iso3]) === 2) out.add(iso3);
  }
  return out;
}

// The pool a Study pick draws from. Spotlight narrows it to one subregion
// (the narrowing lives here, not in filterPool/pickNextStudy, so it can't
// leak into Quiz's shared pickNext path).
function studyPool(state: State): Country[] {
  const pool = filterPool(
    state.selectedContinents,
    state.includeTerritories,
    answerFact(state),
  );
  return state.spotlightSubregion === null
    ? pool
    : pool.filter((c) => c.subregion === state.spotlightSubregion);
}

function nextCurrent(state: State, now: Date = new Date()): Country {
  if (state.practiceMode === "study") {
    const pool = studyPool(state);
    const picked = pickNextStudy({
      pool,
      byIso3: COUNTRY_BY_ISO3,
      excludeIso3: state.current.iso3,
      records: recordsFor(state),
      introduceFirst: introduceFirst(state),
      now,
      newIntroducedThisStretch: state.newIntroducedThisStretch,
      resurfaceQueue: state.studyResurfaceQueue,
      step: state.studyStep,
    });
    // null = caught-up empty state. Caller surfaces the empty UI; we
    // keep `current` pointing at something to avoid undefined access.
    return picked ?? state.current;
  }
  return pickNext({
    pool: filterPool(
      state.selectedContinents,
      state.includeTerritories,
      answerFact(state),
    ),
    byIso3: COUNTRY_BY_ISO3,
    excludeIso3: state.current.iso3,
    total: state.total,
    retryQueue: state.retryQueue,
    phase: state.phase,
    completedSet: state.completedSet,
  });
}

// Said when a focus runs out. The learner pressed "Focus on …"; "spotlight"
// and "scope" are words they never saw.
function spotlightClearedMessage(subregion: Subregion): string {
  return `Nothing left to focus on in ${subregion} — back to all your regions.`;
}

// Pick the next Study country, falling back to the full continent pool when
// a spotlight has been exhausted. Returns the next `current`, the resulting
// spotlight (cleared to null on depletion), and a transient toast message.
// Callers MUST pass the post-grade state so the re-pick runs against the
// up-to-date SRS store and doesn't re-surface a just-graded country.
function pickStudyWithSpotlightFallback(
  state: State,
  now: Date,
): { current: Country; spotlightSubregion: Subregion | null; transientMessage: string | null } {
  const picked = nextCurrent(state, now);
  // Depletion: the narrowed pool yielded nothing new (picked fell back to
  // the unchanged current). Clear the spotlight, re-pick from full scope.
  // The reference check is exact because pickNextStudy always excludes
  // state.current.iso3 (so a real pick is never === current by identity)
  // and byIso3 returns module-singleton Country objects — picked === current
  // can only mean nextCurrent hit its `picked ?? state.current` null branch.
  if (state.spotlightSubregion !== null && picked === state.current) {
    const widened: State = { ...state, spotlightSubregion: null };
    return {
      current: nextCurrent(widened, now),
      spotlightSubregion: null,
      transientMessage: spotlightClearedMessage(state.spotlightSubregion),
    };
  }
  return {
    current: picked,
    spotlightSubregion: state.spotlightSubregion,
    transientMessage: null,
  };
}

// A test round and an expedition grade at answer time (Study defers to
// dismiss). Only in the normal phase: a review pass would double-count the
// miss retryQueue already tracks. An expedition's second look at its misses
// (#64) is a review pass too, and writes nothing for the same reason.
function applyImmediateSrsWriteThrough(
  state: State,
  iso3: string,
  ease: Ease,
  now: Date,
): SrsStore {
  if (state.practiceMode === "study" || state.phase !== "normal") {
    return state.srsStore;
  }
  const next = srsGrade(recordsFor(state)[iso3] ?? null, ease, now);
  return withGrade(state.srsStore, answerFact(state), iso3, next);
}

// Close the card whose feedback is on screen, on a path that does not go
// through dismissFeedback and then CARRIES ON in the same round: a scope
// change, or a question-mode switch. Commits a Study grade still in flight
// and counts the card into its round — without this a twelve-card round
// quietly needs thirteen answers, and the break's "N right" is short by one.
//
// `cardsAnswered` is deliberately left alone. applyScope counts it at its own
// return, which also covers a test round's answer (no grade is in flight
// there — it was written at answer time); the question-mode switch is counted
// by the hook instead, against the mode the answer was actually given in,
// because the counters effect reads a ref that already holds the new one.
//
// endSession and startExpedition commit a grade too, but the round ends with
// them, so they only count the answer and leave the round where it stopped.
function closeCardIntoRound(state: State, now: Date): State {
  // An expedition takes every credit at answer time and never advances a
  // round here; dismissFeedback skips withRoundAdvance for it too.
  if (!state.feedback || state.practiceMode === "expedition") return state;
  const kind = state.feedback.kind;
  const isNew = cardIsNew(state);
  const key = sittingKey(state);
  const pending = state.practiceMode === "study" && state.autoGradePending;
  const committed: State = pending
    ? {
        ...state,
        ...commitStudyGrade(state, state.autoGradePending!, state.studyStep, now),
        autoGradePending: null,
      }
    : state;
  return {
    ...withRoundAdvance(committed, kind, isNew, key),
    cardsAnswered: committed.cardsAnswered,
  };
}

function poolComplete(
  pool: readonly Country[],
  completedSet: ReadonlySet<string>,
  retryQueue: readonly RetryEntry[],
): boolean {
  if (retryQueue.length > 0) return false;
  return pool.every((c) => completedSet.has(c.iso3));
}

// Apply a new scope (continents and/or the territories setting): prune the
// in-session queues to it, replace a current card that fell out of it, and
// end a review or a completed Quiz pool that the narrowing finished off.
// SRS records are never touched — out-of-scope due cards resurface when the
// learner widens scope again.
// A scope change also clears Keep going anyway — the learner agreed to
// repeats from the pool as it was — starts a fresh new-card allowance while
// unseen cards remain, and moves off a filler card when the new pool has
// something useful waiting.
function applyScope(
  state: State,
  continents: readonly Continent[],
  includeTerritories: boolean,
  now: Date,
): State {
  return offFiller(
    withFreshAllowance({
      ...applyScopeKeepingCard(state, continents, includeTerritories, now),
      fillerAccepted: false,
    }),
    now,
  );
}

function applyScopeKeepingCard(
  state: State,
  continents: readonly Continent[],
  includeTerritories: boolean,
  now: Date,
): State {
  // A reveal that is open when the scope changes belongs to an answer the
  // learner gave. Commit any deferred grade (as endSession does) so it reaches
  // the SRS store instead of vanishing with the feedback, and count the card
  // into the round it was part of — the round carries on across a scope change.
  state = closeCardIntoRound(state, now);
  const normalized = normalizeScope(
    continents,
    includeTerritories,
    learnerFact(state),
  );
  continents = normalized.continents;
  const pool = normalized.pool;
  const inScope = new Set(pool.map((c) => c.iso3));
  const retryQueue = state.retryQueue.filter((e) => inScope.has(e.iso3));
  const studyResurfaceQueue = state.studyResurfaceQueue.filter((e) =>
    inScope.has(e.iso3),
  );
  if (state.practiceMode === "expedition") {
    // The expedition ignores scope by design: the ten are the same for
    // everyone. The setting is kept, and the queues pruned, for when the
    // learner comes back to studying; the current card and the reveal stay
    // where they are.
    return {
      ...state,
      selectedContinents: continents,
      includeTerritories,
      // A second look at the misses (#64) asks today's ten, which ignore
      // scope as the expedition does, so its queue is not pruned.
      retryQueue: state.phase === "review" ? state.retryQueue : retryQueue,
      studyResurfaceQueue,
    };
  }
  // A current card that fell out of scope is replaced: during a review pass
  // by the next queued retry (a review only ever asks queued cards); in
  // Study by the scheduler (so "Pick a region" on the welcome still starts
  // with the region's big ones, not a random island); in Quiz at random.
  let current = state.current;
  if (!inScope.has(state.current.iso3)) {
    const reviewNext =
      state.phase === "review" && retryQueue.length > 0
        ? COUNTRY_BY_ISO3.get(retryQueue[0].iso3)
        : undefined;
    if (reviewNext) {
      current = reviewNext;
    } else if (state.practiceMode === "study") {
      const scoped: State = {
        ...state,
        selectedContinents: continents,
        includeTerritories,
        studyResurfaceQueue,
        spotlightSubregion: null,
      };
      const picked = nextCurrent(scoped, now);
      // nextCurrent hands back the (out-of-scope) current when the
      // scheduler has nothing to offer — nothing due and the new-card cap
      // for this stretch already spent; fall back to a random pick.
      current = picked === state.current ? pickRandom(pool, null) : picked;
    } else {
      current = pickRandom(pool, null);
    }
  }
  // completedSet is preserved across scope changes — out-of-scope entries
  // don't affect poolComplete (which only checks pool ∩ set) and the
  // displayed count is derived against the active scope.
  const reviewEmpty = state.phase === "review" && retryQueue.length === 0;
  const poolDone =
    state.phase === "normal" &&
    state.practiceMode === "quiz" &&
    poolComplete(pool, state.completedSet, retryQueue);
  return {
    ...state,
    selectedContinents: continents,
    includeTerritories,
    current,
    retryQueue,
    studyResurfaceQueue,
    feedback: null,
    // An answer whose feedback this closes still reached the store, so it
    // counts — the same reasoning as endSession above.
    cardsAnswered: state.feedback
      ? state.cardsAnswered + 1
      : state.cardsAnswered,
    // Wipe in-flight Study-mode grade state: feedback is gone and `current`
    // may have changed, so a leftover autoGradePending would target a
    // country the user can no longer see. The ceremony goes with it.
    autoGradePending: null,
    milestone: null,
    // Scope change supersedes any active spotlight lens.
    spotlightSubregion: null,
    phase: reviewEmpty ? "normal" : state.phase,
    sessionDone: reviewEmpty || poolDone ? true : state.sessionDone,
    // The summary wins over the round break.
    roundDone: reviewEmpty || poolDone ? false : state.roundDone,
  };
}

function withoutIso3(queue: readonly RetryEntry[], iso3: string): RetryEntry[] {
  return queue.filter((e) => e.iso3 !== iso3);
}

function applyMiss(
  state: State,
  current: Country,
  kind: Extract<FeedbackKind, "wrong" | "skipped">,
  answerIso3: string,
  now: Date,
): State {
  const correctIso3 = current.iso3;
  const feedback: Feedback = {
    kind,
    answerIso3,
    correctIso3,
    at: now.getTime(),
  };

  if (state.practiceMode === "study") {
    // Study mode doesn't touch session counters or retryQueue. Both a
    // wrong answer and a skip ("Don't know") schedule an auto-Again for
    // dismiss-time; the reveal advances on a single "Got it" with no
    // self-grading. The resurface enqueue happens at commit time in
    // dismissFeedback, keyed off autoGradePending === "Again".
    //
    // The run of correct answers breaks here. Study keeps `streak` for the
    // ceremony copy only — no counter is shown, so a broken run is silent.
    return { ...state, streak: 0, feedback, autoGradePending: "Again" };
  }

  // Quiz mode.
  const srsStore = applyImmediateSrsWriteThrough(
    state,
    correctIso3,
    "Again",
    now,
  );

  if (
    state.practiceMode === "expedition" &&
    state.expedition &&
    state.phase === "normal"
  ) {
    // The outcome is recorded at answer time, not at dismiss, so an
    // expedition abandoned mid-reveal keeps this answer; it resumes on the
    // next card. The answer is counted now too, while the mode it was given
    // in is still current. A skip is a miss, and an empty glyph.
    return {
      ...state,
      streak: 0,
      feedback,
      srsStore,
      ...withExpeditionOutcome(state, "missed"),
    };
  }

  if (state.phase === "review") {
    return {
      ...state,
      streak: 0,
      retryQueue: [
        ...withoutIso3(state.retryQueue, correctIso3),
        { iso3: correctIso3, dueAt: state.total },
      ],
      feedback,
      srsStore,
    };
  }

  const newTotal = state.total + 1;
  const alreadyMissed = state.missedSet.has(correctIso3);
  const dueAt = newTotal + randInt(RETRY_GAP_MIN, RETRY_GAP_MAX);
  return {
    ...state,
    streak: 0,
    total: newTotal,
    missed: alreadyMissed ? state.missed : [...state.missed, current],
    missedSet: alreadyMissed
      ? state.missedSet
      : new Set(state.missedSet).add(correctIso3),
    retryQueue: [
      ...withoutIso3(state.retryQueue, correctIso3),
      { iso3: correctIso3, dueAt },
    ],
    feedback,
    srsStore,
  };
}

function applyCorrect(state: State, correctIso3: string, now: Date): State {
  const feedback: Feedback = {
    kind: "correct",
    answerIso3: correctIso3,
    correctIso3,
    at: now.getTime(),
  };

  const completedSet = state.completedSet.has(correctIso3)
    ? state.completedSet
    : new Set(state.completedSet).add(correctIso3);

  if (state.practiceMode === "study") {
    // Auto-Good is *scheduled* for dismiss-time, committed by the
    // correct-flash timer in dismissFeedback. Grading is automatic — the
    // user never self-grades.
    //
    // The ceremony has to be known now, not at commit time, because it plays
    // during the correct flash. srsGrade is pure, so we grade a throwaway copy
    // to see whether this answer carries the country into "known" and, if so,
    // whether it finishes the continent. dismissFeedback re-grades for real; a
    // test pins that the two agree, since a milestone the commit does not
    // deliver would be a lie.
    const prospective = srsGrade(
      recordsFor(state)[correctIso3] ?? null,
      "Good",
      now,
    );
    return {
      ...state,
      completedSet,
      streak: state.streak + 1,
      // Location only. "Now on your map" and the engraved hatch are map
      // ceremonies, and the map paints where countries are — there is nothing
      // for a capital answer to draw on. The streak note still plays.
      milestone:
        answerFact(state) === "location"
          ? milestoneFor(
              state.current,
              recordsFor(state),
              prospective,
              filterPool(
                state.selectedContinents,
                state.includeTerritories,
                answerFact(state),
              ),
            )
          : null,
      feedback,
      autoGradePending: "Good",
    };
  }

  const srsStore = applyImmediateSrsWriteThrough(state, correctIso3, "Good", now);

  if (
    state.practiceMode === "expedition" &&
    state.expedition &&
    state.phase === "normal"
  ) {
    // No milestone: like a test round, an expedition is a measurement and its
    // map is neutral. The streak note is not restricted — a run of correct
    // answers means something here too, and a line of copy cannot help you
    // answer.
    return {
      ...state,
      streak: state.streak + 1,
      completedSet,
      feedback,
      srsStore,
      ...withExpeditionOutcome(state, "found"),
    };
  }

  if (state.phase === "review") {
    // Score and total stay out of the review pass, but the run of correct
    // answers does not: it is a live "you are on a roll" signal, not a session
    // statistic, and it now breaks on a review miss — so it has to build on a
    // review hit too, or a run could only ever be lost there.
    return {
      ...state,
      streak: state.streak + 1,
      retryQueue: withoutIso3(state.retryQueue, correctIso3),
      completedSet,
      feedback,
      srsStore,
    };
  }

  const inRetry = state.retryQueue.some((e) => e.iso3 === correctIso3);
  return {
    ...state,
    score: state.score + 1,
    streak: state.streak + 1,
    total: state.total + 1,
    retryQueue: inRetry
      ? withoutIso3(state.retryQueue, correctIso3)
      : state.retryQueue,
    completedSet,
    feedback,
    srsStore,
  };
}

// Commit a deferred Study auto-grade to the SRS store and update the
// in-session resurface queue. `scheduleStep` is the step a re-queued miss
// schedules its `dueAt` against, so it resurfaces ~gap cards from then. The
// single home for this so dismissFeedback and endSession can't drift.
function commitStudyGrade(
  state: State,
  ease: Ease,
  scheduleStep: number,
  now: Date,
): Pick<State, "srsStore" | "newIntroducedThisStretch" | "studyResurfaceQueue"> {
  const iso3 = state.current.iso3;
  const rec = recordsFor(state)[iso3];
  const isNew = !rec;
  const next = srsGrade(rec ?? null, ease, now);
  return {
    srsStore: withGrade(state.srsStore, answerFact(state), iso3, next),
    newIntroducedThisStretch: isNew
      ? state.newIntroducedThisStretch + 1
      : state.newIntroducedThisStretch,
    // In-session resurface: a miss comes back a few cards later; a correct
    // answer drops any pending resurface for this card. withoutIso3 dedupes
    // a repeat miss so the queue holds at most one entry per country.
    studyResurfaceQueue:
      ease === "Again"
        ? [
            ...withoutIso3(state.studyResurfaceQueue, iso3),
            { iso3, dueAt: scheduleStep + randInt(RETRY_GAP_MIN, RETRY_GAP_MAX) },
          ]
        : withoutIso3(state.studyResurfaceQueue, iso3),
  };
}

function dismissFeedback(state: State, now: Date): State {
  // An expedition took every credit at answer time (withExpeditionOutcome),
  // and its round counters are read off the store, so the twelve-card round
  // accounting does not apply: the interstitial never appears inside one.
  if (state.practiceMode === "expedition" && state.expedition) {
    if (state.phase === "normal") {
      return atExpeditionCard(state, state.expedition);
    }
    // The second look at the misses (#64) runs on the test's review pass, but
    // it is not a round: no break can open inside an expedition. The answer
    // still counts. An emptied queue lands back on the result card.
    const advanced = advanceCard(state, now);
    return {
      ...advanced,
      cardsAnswered: state.cardsAnswered + 1,
      expeditionLookDone: advanced.sessionDone,
    };
  }
  const kind = state.feedback?.kind ?? "correct";
  return withRoundAdvance(
    advanceCard(state, now),
    kind,
    cardIsNew(state),
    sittingKey(state),
  );
}

// Record an expedition answer: the glyph, the answer count (now, while the
// mode it was given in is still current) and, on the tenth, the finished
// round — `roundsCompleted` is what the hook reads to mark the streak day
// and count a finished round, and it is per-tab reducer state, so only the
// tab that played the tenth answer credits it, never one that merely adopts
// the finished store from another tab or loads it already finished.
function withExpeditionOutcome(
  state: State,
  outcome: "found" | "missed",
): Pick<State, "expedition" | "cardsAnswered" | "roundsCompleted"> {
  const expedition = recordOutcome(state.expedition!, outcome);
  return {
    expedition,
    cardsAnswered: state.cardsAnswered + 1,
    roundsCompleted: expeditionFinished(expedition)
      ? state.roundsCompleted + 1
      : state.roundsCompleted,
  };
}

// Land on the expedition's current card: the one after its last answer, or
// the result card (sessionDone) after the tenth. The one projection from the
// store to game state, shared by starting, resuming, syncing from another
// tab and advancing, so they can never disagree about what "card n" means.
function atExpeditionCard(state: State, store: ExpeditionStore): State {
  const finished = expeditionFinished(store);
  const next = finished
    ? undefined
    : COUNTRY_BY_ISO3.get(store.iso3s[store.outcomes.length]);
  return {
    ...state,
    expedition: store,
    current: next ?? state.current,
    feedback: null,
    milestone: null,
    sessionDone: finished,
    roundCards: store.outcomes.length,
    roundRight: foundCount(store),
    roundNew: 0,
    roundDone: false,
  };
}

// A second look at today's misses, from the result card (#64). It runs on the
// review pass a test already has: each miss is asked in order, a miss comes
// back until it is found, and the pass writes no grade, since the answer that
// counted was graded when it was given. The store is untouched — the glyphs,
// the share text and the day's one attempt stay exactly what they were.
function startExpeditionReview(state: State): State {
  const store = state.expedition;
  if (!store || !expeditionFinished(store) || !state.sessionDone) return state;
  const misses = store.iso3s.filter((_, i) => store.outcomes[i] === "missed");
  const first = misses.length > 0 ? COUNTRY_BY_ISO3.get(misses[0]) : undefined;
  if (!first) return state;
  return {
    ...state,
    phase: "review",
    retryQueue: misses.map((iso3) => ({ iso3, dueAt: 0 })),
    sessionDone: false,
    feedback: null,
    milestone: null,
    streak: 0,
    current: first,
    expeditionLookDone: false,
  };
}

function advanceCard(state: State, now: Date): State {
  if (state.practiceMode === "study") {
    // Commit the deferred auto-grade (Good on correct, Again on miss).
    // Picking the next country runs against the post-grade store so we
    // don't re-surface the same iso3. studyStep advances by one card here;
    // a re-queued miss schedules against that new step.
    const newStep = state.studyStep + 1;
    const committed = state.autoGradePending
      ? commitStudyGrade(state, state.autoGradePending, newStep, now)
      : null;
    const updated: State = {
      ...state,
      ...(committed ?? {}),
      studyStep: newStep,
      feedback: null,
      autoGradePending: null,
      // The ceremony belongs to the card that earned it and ends with it.
      milestone: null,
    };
    // Run the pick against the post-grade state; a depleted spotlight
    // auto-clears here and surfaces a toast.
    const { current, spotlightSubregion, transientMessage } =
      pickStudyWithSpotlightFallback(updated, now);
    const next: State = { ...updated, current, spotlightSubregion, transientMessage };
    // Nothing useful left: end the round here instead of padding it to
    // ROUND_SIZE with cards that are not due. withRoundAdvance opens the
    // break and credits the round. The filler card stays picked, so Keep
    // going anyway starts on it. A queued miss holds the round open: the
    // card after this filler one is that miss, and its recovery is the most
    // useful card the round has left. Keep going anyway does not hold a round
    // open against unseen cards: a spent new-card allowance still ends it, so
    // Keep going can refill (a wider scope can bring unseen cards back in).
    return {
      ...next,
      roundEndedEarly:
        nothingUseful(next, now) &&
        (!next.fillerAccepted || newCapReached(next)),
    };
  }
  if (state.phase === "review" && state.retryQueue.length === 0) {
    return { ...state, feedback: null, milestone: null, phase: "normal", sessionDone: true };
  }
  if (
    state.phase === "normal" &&
    poolComplete(
      filterPool(
        state.selectedContinents,
        state.includeTerritories,
        answerFact(state),
      ),
      state.completedSet,
      state.retryQueue,
    )
  ) {
    return { ...state, feedback: null, milestone: null, sessionDone: true };
  }
  return { ...state, current: nextCurrent(state, now), feedback: null, milestone: null };
}

// Switch to Study or a test round. Resets session counters and the soft cap.
// Entering a test round ("Test me on these") also starts it clean: completedSet
// and retryQueue from an earlier test would otherwise make pickNext skip
// countries and poolComplete end the new test early. Going back to studying
// keeps them, which is harmless — Study reads neither. Leaving an expedition
// restores the question mode the learner had before it; an answer whose
// reveal was still open needs nothing here, since an expedition takes every
// credit at answer time.
function enterPracticeMode(
  state: State,
  mode: Exclude<PracticeMode, "expedition">,
  now: Date,
): State {
  const startingTest = mode === "quiz";
  const leavingExpedition = state.practiceMode === "expedition";
  const next: State = {
    ...state,
    practiceMode: mode,
    mode:
      leavingExpedition && state.modeBeforeExpedition !== null
        ? state.modeBeforeExpedition
        : state.mode,
    modeBeforeExpedition: null,
    expeditionLookDone: false,
    completedSet: startingTest ? new Set() : state.completedSet,
    // A second look at an expedition's misses (#64) is left with it.
    retryQueue: startingTest || leavingExpedition ? [] : state.retryQueue,
    score: 0,
    streak: 0,
    milestone: null,
    total: 0,
    missed: [],
    missedSet: new Set(),
    phase: "normal",
    feedback: null,
    sessionDone: false,
    newIntroducedThisStretch: 0,
    // A mode flip is a fresh stretch — drop the in-session resurface
    // queue and reset its clock.
    studyResurfaceQueue: [],
    studyStep: 0,
    autoGradePending: null,
    // Flipping into Quiz must never inherit a silently narrowed pool.
    spotlightSubregion: null,
    // A new round type starts a fresh round, and a fresh sitting.
    ...FRESH_STRETCH,
  };
  return { ...next, current: nextCurrent(next, now) };
}

// Switch the question mode. The counterpart of enterPracticeMode, and
// deliberately NOT a rebuild through initialState: that dropped a pending
// Study grade, reset `cardsAnswered` (so the answer on screen vanished from
// the counters, against CLAUDE.md's rule that every answer whose grade
// reaches the store is counted), cleared the Study miss queue and the
// new-card cap even between two modes of the same fact, and started a fresh
// round — inflating `roundsStarted` every time a learner looked at another
// prompt type.
function enterQuestionMode(
  state: State,
  mode: QuestionMode,
  now: Date,
): State {
  // Nothing in the learner's scope can be asked this way, so there is no card
  // to show: refuse rather than enter. The settings already disable such an
  // option, but the reducer must not depend on a UI guard — an empty pool
  // makes Quiz's pickRandom throw, and leaves Study on a capital-less card
  // with a blank prompt. Refusing rather than widening the scope keeps the
  // promise that a mode switch never rewrites the learner's selection; the
  // option simply waits until they pick a region that has one.
  if (
    filterPool(state.selectedContinents, state.includeTerritories, factOf(mode))
      .length === 0
  ) {
    return state;
  }
  // A reveal open at the moment of the switch belongs to an answer already
  // given. Commit any deferred grade under the OLD mode's fact, before `mode`
  // moves, and count the card into the round — which carries on across the
  // switch, so an uncounted card would leave a twelve-card round needing
  // thirteen answers.
  state = closeCardIntoRound(state, now);
  // Study's in-session state is per fact, not per mode: the miss queue and the
  // new-card cap refer to cards of one fact, so Name → Click ⇄ Shape → Name
  // keeps them and a switch to a capital mode starts a fresh stretch.
  const sameFact = factOf(state.mode) === factOf(mode);
  // A test round's queue refers to the old question type either way, so a
  // test restarts exactly as it did before. Study keeps everything below.
  const inTest = state.practiceMode === "quiz";
  const next: State = {
    ...state,
    mode,
    completedSet: inTest ? new Set() : state.completedSet,
    retryQueue: inTest ? [] : state.retryQueue,
    score: inTest ? 0 : state.score,
    total: inTest ? 0 : state.total,
    missed: inTest ? [] : state.missed,
    missedSet: inTest ? new Set() : state.missedSet,
    phase: inTest ? "normal" : state.phase,
    // A run of correct answers is a run at one prompt; changing the prompt
    // ends it rather than carrying it over.
    streak: 0,
    milestone: null,
    feedback: null,
    autoGradePending: null,
    sessionDone: false,
    newIntroducedThisStretch: sameFact ? state.newIntroducedThisStretch : 0,
    studyResurfaceQueue: sameFact ? state.studyResurfaceQueue : [],
    studyStep: sameFact ? state.studyStep : 0,
    // Study keeps its round and its spotlight lens: the learner is still in
    // the same sitting, asking about the same places a different way.
    ...(inTest ? FRESH_ROUND : {}),
  };
  return { ...next, current: nextCurrent(next, now) };
}

export function reducer(state: State, action: Action): State {
  const now = nowOf(action);
  switch (action.type) {
    case "answer": {
      if (state.feedback || state.sessionDone || state.roundDone) return state;
      const correctIso3 = state.current.iso3;
      return action.iso3 === correctIso3
        ? applyCorrect(state, correctIso3, now)
        : applyMiss(state, state.current, "wrong", action.iso3, now);
    }
    case "skip": {
      if (state.feedback || state.sessionDone || state.roundDone) return state;
      return applyMiss(state, state.current, "skipped", "", now);
    }
    case "dismiss": {
      if (!state.feedback) return state;
      return dismissFeedback(state, now);
    }
    case "setMode": {
      if (state.mode === action.mode) return state;
      // An expedition is Name → Click only; the picker is locked while one is
      // up, and a stray dispatch must not rebuild the state under it.
      if (state.practiceMode === "expedition") return state;
      return enterQuestionMode(state, action.mode, now);
    }
    case "setPracticeMode": {
      if (state.practiceMode === action.mode) return state;
      return enterPracticeMode(state, action.mode, now);
    }
    case "startExpedition": {
      // No door exists inside an expedition; a stray re-entry must not
      // rebuild the run under the learner.
      if (state.practiceMode === "expedition") return state;
      // Reached from the Today card and the Study summary, where no card is
      // open — but a Study grade in flight is committed all the same, as
      // every other exit does, and counted, since it reached the store.
      const committed =
        state.practiceMode === "study" && state.autoGradePending
          ? commitStudyGrade(state, state.autoGradePending, state.studyStep, now)
          : null;
      const entered: State = {
        ...state,
        ...(committed ?? {}),
        cardsAnswered: committed ? state.cardsAnswered + 1 : state.cardsAnswered,
        practiceMode: "expedition",
        // Name → Click only; the learner's own choice is restored on leaving.
        mode: "name-to-click",
        modeBeforeExpedition: state.mode,
        score: 0,
        streak: 0,
        total: 0,
        missed: [],
        missedSet: new Set(),
        phase: "normal",
        studyResurfaceQueue: [],
        studyStep: 0,
        autoGradePending: null,
        spotlightSubregion: null,
      };
      // A resumed expedition keeps its place, so the chip picks up at the
      // answers already given; a finished one opens straight onto its result
      // card, which is its summary. There is no replay.
      return atExpeditionCard(entered, action.store);
    }
    case "setContinents": {
      if (action.continents.length === 0) return state;
      return applyScope(state, action.continents, state.includeTerritories, now);
    }
    case "setIncludeTerritories": {
      if (state.includeTerritories === action.value) return state;
      return applyScope(
        state,
        state.selectedContinents,
        action.value,
        action.now ?? new Date(),
      );
    }
    case "syncExpedition": {
      const store = action.store;
      if (store === null) {
        // The key was removed: "Erase all progress" in another tab. The
        // erase reaches this tab's expedition too, and a run in progress is
        // left — the answers it would go on to give have no store to land
        // in. The other stores stay last-write-wins per tab, as before.
        if (state.expedition === null) return state;
        const left =
          state.practiceMode === "expedition"
            ? enterPracticeMode(state, "study", now)
            : state;
        return { ...left, expedition: null };
      }
      if (!expeditionSupersedes(store, state.expedition)) return state;
      if (state.practiceMode !== "expedition") {
        return { ...state, expedition: store };
      }
      // Mid-run, or on the result card, only the same day's store can move
      // this tab. A later day's (another tab opened tomorrow's past
      // midnight) would replace a run or a result the learner is looking at;
      // it is picked up on leaving, when the door reads today afresh.
      if (state.expedition && store.day !== state.expedition.day) return state;
      // The other tab has answered cards this one is still showing. Move to
      // the card after its last answer, closing any reveal here — the answer
      // it was for is recorded, by the other tab.
      return atExpeditionCard(state, store);
    }
    case "endSession": {
      // "Done" inside an expedition leaves it rather than ending it: the
      // answers given so far are already in the store, and it resumes from
      // the Today card or the Study summary. Its summary is the result card,
      // which only a finished expedition has.
      if (state.practiceMode === "expedition") {
        // Done during the second look at the misses goes back to the result,
        // which is where that look was started from. An open reveal is an
        // answer given, and counts.
        if (state.phase === "review") {
          return {
            ...state,
            phase: "normal",
            retryQueue: [],
            feedback: null,
            milestone: null,
            sessionDone: true,
            cardsAnswered: state.feedback
              ? state.cardsAnswered + 1
              : state.cardsAnswered,
          };
        }
        // Unless the reveal that is open is the tenth's: the expedition is
        // finished, and "Done" lands on its result.
        if (
          state.feedback &&
          state.expedition &&
          expeditionFinished(state.expedition)
        ) {
          return dismissFeedback(state, now);
        }
        return enterPracticeMode(state, "study", now);
      }
      // The card whose feedback is open was answered: the learner saw it and
      // then left. It never reaches withRoundAdvance, so count it here, into
      // cardsAnswered (or the mode mix and the first-session depth quietly
      // lose it) and into the sitting the summary reports. The round ends
      // where it stopped.
      const closed: State = state.feedback
        ? {
            ...withSittingCard(
              state,
              state.feedback.kind,
              cardIsNew(state),
              sittingKey(state),
            ),
            cardsAnswered: state.cardsAnswered + 1,
          }
        : state;
      // If Study has an auto-grade in flight (correct-flash or miss
      // waiting on dismiss), commit it before bowing out — otherwise the
      // user's last interaction silently produces no SRS record. No card
      // is advanced here, so a re-queued miss schedules against the
      // current studyStep — it resurfaces ~gap cards after "Keep going".
      if (state.practiceMode === "study" && state.autoGradePending) {
        return {
          ...closed,
          ...commitStudyGrade(
            state,
            state.autoGradePending,
            state.studyStep,
            now,
          ),
          autoGradePending: null,
          milestone: null,
          sessionDone: true,
          resumeCurrent: false,
          feedback: null,
          roundDone: false,
        };
      }
      // In Quiz the grade was written through at answer time.
      return {
        ...closed,
        sessionDone: true,
        resumeCurrent: state.practiceMode === "study" && !state.feedback,
        feedback: null,
        milestone: null,
        roundDone: false,
      };
    }
    case "continueRound": {
      if (!state.roundDone) return state;
      const next: State = { ...state, ...FRESH_ROUND };
      // Unseen cards remain: each round starts with a fresh new-card
      // allowance, so the next one meets new countries.
      const refilled = withNewAllowance(next, now);
      if (refilled !== next) return refilled;
      // Otherwise Keep going from a break that came early is Keep going
      // anyway: the learner has seen there is nothing useful left and chosen
      // more. Only when it really continues onto filler — the break's
      // capitals door switches the question mode first and lands on new work.
      return {
        ...next,
        fillerAccepted:
          state.fillerAccepted ||
          (state.roundEndedEarly && nothingUseful(next, now)),
      };
    }
    case "acceptFiller": {
      if (state.fillerAccepted) return state;
      return { ...state, fillerAccepted: true };
    }
    case "startReview": {
      if (state.practiceMode === "expedition") {
        return startExpeditionReview(state);
      }
      if (state.retryQueue.length === 0) return state;
      const country = COUNTRY_BY_ISO3.get(state.retryQueue[0].iso3);
      if (!country) return state;
      return {
        ...state,
        phase: "review",
        sessionDone: false,
        feedback: null,
        milestone: null,
        current: country,
        ...FRESH_STRETCH,
      };
    }
    case "resetSrs": {
      // Erasing the store cancels anything staged against it, including a
      // ceremony announcing a country as known — the commit that would have
      // backed it is gone. Today's expedition goes with it: "all progress"
      // means all, and an expedition left standing would be graded into a
      // store that no longer knows its countries.
      if (state.practiceMode === "expedition") {
        state = enterPracticeMode(state, "study", now);
      }
      return {
        ...state,
        expedition: null,
        srsStore: emptyStore(),
        newIntroducedThisStretch: 0,
        autoGradePending: null,
        milestone: null,
        feedback: null,
        // The round in progress goes with the progress. Left standing, its
        // remaining cards would carry it to a finish that the emptied counters
        // never saw begin, and the Data view would read "2 of 1".
        ...FRESH_STRETCH,
        cardsAnswered: 0,
      };
    }
    case "closeSummary": {
      // The expedition's summary is its result card; closing it is leaving.
      if (state.practiceMode === "expedition") {
        return enterPracticeMode(state, "study", now);
      }
      // Clear the summary without nuking session state. Re-pick so the
      // user lands on a fresh prompt (or the most-overdue fallback in
      // Study when nothing's due). Route Study through the spotlight
      // fallback so an already-depleted focus region clears + toasts.
      const next: State = {
        ...state,
        sessionDone: false,
        feedback: null,
        milestone: null,
        ...FRESH_STRETCH,
      };
      if (state.practiceMode === "study") {
        // Keep going starts a fresh new-card allowance while unseen cards
        // remain, as it does on the round break.
        const refilled = allowanceRefills(next);
        const allowed: State = refilled
          ? { ...next, newIntroducedThisStretch: 0 }
          : next;
        // Done left a card unanswered: resume it, unless it is filler the
        // refill has just made something better available than.
        const resume =
          state.resumeCurrent &&
          !(
            cardIsFiller(allowed, now) &&
            (refilled || usefulInPool(allowed, now) || missWaiting(allowed))
          );
        const landed: State = resume
          ? { ...allowed, resumeCurrent: false }
          : {
              ...allowed,
              resumeCurrent: false,
              ...pickStudyWithSpotlightFallback(allowed, now),
            };
        // Keep going onto filler is Keep going anyway: the rest card has
        // already said nothing is waiting, so the CaughtUp banner must not
        // ask again. Not in a focus, where its label never says "anyway" —
        // the banner's region copy asks there instead.
        return {
          ...landed,
          fillerAccepted:
            landed.spotlightSubregion === null && nothingUseful(landed, now),
        };
      }
      return { ...next, current: nextCurrent(next, now) };
    }
    case "setSpotlight": {
      // Study-only lens. The CTA only renders in StudySummary, but guard
      // here too (symmetric with the other Study-only actions) so a stray
      // dispatch can't seed a spotlight into Quiz state — which the map
      // would then tint even though Quiz picks ignore it.
      if (state.practiceMode !== "study") return state;
      // Self-contained transition: close any open summary and pick the
      // first focused country in one step (the summary's Focus CTA calls
      // only this — no trailing closeSummary, so there's a single pick).
      // Activating a spotlight is a fresh study stretch: reset the
      // per-stretch new-introduction cap so the focused region can
      // actually introduce cards (the natural trigger is dueCount === 0,
      // which is often when the cap is already exhausted). The fallback
      // handles the (defensive) already-depleted-region case.
      const next: State = {
        ...state,
        spotlightSubregion: action.subregion,
        newIntroducedThisStretch: 0,
        sessionDone: false,
        feedback: null,
        milestone: null,
        // Leaving the summary into a focus region starts a fresh round,
        // like closeSummary does.
        ...FRESH_STRETCH,
      };
      const { current, spotlightSubregion, transientMessage } =
        pickStudyWithSpotlightFallback(next, now);
      return { ...next, current, spotlightSubregion, transientMessage };
    }
    case "clearSpotlight": {
      // Leaving a focus: Keep going anyway was agreed for the region, and the
      // whole scope may have cards back, so the choice is cleared and a
      // region filler card gives way when something useful is waiting.
      return offFiller(
        withFreshAllowance({
          ...state,
          spotlightSubregion: null,
          fillerAccepted: false,
        }),
        now,
      );
    }
    case "setTransientMessage": {
      return { ...state, transientMessage: action.message };
    }
    case "clearTransientMessage": {
      return { ...state, transientMessage: null };
    }
    case "reset": {
      // There is no "try again" for an expedition; the second go is tomorrow.
      if (state.practiceMode === "expedition") return state;
      return initialState({
        mode: state.mode,
        practiceMode: state.practiceMode,
        selectedContinents: state.selectedContinents,
        includeTerritories: state.includeTerritories,
        srsStore: state.srsStore,
        expedition: state.expedition,
      });
    }
  }
}

export type GameApi = {
  state: State;
  unlearnedCount: number;
  // Local counters (R2.4), for the Data view in settings. Read-only here; the
  // hook owns every write.
  counters: Counters;
  // Days played and the longest gap between them, derived from the streak
  // store rather than duplicated into the counters key.
  returns: ReturnInfo;
  totalInScope: number;
  // A test round's standing in countries: right first try, recovered, still
  // missed, not yet asked (testTally.ts). Meaningful in a test only.
  testTally: TestTally;
  dueCount: number;
  // When the next in-scope card comes back, as the line every surface says
  // (nextBackLine); null when none is scheduled. Never one dueCount counts
  // (see srs.nextDueAt).
  nextBack: string | null;
  newAvailableCount: number;
  seenSrsIntro: boolean;
  markSrsIntroSeen: () => void;
  // Whether the latest save of the learning records landed. The rest card says
  // "kept in this browser" only when it is true.
  progressSaved: boolean;
  // Nothing useful is left to ask (see nothingUseful): the Study card on
  // screen is filler and no miss is waiting behind it.
  onlyFiller: boolean;
  // A miss from this sitting is queued to come back (see missWaiting), so
  // there is something useful to go on to even with nothing due or new.
  missQueued: boolean;
  // Unseen cards wait only on the stretch's new-card allowance, which Keep
  // going refills (see newCapReached).
  newCapReached: boolean;
  // Keep going anyway from the CaughtUp banner: rounds run full again for the
  // rest of the sitting.
  acceptFiller: () => void;
  // Cross-day streak (days with a finished round). Derived from
  // atlasaur:streak:v1; recorded by the hook when roundsCompleted grows.
  streak: StreakInfo;
  // The Today card shows once per load to a learner with existing progress,
  // before the first prompt. Not part of reducer state: it is a greeting,
  // not game state.
  showTodayCard: boolean;
  dismissTodayCard: () => void;
  // First-run welcome: shown once (atlasaur:seenWelcome) to a learner with
  // no SRS records. Existing learners upgrading past it never see it.
  showWelcome: boolean;
  dismissWelcome: () => void;
  isoFromNumeric: (numeric: string) => string | undefined;
  numericFromIso3: (iso3: string) => string | undefined;
  nameFromIso3: (iso3: string) => string;
  // What the map can ask right now: the learner's scope, or every country in
  // its own right during an expedition. The map reads this.
  isInScope: (iso3: string) => boolean;
  // The learnable set (continents × territories setting). Every figure reads
  // scope from here rather than recomputing it from continents, and it does
  // not widen during an expedition.
  scopeSet: ReadonlySet<string>;
  // The fact the learner is working on, which is what every displayed figure
  // counts over. Not the fact the current card grades — those differ during
  // an expedition. See learnerFact.
  fact: Fact;
  // The iso3 a typed answer names — a country name or a capital, depending on
  // the mode — or "" for no match. One entry point so components never branch
  // on the fact themselves.
  matchTyped: (input: string) => string;
  answer: (iso3: string) => void;
  skip: () => void;
  dismiss: () => void;
  setMode: (mode: QuestionMode) => void;
  setPracticeMode: (mode: Exclude<PracticeMode, "expedition">) => void;
  // Capitals worth offering a learner who is working on locations, or null
  // when there is nothing specific to offer. Drives the doors on the Today
  // card and the CaughtUp banner — the only things outside the settings that
  // say the capital questions exist.
  capitalOffer: CapitalOffer | null;
  // The Daily Expedition (R3.1): what today holds — nothing yet, a run to
  // resume, or a result — and the one way in. Entering builds today's ten if
  // the store is from another day, resumes it if it is unfinished, and opens
  // the result card if it is done. Leaving is setPracticeMode("study").
  expeditionToday: ExpeditionStatus;
  startExpedition: () => void;
  setContinents: (continents: readonly Continent[]) => void;
  setIncludeTerritories: (value: boolean) => void;
  endSession: () => void;
  continueRound: () => void;
  startReview: () => void;
  resetSrs: () => void;
  closeSummary: () => void;
  setSpotlight: (subregion: Subregion) => void;
  clearSpotlight: () => void;
  // Exposed for the toast auto-dismiss timer test; production code reaches
  // the toast via the depletion fallback, not this setter. The matching
  // clearTransientMessage action is dispatched by the hook's timer directly,
  // so it isn't surfaced here.
  setTransientMessage: (message: string) => void;
  reset: () => void;
};

export function useGame(): GameApi {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState({
      mode: loadQuestionMode(),
      // Study is the home. A "Test me on these" round is entered
      // deliberately from the Study summary and is never persisted, so a
      // reload always lands back on Study.
      practiceMode: "study",
      selectedContinents: loadContinents(),
      includeTerritories: loadIncludeTerritories(),
      srsStore: loadStore(),
      // A stored set this build cannot ask (a country dropped from the
      // table) is discarded rather than half-asked.
      expedition: loadExpedition(isExpeditionIso3),
    }),
  );
  const [seenSrsIntro, setSeenSrsIntro] = useState(loadSeenIntro);
  // Whether the latest save of the learning records landed. Set by the save
  // effect below, so "kept in this browser" follows the real write.
  const [progressSaved, setProgressSaved] = useState(true);
  const [streakStore, setStreakStore] = useState(loadStreak);
  // Local counters (R2.4). Recorded from state transitions here rather than in
  // the reducer, the same way the streak is, so the reducer stays pure and
  // every persisted side effect lives in one place.
  // `startSession` runs in the initialiser, before anything can be recorded:
  // answers already on the store belong to an earlier sitting, and a profile
  // that had SRS records before this key existed has no measurable first
  // session at all.
  const [counters, setCounters] = useState(() =>
    startSession(loadCounters(), hasAnyRecord(state.srsStore)),
  );
  // Read by the counter effects below, which fire on a card or round count and
  // must not re-run when only the mode changes.
  const modeRef = useRef(state.mode);
  modeRef.current = state.mode;
  const practiceModeRef = useRef(state.practiceMode);
  practiceModeRef.current = state.practiceMode;
  // Returning learner = any SRS record at load. Decided once so the card
  // doesn't appear mid-session after the first answer.
  const [todayCardOpen, setTodayCardOpen] = useState(() =>
    hasAnyRecord(state.srsStore),
  );
  const [welcomeOpen, setWelcomeOpen] = useState(
    () => !loadSeenWelcome() && !hasAnyRecord(state.srsStore),
  );
  // Tick on visibility change + hourly to recompute due counts when the
  // day rolls over for users who leave the tab open.
  const [nowBucket, setNowBucket] = useState(() => Math.floor(Date.now() / 60_000));

  useEffect(() => {
    if (!state.feedback || state.feedback.kind !== "correct") return;
    const ordinary = isClickMode(state.mode)
      ? FEEDBACK_DURATION.correctNameToClick
      : FEEDBACK_DURATION.correct;
    const ms = state.milestone
      ? MILESTONE_DURATION
      : streakNote(state.streak) !== null
        ? Math.max(ordinary, STREAK_NOTE_DURATION)
        : ordinary;
    const id = window.setTimeout(
      () => dispatch({ type: "dismiss", now: new Date() }),
      ms,
    );
    return () => window.clearTimeout(id);
  }, [state.feedback, state.mode, state.milestone, state.streak]);

  useEffect(() => {
    if (!state.transientMessage) return;
    const id = window.setTimeout(
      () => dispatch({ type: "clearTransientMessage" }),
      TOAST_DURATION,
    );
    return () => window.clearTimeout(id);
  }, [state.transientMessage]);

  useEffect(() => {
    saveContinents(state.selectedContinents);
  }, [state.selectedContinents]);

  useEffect(() => {
    saveIncludeTerritories(state.includeTerritories);
  }, [state.includeTerritories]);

  // The learner's own choice, never the expedition's forced Name → Click —
  // otherwise playing today's ten would quietly rewrite the preference.
  useEffect(() => {
    saveQuestionMode(state.modeBeforeExpedition ?? state.mode);
  }, [state.mode, state.modeBeforeExpedition]);

  useEffect(() => {
    setProgressSaved(saveStore(state.srsStore));
  }, [state.srsStore]);

  useEffect(() => {
    saveExpedition(state.expedition);
  }, [state.expedition]);

  // One attempt a day has to hold across tabs. Each tab keeps its own copy
  // of the store and would otherwise save its snapshot over the other's
  // answers; the `storage` event (raised in every *other* tab on a write)
  // hands the newer store here, and the reducer adopts it only when it is
  // further along. The adopted store then round-trips through the save
  // effect unchanged, which raises no event, so the two cannot ping-pong.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== EXPEDITION_STORAGE_KEY) return;
      // A removed key is an erase and is passed through as null; a value
      // that does not parse is nobody's expedition and is ignored.
      const store =
        e.newValue === null ? null : parseExpedition(e.newValue, isExpeditionIso3);
      if (e.newValue !== null && store === null) return;
      dispatch({ type: "syncExpedition", store, now: new Date() });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // One card answered — meaning one whose grade reached the store, which is
  // usually a dismissed card but also covers an answer whose feedback is
  // closed by "Done" or by a scope change. `cardsAnswered` only ever grows by
  // one at a time within a mount; a rebuild resets it to 0, which reads as a
  // shrink and is skipped, so a mode flip cannot double count.
  const lastCardsAnsweredRef = useRef(state.cardsAnswered);
  useEffect(() => {
    const prev = lastCardsAnsweredRef.current;
    lastCardsAnsweredRef.current = state.cardsAnswered;
    if (state.cardsAnswered <= prev) return;
    // Mode via a ref: this fires on the card count, and depending on
    // state.mode would re-run it on a mode flip with no new card.
    setCounters((c) => recordAnswer(c, modeRef.current));
  }, [state.cardsAnswered]);

  // One answer logged the moment its feedback appears. Only applyCorrect and
  // applyMiss create a Feedback, each a new object, so a new non-null feedback
  // is exactly one answer, in every practice mode and in the review pass. The
  // mode, practice mode and phase are this render's, the ones it was given in;
  // the time is the reducer's, so running a render later cannot move the
  // answer past midnight or month-end. The ref stops a re-render or
  // StrictMode's second run logging it twice.
  const lastLoggedFeedbackRef = useRef(state.feedback);
  useEffect(() => {
    const feedback = state.feedback;
    if (!feedback || feedback === lastLoggedFeedbackRef.current) return;
    lastLoggedFeedbackRef.current = feedback;
    appendOutcome({
      at: feedback.at,
      asked: feedback.correctIso3,
      mode: state.mode,
      practice: state.practiceMode,
      phase: state.phase,
      outcome: feedback.kind,
      given: feedback.kind === "wrong" ? feedback.answerIso3 : "",
    });
  }, [state.feedback, state.mode, state.practiceMode, state.phase]);

  // A round begins when its first card is dismissed. Started is counted on the
  // transition into card 1 so an abandoned round still counts as begun — which
  // is the whole point of comparing the two.
  // An expedition is the exception: it is begun when the learner opens a
  // fresh one (see startExpedition below), because a resumed one re-enters
  // with its count already at the answers given, and re-entering at exactly
  // one would otherwise read as a second start.
  const lastRoundCardsRef = useRef(state.roundCards);
  useEffect(() => {
    const prev = lastRoundCardsRef.current;
    lastRoundCardsRef.current = state.roundCards;
    if (state.roundCards !== 1 || prev === 1) return;
    if (practiceModeRef.current === "expedition") return;
    setCounters((c) => recordRoundStarted(c, practiceModeRef.current));
  }, [state.roundCards]);

  // Finished means the round filled to ROUND_SIZE, or ended early in Study
  // because nothing useful was left, which is what `roundsCompleted` counts.
  // That includes a round whose twelfth card also ended the session, so no
  // interstitial was shown — deliberate, and the same rounds the streak counts
  // as a day played.
  const lastRoundsCompletedRef = useRef(state.roundsCompleted);
  useEffect(() => {
    const prev = lastRoundsCompletedRef.current;
    lastRoundsCompletedRef.current = state.roundsCompleted;
    if (state.roundsCompleted <= prev) return;
    setCounters(recordRoundFinished);
  }, [state.roundsCompleted]);

  // The first session ends the first time the learner reaches a summary. After
  // that `firstSessionAnswers` is frozen.
  useEffect(() => {
    if (!state.sessionDone) return;
    setCounters(recordSessionEnded);
  }, [state.sessionDone]);

  useEffect(() => {
    saveCounters(counters);
  }, [counters]);

  // Known countries over time, snapshotted whenever the figure moves. Counted
  // across the whole store rather than the active scope, so switching the
  // continent filter never looks like progress or a loss. Uses masteryTierOf
  // so this can never disagree with the "Known" stat or the map's pigment.
  // Always the location fact, like the paint it mirrors: "known" here means a
  // country the learner can find, whatever else they have been practising.
  const locationRecords = state.srsStore.facts.location;
  const knownEverywhere = useMemo(() => {
    let n = 0;
    for (const iso3 in locationRecords) {
      if (masteryTierOf(locationRecords[iso3]) === 2) n++;
    }
    return n;
  }, [locationRecords]);
  useEffect(() => {
    setCounters((c) => recordKnown(c, knownEverywhere, new Date()));
  }, [knownEverywhere]);

  // A finished round marks today on the streak. recordDay returns the same
  // store when today is already there, so the save effect below is quiet.
  useEffect(() => {
    if (state.roundsCompleted === 0) return;
    setStreakStore((prev) => recordDay(prev, new Date()));
  }, [state.roundsCompleted]);

  useEffect(() => {
    saveStreak(streakStore);
  }, [streakStore]);

  // Once the learner has reached a summary (keyboard users can reach the
  // status-bar Done under the card's scrim), the greeting has had its
  // moment; don't bring it back when the summary closes.
  useEffect(() => {
    if (!state.sessionDone) return;
    setTodayCardOpen(false);
    setWelcomeOpen((open) => {
      if (open) saveSeenWelcome(true);
      return false;
    });
  }, [state.sessionDone]);

  // Hourly, on becoming visible, and at local midnight: the day-keyed
  // figures (due counts, the streak, today's expedition) must turn over with
  // the day, not up to an hour after it — the expedition door promises a
  // result or a resume by what the memo saw, and acts on the clock.
  useEffect(() => {
    const tick = () => setNowBucket(Math.floor(Date.now() / 60_000));
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(tick, 60 * 60 * 1000);
    let midnight = 0;
    const armMidnight = () => {
      const now = new Date();
      const next = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1,
      );
      midnight = window.setTimeout(() => {
        tick();
        armMidnight();
      }, next.getTime() - now.getTime());
    };
    armMidnight();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
      window.clearTimeout(midnight);
    };
  }, []);

  // The learner's own scope. Every figure — due, known, seen, not yet seen,
  // the test's Done count — reads against this whatever round is up, so the
  // settings never show world-wide numbers beside the learner's own chips.
  // The learner's own fact: an expedition's forced Name → Click must not make
  // the settings count locations while they are studying capitals.
  const fact = learnerFact(state);
  // Memoised on the pool's CONTENT rather than the fact, so a mode switch
  // that leaves the pool identical (the two facts differ only in the handful
  // of rows with no capital, and only with territories on) hands back the same
  // Set and the map never re-settles because of scope.
  const scopeKey = useMemo(
    () =>
      filterPool(state.selectedContinents, state.includeTerritories, fact)
        .map((c) => c.iso3)
        .join(),
    [state.selectedContinents, state.includeTerritories, fact],
  );
  const scopeSet = useMemo<ReadonlySet<string>>(
    () => new Set(scopeKey ? scopeKey.split(",") : []),
    [scopeKey],
  );
  const totalInScope = scopeSet.size;
  // What the map can ask and the learner can tap. During an expedition that
  // is every country in its own right, so the map frames the world and
  // nothing is inert. Keyed on the boolean, not the practice mode, so a
  // Study / test flip keeps the same predicate and the map does not re-settle.
  const isExpedition = state.practiceMode === "expedition";
  const isInScope = useMemo(
    () =>
      isExpedition ? isExpeditionIso3 : (iso3: string) => scopeSet.has(iso3),
    [isExpedition, scopeSet],
  );

  const testTally = useMemo(
    () => computeTestTally(scopeSet, state.completedSet, state.missedSet),
    [scopeSet, state.completedSet, state.missedSet],
  );

  const learnerRecords = state.srsStore.facts[fact];

  const dueCount = useMemo(
    () => srsDueCount(learnerRecords, scopeSet, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [learnerRecords, scopeSet, nowBucket],
  );

  const nextBack = useMemo(() => {
    const now = new Date();
    return nextBackLine(srsNextDueAt(learnerRecords, scopeSet, now), now);
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [learnerRecords, scopeSet, nowBucket],
  );

  const newAvailableCount = useMemo(
    () => srsNewAvailableCount(learnerRecords, scopeSet),
    [learnerRecords, scopeSet],
  );

  const matchTyped = (input: string) =>
    answerFact(state) === "capital"
      ? matchTypedCapital(input, state.current)
      : matchTypedName(input);

  // Offered only to a learner working on locations: someone already studying
  // capitals needs no door to them. Recomputed on the hourly tick, like every
  // other due figure.
  const offer = useMemo(
    () =>
      fact === "location"
        ? capitalOffer(state.srsStore, COUNTRIES, scopeSet, new Date())
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fact, state.srsStore, scopeSet, nowBucket],
  );

  const returns = useMemo(() => returnInfo(streakStore), [streakStore]);
  const expeditionToday = useMemo(
    () => expeditionStatus(state.expedition, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.expedition, nowBucket],
  );
  const streak = useMemo(
    () => streakInfo(streakStore, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streakStore, nowBucket],
  );

  const markSrsIntroSeen = () => {
    if (seenSrsIntro) return;
    setSeenSrsIntro(true);
    saveSeenIntro(true);
  };

  return {
    state,
    unlearnedCount: state.retryQueue.length,
    counters,
    returns,
    totalInScope,
    dueCount,
    nextBack,
    newAvailableCount,
    seenSrsIntro,
    markSrsIntroSeen,
    progressSaved,
    onlyFiller: nothingUseful(state, new Date()),
    missQueued: missWaiting(state),
    newCapReached: newCapReached(state),
    acceptFiller: () => dispatch({ type: "acceptFiller" }),
    streak,
    capitalOffer: offer,
    expeditionToday,
    startExpedition: () => {
      const now = new Date();
      const day = dayKey(now);
      // Storage is the record of what any tab has done today; re-read it,
      // so a store this tab declined to adopt mid-run (another tab opened a
      // later day's) or a missed event is picked up here rather than a
      // second, competing expedition being built for the same day.
      const stored = loadExpedition(isExpeditionIso3);
      const latest = expeditionSupersedes(stored, state.expedition)
        ? stored
        : state.expedition;
      const fresh = !(latest && latest.day === day);
      const store = fresh ? newExpedition(day, EXPEDITION_POOL) : latest!;
      // Begun once, when today's is first opened; resuming is not a start.
      if (fresh) setCounters((c) => recordRoundStarted(c, "expedition"));
      dispatch({ type: "startExpedition", store, now });
    },
    showTodayCard: todayCardOpen,
    dismissTodayCard: () => setTodayCardOpen(false),
    showWelcome: welcomeOpen,
    dismissWelcome: () => {
      setWelcomeOpen(false);
      saveSeenWelcome(true);
    },
    testTally,
    isoFromNumeric,
    numericFromIso3,
    nameFromIso3,
    isInScope,
    scopeSet,
    fact,
    matchTyped,
    answer: (iso3) => dispatch({ type: "answer", iso3, now: new Date() }),
    skip: () => dispatch({ type: "skip", now: new Date() }),
    dismiss: () => dispatch({ type: "dismiss", now: new Date() }),
    setMode: (mode) => {
      // The answer still on screen was given in the OLD mode, and it is
      // counted here rather than through `cardsAnswered`: the counters effect
      // reads the mode through modeRef, which already holds the new one by
      // the time it fires. Guarded the same way the reducer guards the
      // switch, so an ignored dispatch records nothing.
      if (state.feedback && state.mode !== mode && !isExpedition) {
        setCounters((c) => recordAnswer(c, state.mode));
      }
      dispatch({ type: "setMode", mode, now: new Date() });
    },
    setPracticeMode: (mode) =>
      dispatch({ type: "setPracticeMode", mode, now: new Date() }),
    setContinents: (continents) =>
      dispatch({ type: "setContinents", continents, now: new Date() }),
    setIncludeTerritories: (value) =>
      dispatch({ type: "setIncludeTerritories", value, now: new Date() }),
    endSession: () => dispatch({ type: "endSession" }),
    continueRound: () => dispatch({ type: "continueRound", now: new Date() }),
    startReview: () => dispatch({ type: "startReview" }),
    resetSrs: () => {
      // "Erase all progress" means the streak too — otherwise the next
      // finished round would continue the old day count — the counters, and
      // the welcome flag, so the learner meets the app as a stranger on the
      // next load. A kept counters key would also re-freeze
      // firstSessionAnswers against a session the learner no longer has. The
      // outcome log goes too: it describes the history being erased.
      dispatch({ type: "resetSrs" });
      // Both SRS keys, or the v1 blob would be migrated back on the next load.
      clearStore();
      clearOutcomes();
      setStreakStore(emptyStreak());
      setCounters(startSession(emptyCounters(), false));
      saveSeenWelcome(false);
    },
    closeSummary: () => dispatch({ type: "closeSummary", now: new Date() }),
    setSpotlight: (subregion) =>
      dispatch({ type: "setSpotlight", subregion, now: new Date() }),
    clearSpotlight: () => dispatch({ type: "clearSpotlight", now: new Date() }),
    setTransientMessage: (message) =>
      dispatch({ type: "setTransientMessage", message }),
    reset: () => dispatch({ type: "reset" }),
  };
}
