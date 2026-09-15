import {
  createEmptyCard,
  fsrs,
  Rating,
  type Card,
  type Grade,
} from "ts-fsrs";
import { FACTS } from "../types";
import type {
  Continent,
  Country,
  Ease,
  Fact,
  PracticeMode,
  QuestionMode,
  SrsRecord,
  SrsRecords,
  SrsStore,
  Subregion,
} from "../types";

// Version 2 lives under its own key and version 1's is never written again.
// A new key rather than a version bump inside the old one: an old build — a
// stale tab beside a hard-reloaded one, or a rollback — reads a v2 blob under
// the v1 key as empty, and its save-on-mount effect then writes that empty
// store straight back, wiping every record. The accepted cost is that answers
// given in such a tab land in v1 and never reach v2.
const SRS_STORAGE_KEY = "atlasaur:srs:v2";
const SRS_V1_KEY = "atlasaur:srs:v1";
// Versioned because the intro was rewritten to explain that every country
// comes back: a learner who dismissed the old text sees the new one once, on
// their next Study miss. The old key is left where it is and never read.
const SRS_SEEN_INTRO_KEY = "atlasaur:srs:seenIntro:v2";
const SEEN_WELCOME_KEY = "atlasaur:seenWelcome";
const STORE_VERSION = 2;

const scheduler = fsrs();

const EASE_TO_RATING: Record<Ease, Grade> = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy,
};

export function emptyStore(): SrsStore {
  const facts = {} as SrsStore["facts"];
  for (const fact of FACTS) facts[fact] = {};
  return { version: STORE_VERSION, facts };
}

// Records saved before the hits/misses tally existed are backfilled with
// zeros so every record has the full shape and lifetimeAccuracy can treat
// them uniformly. A malformed entry is dropped rather than left to throw:
// loadStore's catch would otherwise replace the whole store with an empty
// one and the save effect would persist that, wiping progress.
function sanitizeRecords(raw: unknown): SrsRecords {
  if (typeof raw !== "object" || raw === null) return {};
  const records = raw as SrsRecords;
  for (const iso3 in records) {
    const rec = records[iso3] as Partial<SrsRecord> | null;
    if (typeof rec !== "object" || rec === null) {
      delete records[iso3];
      continue;
    }
    if (typeof rec.hits !== "number") rec.hits = 0;
    if (typeof rec.misses !== "number") rec.misses = 0;
  }
  return records;
}

// A v1 blob's single record map becomes `location`; every other fact starts
// empty. Returns null when there is nothing readable to migrate.
function migrateV1(): SrsStore | null {
  try {
    const raw = window.localStorage.getItem(SRS_V1_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: number }).version !== 1 ||
      typeof (parsed as { records?: unknown }).records !== "object"
    ) {
      return null;
    }
    const store = emptyStore();
    store.facts.location = sanitizeRecords((parsed as { records: unknown }).records);
    return store;
  } catch {
    return null;
  }
}

// Reads, in order: a valid v2 blob, a migration of v1, an empty store. v1 is
// re-read whenever v2 is missing OR unreadable, because a stale store beats
// an empty one — an empty one would be written over v2 on mount.
export function loadStore(): SrsStore {
  try {
    const raw = window.localStorage.getItem(SRS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: number }).version !== STORE_VERSION ||
      typeof (parsed as { facts?: unknown }).facts !== "object" ||
      (parsed as { facts: unknown }).facts === null
    ) {
      return migrateV1() ?? emptyStore();
    }
    const store = parsed as SrsStore;
    // Facts this build doesn't know are kept exactly as they are, so a
    // rollback can't drop a later release's records; only the ones we read
    // are sanitized, and a missing one starts empty.
    for (const fact of FACTS) {
      store.facts[fact] = sanitizeRecords(store.facts[fact]);
    }
    return store;
  } catch {
    return migrateV1() ?? emptyStore();
  }
}

