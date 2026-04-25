import { useEffect, useReducer } from "react";
import countriesData from "../data/countries.json";
import { normalize } from "../data/normalize";
import { pickCountry, pickNext } from "./pickCountry";
import type {
  Country,
  Feedback,
  FeedbackKind,
  Mode,
  Phase,
  RetryEntry,
} from "../types";

const COUNTRIES = countriesData as Country[];
const ISO3_BY_NUMERIC = new Map(COUNTRIES.map((c) => [c.numeric, c.iso3]));
const NUMERIC_BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c.numeric]));
const COUNTRY_BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));

const FEEDBACK_DURATION = { correct: 600 } as const;
const RETRY_GAP_MIN = 3;
const RETRY_GAP_MAX = 5;

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const isoFromNumeric = (numeric: string) => ISO3_BY_NUMERIC.get(numeric);
const numericFromIso3 = (iso3: string) => NUMERIC_BY_ISO3.get(iso3);

function matchTypedAnswer(input: string): string {
  const n = normalize(input);
  if (!n) return "";
  for (const country of COUNTRIES) {
    const candidates = [country.name, ...country.aliases];
    if (candidates.some((c) => normalize(c) === n)) return country.iso3;
  }
  return "";
}

type State = {
  mode: Mode;
  current: Country;
  score: number;
  streak: number;
  bestStreak: number;
  total: number;
  missed: Country[];
  missedSet: Set<string>;
  retryQueue: RetryEntry[];
  phase: Phase;
  feedback: Feedback | null;
  sessionDone: boolean;
};

type Action =
  | { type: "answer"; iso3: string }
  | { type: "skip" }
  | { type: "continue" }
  | { type: "advance" }
  | { type: "setMode"; mode: Mode }
  | { type: "endSession" }
  | { type: "startReview" }
  | { type: "reset" };

function initialState(mode: Mode = "name-to-click"): State {
  return {
    mode,
    current: pickCountry(COUNTRIES, null),
    score: 0,
    streak: 0,
    bestStreak: 0,
    total: 0,
    missed: [],
    missedSet: new Set(),
    retryQueue: [],
    phase: "normal",
    feedback: null,
    sessionDone: false,
  };
}

function nextCurrent(state: State): Country {
  return pickNext({
    pool: COUNTRIES,
    byIso3: COUNTRY_BY_ISO3,
    excludeIso3: state.current.iso3,
    total: state.total,
    retryQueue: state.retryQueue,
    phase: state.phase,
  });
}

function withoutIso3(queue: readonly RetryEntry[], iso3: string): RetryEntry[] {
  return queue.filter((e) => e.iso3 !== iso3);
}

function applyMiss(
  state: State,
  current: Country,
  kind: Extract<FeedbackKind, "wrong" | "skipped">,
  answerIso3: string,
): State {
  const correctIso3 = current.iso3;
  const feedback: Feedback = { kind, answerIso3, correctIso3 };

  if (state.phase === "review") {
    return {
      ...state,
      retryQueue: [
        ...withoutIso3(state.retryQueue, correctIso3),
        { iso3: correctIso3, dueAt: state.total },
      ],
      feedback,
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
  };
}

function applyCorrect(state: State, correctIso3: string): State {
  const feedback: Feedback = {
    kind: "correct",
    answerIso3: correctIso3,
    correctIso3,
  };

  if (state.phase === "review") {
    return {
      ...state,
      retryQueue: withoutIso3(state.retryQueue, correctIso3),
      feedback,
    };
  }

  const inRetry = state.retryQueue.some((e) => e.iso3 === correctIso3);
  const nextStreak = state.streak + 1;
  return {
    ...state,
    score: state.score + 1,
    streak: nextStreak,
    bestStreak: Math.max(state.bestStreak, nextStreak),
    total: state.total + 1,
    retryQueue: inRetry
      ? withoutIso3(state.retryQueue, correctIso3)
      : state.retryQueue,
    feedback,
  };
}

function dismissFeedback(state: State): State {
  if (state.phase === "review" && state.retryQueue.length === 0) {
    return { ...state, feedback: null, phase: "normal", sessionDone: true };
  }
  return { ...state, current: nextCurrent(state), feedback: null };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "answer": {
      if (state.feedback || state.sessionDone) return state;
      const correctIso3 = state.current.iso3;
      return action.iso3 === correctIso3
        ? applyCorrect(state, correctIso3)
        : applyMiss(state, state.current, "wrong", action.iso3);
    }
    case "skip": {
      if (state.feedback || state.sessionDone) return state;
      return applyMiss(state, state.current, "skipped", "");
    }
    case "advance": {
      if (!state.feedback) return state;
      return dismissFeedback(state);
    }
    case "continue": {
      if (!state.feedback || state.feedback.kind === "correct") return state;
      return dismissFeedback(state);
    }
    case "setMode": {
      if (state.mode === action.mode) return state;
      return initialState(action.mode);
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
    case "reset": {
      return initialState(state.mode);
    }
  }
}

export type GameApi = {
  state: State;
  isoFromNumeric: (numeric: string) => string | undefined;
  numericFromIso3: (iso3: string) => string | undefined;
  matchTypedAnswer: (input: string) => string;
  answer: (iso3: string) => void;
  skip: () => void;
  continue: () => void;
  setMode: (mode: Mode) => void;
  endSession: () => void;
  startReview: () => void;
  reset: () => void;
};

export function useGame(): GameApi {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState());

  useEffect(() => {
    if (!state.feedback || state.feedback.kind !== "correct") return;
    const id = window.setTimeout(
      () => dispatch({ type: "advance" }),
      FEEDBACK_DURATION.correct,
    );
    return () => window.clearTimeout(id);
  }, [state.feedback]);

  return {
    state,
    isoFromNumeric,
    numericFromIso3,
    matchTypedAnswer,
    answer: (iso3) => dispatch({ type: "answer", iso3 }),
    skip: () => dispatch({ type: "skip" }),
    continue: () => dispatch({ type: "continue" }),
    setMode: (mode) => dispatch({ type: "setMode", mode }),
    endSession: () => dispatch({ type: "endSession" }),
    startReview: () => dispatch({ type: "startReview" }),
    reset: () => dispatch({ type: "reset" }),
  };
}
