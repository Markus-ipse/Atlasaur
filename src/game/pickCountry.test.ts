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

describe("pickNext — normal phase", () => {
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
      completedSet: new Set(),
    });
    expect(result.iso3).toBe("BBB");
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
      completedSet: new Set(),
    });
    expect(result.iso3).toBe("BBB");
  });

  it("excludes completed countries from the fresh pool", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB", "CCC"]);
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "",
      total: 0,
      retryQueue: [],
      phase: "normal",
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
      completedSet: new Set(["AAA"]),
    });
    expect(result.iso3).toBe("CCC");
  });

  it("due retry takes precedence over the fresh pool", () => {
    const { pool, byIso3 } = makePool(["AAA", "BBB", "CCC"]);
    const retryQueue: RetryEntry[] = [{ iso3: "BBB", dueAt: 1 }];
    const result = pickNext({
      pool,
      byIso3,
      excludeIso3: "",
      total: 5,
      retryQueue,
      phase: "normal",
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
      completedSet: new Set(),
    });
    expect(result.iso3).toBe("AAA");
  });
});

import { pickNextTraining, TRAINING_NEW_CAP } from "./pickCountry";
import { grade } from "./srs";
import type { SrsStore } from "../types";

function tierCountry(iso3: string, notability: 0 | 1 | 2, size: 0 | 1 | 2 | 3): Country {
  return { ...country(iso3), notabilityTier: notability, sizeTier: size };
}

describe("pickNextTraining", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  it("prefers a due record over a fresh introduction", () => {
    const fra = tierCountry("FRA", 2, 2);
    const deu = tierCountry("DEU", 1, 1);
    const pool = [fra, deu];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    // Make FRA due in the past
    const past = new Date(NOW.getTime() - 86_400_000);
    const srsStore: SrsStore = {
      version: 1,
      records: { FRA: grade(null, "Again", past) },
    };
    const picked = pickNextTraining({
      pool,
      byIso3,
      excludeIso3: "",
      srsStore,
      now: NOW,
      newIntroducedThisStretch: 0,
    });
    expect(picked?.iso3).toBe("FRA");
  });

  it("introduces new countries in notability → size order when nothing is due", () => {
    // High-notability tier-2 should beat low-notability tier-3.
    const big_obscure = tierCountry("OBS", 0, 3);
    const small_famous = tierCountry("FAM", 2, 0);
    const mid = tierCountry("MID", 1, 1);
    const pool = [big_obscure, mid, small_famous];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    const srsStore: SrsStore = { version: 1, records: {} };
    const picked = pickNextTraining({
      pool,
      byIso3,
      excludeIso3: "",
      srsStore,
      now: NOW,
      newIntroducedThisStretch: 0,
    });
    expect(picked?.iso3).toBe("FAM");
  });

  it("honors the soft cap by falling back to the most-overdue record", () => {
    const fresh = tierCountry("NEW", 2, 0); // would be new if cap weren't hit
    const seen = tierCountry("SEEN", 0, 0);
    const pool = [fresh, seen];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    // SEEN has a future due date (not in the "due now" set)
    const future = new Date(NOW.getTime() + 86_400_000);
    const seenRecord = grade(null, "Good", new Date(NOW.getTime() - 200_000));
    const srsStore: SrsStore = {
      version: 1,
      records: { SEEN: { ...seenRecord, due: future.toISOString() } },
    };
    const picked = pickNextTraining({
      pool,
      byIso3,
      excludeIso3: "",
      srsStore,
      now: NOW,
      newIntroducedThisStretch: TRAINING_NEW_CAP,
    });
    expect(picked?.iso3).toBe("SEEN");
  });

  it("returns null when nothing is due and pool is empty after exclusions", () => {
    const fra = tierCountry("FRA", 0, 0);
    const pool = [fra];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    const srsStore: SrsStore = { version: 1, records: {} };
    const picked = pickNextTraining({
      pool,
      byIso3,
      excludeIso3: "FRA",
      srsStore,
      now: NOW,
      newIntroducedThisStretch: TRAINING_NEW_CAP,
    });
    expect(picked).toBeNull();
  });

  it("scope filter excludes out-of-scope records (caller passes pool)", () => {
    // Caller-side scope filtering — the function just trusts `pool`. We
    // verify that passing a narrowed pool excludes records outside it.
    const inEurope = tierCountry("FRA", 1, 1);
    const inAsia = tierCountry("JPN", 2, 1);
    const past = new Date(NOW.getTime() - 86_400_000);
    const srsStore: SrsStore = {
      version: 1,
      records: {
        FRA: grade(null, "Again", past),
        JPN: grade(null, "Again", past),
      },
    };
    // Pool is Europe-only — JPN is due but not in scope, so we get FRA.
    const europePool = [inEurope];
    const byIso3 = new Map([
      ["FRA", inEurope],
      ["JPN", inAsia],
    ]);
    const picked = pickNextTraining({
      pool: europePool,
      byIso3,
      excludeIso3: "",
      srsStore,
      now: NOW,
      newIntroducedThisStretch: 0,
    });
    expect(picked?.iso3).toBe("FRA");
  });
});
