import { useEffect, useReducer } from "react";
import countriesData from "../data/countries.json";
import { normalize } from "../data/normalize";
import { pickCountry } from "./pickCountry";
import type { Country, Feedback, Mode } from "../types";

const COUNTRIES = countriesData as Country[];
const ISO3_BY_NUMERIC = new Map(COUNTRIES.map((c) => [c.numeric, c.iso3]));
const COUNTRY_BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));

const FEEDBACK_DURATION = {
  correct: 600,
  wrong: 1200,
  skipped: 800,
} as const;

type State = {
  mode: Mode;
  current: Country;
  score: number;
  streak: number;
  bestStreak: number;
  total: number;
  missed: Country[];
  feedback: Feedback | null;
  sessionDone: boolean;
};

type Action =
  | { type: "answer"; iso3: string }
  | { type: "skip" }
  | { type: "advance" }
  | { type: "setMode"; mode: Mode }
  | { type: "endSession" }
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
    feedback: null,
    sessionDone: false,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "answer": {
      if (state.feedback || state.sessionDone) return state;
      const correctIso3 = state.current.iso3;
      const isCorrect = action.iso3 === correctIso3;
      const nextStreak = isCorrect ? state.streak + 1 : 0;
      return {
        ...state,
        score: isCorrect ? state.score + 1 : state.score,
        streak: nextStreak,
        bestStreak: Math.max(state.bestStreak, nextStreak),
        total: state.total + 1,
        missed: isCorrect ? state.missed : [...state.missed, state.current],
        feedback: {
          kind: isCorrect ? "correct" : "wrong",
          answerIso3: action.iso3,
          correctIso3,
        },
      };
    }
    case "skip": {
      if (state.feedback || state.sessionDone) return state;
      return {
        ...state,
        streak: 0,
        total: state.total + 1,
        missed: [...state.missed, state.current],
        feedback: {
          kind: "skipped",
          answerIso3: "",
          correctIso3: state.current.iso3,
        },
      };
    }
    case "advance": {
      if (!state.feedback) return state;
      return {
        ...state,
        current: pickCountry(COUNTRIES, state.current.iso3),
        feedback: null,
      };
    }
    case "setMode": {
      if (state.mode === action.mode) return state;
      return { ...initialState(action.mode) };
    }
    case "endSession": {
      return { ...state, sessionDone: true, feedback: null };
    }
    case "reset": {
      return initialState(state.mode);
    }
  }
}

export type GameApi = {
  state: State;
  countries: readonly Country[];
  isoFromNumeric: (numeric: string) => string | undefined;
  countryFromIso3: (iso3: string) => Country | undefined;
  matchTypedAnswer: (input: string) => string;
  answer: (iso3: string) => void;
  skip: () => void;
  setMode: (mode: Mode) => void;
  endSession: () => void;
  reset: () => void;
};

export function useGame(): GameApi {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState());

  useEffect(() => {
    if (!state.feedback) return;
    const ms = FEEDBACK_DURATION[state.feedback.kind];
    const id = window.setTimeout(() => dispatch({ type: "advance" }), ms);
    return () => window.clearTimeout(id);
  }, [state.feedback]);

  const matchTypedAnswer = (input: string): string => {
    const n = normalize(input);
    if (!n) return "";
    for (const country of COUNTRIES) {
      const candidates = [country.name, ...country.aliases];
      if (candidates.some((c) => normalize(c) === n)) return country.iso3;
    }
    return "";
  };

  return {
    state,
    countries: COUNTRIES,
    isoFromNumeric: (numeric) => ISO3_BY_NUMERIC.get(numeric),
    countryFromIso3: (iso3) => COUNTRY_BY_ISO3.get(iso3),
    matchTypedAnswer,
    answer: (iso3) => dispatch({ type: "answer", iso3 }),
    skip: () => dispatch({ type: "skip" }),
    setMode: (mode) => dispatch({ type: "setMode", mode }),
    endSession: () => dispatch({ type: "endSession" }),
    reset: () => dispatch({ type: "reset" }),
  };
}
