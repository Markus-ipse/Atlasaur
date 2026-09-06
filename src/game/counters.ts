// Local counters (R2.4). The survey's "What to measure" list, kept in one
// versioned localStorage key so the maintainer and any curious learner read
// the same numbers. No backend, no network, nothing leaves the device — if
// aggregate numbers are ever wanted, that has to be an explicit opt-in that
// sends only these.
//
// Deliberately not here: "distinct days with a completed round, and the gap
// between them". The cross-day streak store already records exactly those days
// (`atlasaur:streak:v1`), so `returnInfo` below reads them rather than keeping
// a second copy that could disagree.

import type { PracticeMode, QuestionMode } from "../types";
import {
  dayKey,
  daysBetween,
  isDayKey,
  MAX_DAYS,
  type StreakStore,
} from "./streak";

const COUNTERS_STORAGE_KEY = "atlasaur:counters:v1";
const STORE_VERSION = 1;
// One entry per day the known count *changed*, so 400 of them span at least
// 400 days and usually far more — unlike the streak store's cap, which is 400
// calendar days. Every window this file reports on is a week, so the trim can
// never remove a baseline a caller still needs.
const MAX_KNOWN_DAYS = 400;

export type Counters = {
  version: 1;
  // Cards answered in the learner's first sitting. Frozen once
  // `firstSessionEnded` is set, so it stays a measure of that sitting however
  // long the profile lives. Under twelve means the welcome screen and the
  // first round are not carrying a stranger far enough.
  //
  // A sitting ends when the learner reaches a summary OR when they simply
  // close the tab, which is the commoner case for exactly the bouncing
  // learners this measures — so `startSession` freezes it on any load that
  // finds answers already counted. A profile that predates this key freezes it
  // at zero instead, and the Data view omits the row, because a backfilled
  // figure would be a different session wearing the first one's label.
  firstSessionAnswers: number;
  firstSessionEnded: boolean;
  // Loads of the app, counted before anything else happens. Its only job is to
  // recognise a second visit: a learner who opens Atlasaur, answers nothing and
  // closes the tab leaves no other trace, and their first session — a bounce at
  // zero cards, the most important reading this metric has — would otherwise be
  // handed to whatever they do on the next visit.
  sessionsStarted: number;
  // Rounds begun against rounds carried to the interstitial. Tells us whether
  // twelve is the right size.
  roundsStarted: number;
  roundsFinished: number;
  // Which prompt the learner actually chooses to answer, and which kind of
  // round they start. Both grow with each question mode and round type as it
  // lands, so the mode mix is real from the day there is a choice.
  answersByQuestionMode: Record<QuestionMode, number>;
  roundsByPractice: Record<PracticeMode, number>;
  // Known count on each day it changed, oldest first. The learning outcome,
  // and the number the map paints.
  knownByDay: { day: string; known: number }[];
};

export function emptyCounters(): Counters {
  return {
    version: STORE_VERSION,
    firstSessionAnswers: 0,
    firstSessionEnded: false,
    sessionsStarted: 0,
    roundsStarted: 0,
    roundsFinished: 0,
    answersByQuestionMode: { "name-to-click": 0, "shape-to-name": 0 },
    roundsByPractice: { study: 0, quiz: 0, expedition: 0 },
    knownByDay: [],
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

export function loadCounters(): Counters {
  try {
    const raw = window.localStorage.getItem(COUNTERS_STORAGE_KEY);
    if (!raw) return emptyCounters();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== STORE_VERSION) {
      return emptyCounters();
    }
    const modes = isRecord(parsed.answersByQuestionMode)
      ? parsed.answersByQuestionMode
      : {};
    const practice = isRecord(parsed.roundsByPractice)
      ? parsed.roundsByPractice
      : {};
    const known = Array.isArray(parsed.knownByDay) ? parsed.knownByDay : [];
    return {
      version: STORE_VERSION,
      firstSessionAnswers: num(parsed.firstSessionAnswers),
      firstSessionEnded: parsed.firstSessionEnded === true,
      sessionsStarted: num(parsed.sessionsStarted),
      roundsStarted: num(parsed.roundsStarted),
      roundsFinished: num(parsed.roundsFinished),
      answersByQuestionMode: {
        "name-to-click": num(modes["name-to-click"]),
        "shape-to-name": num(modes["shape-to-name"]),
      },
      roundsByPractice: {
        study: num(practice.study),
        quiz: num(practice.quiz),
        expedition: num(practice.expedition),
      },
      knownByDay: normaliseKnownByDay(known),
    };
  } catch {
    // Unavailable or malformed storage (private mode, SSR, a hand-edited key)
    // must never stop the app starting. Counters are the least important thing
    // in it.
    return emptyCounters();
  }
}

// Drop entries that are not a day-keyed number, collapse repeats of a day to
// its last value, order by day and trim to the cap. A hand-edited or
// clock-skewed store must not be able to make knownGain read a baseline out of
// order, or make it silently give up because one entry is not a date.
function normaliseKnownByDay(raw: unknown[]): { day: string; known: number }[] {
  const byDay = new Map<string, number>();
  for (const e of raw) {
    if (!isRecord(e)) continue;
    const day = e.day;
    // A `day` that is not a day key is not a date, and a store carrying one
    // cannot be reasoned about.
    if (!isDayKey(day)) continue;
    byDay.set(day, num(e.known));
  }
  const out = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, known]) => ({ day, known }));
  return out.length > MAX_KNOWN_DAYS ? out.slice(out.length - MAX_KNOWN_DAYS) : out;
}

