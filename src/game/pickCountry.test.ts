import { describe, it, expect } from "vitest";
import { pickNext } from "./pickCountry";
import type { Country, RetryEntry } from "../types";

function country(iso3: string): Country {
  return {
    numeric: iso3,
    iso3,
    name: iso3,
    aliases: [],
    continent: "Europe",
    subregion: "Western Europe",
    capital: "—",
    neighbors: [],
    sizeTier: 0,
    notabilityTier: 0,
  };
}

function makePool(iso3s: string[]): {
  pool: Country[];
  byIso3: Map<string, Country>;
} {
  const pool = iso3s.map(country);
  const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
  return { pool, byIso3 };
}

describe("pickNext — normal phase, freeplay", () => {
  it("returns a due retry when one is available", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB", "CCC"]);
    const retryQueue: RetryEntry[] = [{ iso3: "BBB", dueAt: 5 }];
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "AAA",
      total: 5,
      retryQueue,
      phase: "normal",
      sessionType: "freeplay",
      completedSet: new Set(),
    });
    expect(result.iso3).toBe("BBB");
  });

  it("skips a not-yet-due retry and picks fresh instead", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB"]);
    const retryQueue: RetryEntry[] = [{ iso3: "BBB", dueAt: 10 }];
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "",
      total: 3,
      retryQueue,
      phase: "normal",
      sessionType: "freeplay",
      completedSet: new Set(),
    });
    expect(["AAA", "BBB"]).toContain(result.iso3);
  });

  it("does not return excludeIso3 as the due retry", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB"]);
    const retryQueue: RetryEntry[] = [{ iso3: "AAA", dueAt: 1 }];
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "AAA",
      total: 5,
      retryQueue,
      phase: "normal",
      sessionType: "freeplay",
      completedSet: new Set(),
    });
    expect(result.iso3).toBe("BBB");
  });
});

describe("pickNext — normal phase, marathon", () => {
  it("excludes completed countries from the fresh pool", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB", "CCC"]);
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "",
      total: 0,
      retryQueue: [],
      phase: "normal",
      sessionType: "marathon",
      completedSet: new Set(["AAA", "BBB"]),
    });
    expect(result.iso3).toBe("CCC");
  });

  it("excludes queued countries from the fresh pool", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB", "CCC"]);
    const retryQueue: RetryEntry[] = [
      { iso3: "AAA", dueAt: 100 },
      { iso3: "BBB", dueAt: 100 },
    ];
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "",
      total: 0,
      retryQueue,
      phase: "normal",
      sessionType: "marathon",
      completedSet: new Set(),
    });
    expect(result.iso3).toBe("CCC");
  });

  it("falls back to retryQueue head when fresh pool is exhausted", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB"]);
    const retryQueue: RetryEntry[] = [{ iso3: "BBB", dueAt: 999 }];
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "",
      total: 0,
      retryQueue,
      phase: "normal",
      sessionType: "marathon",
      completedSet: new Set(["AAA"]),
    });
    expect(result.iso3).toBe("BBB");
  });

  it("fallback prefers a queue entry other than excludeIso3 when possible", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB", "CCC"]);
    const retryQueue: RetryEntry[] = [
      { iso3: "BBB", dueAt: 999 },
      { iso3: "CCC", dueAt: 999 },
    ];
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "BBB",
      total: 0,
      retryQueue,
      phase: "normal",
      sessionType: "marathon",
      completedSet: new Set(["AAA"]),
    });
    expect(result.iso3).toBe("CCC");
  });

  it("due retry takes precedence over the marathon fresh pool", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB", "CCC"]);
    const retryQueue: RetryEntry[] = [{ iso3: "BBB", dueAt: 1 }];
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "",
      total: 5,
      retryQueue,
      phase: "normal",
      sessionType: "marathon",
      completedSet: new Set(),
    });
    expect(result.iso3).toBe("BBB");
  });
});

describe("pickNext — review phase", () => {
  it("returns the first retryQueue entry not equal to excludeIso3", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB", "CCC"]);
    const retryQueue: RetryEntry[] = [
      { iso3: "AAA", dueAt: 0 },
      { iso3: "BBB", dueAt: 0 },
    ];
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "AAA",
      total: 0,
      retryQueue,
      phase: "review",
      sessionType: "freeplay",
      completedSet: new Set(),
    });
    expect(result.iso3).toBe("BBB");
  });

  it("falls back to retryQueue[0] when only the excluded entry remains", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB"]);
    const retryQueue: RetryEntry[] = [{ iso3: "AAA", dueAt: 0 }];
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "AAA",
      total: 0,
      retryQueue,
      phase: "review",
      sessionType: "freeplay",
      completedSet: new Set(),
    });
    expect(result.iso3).toBe("AAA");
  });
});
