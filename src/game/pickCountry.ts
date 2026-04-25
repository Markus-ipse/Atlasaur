import type { Country, Phase, RetryEntry } from "../types";

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
}): Country {
  const { pool, byIso3, excludeIso3, total, retryQueue, phase } = args;

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
  return pickRandom(pool, excludeIso3);
}