export function saveCounters(counters: Counters): void {
  try {
    window.localStorage.setItem(COUNTERS_STORAGE_KEY, JSON.stringify(counters));
  } catch {
    // localStorage may be unavailable (private mode, SSR); ignore.
  }
}

// One card answered. Always allocates: an answer always changes something.
export function recordAnswer(
  counters: Counters,
  mode: QuestionMode,
): Counters {
  return {
    ...counters,
    firstSessionAnswers: counters.firstSessionEnded
      ? counters.firstSessionAnswers
      : counters.firstSessionAnswers + 1,
    answersByQuestionMode: {
      ...counters.answersByQuestionMode,
      [mode]: counters.answersByQuestionMode[mode] + 1,
    },
  };
}

export function recordRoundStarted(
  counters: Counters,
  practiceMode: PracticeMode,
): Counters {
  return {
    ...counters,
    roundsStarted: counters.roundsStarted + 1,
    roundsByPractice: {
      ...counters.roundsByPractice,
      [practiceMode]: counters.roundsByPractice[practiceMode] + 1,
    },
  };
}

export function recordRoundFinished(counters: Counters): Counters {
  return { ...counters, roundsFinished: counters.roundsFinished + 1 };
}

// The first session is over the first time the learner leaves one. After this
// `firstSessionAnswers` never moves again.
// Called once per load, before anything is recorded. Answers already on the
// store belong to an earlier sitting, so the first session is over whether or
// not the learner ever reached a summary — closing the tab ends a session too.
// `hasHistory` marks a profile that existed before this key did: its first
// session cannot be measured, so it is frozen at zero and the Data view omits
// the row rather than labelling a later session as the first.
export function startSession(counters: Counters, hasHistory: boolean): Counters {
  const next = { ...counters, sessionsStarted: counters.sessionsStarted + 1 };
  if (counters.firstSessionEnded) return next;
  // A session already begun on an earlier load is over, however it ended —
  // including with no answers at all, which is the reading that matters most.
  if (counters.sessionsStarted > 0 || hasHistory) {
    return { ...next, firstSessionEnded: true };
  }
  return next;
}

export function recordSessionEnded(counters: Counters): Counters {
  if (counters.firstSessionEnded) return counters;
  return { ...counters, firstSessionEnded: true };
}

// Snapshot today's known count. Replaces today's entry rather than appending,
// so a day holds its final figure, and returns the same object when the count
// has not moved since the last snapshot.
export function recordKnown(
  counters: Counters,
  known: number,
  now: Date,
): Counters {
  const day = dayKey(now);
  const last = counters.knownByDay[counters.knownByDay.length - 1];
  // Nothing to record: the count has not moved since the last snapshot, or
  // there is no history yet and nothing has been learned.
  if (last ? last.known === known : known === 0) return counters;
  // A second change on the same day overwrites that day's entry, so each day
  // holds the figure it ended on.
  const rest =
    last && last.day === day
      ? counters.knownByDay.slice(0, -1)
      : counters.knownByDay;
  const next = [...rest, { day, known }];
  return {
    ...counters,
    knownByDay:
      next.length > MAX_KNOWN_DAYS
        ? next.slice(next.length - MAX_KNOWN_DAYS)
        : next,
  };
}

// Countries learned over the last `days` calendar days, or null when there is
// no earlier snapshot to compare against.
export function knownGain(
  counters: Counters,
  days: number,
  now: Date,
): number | null {
  const history = counters.knownByDay;
  if (history.length === 0) return null;
  // Chosen by day rather than by array position, so a store that ended up out
  // of order (a clock moved backwards mid-session) still reads correctly.
  const cutoff = daysBetween("1970-01-01", dayKey(now)) - days;
  let latest: { at: number; known: number } | null = null;
  let baseline: { at: number; known: number } | null = null;
  for (const entry of history) {
    const at = daysBetween("1970-01-01", entry.day);
    if (!Number.isFinite(at)) continue;
    if (!latest || at >= latest.at) latest = { at, known: entry.known };
    if (at <= cutoff && (!baseline || at >= baseline.at)) {
      baseline = { at, known: entry.known };
    }
  }
  if (!latest || !baseline) return null;
  return latest.known - baseline.known;
}

export type ReturnInfo = {
  // Distinct days with at least one finished round, within the history the
  // streak store still holds.
  daysPlayed: number;
  // The longest run of days between two played days, or null with fewer than
  // two of them. This is the number that says whether people come back.
  longestGap: number | null;
  // The streak store keeps at most MAX_DAYS days, so a profile past that has
  // had its oldest days dropped: `daysPlayed` is then a floor rather than a
  // total, and `longestGap` may have lost an endpoint. The Data view says so
  // instead of quietly understating.
  capped: boolean;
};

export function returnInfo(streak: StreakStore): ReturnInfo {
  const days = [...streak.days].sort();
  const capped = days.length >= MAX_DAYS;
  if (days.length < 2) {
    return { daysPlayed: days.length, longestGap: null, capped };
  }
  let longest = 0;
  for (let i = 1; i < days.length; i++) {
    const gap = daysBetween(days[i - 1], days[i]) - 1;
    if (gap > longest) longest = gap;
  }
  return { daysPlayed: days.length, longestGap: longest, capped };
}