export function saveStore(store: SrsStore): void {
  try {
    window.localStorage.setItem(SRS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage may be unavailable (private mode, SSR); ignore.
  }
}

// "Erase all progress" drops both keys — leaving v1 behind would resurrect
// the learner's old records on the next load, through migrateV1.
export function clearStore(): void {
  try {
    window.localStorage.removeItem(SRS_STORAGE_KEY);
    window.localStorage.removeItem(SRS_V1_KEY);
  } catch {
    // ignore
  }
}

// The one write into the store. Facts other than `fact` keep the same object
// identity, so a memo keyed on `facts.location` doesn't re-run after a
// capital answer.
export function withGrade(
  store: SrsStore,
  fact: Fact,
  iso3: string,
  record: SrsRecord,
): SrsStore {
  return {
    ...store,
    facts: {
      ...store.facts,
      [fact]: { ...store.facts[fact], [iso3]: record },
    },
  };
}

// Whether the learner has met anything at all, across every fact this build
// knows. Drives the Today card and the first-run welcome.
export function hasAnyRecord(store: SrsStore): boolean {
  return FACTS.some((fact) => Object.keys(store.facts[fact] ?? {}).length > 0);
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

// Every helper below takes ONE fact's records rather than the store and a
// fact, so no helper can quietly read the wrong fact — the choice is made in
// the reducer, the hook and App. The two lifetime totals are the exception:
// they add up across facts and so take the whole store.
export function dueCount(
  records: SrsRecords,
  scope: ReadonlySet<string>,
  now: Date,
): number {
  let n = 0;
  for (const iso3 in records) {
    if (!scope.has(iso3)) continue;
    if (isDue(records[iso3], now)) n++;
  }
  return n;
}

// When the next in-scope card comes back, or null when none is scheduled
// ahead. Strictly after `now` — the complement of isDue's <= — so a record is
// counted by dueCount or is a candidate here, never both.
export function nextDueAt(
  records: SrsRecords,
  scope: ReadonlySet<string>,
  now: Date,
): Date | null {
  let earliest = Infinity;
  for (const iso3 in records) {
    if (!scope.has(iso3)) continue;
    const t = new Date(records[iso3].due).getTime();
    if (t > now.getTime() && t < earliest) earliest = t;
  }
  return earliest === Infinity ? null : new Date(earliest);
}

export function newAvailableCount(
  records: SrsRecords,
  scope: ReadonlySet<string>,
): number {
  let n = 0;
  scope.forEach((iso3) => {
    if (!records[iso3]) n++;
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

export function learnedCount(
  records: SrsRecords,
  scope: ReadonlySet<string>,
): number {
  let n = 0;
  for (const iso3 in records) {
    if (!scope.has(iso3)) continue;
    // state 2 = Review (graduated past Learning/Relearning).
    if (records[iso3].state >= 2) n++;
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
  records: SrsRecords,
  countries: readonly Country[],
  scope: ReadonlySet<string>,
): Map<Subregion, { learned: number; total: number }> {
  const map = new Map<Subregion, { learned: number; total: number }>();
  for (const c of countries) {
    if (!scope.has(c.iso3)) continue;
    const entry = map.get(c.subregion) ?? { learned: 0, total: 0 };
    entry.total += 1;
    const rec = records[c.iso3];
    if (rec && rec.state >= 2) entry.learned += 1;
    map.set(c.subregion, entry);
  }
  return map;
}

// Ambient map paint (R2.1). Three tiers, in the order the map inks them in:
// 0 unseen (never answered — a ghost outline), 1 introduced (a record exists
// but has not graduated), 2 known (FSRS state >= 2). Tier 2 reuses
// learnedCount's predicate so the map and the "Known" stat can never
// disagree; `tier >= 1` is seenCount's "any record at all" (note seenCount
// counts introduced AND known, so it is the pair of tiers, not tier 1 alone).
// Like learnedCount, tier 2 includes FSRS Relearning (state 3), so a country
// the learner has just lapsed on keeps its full pigment until it is graded
// down — deliberate, since the map must agree with the "Known" stat.
export type MasteryTier = 0 | 1 | 2;

export function masteryTierOf(record: SrsRecord | undefined): MasteryTier {
  if (!record) return 0;
  return record.state >= 2 ? 2 : 1;
}

// iso3 -> tier for every country with a record. Countries absent from the map
// are tier 0, so the caller reads it as `tiers.get(iso3) ?? 0` rather than
// this allocating an entry per country in the world on every store change.
// Scope-independent on purpose: an out-of-scope country keeps the ink it
// earned, and fillFor's own inert branch decides whether that ink is shown.
export function masteryTiers(records: SrsRecords): Map<string, MasteryTier> {
  const map = new Map<string, MasteryTier>();
  for (const iso3 in records) {
    map.set(iso3, masteryTierOf(records[iso3]));
  }
  return map;
}

// The tiers the MAP is allowed to paint, which is not always every tier the
// store knows. In `name-to-click` the introduced wash is collapsed into unseen,
// because pickNextStudy partitions its picks exactly on that boundary: the
// new-introduction branch requires no record (tier 0), while the resurface, due
// and most-overdue branches all require one (tier 1 or 2). Tier 1 is by
// construction tiny — the cards still in FSRS learning, which is precisely the
// set the scheduler resurfaces — so painting it would narrow "find Portugal" to
// three or four countries. Tiers 0 and 2 are both large, so a two-tone map
// leaks nothing. `shape-to-name` keeps all three: the shape is already
// highlighted, and knowing you have met a country cannot supply its name.
//
// `capital-to-click` gets NO paint at all, and collapsing the wash is not
// enough there. Capital cards are introduced in the same `introductionOrder`
// that built the learner's known map, and due ones come from that same set, so
// the gold of tier 2 points at the answer as surely as the wash would. Its
// counterpart `country-to-capital` keeps the full three tones: the country is
// already highlighted, so there is nothing left to give away.
//
// `records` is always the LOCATION fact: the paint is a map of where the
// learner has been, whatever the prompt on screen happens to ask.

// Whether the map carries ambient progress at all under this mode. The one
// rule, read by paintTiers and by App for the continent captions — a caption
// claiming "Europe 46%" over a blank map would contradict it.
export function paintsProgress(
  mode: QuestionMode,
  practiceMode: PracticeMode,
): boolean {
  return practiceMode === "study" && mode !== "capital-to-click";
}

// Whether the question is a place to find on the map, where knowing a card has
// been met narrows the answer: `name-to-click`. The map collapses the
// introduced wash there (paintTiers), and ControlZone moves the Back again
// pill off the prompt for the same reason. One rule, so the two cannot drift.
export function hidesIntroduced(mode: QuestionMode): boolean {
  return mode === "name-to-click";
}

export function paintTiers(
  records: SrsRecords,
  mode: QuestionMode,
  practiceMode: PracticeMode,
): Map<string, MasteryTier> {
  // A test round is a measurement, so the map carries no progress paint at
  // all. Its picks are random rather than scheduler-driven, so there is no
  // tier-to-pick correlation to leak — but a learner near the end of a small
  // scope could still answer by elimination, reading off the map the countries
  // they know instead of locating the one they were asked for, which is the
  // skill the test is scoring. Everything reads as unseen until the test ends.
  // The Daily Expedition is the one score a learner shows someone else, so it
  // is the most neutral measurement of all and gets the same blank map.
  if (!paintsProgress(mode, practiceMode)) return new Map();
  const tiers = masteryTiers(records);
  if (!hidesIntroduced(mode)) return tiers;
  for (const [iso3, tier] of tiers) {
    if (tier === 1) tiers.set(iso3, 0);
  }
  return tiers;
}

// Per-continent mastery aggregate, scoped to the active continent filter and
// the territories setting. `known` is the tier-2 count; `total` is every
// in-scope country on the continent. Only continents with >= 1 in-scope
// country appear, so a continent filtered out (or Antarctica with territories
// off) never renders a percentage.
export function masteryByContinent(
  records: SrsRecords,
  countries: readonly Country[],
  scope: ReadonlySet<string>,
): Map<Continent, { known: number; total: number }> {
  const map = new Map<Continent, { known: number; total: number }>();
  for (const c of countries) {
    if (!scope.has(c.iso3)) continue;
    const entry = map.get(c.continent) ?? { known: 0, total: 0 };
    entry.total += 1;
    if (masteryTierOf(records[c.iso3]) === 2) entry.known += 1;
    map.set(c.continent, entry);
  }
  return map;
}

// Whole percent of a set inked in, for the map's continent captions. Floors
// below 100 and lifts a non-zero share off 0, so "100%" means finished and
// "0%" means untouched — neither is ever a rounding artefact.
export function masteryPercent(known: number, total: number): number {
  if (total === 0) return 0;
  if (known >= total) return 100;
  if (known === 0) return 0;
  // known < total here, so the floor cannot reach 100.
  return Math.max(1, Math.floor((known / total) * 100));
}

// Lifetime totals add up across every fact this build knows — and only those,
// so a fact kept from a later build is never counted into a figure the app
// cannot otherwise show.
export function totalReviews(store: SrsStore): number {
  let n = 0;
  for (const fact of FACTS) {
    const records = store.facts[fact];
    for (const iso3 in records) {
      n += records[iso3].reps;
    }
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
  for (const fact of FACTS) {
    const records = store.facts[fact];
    for (const iso3 in records) {
      hits += records[iso3].hits;
      misses += records[iso3].misses;
    }
  }
  const answered = hits + misses;
  if (answered === 0) return null;
  return hits / answered;
}

// Countries with any record in scope — introduced, whether or not they have
// graduated to "known" (learnedCount). First sessions read as progress via
// this number even though FSRS graduation typically happens on a later day.
export function seenCount(
  records: SrsRecords,
  scope: ReadonlySet<string>,
): number {
  let n = 0;
  for (const iso3 in records) {
    if (scope.has(iso3)) n++;
  }
  return n;
}
