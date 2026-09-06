import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import countriesData from "../data/countries.json";
import { normalize } from "../data/normalize";
import { pickRandom, pickNext, pickNextStudy } from "./pickCountry";
import {
  dueCount as srsDueCount,
  emptyStore,
  grade as srsGrade,
  loadSeenIntro,
  loadSeenWelcome,
  loadStore,
  masteryTierOf,
  newAvailableCount as srsNewAvailableCount,
  saveSeenIntro,
  saveSeenWelcome,
  saveStore,
} from "./srs";
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
  type Continent,
  type Country,
  type Ease,
  type Feedback,
  type FeedbackKind,
  type PracticeMode,
  type QuestionMode,
  type Phase,
  type RetryEntry,
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

const CONTINENTS_STORAGE_KEY = "atlasaur:selectedContinents";
const TERRITORIES_STORAGE_KEY = "atlasaur:includeTerritories";

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
// and uninhabited land unless the learner has opted them in. The single
// scope predicate — every count, picker and map fill derives from it.
function filterPool(
  continents: readonly Continent[],
  includeTerritories: boolean,
): Country[] {
  const set = new Set(continents);
  return COUNTRIES.filter(
    (c) => set.has(c.continent) && (includeTerritories || !c.territory),
  );
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
): { continents: readonly Continent[]; pool: Country[] } {
  const pool = filterPool(continents, includeTerritories);
  if (pool.length > 0) return { continents, pool };
  return {
    continents: ALL_CONTINENTS,
    pool: filterPool(ALL_CONTINENTS, includeTerritories),
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

function matchTypedAnswer(input: string): string {
  const n = normalize(input);
  if (!n) return "";
  for (const country of COUNTRIES) {
    const candidates = [country.name, ...country.aliases];
    if (candidates.some((c) => normalize(c) === n)) return country.iso3;
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
  // One-shot toast message (e.g. "Spotlight cleared"). Auto-dismissed by a
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
  // Rounds finished this session. The unit R1.3's cross-day streak counts.
  roundsCompleted: number;
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
};

export type Action =
  | { type: "answer"; iso3: string; now?: Date }
  | { type: "skip"; now?: Date }
  | { type: "dismiss"; now?: Date }
  | { type: "setMode"; mode: QuestionMode }
  // An expedition is entered only through startExpedition, which carries the
  // day's store; setPracticeMode leaves one, never enters it.
  | { type: "setPracticeMode"; mode: Exclude<PracticeMode, "expedition">; now?: Date }
  | { type: "startExpedition"; store: ExpeditionStore; now?: Date }
  // Another tab wrote the expedition store. Adopted only when it is further
  // along (see `supersedes`); a run in progress here jumps to its card.
  | { type: "syncExpedition"; store: ExpeditionStore | null }
  | { type: "setContinents"; continents: readonly Continent[]; now?: Date }
  | { type: "setIncludeTerritories"; value: boolean; now?: Date }
  | { type: "endSession" }
  | { type: "continueRound"; now?: Date }
  | { type: "startReview" }
  | { type: "resetSrs" }
  | { type: "closeSummary"; now?: Date }
  | { type: "setSpotlight"; subregion: Subregion; now?: Date }
  | { type: "clearSpotlight" }
  | { type: "setTransientMessage"; message: string }
  | { type: "clearTransientMessage" }
  | { type: "reset" };

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
  );
  const srsStore = options.srsStore ?? emptyStore();
  const current = pickInitialCountry(
    pool,
    practiceMode,
    srsStore,
    options.retryQueue ?? [],
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
    srsStore,
    newIntroducedThisStretch: 0,
    studyResurfaceQueue: [],
    studyStep: 0,
    autoGradePending: null,
    spotlightSubregion: null,
    transientMessage: null,
    ...FRESH_ROUND,
    roundsCompleted: 0,
    // Not carried across a rebuild: the persisted counters hold the lifetime
    // total, and the hook records growth, so restarting from 0 is a no-op
    // rather than a double count.
    cardsAnswered: 0,
    expedition: options.expedition ?? null,
    modeBeforeExpedition: null,
  };
}

const FRESH_ROUND = {
  roundCards: 0,
  roundRight: 0,
  roundNew: 0,
  roundDone: false,
} as const;

// Count the card whose feedback just dismissed against the current round,
// and open the interstitial when the round fills. A state that has already
// ended the session (Quiz pool complete, review queue drained) keeps its
// summary; the round is still counted so a "Done for now" straight after
// still credits it.
function withRoundAdvance(
  state: State,
  kind: FeedbackKind,
  isNew: boolean,
): State {
  const roundCards = state.roundCards + 1;
  // An expedition is a round of ten whose every credit is taken at answer
  // time (applyCorrect / applyMiss): the answer count here, and the finish in
  // the hook, off the store itself. advanceCard raises the result card
  // (sessionDone) when the tenth dismisses, so the interstitial never
  // appears inside one, and `roundsCompleted` stays a Study / test figure.
  const expedition = state.practiceMode === "expedition";
  const filled = !expedition && roundCards >= ROUND_SIZE;
  return {
    ...state,
    roundCards,
    cardsAnswered: expedition ? state.cardsAnswered : state.cardsAnswered + 1,
    roundRight: state.roundRight + (kind === "correct" ? 1 : 0),
    roundNew: state.roundNew + (isNew ? 1 : 0),
    roundDone: filled && !state.sessionDone,
    roundsCompleted: filled ? state.roundsCompleted + 1 : state.roundsCompleted,
  };
}

function pickInitialCountry(
  pool: Country[],
  practiceMode: PracticeMode,
  srsStore: SrsStore,
  retryQueue: readonly RetryEntry[],
): Country {
  if (practiceMode === "study") {
    const picked = pickNextStudy({
      pool,
      byIso3: COUNTRY_BY_ISO3,
      excludeIso3: "",
      srsStore,
      now: new Date(),
      newIntroducedThisStretch: 0,
      resurfaceQueue: [],
      step: 0,
    });
    if (picked) return picked;
  }
  return pickRandom(pool, retryQueue[0]?.iso3 ?? null);
}

function nextCurrent(state: State, now: Date = new Date()): Country {
  if (state.practiceMode === "study") {
    // Spotlight narrows the Study pool to one subregion (the narrowing
    // lives here, not in filterPool/pickNextStudy, so it can't leak into
    // Quiz's shared pickNext path).
    let pool = filterPool(state.selectedContinents, state.includeTerritories);
    if (state.spotlightSubregion !== null) {
      pool = pool.filter((c) => c.subregion === state.spotlightSubregion);
    }
    const picked = pickNextStudy({
      pool,
      byIso3: COUNTRY_BY_ISO3,
      excludeIso3: state.current.iso3,
      srsStore: state.srsStore,
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
    pool: filterPool(state.selectedContinents, state.includeTerritories),
    byIso3: COUNTRY_BY_ISO3,
    excludeIso3: state.current.iso3,
    total: state.total,
    retryQueue: state.retryQueue,
    phase: state.phase,
    completedSet: state.completedSet,
  });
}

const SPOTLIGHT_CLEARED_MESSAGE = "Spotlight cleared — back to full scope";

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
      transientMessage: SPOTLIGHT_CLEARED_MESSAGE,
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
// miss retryQueue already tracks. An expedition has no review pass.
function applyImmediateSrsWriteThrough(
  state: State,
  iso3: string,
  ease: Ease,
  now: Date,
): SrsStore {
  if (state.practiceMode === "study" || state.phase !== "normal") {
    return state.srsStore;
  }
  const next = srsGrade(state.srsStore.records[iso3] ?? null, ease, now);
  return {
    ...state.srsStore,
    records: { ...state.srsStore.records, [iso3]: next },
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
function applyScope(
  state: State,
  continents: readonly Continent[],
  includeTerritories: boolean,
  now: Date,
): State {
  if (state.practiceMode === "expedition") {
    // The expedition ignores scope by design: the ten are the same for
    // everyone. The setting is kept for when the learner comes back to
    // studying; the current card and the reveal stay where they are.
    const normalized = normalizeScope(continents, includeTerritories);
    const inScope = new Set(normalized.pool.map((c) => c.iso3));
    return {
      ...state,
      selectedContinents: normalized.continents,
      includeTerritories,
      retryQueue: state.retryQueue.filter((e) => inScope.has(e.iso3)),
      studyResurfaceQueue: state.studyResurfaceQueue.filter((e) =>
        inScope.has(e.iso3),
      ),
    };
  }
  // A Study reveal that is open when the scope changes still holds its
  // deferred grade. Commit it first (as endSession does) so the answer and
  // its resurface scheduling reach the SRS store instead of vanishing with
  // the feedback.
  if (state.practiceMode === "study" && state.autoGradePending) {
    state = {
      ...state,
      ...commitStudyGrade(state, state.autoGradePending, state.studyStep, now),
      autoGradePending: null,
    };
  }
  const normalized = normalizeScope(continents, includeTerritories);
  continents = normalized.continents;
  const pool = normalized.pool;
  const inScope = new Set(pool.map((c) => c.iso3));
  const retryQueue = state.retryQueue.filter((e) => inScope.has(e.iso3));
  const studyResurfaceQueue = state.studyResurfaceQueue.filter((e) =>
    inScope.has(e.iso3),
  );
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
  const feedback: Feedback = { kind, answerIso3, correctIso3 };

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

  if (state.practiceMode === "expedition" && state.expedition) {
    // The outcome is recorded at answer time, not at dismiss, so an
    // expedition abandoned mid-reveal keeps this answer; it resumes on the
    // next card. The answer is counted now too, while the mode it was given
    // in is still current. A skip is a miss, and an empty glyph.
    return {
      ...state,
      streak: 0,
      feedback,
      srsStore,
      expedition: recordOutcome(state.expedition, "missed"),
      cardsAnswered: state.cardsAnswered + 1,
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
      state.srsStore.records[correctIso3] ?? null,
      "Good",
      now,
    );
    return {
      ...state,
      completedSet,
      streak: state.streak + 1,
      milestone: milestoneFor(
        state.current,
        state.srsStore,
        prospective,
        filterPool(state.selectedContinents, state.includeTerritories),
      ),
      feedback,
      autoGradePending: "Good",
    };
  }

  const srsStore = applyImmediateSrsWriteThrough(state, correctIso3, "Good", now);

  if (state.practiceMode === "expedition" && state.expedition) {
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
      expedition: recordOutcome(state.expedition, "found"),
      cardsAnswered: state.cardsAnswered + 1,
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
  const rec = state.srsStore.records[iso3];
  const isNew = !rec;
  const next = srsGrade(rec ?? null, ease, now);
  return {
    srsStore: {
      ...state.srsStore,
      records: { ...state.srsStore.records, [iso3]: next },
    },
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
  const kind = state.feedback?.kind ?? "correct";
  const isNew =
    state.practiceMode === "study" &&
    state.autoGradePending !== null &&
    !state.srsStore.records[state.current.iso3];
  return withRoundAdvance(advanceCard(state, now), kind, isNew);
}

function advanceCard(state: State, now: Date): State {
  if (state.practiceMode === "expedition" && state.expedition) {
    // The outcome was recorded at answer time; the next card is simply the
    // next of the ten. After the tenth, the result card is the summary.
    const next = COUNTRY_BY_ISO3.get(
      state.expedition.iso3s[state.expedition.outcomes.length] ?? "",
    );
    if (!next || expeditionFinished(state.expedition)) {
      return { ...state, feedback: null, milestone: null, sessionDone: true };
    }
    return { ...state, current: next, feedback: null, milestone: null };
  }
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
    return { ...updated, current, spotlightSubregion, transientMessage };
  }
  if (state.phase === "review" && state.retryQueue.length === 0) {
    return { ...state, feedback: null, milestone: null, phase: "normal", sessionDone: true };
  }
  if (
    state.phase === "normal" &&
    poolComplete(
      filterPool(state.selectedContinents, state.includeTerritories),
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
    completedSet: startingTest ? new Set() : state.completedSet,
    retryQueue: startingTest ? [] : state.retryQueue,
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
    // A new round type starts a fresh round.
    ...FRESH_ROUND,
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
      // Question-mode flip resets in-session state (retryQueue,
      // completedSet, score) — those refer to the old question type.
      // Preserve cross-cutting state: practiceMode, srsStore, scope, and
      // today's expedition.
      return initialState({
        mode: action.mode,
        practiceMode: state.practiceMode,
        selectedContinents: state.selectedContinents,
        includeTerritories: state.includeTerritories,
        srsStore: state.srsStore,
        expedition: state.expedition,
      });
    }
    case "setPracticeMode": {
      if (state.practiceMode === action.mode) return state;
      return enterPracticeMode(state, action.mode, now);
    }
    case "startExpedition": {
      const store = action.store;
      // Reached from the Today card and the Study summary, where no card is
      // open — but a Study grade in flight is committed all the same, as
      // every other exit does.
      const committed =
        state.practiceMode === "study" && state.autoGradePending
          ? commitStudyGrade(state, state.autoGradePending, state.studyStep, now)
          : null;
      const current = COUNTRY_BY_ISO3.get(
        store.iso3s[store.outcomes.length] ?? "",
      );
      return {
        ...state,
        ...(committed ?? {}),
        practiceMode: "expedition",
        expedition: store,
        // Name → Click only; the learner's own choice is restored on leaving.
        mode: "name-to-click",
        modeBeforeExpedition:
          state.practiceMode === "expedition"
            ? state.modeBeforeExpedition
            : state.mode,
        // A resumed expedition keeps its place: the round counters pick up at
        // the answers already given, so the round chip reads "5/10" and the
        // started counter does not fire a second time.
        current: current ?? state.current,
        score: 0,
        streak: 0,
        milestone: null,
        total: 0,
        missed: [],
        missedSet: new Set(),
        phase: "normal",
        feedback: null,
        // A finished expedition opens straight onto its result card, which is
        // its summary; there is no replay.
        sessionDone: expeditionFinished(store),
        studyResurfaceQueue: [],
        studyStep: 0,
        autoGradePending: null,
        spotlightSubregion: null,
        roundCards: store.outcomes.length,
        roundRight: foundCount(store),
        roundNew: 0,
        roundDone: false,
      };
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
      if (!store || !expeditionSupersedes(store, state.expedition)) return state;
      if (state.practiceMode !== "expedition") {
        return { ...state, expedition: store };
      }
      // Mid-run: the other tab has answered cards this one is still showing.
      // Move to the card after its last answer, closing any reveal here — the
      // answer it was for is recorded, by the other tab. After the tenth,
      // the result card, as advanceCard would. A later day's store (the other
      // tab opened tomorrow's past midnight) lands on its first card the
      // same way; the start was credited by the tab that built it.
      const current = COUNTRY_BY_ISO3.get(
        store.iso3s[store.outcomes.length] ?? "",
      );
      return {
        ...state,
        expedition: store,
        current: current ?? state.current,
        feedback: null,
        milestone: null,
        sessionDone: expeditionFinished(store),
        roundCards: store.outcomes.length,
        roundRight: foundCount(store),
        roundDone: false,
      };
    }
    case "endSession": {
      // "Done" inside an expedition leaves it rather than ending it: the
      // answers given so far are already in the store, and it resumes from
      // the Today card or the Study summary. Its summary is the result card,
      // which only a finished expedition has.
      if (state.practiceMode === "expedition") {
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
      // If Study has an auto-grade in flight (correct-flash or miss
      // waiting on dismiss), commit it before bowing out — otherwise the
      // user's last interaction silently produces no SRS record. No card
      // is advanced here, so a re-queued miss schedules against the
      // current studyStep — it resurfaces ~gap cards after "Keep studying".
      if (state.practiceMode === "study" && state.autoGradePending) {
        const committed = commitStudyGrade(
          state,
          state.autoGradePending,
          state.studyStep,
          now,
        );
        return {
          ...state,
          ...committed,
          autoGradePending: null,
          milestone: null,
          sessionDone: true,
          feedback: null,
          // The card was answered — the learner saw the feedback and then left.
          // It never reaches withRoundAdvance, so count it here or the mode mix
          // and the first-session depth quietly lose it.
          cardsAnswered: state.cardsAnswered + 1,
          roundDone: false,
        };
      }
      return {
        ...state,
        sessionDone: true,
        feedback: null,
        milestone: null,
        // Same in Quiz, where the grade was written through at answer time.
        cardsAnswered: state.feedback
          ? state.cardsAnswered + 1
          : state.cardsAnswered,
        roundDone: false,
      };
    }
    case "continueRound": {
      if (!state.roundDone) return state;
      return { ...state, ...FRESH_ROUND };
    }
    case "startReview": {
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
        ...FRESH_ROUND,
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
        ...FRESH_ROUND,
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
        ...FRESH_ROUND,
      };
      if (state.practiceMode === "study") {
        const { current, spotlightSubregion, transientMessage } =
          pickStudyWithSpotlightFallback(next, now);
        return { ...next, current, spotlightSubregion, transientMessage };
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
        ...FRESH_ROUND,
      };
      const { current, spotlightSubregion, transientMessage } =
        pickStudyWithSpotlightFallback(next, now);
      return { ...next, current, spotlightSubregion, transientMessage };
    }
    case "clearSpotlight": {
      return { ...state, spotlightSubregion: null };
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
  completedInScopeCount: number;
  dueCount: number;
  newAvailableCount: number;
  seenSrsIntro: boolean;
  markSrsIntroSeen: () => void;
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
  isInScope: (iso3: string) => boolean;
  // The learnable set (continents × territories setting). Components must
  // read scope from here rather than recomputing it from continents.
  scopeSet: ReadonlySet<string>;
  matchTypedAnswer: (input: string) => string;
  answer: (iso3: string) => void;
  skip: () => void;
  dismiss: () => void;
  setMode: (mode: QuestionMode) => void;
  setPracticeMode: (mode: Exclude<PracticeMode, "expedition">) => void;
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
      mode: "name-to-click",
      // Study is the home. A "Test me on these" round is entered
      // deliberately from the Study summary and is never persisted, so a
      // reload always lands back on Study.
      practiceMode: "study",
      selectedContinents: loadContinents(),
      includeTerritories: loadIncludeTerritories(),
      srsStore: loadStore(),
      // A stored set this build cannot ask (a country dropped from the
      // table) is discarded rather than half-asked.
      expedition: loadExpedition((iso3) => COUNTRY_BY_ISO3.has(iso3)),
    }),
  );
  const [seenSrsIntro, setSeenSrsIntro] = useState(loadSeenIntro);
  const [streakStore, setStreakStore] = useState(loadStreak);
  // Local counters (R2.4). Recorded from state transitions here rather than in
  // the reducer, the same way the streak is, so the reducer stays pure and
  // every persisted side effect lives in one place.
  // `startSession` runs in the initialiser, before anything can be recorded:
  // answers already on the store belong to an earlier sitting, and a profile
  // that had SRS records before this key existed has no measurable first
  // session at all.
  const [counters, setCounters] = useState(() =>
    startSession(
      loadCounters(),
      Object.keys(loadStore().records).length > 0,
    ),
  );
  // Read by the counter effects below, which fire on a card or round count and
  // must not re-run when only the mode changes.
  const modeRef = useRef(state.mode);
  modeRef.current = state.mode;
  const practiceModeRef = useRef(state.practiceMode);
  practiceModeRef.current = state.practiceMode;
  // Returning learner = any SRS record at load. Decided once so the card
  // doesn't appear mid-session after the first answer.
  const [todayCardOpen, setTodayCardOpen] = useState(
    () => Object.keys(state.srsStore.records).length > 0,
  );
  const [welcomeOpen, setWelcomeOpen] = useState(
    () =>
      !loadSeenWelcome() && Object.keys(state.srsStore.records).length === 0,
  );
  // Tick on visibility change + hourly to recompute due counts when the
  // day rolls over for users who leave the tab open.
  const [nowBucket, setNowBucket] = useState(() => Math.floor(Date.now() / 60_000));

  useEffect(() => {
    if (!state.feedback || state.feedback.kind !== "correct") return;
    const ordinary =
      state.mode === "name-to-click"
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

  useEffect(() => {
    saveStore(state.srsStore);
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
      dispatch({
        type: "syncExpedition",
        store: parseExpedition(e.newValue, (iso3) => COUNTRY_BY_ISO3.has(iso3)),
      });
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

  // Finished means the round filled to ROUND_SIZE, which is what
  // `roundsCompleted` counts. That includes a round whose twelfth card also
  // ended the session, so no interstitial was shown — deliberate, and the same
  // rounds the streak counts as a day played.
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
  const knownEverywhere = useMemo(() => {
    let n = 0;
    for (const iso3 in state.srsStore.records) {
      if (masteryTierOf(state.srsStore.records[iso3]) === 2) n++;
    }
    return n;
  }, [state.srsStore]);
  useEffect(() => {
    setCounters((c) => recordKnown(c, knownEverywhere, new Date()));
  }, [knownEverywhere]);

  // A finished round marks today on the streak. recordDay returns the same
  // store when today is already there, so the save effect below is quiet.
  useEffect(() => {
    if (state.roundsCompleted === 0) return;
    setStreakStore((prev) => recordDay(prev, new Date()));
  }, [state.roundsCompleted]);

  // A finished expedition is a finished round, credited off the store the
  // moment its tenth answer lands rather than at that answer's dismiss — the
  // commoner ending for the last card is the tab closing on its reveal, and
  // the store cannot say afterwards whether it was ever credited. Keyed on
  // the day so a store loaded already finished (the ref starts at it) is not
  // credited again, and tomorrow's is.
  const finishedExpeditionDay =
    state.expedition && expeditionFinished(state.expedition)
      ? state.expedition.day
      : null;
  const lastFinishedExpeditionRef = useRef(finishedExpeditionDay);
  useEffect(() => {
    const prev = lastFinishedExpeditionRef.current;
    lastFinishedExpeditionRef.current = finishedExpeditionDay;
    if (finishedExpeditionDay === null || finishedExpeditionDay === prev) return;
    setStreakStore((s) => recordDay(s, new Date()));
    setCounters(recordRoundFinished);
  }, [finishedExpeditionDay]);

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

  useEffect(() => {
    const tick = () => setNowBucket(Math.floor(Date.now() / 60_000));
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(tick, 60 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, []);

  const { isInScope, totalInScope, scopeSet } = useMemo(() => {
    // During an expedition the learnable set is the whole world: every
    // country in its own right is a possible answer and a clickable one, and
    // the map frames all of it.
    const pool =
      state.practiceMode === "expedition"
        ? EXPEDITION_POOL
        : filterPool(state.selectedContinents, state.includeTerritories);
    const inScopeSet = new Set(pool.map((c) => c.iso3));
    return {
      isInScope: (iso3: string) => inScopeSet.has(iso3),
      totalInScope: inScopeSet.size,
      scopeSet: inScopeSet as ReadonlySet<string>,
    };
  }, [state.selectedContinents, state.includeTerritories, state.practiceMode]);

  const completedInScopeCount = useMemo(() => {
    let n = 0;
    state.completedSet.forEach((iso3) => {
      if (isInScope(iso3)) n++;
    });
    return n;
  }, [state.completedSet, isInScope]);

  const dueCount = useMemo(
    () => srsDueCount(state.srsStore, scopeSet, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.srsStore, scopeSet, nowBucket],
  );

  const newAvailableCount = useMemo(
    () => srsNewAvailableCount(state.srsStore, scopeSet),
    [state.srsStore, scopeSet],
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
    newAvailableCount,
    seenSrsIntro,
    markSrsIntroSeen,
    streak,
    expeditionToday,
    startExpedition: () => {
      const now = new Date();
      const day = dayKey(now);
      const fresh = !(state.expedition && state.expedition.day === day);
      const store = fresh
        ? newExpedition(day, EXPEDITION_POOL)
        : state.expedition!;
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
    completedInScopeCount,
    isoFromNumeric,
    numericFromIso3,
    nameFromIso3,
    isInScope,
    scopeSet,
    matchTypedAnswer,
    answer: (iso3) => dispatch({ type: "answer", iso3, now: new Date() }),
    skip: () => dispatch({ type: "skip", now: new Date() }),
    dismiss: () => dispatch({ type: "dismiss", now: new Date() }),
    setMode: (mode) => dispatch({ type: "setMode", mode }),
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
      // firstSessionAnswers against a session the learner no longer has.
      dispatch({ type: "resetSrs" });
      setStreakStore(emptyStreak());
      setCounters(startSession(emptyCounters(), false));
      saveSeenWelcome(false);
    },
    closeSummary: () => dispatch({ type: "closeSummary", now: new Date() }),
    setSpotlight: (subregion) =>
      dispatch({ type: "setSpotlight", subregion, now: new Date() }),
    clearSpotlight: () => dispatch({ type: "clearSpotlight" }),
    setTransientMessage: (message) =>
      dispatch({ type: "setTransientMessage", message }),
    reset: () => dispatch({ type: "reset" }),
  };
}
