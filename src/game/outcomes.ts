// The per-answer outcome log (docs/plans/outcome-log.md). One entry per answer
// or skip, kept across days, so later analyses — delayed recall, confusion
// pairs — can read individual answers rather than the counters' aggregates.
// Local only: nothing leaves the device.
//
// One key per local month, `atlasaur:outcomes:v1:YYYY-MM`, so an append costs
// the same on day one as in year two. Each append re-reads its key, so two tabs
// append onto each other's entries rather than saving snapshots over them.

import type {
  FeedbackKind,
  Phase,
  PracticeMode,
  QuestionMode,
} from "../types";

export const OUTCOME_KEY_PREFIX = "atlasaur:outcomes:v1:";
const STORE_VERSION = 1;
export const MAX_OUTCOME_MONTHS = 6;
export const MAX_OUTCOMES_PER_MONTH = 5000;

export type Outcome = {
  // Epoch ms of the answer. Stored to the second.
  at: number;
  asked: string;
  mode: QuestionMode;
  practice: PracticeMode;
  phase: Phase;
  outcome: FeedbackKind;
  // The country given on a wrong answer; empty on a correct answer, a skip,
  // and a typed answer that matched nothing.
  given: string;
};

// Short codes, not positions: reordering QUESTION_MODES must not change what a
// stored entry means. Changing an existing code would, and the tests pin them.
// A mode added later fails to compile here until it has a code.
export const MODE_CODES: Record<QuestionMode, string> = {
  "name-to-click": "nc",
  "shape-to-name": "sn",
  "capital-to-click": "cc",
  "country-to-capital": "cn",
};
export const PRACTICE_CODES: Record<PracticeMode, string> = {
  study: "s",
  quiz: "q",
  expedition: "e",
};
export const PHASE_CODES: Record<Phase, string> = { normal: "n", review: "r" };
export const OUTCOME_CODES: Record<FeedbackKind, string> = {
  correct: "c",
  wrong: "w",
  skipped: "s",
};

type Row = [number, string, string, string, string, string, string];

function invert<K extends string>(codes: Record<K, string>): Map<string, K> {
  return new Map(
    (Object.entries(codes) as [K, string][]).map(([k, code]) => [code, k]),
  );
}
const MODE_BY_CODE = invert(MODE_CODES);
const PRACTICE_BY_CODE = invert(PRACTICE_CODES);
const PHASE_BY_CODE = invert(PHASE_CODES);
const OUTCOME_BY_CODE = invert(OUTCOME_CODES);

export function encodeOutcome(o: Outcome): Row {
  return [
    Math.floor(o.at / 1000),
    o.asked,
    MODE_CODES[o.mode],
    PRACTICE_CODES[o.practice],
    PHASE_CODES[o.phase],
    OUTCOME_CODES[o.outcome],
    o.given,
  ];
}

// Null for anything this build cannot read, including a code written by a
// later build. The row stays on disk; it is only skipped here.
export function decodeOutcome(raw: unknown): Outcome | null {
  if (!Array.isArray(raw) || raw.length < 7) return null;
  const [secs, asked, m, p, ph, k, given] = raw as unknown[];
  if (typeof secs !== "number" || !Number.isFinite(secs)) return null;
  if (typeof asked !== "string" || typeof given !== "string") return null;
  const mode = typeof m === "string" ? MODE_BY_CODE.get(m) : undefined;
  const practice = typeof p === "string" ? PRACTICE_BY_CODE.get(p) : undefined;
  const phase = typeof ph === "string" ? PHASE_BY_CODE.get(ph) : undefined;
  const outcome = typeof k === "string" ? OUTCOME_BY_CODE.get(k) : undefined;
  if (!mode || !practice || !phase || !outcome) return null;
  return { at: secs * 1000, asked, mode, practice, phase, outcome, given };
}

// The local month an epoch-ms time falls in, as `YYYY-MM`.
export function monthKey(at: number): string {
  const date = new Date(at);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${m}`;
}

// The raw rows under one key, or [] for a missing, malformed or wrong-version
// blob. Rows are returned as stored, unread, so an append keeps rows it cannot
// decode.
function readRows(key: string): unknown[] {
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== STORE_VERSION
    ) {
      return [];
    }
    const entries = (parsed as { entries?: unknown }).entries;
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function monthKeys(): string[] {
  const keys: string[] = [];
  const storage = window.localStorage;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(OUTCOME_KEY_PREFIX)) keys.push(key);
  }
  // `YYYY-MM` sorts as text in time order.
  return keys.sort();
}

// Read, append, trim and write back in one synchronous call.
export function appendOutcome(outcome: Outcome): void {
  try {
    const key = OUTCOME_KEY_PREFIX + monthKey(outcome.at);
    const opensMonth = window.localStorage.getItem(key) === null;
    const rows = [...readRows(key), encodeOutcome(outcome)];
    const kept =
      rows.length > MAX_OUTCOMES_PER_MONTH
        ? rows.slice(rows.length - MAX_OUTCOMES_PER_MONTH)
        : rows;
    window.localStorage.setItem(
      key,
      JSON.stringify({ version: STORE_VERSION, entries: kept }),
    );
    if (opensMonth) {
      const keys = monthKeys();
      for (const old of keys.slice(0, -MAX_OUTCOME_MONTHS)) {
        window.localStorage.removeItem(old);
      }
    }
  } catch {
    // Quota or unavailable storage: the log is the least important thing in
    // the app.
  }
}

// Every readable entry, oldest month first.
export function loadOutcomes(): Outcome[] {
  try {
    return monthKeys().flatMap((key) =>
      readRows(key).flatMap((row) => decodeOutcome(row) ?? []),
    );
  } catch {
    return [];
  }
}

export function clearOutcomes(): void {
  try {
    for (const key of monthKeys()) window.localStorage.removeItem(key);
  } catch {
    // localStorage may be unavailable (private mode, SSR); ignore.
  }
}
