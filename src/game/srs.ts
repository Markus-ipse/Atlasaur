import {
  createEmptyCard,
  fsrs,
  Rating,
  type Card,
} from "ts-fsrs";
import type { Continent, Country, Ease, SrsRecord, SrsStore } from "../types";

const SRS_STORAGE_KEY = "atlasaur:srs:v1";
const SRS_SEEN_INTRO_KEY = "atlasaur:srs:seenIntro";
const STORE_VERSION = 1;

const scheduler = fsrs();

const EASE_TO_RATING: Record<Ease, Rating> = {
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
    return parsed as SrsStore;
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

export function toJSON(card: Card): SrsRecord {
  return {
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
  return toJSON(next);
}

// Lightweight preview helpers for ease-button tooltips. Compute the
// projected interval (rounded days) for each ease without persisting.
export function previewIntervalDays(
  record: SrsRecord | null,
  ease: Ease,
  now: Date,
): number {
  const card = record ? fromJSON(record) : createEmptyCard(now);
  const { card: next } = scheduler.next(card, now, EASE_TO_RATING[ease]);
  const ms = next.due.getTime() - now.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
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

export function totalReviews(store: SrsStore): number {
  let n = 0;
  for (const iso3 in store.records) {
    n += store.records[iso3].reps;
  }
  return n;
}

export function lifetimeAccuracy(store: SrsStore): number {
  let reps = 0;
  let lapses = 0;
  for (const iso3 in store.records) {
    reps += store.records[iso3].reps;
    lapses += store.records[iso3].lapses;
  }
  if (reps === 0) return 0;
  return Math.max(0, Math.min(1, 1 - lapses / reps));
}

// Scope helper for callers that pass a continent set rather than an
// iso3 set. Keeps callers from re-implementing the filter.
export function scopeFromCountries(
  countries: readonly Country[],
  continents: readonly Continent[],
): Set<string> {
  const cset = new Set(continents);
  const out = new Set<string>();
  for (const c of countries) {
    if (cset.has(c.continent)) out.add(c.iso3);
  }
  return out;
}
