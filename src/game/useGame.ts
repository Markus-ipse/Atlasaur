import { useEffect, useMemo, useReducer, useState } from "react";
import countriesData from "../data/countries.json";
import { normalize } from "../data/normalize";
import { pickRandom, pickNext, pickNextTraining } from "./pickCountry";
import {
  dueCount as srsDueCount,
  emptyStore,
  grade as srsGrade,
  loadSeenIntro,
  loadStore,
  newAvailableCount as srsNewAvailableCount,
  saveSeenIntro,
  saveStore,
} from "./srs";
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
} from "../types";

const COUNTRIES = countriesData as Country[];
const ISO3_BY_NUMERIC = new Map(COUNTRIES.map((c) => [c.numeric, c.iso3]));
const NUMERIC_BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c.numeric]));
const COUNTRY_BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));

const CONTINENTS_STORAGE_KEY = "atlasaur:selectedContinents";
const SHOW_LABELS_STORAGE_KEY = "atlasaur:showLabelsOnReveal";
const PRACTICE_MODE_STORAGE_KEY = "atlasaur:practiceMode";

function loadPracticeMode(): PracticeMode {
  try {
    const raw = window.localStorage.getItem(PRACTICE_MODE_STORAGE_KEY);
    if (raw === "training") return "training";
    return "exam";
  } catch {
    return "exam";
  }
}

