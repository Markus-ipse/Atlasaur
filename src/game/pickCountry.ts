import type { Country, Phase, RetryEntry, SrsStore, Subregion } from "../types";
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

export function pickNextStudy(args: {
  pool: readonly Country[];
  byIso3: ReadonlyMap<string, Country>;
  excludeIso3: string;
  srsStore: SrsStore;
  now: Date;
  newIntroducedThisStretch: number;
  resurfaceQueue?: readonly RetryEntry[];
  step?: number;
}): Country | null {
  const {
    pool,
    byIso3,
    excludeIso3,
    srsStore,
    now,
    newIntroducedThisStretch,
    resurfaceQueue = [],
    step = 0,
  } = args;

  // 0. In-session resurface: a recent miss whose gap has elapsed comes
  //    back before any FSRS pick. iso3 !== excludeIso3 so we never re-pick
  //    the card the user is leaving.
  const resurfaced = resurfaceQueue.find(
    (e) => e.dueAt <= step && e.iso3 !== excludeIso3,
  );
  if (resurfaced) {
    const country = byIso3.get(resurfaced.iso3);
    if (country) return country;
  }

  // 1. Due records, oldest-due first.
  const dueList: { iso3: string; due: number }[] = [];
  for (const c of pool) {
    if (c.iso3 === excludeIso3) continue;
    const rec = srsStore.records[c.iso3];
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
      (c) => c.iso3 !== excludeIso3 && !srsStore.records[c.iso3],
    );
    if (fresh.length > 0) {
      fresh.sort((a, b) => {
        const ord = introductionOrder(b) - introductionOrder(a);
        if (ord !== 0) return ord;
        return a.iso3.localeCompare(b.iso3);
      });
      return fresh[0];
    }
  }

  // 3a. Soft cap hit but fresh exists: pick most-overdue regardless of
  // dueAt — there is no work yet, but we can show an already-introduced
  // record. Find the oldest-due record in scope.
  const allInScope: { iso3: string; due: number }[] = [];
  for (const c of pool) {
    if (c.iso3 === excludeIso3) continue;
    const rec = srsStore.records[c.iso3];
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
export function pickSpotlight(
  masteryMap: ReadonlyMap<Subregion, { learned: number; total: number }>,
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
    if (a.ratio !== b.ratio) return a.ratio - b.ratio; // lowest mastery first
    if (a.remaining !== b.remaining) return b.remaining - a.remaining; // largest pool
    return a.subregion.localeCompare(b.subregion); // deterministic
  });
  const top = candidates[0];
  return { subregion: top.subregion, remaining: top.remaining };
}
