import type { Country, Phase, RetryEntry, SrsRecords, Subregion } from "../types";
import { introductionOrder, isDue } from "./srs";

export const STUDY_NEW_CAP = 10;

// Smallest "real" subregions present at 110m resolution are Antarctica (2),
// Australia and New Zealand (2), Northern America (3); next up are
// Central Asia / Melanesia / Southern Africa (5). A gate of 3 keeps the
// 2-country regions out while preserving the 5-country ones.
export const SPOTLIGHT_MIN_REMAINING = 3;

export function pickRandom(
  pool: readonly Country[],
  exclude: string | null,
): Country {
  if (pool.length === 0) {
    throw new Error("Cannot pick from an empty country pool");
  }
  const candidates = exclude
    ? pool.filter((c) => c.iso3 !== exclude)
    : pool;
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(Math.random() * source.length)];
}

export function pickNext(args: {
  pool: readonly Country[];
  byIso3: ReadonlyMap<string, Country>;
  excludeIso3: string;
  total: number;
  retryQueue: readonly RetryEntry[];
  phase: Phase;
  completedSet: ReadonlySet<string>;
}): Country {
  const {
    pool,
    byIso3,
    excludeIso3,
    total,
    retryQueue,
    phase,
    completedSet,
  } = args;

  if (phase === "review") {
    const head =
      retryQueue.find((e) => e.iso3 !== excludeIso3) ?? retryQueue[0];
    const country = head ? byIso3.get(head.iso3) : undefined;
    if (country) return country;
    return pickRandom(pool, excludeIso3);
  }

  const due = retryQueue.find(
    (e) => e.dueAt <= total && e.iso3 !== excludeIso3,
  );
  if (due) {
    const country = byIso3.get(due.iso3);
    if (country) return country;
  }

  const queuedIso3s = new Set(retryQueue.map((e) => e.iso3));
  const fresh = pool.filter(
    (c) =>
      !completedSet.has(c.iso3) &&
      !queuedIso3s.has(c.iso3) &&
      c.iso3 !== excludeIso3,
  );
  if (fresh.length > 0) {
    return fresh[Math.floor(Math.random() * fresh.length)];
  }
  // Fresh exhausted but retryQueue non-empty: surface the head regardless of
  // dueAt. The 3–5 turn gap is best-effort; once the fresh pool is empty the
  // only remaining work is the queue, so the user always gets something.
  const head =
    retryQueue.find((e) => e.iso3 !== excludeIso3) ?? retryQueue[0];
  const country = head ? byIso3.get(head.iso3) : undefined;
  if (country) return country;

  return pickRandom(pool, excludeIso3);
}

const NO_PREFERENCE: ReadonlySet<string> = new Set();

