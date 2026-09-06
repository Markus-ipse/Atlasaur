// Ceremony (R2.2). The moments Atlasaur marks, and nothing else: a run of
// correct answers, a country crossing into "known" for the first time, and a
// continent finished. Ink and wax only — no confetti, coins, XP or badges.
//
// Everything here is pure so the reducer can compute a milestone at answer
// time and the panel can render it without either owning the rules.

import type { Continent, Country, SrsRecord, SrsStore } from "../types";
import { masteryTierOf } from "./srs";

// The country that just crossed into "known", plus the continent it finished
// if it was the last one in scope. One shape rather than a union: the map
// hatches the country either way, and a completed continent always has a
// country underneath it.
export type Milestone = {
  iso3: string;
  name: string;
  continentComplete: Continent | null;
};

// Consecutive correct answers worth remarking on. Exact thresholds, so each
// one is a moment rather than a badge the learner then carries around.
const STREAK_NOTES: Record<number, string> = {
  5: "A steady hand.",
  10: "Cartographer's eye.",
  20: "Drawn from memory.",
};

export function streakNote(streak: number): string | null {
  return STREAK_NOTES[streak] ?? null;
}

// Whether grading `record` with this outcome would carry the country across
// into "known" for the first time. Callers pass the record as it is now and
// the record the grade would produce; the transition is one-way, because FSRS
// never returns a card from Review or Relearning to Learning.
export function crossesIntoKnown(
  before: SrsRecord | undefined,
  after: SrsRecord,
): boolean {
  return masteryTierOf(before) < 2 && masteryTierOf(after) === 2;
}

// The milestone a correct answer on `country` earns, or null. `pool` is the
// learner's current scope, so "continent complete" means every country they
// have chosen to study on it — widening the scope later can un-finish a
// continent, the same way it moves the percentage on the map.
export function milestoneFor(
  country: Country,
  store: SrsStore,
  after: SrsRecord,
  pool: readonly Country[],
): Milestone | null {
  if (!crossesIntoKnown(store.records[country.iso3], after)) return null;
  const completesContinent = pool.every(
    (c) =>
      c.continent !== country.continent ||
      c.iso3 === country.iso3 ||
      masteryTierOf(store.records[c.iso3]) === 2,
  );
  return {
    iso3: country.iso3,
    name: country.name,
    // A country whose continent is outside the pool entirely cannot complete
    // it; `every` would vacuously pass, so require at least one in-pool
    // country on the continent — which this country is, when it is in scope.
    continentComplete:
      completesContinent && pool.some((c) => c.iso3 === country.iso3)
        ? country.continent
        : null,
  };
}