function savePracticeMode(mode: PracticeMode): void {
  try {
    window.localStorage.setItem(PRACTICE_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

function filterPool(continents: readonly Continent[]): Country[] {
  const set = new Set(continents);
  return COUNTRIES.filter((c) => set.has(c.continent));
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

function loadShowLabels(): boolean {
  try {
    const raw = window.localStorage.getItem(SHOW_LABELS_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function saveShowLabels(value: boolean): void {
  try {
    window.localStorage.setItem(SHOW_LABELS_STORAGE_KEY, String(value));
  } catch {
    // localStorage may be unavailable (private mode, SSR); ignore.
  }
}

const FEEDBACK_DURATION = { correct: 600 } as const;
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
  current: Country;
  score: number;
  streak: number;
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
  pendingGrade: boolean;
};

export type Action =
  | { type: "answer"; iso3: string; now?: Date }
  | { type: "skip"; now?: Date }
  | { type: "dismiss"; now?: Date }
  | { type: "setMode"; mode: QuestionMode }
  | { type: "setPracticeMode"; mode: PracticeMode; now?: Date }
  | { type: "setContinents"; continents: readonly Continent[] }
  | { type: "endSession" }
  | { type: "startReview" }
  | { type: "grade"; ease: Ease; now?: Date }
  | { type: "resetSrs" }
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
  srsStore?: SrsStore;
  retryQueue?: RetryEntry[];
  completedSet?: Set<string>;
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
  const practiceMode = options.practiceMode ?? "exam";
  const selectedContinents = options.selectedContinents ?? ALL_CONTINENTS;
  const srsStore = options.srsStore ?? emptyStore();
  const pool = filterPool(selectedContinents);
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
    current,
    score: 0,
    streak: 0,
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
    pendingGrade: false,
  };
}

function pickInitialCountry(
  pool: Country[],
  practiceMode: PracticeMode,
  srsStore: SrsStore,
  retryQueue: readonly RetryEntry[],
): Country {
  if (practiceMode === "training") {
    const picked = pickNextTraining({
      pool,
      byIso3: COUNTRY_BY_ISO3,
      excludeIso3: "",
      srsStore,
      now: new Date(),
      newIntroducedThisStretch: 0,
    });
    if (picked) return picked;
  }
  return pickRandom(pool, retryQueue[0]?.iso3 ?? null);
}

function nextCurrent(state: State, now: Date = new Date()): Country {
  if (state.practiceMode === "training") {
    const picked = pickNextTraining({
      pool: filterPool(state.selectedContinents),
      byIso3: COUNTRY_BY_ISO3,
      excludeIso3: state.current.iso3,
      srsStore: state.srsStore,
      now,
      newIntroducedThisStretch: state.newIntroducedThisStretch,
    });
    // null = caught-up empty state. Caller surfaces the empty UI; we
    // keep `current` pointing at something to avoid undefined access.
    return picked ?? state.current;
  }
  return pickNext({
    pool: filterPool(state.selectedContinents),
    byIso3: COUNTRY_BY_ISO3,
    excludeIso3: state.current.iso3,
    total: state.total,
    retryQueue: state.retryQueue,
    phase: state.phase,
    completedSet: state.completedSet,
  });
}

function applyExamSrsWriteThrough(
  state: State,
  iso3: string,
  ease: Ease,
  now: Date,
): SrsStore {
  if (state.practiceMode !== "exam" || state.phase !== "normal") {
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

  if (state.practiceMode === "training") {
    // Training doesn't touch session counters or retryQueue.
    // Wrong → user must grade (pendingGrade). Skip → auto-grade Again
    // immediately so the user can dismiss without a button press.
    if (kind === "skipped") {
      const isNew = !state.srsStore.records[correctIso3];
      const nextRecord = srsGrade(
        state.srsStore.records[correctIso3] ?? null,
        "Again",
        now,
      );
      return {
        ...state,
        srsStore: {
          ...state.srsStore,
          records: { ...state.srsStore.records, [correctIso3]: nextRecord },
        },
        newIntroducedThisStretch: isNew
          ? state.newIntroducedThisStretch + 1
          : state.newIntroducedThisStretch,
        feedback,
        pendingGrade: false,
      };
    }
    return { ...state, feedback, pendingGrade: true };
  }

  // Exam mode.
  const srsStore = applyExamSrsWriteThrough(
    state,
    correctIso3,
    "Again",
    now,
  );

  if (state.phase === "review") {
    return {
      ...state,
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

  if (state.practiceMode === "training") {
    // Auto-Good; the existing CORRECT_DISMISS_MS timer dismisses.
    // Ease buttons may appear during the window for an override.
    const isNew = !state.srsStore.records[correctIso3];
    const nextRecord = srsGrade(
      state.srsStore.records[correctIso3] ?? null,
      "Good",
      now,
    );
    return {
      ...state,
      srsStore: {
        ...state.srsStore,
        records: { ...state.srsStore.records, [correctIso3]: nextRecord },
      },
      newIntroducedThisStretch: isNew
        ? state.newIntroducedThisStretch + 1
        : state.newIntroducedThisStretch,
      completedSet,
      feedback,
      pendingGrade: false,
    };
  }

  const srsStore = applyExamSrsWriteThrough(state, correctIso3, "Good", now);

  if (state.phase === "review") {
    return {
      ...state,
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

function dismissFeedback(state: State, now: Date): State {
  if (state.practiceMode === "training") {
    // Training never reaches review-phase exit or poolComplete branches;
    // every dismiss simply re-picks.
    return {
      ...state,
      current: nextCurrent(state, now),
      feedback: null,
      pendingGrade: false,
    };
  }
  if (state.phase === "review" && state.retryQueue.length === 0) {
    return { ...state, feedback: null, phase: "normal", sessionDone: true };
  }
  if (
    state.phase === "normal" &&
    poolComplete(
      filterPool(state.selectedContinents),
      state.completedSet,
      state.retryQueue,
    )
  ) {
    return { ...state, feedback: null, sessionDone: true };
  }
  return { ...state, current: nextCurrent(state, now), feedback: null };
}

export function reducer(state: State, action: Action): State {
  const now = nowOf(action);
  switch (action.type) {
    case "answer": {
      if (state.feedback || state.sessionDone) return state;
      const correctIso3 = state.current.iso3;
      return action.iso3 === correctIso3
        ? applyCorrect(state, correctIso3, now)
        : applyMiss(state, state.current, "wrong", action.iso3, now);
    }
    case "skip": {
      if (state.feedback || state.sessionDone) return state;
      return applyMiss(state, state.current, "skipped", "", now);
    }
    case "dismiss": {
      if (!state.feedback) return state;
      // Training: if a miss hasn't been graded yet, treat dismiss as
      // pressing the default ease (Again) — keeps Enter/Continue
      // working without explicitly picking a button.
      if (state.practiceMode === "training" && state.pendingGrade) {
        const iso3 = state.current.iso3;
        const isNew = !state.srsStore.records[iso3];
        const next = srsGrade(
          state.srsStore.records[iso3] ?? null,
          "Again",
          now,
        );
        const graded: State = {
          ...state,
          srsStore: {
            ...state.srsStore,
            records: { ...state.srsStore.records, [iso3]: next },
          },
          newIntroducedThisStretch: isNew
            ? state.newIntroducedThisStretch + 1
            : state.newIntroducedThisStretch,
          pendingGrade: false,
        };
        return dismissFeedback(graded, now);
      }
      return dismissFeedback(state, now);
    }
    case "setMode": {
      if (state.mode === action.mode) return state;
      // Question-mode flip resets in-session state (retryQueue,
      // completedSet, score) — those refer to the old question type.
      // Preserve cross-cutting state: practiceMode, srsStore, scope.
      return initialState({
        mode: action.mode,
        practiceMode: state.practiceMode,
        selectedContinents: state.selectedContinents,
        srsStore: state.srsStore,
      });
    }
    case "setPracticeMode": {
      if (state.practiceMode === action.mode) return state;
      // Preserve retryQueue + completedSet (so a quick Training detour
      // doesn't nuke the Exam in-session review queue), but reset
      // session counters and the soft cap.
      const next: State = {
        ...state,
        practiceMode: action.mode,
        score: 0,
        streak: 0,
        total: 0,
        missed: [],
        missedSet: new Set(),
        phase: "normal",
        feedback: null,
        sessionDone: false,
        newIntroducedThisStretch: 0,
        pendingGrade: false,
      };
      return { ...next, current: nextCurrent(next, now) };
    }
    case "setContinents": {
      if (action.continents.length === 0) return state;
      const pool = filterPool(action.continents);
      const inScope = new Set(pool.map((c) => c.iso3));
      const retryQueue = state.retryQueue.filter((e) => inScope.has(e.iso3));
      const current = inScope.has(state.current.iso3)
        ? state.current
        : pickRandom(pool, null);
      // completedSet is preserved across continent changes — out-of-scope
      // entries don't affect poolComplete (which only checks pool ∩ set)
      // and the displayed count is derived against the active scope.
      const reviewEmpty = state.phase === "review" && retryQueue.length === 0;
      const poolDone =
        state.phase === "normal" &&
        state.practiceMode === "exam" &&
        poolComplete(pool, state.completedSet, retryQueue);
      return {
        ...state,
        selectedContinents: action.continents,
        current,
        retryQueue,
        feedback: null,
        phase: reviewEmpty ? "normal" : state.phase,
        sessionDone: reviewEmpty || poolDone ? true : state.sessionDone,
      };
    }
    case "endSession": {
      return { ...state, sessionDone: true, feedback: null };
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
        current: country,
      };
    }
    case "grade": {
      if (state.practiceMode !== "training") return state;
      const iso3 = state.current.iso3;
      const isNew = !state.srsStore.records[iso3];
      const next = srsGrade(
        state.srsStore.records[iso3] ?? null,
        action.ease,
        now,
      );
      const graded: State = {
        ...state,
        srsStore: {
          ...state.srsStore,
          records: { ...state.srsStore.records, [iso3]: next },
        },
        newIntroducedThisStretch:
          isNew && !state.pendingGrade
            ? state.newIntroducedThisStretch + 1
            : state.newIntroducedThisStretch,
        pendingGrade: false,
      };
      // If feedback is currently shown (miss path), dismiss it and
      // advance. If it's a correct/skip overlay where grade was already
      // applied, the override just re-records — still advance.
      if (state.feedback) {
        return dismissFeedback(graded, now);
      }
      return graded;
    }
    case "resetSrs": {
      return {
        ...state,
        srsStore: emptyStore(),
        newIntroducedThisStretch: 0,
      };
    }
    case "reset": {
      return initialState({
        mode: state.mode,
        practiceMode: state.practiceMode,
        selectedContinents: state.selectedContinents,
        srsStore: state.srsStore,
      });
    }
  }
}

export type GameApi = {
  state: State;
  unlearnedCount: number;
  totalInScope: number;
  completedInScopeCount: number;
  dueCount: number;
  newAvailableCount: number;
  seenSrsIntro: boolean;
  markSrsIntroSeen: () => void;
  showLabelsOnReveal: boolean;
  setShowLabelsOnReveal: (value: boolean) => void;
  isoFromNumeric: (numeric: string) => string | undefined;
  numericFromIso3: (iso3: string) => string | undefined;
  nameFromIso3: (iso3: string) => string;
  isInScope: (iso3: string) => boolean;
  matchTypedAnswer: (input: string) => string;
  answer: (iso3: string) => void;
  skip: () => void;
  dismiss: () => void;
  setMode: (mode: QuestionMode) => void;
  setPracticeMode: (mode: PracticeMode) => void;
  setContinents: (continents: readonly Continent[]) => void;
  endSession: () => void;
  startReview: () => void;
  grade: (ease: Ease) => void;
  resetSrs: () => void;
  reset: () => void;
};

export function useGame(): GameApi {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState({
      mode: "name-to-click",
      practiceMode: loadPracticeMode(),
      selectedContinents: loadContinents(),
      srsStore: loadStore(),
    }),
  );
  const [showLabelsOnReveal, setShowLabelsOnReveal] = useState(loadShowLabels);
  const [seenSrsIntro, setSeenSrsIntro] = useState(loadSeenIntro);
  // Tick on visibility change + hourly to recompute due counts when the
  // day rolls over for users who leave the tab open.
  const [nowBucket, setNowBucket] = useState(() => Math.floor(Date.now() / 60_000));

  useEffect(() => {
    if (!state.feedback || state.feedback.kind !== "correct") return;
    const id = window.setTimeout(
      () => dispatch({ type: "dismiss", now: new Date() }),
      FEEDBACK_DURATION.correct,
    );
    return () => window.clearTimeout(id);
  }, [state.feedback]);

  useEffect(() => {
    saveContinents(state.selectedContinents);
  }, [state.selectedContinents]);

  useEffect(() => {
    saveShowLabels(showLabelsOnReveal);
  }, [showLabelsOnReveal]);

  useEffect(() => {
    savePracticeMode(state.practiceMode);
  }, [state.practiceMode]);

  useEffect(() => {
    saveStore(state.srsStore);
  }, [state.srsStore]);

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
    const continents = new Set(state.selectedContinents);
    const inScopeSet = new Set(
      COUNTRIES.filter((c) => continents.has(c.continent)).map((c) => c.iso3),
    );
    return {
      isInScope: (iso3: string) => inScopeSet.has(iso3),
      totalInScope: inScopeSet.size,
      scopeSet: inScopeSet,
    };
  }, [state.selectedContinents]);

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

  const markSrsIntroSeen = () => {
    if (seenSrsIntro) return;
    setSeenSrsIntro(true);
    saveSeenIntro(true);
  };

  return {
    state,
    unlearnedCount: state.retryQueue.length,
    totalInScope,
    dueCount,
    newAvailableCount,
    seenSrsIntro,
    markSrsIntroSeen,
    completedInScopeCount,
    showLabelsOnReveal,
    setShowLabelsOnReveal,
    isoFromNumeric,
    numericFromIso3,
    nameFromIso3,
    isInScope,
    matchTypedAnswer,
    answer: (iso3) => dispatch({ type: "answer", iso3, now: new Date() }),
    skip: () => dispatch({ type: "skip", now: new Date() }),
    dismiss: () => dispatch({ type: "dismiss", now: new Date() }),
    setMode: (mode) => dispatch({ type: "setMode", mode }),
    setPracticeMode: (mode) =>
      dispatch({ type: "setPracticeMode", mode, now: new Date() }),
    setContinents: (continents) =>
      dispatch({ type: "setContinents", continents }),
    endSession: () => dispatch({ type: "endSession" }),
    startReview: () => dispatch({ type: "startReview" }),
    grade: (ease) => dispatch({ type: "grade", ease, now: new Date() }),
    resetSrs: () => dispatch({ type: "resetSrs" }),
    reset: () => dispatch({ type: "reset" }),
  };
}