export function pickNextStudy(args: {
  pool: readonly Country[];
  byIso3: ReadonlyMap<string, Country>;
  excludeIso3: string;
  // One fact's records — the fact the current question mode grades. The
  // caller chooses it; see `recordsFor` in useGame.ts.
  records: SrsRecords;
  // Countries to introduce before any others, when a fact has a prerequisite.
  // Capitals are taught for countries the learner can already place, so the
  // offer's promise ("6 countries you already know") is what the scheduler
  // actually serves. Only orders the NEW-introduction branch; due cards are
  // due whatever else is true. Empty for a fact with no prerequisite.
  introduceFirst?: ReadonlySet<string>;
  now: Date;
  newIntroducedThisStretch: number;
  resurfaceQueue?: readonly RetryEntry[];
  step?: number;
}): Country | null {
  const {
    pool,
    byIso3,
    excludeIso3,
    records,
    introduceFirst = NO_PREFERENCE,
    now,
    newIntroducedThisStretch,
    resurfaceQueue = [],
    step = 0,
  } = args;

  // 0. In-session resurface: a recent miss whose gap has elapsed comes
  //    back before any FSRS pick. iso3 !== excludeIso3 so we never re-pick
  //    the card the user is leaving. The entry must be in `pool` — an
  //    active spotlight narrows the pool to one subregion without pruning
  //    the queue, so an out-of-scope miss stays queued and resurfaces only
  //    once the scope widens again (mirrors how due records behave).
  if (resurfaceQueue.length > 0) {
    const inPool = new Set(pool.map((c) => c.iso3));
    const resurfaced = resurfaceQueue.find(
      (e) => e.dueAt <= step && e.iso3 !== excludeIso3 && inPool.has(e.iso3),
    );
    if (resurfaced) {
      const country = byIso3.get(resurfaced.iso3);
      if (country) return country;
    }
  }

  // 1. Due records, oldest-due first.
  const dueList: { iso3: string; due: number }[] = [];
  for (const c of pool) {
    if (c.iso3 === excludeIso3) continue;
    const rec = records[c.iso3];
    if (rec && isDue(rec, now)) {
      dueList.push({ iso3: c.iso3, due: new Date(rec.due).getTime() });
    }
  }
  if (dueList.length > 0) {
    dueList.sort((a, b) => a.due - b.due);
    const country = byIso3.get(dueList[0].iso3);
    if (country) return country;
  }

  // 2. New introductions (no record), by notability desc → size desc →
  // iso3 stable. Subject to the per-stretch soft cap.
  if (newIntroducedThisStretch < STUDY_NEW_CAP) {
    const fresh = pool.filter(
      (c) => c.iso3 !== excludeIso3 && !records[c.iso3],
    );
    if (fresh.length > 0) {
      fresh.sort((a, b) => {
        // Prerequisite first, so a capital is asked about a country the
        // learner can already find. A sort rather than a filter: when none
        // qualify the ordinary order still applies, so a mode chosen
        // deliberately from the settings is never left with nothing to ask.
        const pa = introduceFirst.has(a.iso3) ? 0 : 1;
        const pb = introduceFirst.has(b.iso3) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        const ord = introductionOrder(b) - introductionOrder(a);
        if (ord !== 0) return ord;
        return a.iso3.localeCompare(b.iso3);
      });
      return fresh[0];
    }
  }

  // 2b. Early retry: nothing is due and no new card may be introduced, but a
  // miss from this sitting is still waiting out its gap. Asking it now is
  // worth more than repeating a card that is not due, so the retry comes
  // forward (soonest first) instead of the round being padded around it.
  const pending = resurfaceQueue
    .filter((e) => e.iso3 !== excludeIso3 && pool.some((c) => c.iso3 === e.iso3))
    .sort((a, b) => a.dueAt - b.dueAt);
  for (const e of pending) {
    const country = byIso3.get(e.iso3);
    if (country) return country;
  }

  // 3a. Filler: nothing useful is left (no due card, no new card allowed or
  // left, no pending retry), so pick the most-overdue record regardless of
  // its due date. The caller ends a Study round early rather than serving
  // these, unless the learner has chosen to keep going anyway
  // (cardIsFiller in useGame.ts).
  const allInScope: { iso3: string; due: number }[] = [];
  for (const c of pool) {
    if (c.iso3 === excludeIso3) continue;
    const rec = records[c.iso3];
    if (rec) {
      allInScope.push({ iso3: c.iso3, due: new Date(rec.due).getTime() });
    }
  }
  if (allInScope.length > 0) {
    allInScope.sort((a, b) => a.due - b.due);
    const country = byIso3.get(allInScope[0].iso3);
    if (country) return country;
  }

  // 3b. Truly empty: caller handles the caught-up empty state.
  return null;
}

// Recommend the most-neglected subregion for an end-of-session spotlight.
// Filter, THEN rank: gating before ranking is load-bearing — a tiny region
// with the lowest ratio but remaining below the gate must not be picked,
// fail the gate, and return null while a larger above-gate region exists.
//
// `lastResort` subregions rank after every other survivor, whatever their
// ratio: the ones the map draws only as dots (R3.4), which have no frame to
// zoom a focus onto. They are still offered once nothing else clears the gate.
export function pickSpotlight(
  masteryMap: ReadonlyMap<Subregion, { learned: number; total: number }>,
  lastResort: ReadonlySet<Subregion> = new Set(),
): { subregion: Subregion; remaining: number } | null {
  const candidates: {
    subregion: Subregion;
    remaining: number;
    ratio: number;
  }[] = [];
  for (const [subregion, { learned, total }] of masteryMap) {
    const remaining = total - learned;
    if (remaining < SPOTLIGHT_MIN_REMAINING) continue;
    candidates.push({ subregion, remaining, ratio: learned / total });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const resort = Number(lastResort.has(a.subregion)) - Number(lastResort.has(b.subregion));
    if (resort !== 0) return resort; // a region with a frame first
    if (a.ratio !== b.ratio) return a.ratio - b.ratio; // lowest mastery first
    if (a.remaining !== b.remaining) return b.remaining - a.remaining; // largest pool
    return a.subregion.localeCompare(b.subregion); // deterministic
  });
  const top = candidates[0];
  return { subregion: top.subregion, remaining: top.remaining };
}

// Subregions with no shape on the map, only markers (R3.4): Micronesia and
// Polynesia. Passed to pickSpotlight as its last resort.
export function markerOnlySubregions(countries: readonly Country[]): Set<Subregion> {
  const shaped = new Set(countries.filter((c) => !c.marker).map((c) => c.subregion));
  return new Set(
    countries.filter((c) => c.marker && !shaped.has(c.subregion)).map((c) => c.subregion),
  );
}
