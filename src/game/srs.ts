import {
  createEmptyCard,
  fsrs,
  Rating,
  type Card,
  type Grade,
} from "ts-fsrs";
import type {
  Country,
  Ease,
  SrsRecord,
  SrsStore,
  Subregion,
} from "../types";

const SRS_STORAGE_KEY = "atlasaur:srs:v1";
const SRS_SEEN_INTRO_KEY = "atlasaur:srs:seenIntro";
const SEEN_WELCOME_KEY = "atlasaur:seenWelcome";
const STORE_VERSION = 1;

const scheduler = fsrs();

const EASE_TO_RATING: Record<Ease, Grade> = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy,
};

export function emptyStore(): SrsStore {
  return { version: STORE_VERSION, records: {} };
}

export function loadStore(): SrsStore {
  try {
    const raw = window.localStorage.getItem(SRS_STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: number }).version !== STORE_VERSION ||
      typeof (parsed as { records?: unknown }).records !== "object"
    ) {
      return emptyStore();
    }
    const store = parsed as SrsStore;
    // Additive schema change within version 1: records saved before the
    // hits/misses tally existed are backfilled with zeros so every record
    // has the full shape and lifetimeAccuracy can treat them uniformly.
    // A malformed entry is dropped rather than letting it throw here —
    // the catch below would otherwise replace the whole store with an
    // empty one and the save effect would persist that, wiping progress.
    for (const iso3 in store.records) {
      const rec = store.records[iso3] as Partial<SrsRecord> | null;
      if (typeof rec !== "object" || rec === null) {
        delete store.records[iso3];
        continue;
      }
      if (typeof rec.hits !== "number") rec.hits = 0;
      if (typeof rec.misses !== "number") rec.misses = 0;
    }
    return store;
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: SrsStore): void {
  try {
    window.localStorage.setItem(SRS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage may be unavailable (private mode, SSR); ignore.
  }
}

export function loadSeenIntro(): boolean {
  try {
    return window.localStorage.getItem(SRS_SEEN_INTRO_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveSeenIntro(value: boolean): void {
  try {
    window.localStorage.setItem(SRS_SEEN_INTRO_KEY, String(value));
  } catch {
    // ignore
  }
}

export function loadSeenWelcome(): boolean {
  try {
    return window.localStorage.getItem(SEEN_WELCOME_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveSeenWelcome(value: boolean): void {
  try {
    window.localStorage.setItem(SEEN_WELCOME_KEY, String(value));
  } catch {
    // ignore
  }
}

export function toJSON(
  card: Card,
  tally: { hits: number; misses: number } = { hits: 0, misses: 0 },
): SrsRecord {
  return {
    hits: tally.hits,
    misses: tally.misses,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as 0 | 1 | 2 | 3,
    last_review: card.last_review?.toISOString(),
  };
}

export function fromJSON(record: SrsRecord): Card {
  return {
    due: new Date(record.due),
    stability: record.stability,
    difficulty: record.difficulty,
    elapsed_days: record.elapsed_days,
    scheduled_days: record.scheduled_days,
    learning_steps: record.learning_steps,
    reps: record.reps,
    lapses: record.lapses,
    state: record.state,
    last_review: record.last_review ? new Date(record.last_review) : undefined,
  };
}

export function grade(record: SrsRecord | null, ease: Ease, now: Date): SrsRecord {
  const card = record ? fromJSON(record) : createEmptyCard(now);
  const { card: next } = scheduler.next(card, now, EASE_TO_RATING[ease]);
  const hits = (record?.hits ?? 0) + (ease === "Again" ? 0 : 1);
  const misses = (record?.misses ?? 0) + (ease === "Again" ? 1 : 0);
  return toJSON(next, { hits, misses });
}

export function isDue(record: SrsRecord, now: Date): boolean {
  return new Date(record.due).getTime() <= now.getTime();
}

export function dueCount(
  store: SrsStore,
  scope: ReadonlySet<string>,
  now: Date,
): number {
  let n = 0;
  for (const iso3 in store.records) {
    if (!scope.has(iso3)) continue;
    if (isDue(store.records[iso3], now)) n++;
  }
  return n;
}

export function newAvailableCount(
  store: SrsStore,
  scope: ReadonlySet<string>,
): number {
  let n = 0;
  scope.forEach((iso3) => {
    if (!store.records[iso3]) n++;
  });
  return n;
}

// Higher numeric = introduce earlier. Multiplying notabilityTier by 10
// dominates the comparator while leaving sizeTier as a fine-grained
// tiebreak (tier 3 area beats tier 0 area among equal-notability
// countries — so Russia precedes Singapore at notabilityTier=2).
export function introductionOrder(country: Country): number {
  return country.notabilityTier * 10 + country.sizeTier;
}

export function learnedCount(store: SrsStore, scope: ReadonlySet<string>): number {
  let n = 0;
  for (const iso3 in store.records) {
    if (!scope.has(iso3)) continue;
    // state 2 = Review (graduated past Learning/Relearning).
    if (store.records[iso3].state >= 2) n++;
  }
  return n;
}

// Per-subregion mastery aggregate, scoped to the active continent filter.
// `learned` reuses learnedCount's `state >= 2` predicate (graduated past
// Learning/Relearning); `total` is every in-scope country in the subregion.
// Only subregions with ≥1 in-scope country appear — so subregions absent at
// this topology resolution (Micronesia, Polynesia) never surface. Pure: the
// metric the spotlight feature consumes (total − learned) is time-independent.
export function masteryBySubregion(
  store: SrsStore,
  countries: readonly Country[],
  scope: ReadonlySet<string>,
): Map<Subregion, { learned: number; total: number }> {
  const map = new Map<Subregion, { learned: number; total: number }>();
  for (const c of countries) {
    if (!scope.has(c.iso3)) continue;
    const entry = map.get(c.subregion) ?? { learned: 0, total: 0 };
    entry.total += 1;
    const rec = store.records[c.iso3];
    if (rec && rec.state >= 2) entry.learned += 1;
    map.set(c.subregion, entry);
  }
  return map;
}

export function totalReviews(store: SrsStore): number {
  let n = 0;
  for (const iso3 in store.records) {
    n += store.records[iso3].reps;
  }
  return n;
}

// Share of graded answers that were right, across every record. Uses the
// hits/misses tally rather than FSRS `lapses` (which ignores misses on New
// and Learning cards, so beginners would read ~100%). Returns null when no
// tallied answers exist — including a store migrated from before the tally,
// where reps > 0 but nothing has been counted yet — so callers show "—"
// rather than a false 0%.
export function lifetimeAccuracy(store: SrsStore): number | null {
  let hits = 0;
  let misses = 0;
  for (const iso3 in store.records) {
    hits += store.records[iso3].hits;
    misses += store.records[iso3].misses;
  }
  const answered = hits + misses;
  if (answered === 0) return null;
  return hits / answered;
}

// Countries with any record in scope — introduced, whether or not they have
// graduated to "known" (learnedCount). First sessions read as progress via
// this number even though FSRS graduation typically happens on a later day.
export function seenCount(store: SrsStore, scope: ReadonlySet<string>): number {
  let n = 0;
  for (const iso3 in store.records) {
    if (scope.has(iso3)) n++;
  }
  return n;
}
