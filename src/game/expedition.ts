// The Daily Expedition (R3.1): ten countries seeded by the local date, the
// same ten for everyone, one attempt a day. This module owns the store
// (`atlasaur:expedition:v1`), the seeded pick, the day's status and the text
// a learner shares. It knows nothing about the reducer or the map; the pool
// is passed in, so the ten for a date are a function of the date and the pool
// alone. Growing the pool (R3.4) changes every future day's ten, which is by
// design — see the plan's decisions.

import type { Country } from "../types";
import { dayKey } from "./streak";

export const EXPEDITION_STORAGE_KEY = "atlasaur:expedition:v1";
const STORE_VERSION = 1;
// A round of ten, not twelve: the result is a row of glyphs someone else
// reads, and ten is the count a caption can say without a denominator that
// needs explaining.
export const EXPEDITION_SIZE = 10;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type ExpeditionOutcome = "found" | "missed";

export type ExpeditionStore = {
  version: 1;
  // Local calendar day the ten belong to. A store from another day is stale:
  // it is kept (its result is still true) but today's is built afresh.
  day: string;
  // The ten, in the order they are asked.
  iso3s: string[];
  // One entry per country answered so far, in order. Length < EXPEDITION_SIZE
  // is an expedition in progress that resumes at that index; length ===
  // EXPEDITION_SIZE is finished and shows its result until local midnight.
  outcomes: ExpeditionOutcome[];
};

export type ExpeditionStatus =
  | { kind: "fresh" }
  | { kind: "in-progress"; answered: number; found: number }
  | { kind: "finished"; found: number };

// FNV-1a over the day key. Any stable 32-bit hash of the string would do; the
// only requirement is that two builds agree on it, and this one has no
// dependencies to drift.
function hashDay(day: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: small, fast, and the same everywhere JS runs. Returns a
// generator of floats in [0, 1).
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The pool an expedition draws from: every country in its own right, whatever
// the learner's continent filter or territories setting says. Everyone gets
// the same ten, or the result cannot be compared with anyone else's.
export function expeditionPool(countries: readonly Country[]): Country[] {
  return countries.filter((c) => !c.territory);
}

// The ten for a day. Sorted by iso3 before the shuffle so the input order
// (a JSON build artefact) can never change the answer, then a Fisher–Yates
// shuffle driven by the day's seed, of which the first ten are taken.
export function expeditionFor(
  day: string,
  pool: readonly Country[],
): string[] {
  const iso3s = pool.map((c) => c.iso3).sort();
  const rand = seeded(hashDay(day));
  for (let i = iso3s.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [iso3s[i], iso3s[j]] = [iso3s[j], iso3s[i]];
  }
  return iso3s.slice(0, EXPEDITION_SIZE);
}

export function newExpedition(
  day: string,
  pool: readonly Country[],
): ExpeditionStore {
  return {
    version: STORE_VERSION,
    day,
    iso3s: expeditionFor(day, pool),
    outcomes: [],
  };
}

export function foundCount(store: ExpeditionStore): number {
  return store.outcomes.filter((o) => o === "found").length;
}

export function isFinished(store: ExpeditionStore): boolean {
  return store.outcomes.length >= EXPEDITION_SIZE;
}

// What today holds for the learner: nothing yet, an expedition to resume, or
// a result to look at. A store from another day counts as nothing yet, and so
// does today's with no answer given: opened and left is not begun.
export function expeditionStatus(
  store: ExpeditionStore | null,
  now: Date,
): ExpeditionStatus {
  if (!store || store.day !== dayKey(now)) return { kind: "fresh" };
  if (store.outcomes.length === 0) return { kind: "fresh" };
  const found = foundCount(store);
  if (isFinished(store)) return { kind: "finished", found };
  return { kind: "in-progress", answered: store.outcomes.length, found };
}

export function recordOutcome(
  store: ExpeditionStore,
  outcome: ExpeditionOutcome,
): ExpeditionStore {
  if (isFinished(store)) return store;
  return { ...store, outcomes: [...store.outcomes, outcome] };
}

// `validIso3` lets the caller reject a stored set that this build cannot ask
// (a country dropped from the table), without this module importing the
// country list. A store that fails any check is discarded rather than
// repaired: a half-valid expedition is worse than a fresh one.
export function loadExpedition(
  validIso3: (iso3: string) => boolean,
): ExpeditionStore | null {
  try {
    return parseExpedition(
      window.localStorage.getItem(EXPEDITION_STORAGE_KEY),
      validIso3,
    );
  } catch {
    return null;
  }
}

// The same validation over a raw value, for the `storage` event another tab's
// write raises: the hook feeds it the event's `newValue`.
export function parseExpedition(
  raw: string | null,
  validIso3: (iso3: string) => boolean,
): ExpeditionStore | null {
  try {
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    if (p.version !== STORE_VERSION) return null;
    if (typeof p.day !== "string" || !DAY_KEY.test(p.day)) return null;
    if (!Array.isArray(p.iso3s) || p.iso3s.length !== EXPEDITION_SIZE) {
      return null;
    }
    const iso3s = p.iso3s as unknown[];
    if (!iso3s.every((v): v is string => typeof v === "string" && validIso3(v))) {
      return null;
    }
    if (new Set(iso3s).size !== iso3s.length) return null;
    if (!Array.isArray(p.outcomes) || p.outcomes.length > EXPEDITION_SIZE) {
      return null;
    }
    const outcomes = p.outcomes as unknown[];
    if (
      !outcomes.every(
        (v): v is ExpeditionOutcome => v === "found" || v === "missed",
      )
    ) {
      return null;
    }
    return { version: STORE_VERSION, day: p.day, iso3s, outcomes };
  } catch {
    return null;
  }
}

// Whether a store seen elsewhere (another tab's write) is further along than
// the one in hand and should replace it: a later day, or the same day with
// more answers given. The same day at the same count is a tie and ours
// stands; an earlier day is history and is ignored. Only ever adopts, never
// merges, so two tabs converge on whichever got further rather than on a row
// stitched from both.
export function supersedes(
  incoming: ExpeditionStore | null,
  current: ExpeditionStore | null,
): boolean {
  if (!incoming) return false;
  if (!current) return true;
  if (incoming.day !== current.day) return incoming.day > current.day;
  return incoming.outcomes.length > current.outcomes.length;
}

export function saveExpedition(store: ExpeditionStore | null): void {
  try {
    if (store === null) {
      window.localStorage.removeItem(EXPEDITION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(EXPEDITION_STORAGE_KEY, JSON.stringify(store));
    }
  } catch {
    // localStorage may be unavailable (private mode, SSR); ignore.
  }
}

// One glyph per country, in order. Filled is found, empty is missed — the one
// thing the caption never has to explain. Both are plain characters that
// every messaging app renders.
export const GLYPH_FOUND = "■";
export const GLYPH_MISSED = "□";

export function glyphRow(outcomes: readonly ExpeditionOutcome[]): string {
  return outcomes.map((o) => (o === "found" ? GLYPH_FOUND : GLYPH_MISSED)).join("");
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "6 September 2026". Fixed rather than locale-formatted so the text two
// learners compare reads the same on both phones.
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? ""} ${y}`;
}

// The text that leaves the app: the row and a caption, nothing else. Two
// short lines survive every messaging app and need no share sheet.
export function shareText(store: ExpeditionStore): string {
  return `Atlasaur · ${formatDay(store.day)}\n${glyphRow(store.outcomes)} ${foundCount(store)}/${EXPEDITION_SIZE}`;
}
