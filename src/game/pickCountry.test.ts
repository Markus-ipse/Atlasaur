import { describe, it, expect } from "vitest";
import { markerOnlySubregions, pickNext, pickSpotlight } from "./pickCountry";
import countriesData from "../data/countries.json";
import type { Country, RetryEntry, Subregion } from "../types";

function country(iso3: string): Country {
  return {
    numeric: iso3,
    iso3,
    name: iso3,
    aliases: [],
    continent: "Europe",
    subregion: "Western Europe",
    capital: "—",
    capitalLonLat: [0, 0],
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

import { pickNextStudy, STUDY_NEW_CAP } from "./pickCountry";
import { grade } from "./srs";
import type { SrsRecords } from "../types";

function tierCountry(iso3: string, notability: 0 | 1 | 2, size: 0 | 1 | 2 | 3): Country {
  return { ...country(iso3), notabilityTier: notability, sizeTier: size };
}

describe("pickNextStudy", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  it("prefers a due record over a fresh introduction", () => {
    const fra = tierCountry("FRA", 2, 2);
    const deu = tierCountry("DEU", 1, 1);
    const pool = [fra, deu];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    // Make FRA due in the past
    const past = new Date(NOW.getTime() - 86_400_000);
    const records: SrsRecords = { FRA: grade(null, "Again", past) };
    const picked = pickNextStudy({
      pool,
      byIso3,
      excludeIso3: "",
      records,
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
    const records: SrsRecords = {};
    const picked = pickNextStudy({
      pool,
      byIso3,
      excludeIso3: "",
      records,
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
    const records: SrsRecords = { SEEN: { ...seenRecord, due: future.toISOString() } };
    const picked = pickNextStudy({
      pool,
      byIso3,
      excludeIso3: "",
      records,
      now: NOW,
      newIntroducedThisStretch: STUDY_NEW_CAP,
    });
    expect(picked?.iso3).toBe("SEEN");
  });

  it("brings a pending miss forward before falling back to filler", () => {
    const seen = tierCountry("SEEN", 2, 3);
    const missed = tierCountry("MISS", 0, 0);
    const pool = [seen, missed];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    const future = new Date(NOW.getTime() + 86_400_000).toISOString();
    const rec = grade(null, "Good", new Date(NOW.getTime() - 200_000));
    const records: SrsRecords = {
      // SEEN is the most overdue, so filler would pick it.
      SEEN: { ...rec, due: new Date(NOW.getTime() + 60_000).toISOString() },
      MISS: { ...rec, due: future },
    };
    const args = {
      pool,
      byIso3,
      records,
      now: NOW,
      newIntroducedThisStretch: STUDY_NEW_CAP,
      resurfaceQueue: [{ iso3: "MISS", dueAt: 10 }],
      step: 0,
    };
    expect(pickNextStudy({ ...args, excludeIso3: "" })?.iso3).toBe("MISS");
    // Never the card being left, and never one outside the pool.
    expect(pickNextStudy({ ...args, excludeIso3: "MISS" })?.iso3).toBe("SEEN");
    expect(
      pickNextStudy({ ...args, pool: [seen], excludeIso3: "" })?.iso3,
    ).toBe("SEEN");
  });

  it("introduces a new card before bringing a pending miss forward", () => {
    const fresh = tierCountry("NEW", 2, 0);
    const missed = tierCountry("MISS", 0, 0);
    const pool = [fresh, missed];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    const rec = grade(null, "Again", new Date(NOW.getTime() - 200_000));
    const records: SrsRecords = {
      MISS: { ...rec, due: new Date(NOW.getTime() + 60_000).toISOString() },
    };
    const picked = pickNextStudy({
      pool,
      byIso3,
      excludeIso3: "",
      records,
      now: NOW,
      newIntroducedThisStretch: 0,
      resurfaceQueue: [{ iso3: "MISS", dueAt: 10 }],
      step: 0,
    });
    expect(picked?.iso3).toBe("NEW");
  });

  it("returns null when nothing is due and pool is empty after exclusions", () => {
    const fra = tierCountry("FRA", 0, 0);
    const pool = [fra];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    const records: SrsRecords = {};
    const picked = pickNextStudy({
      pool,
      byIso3,
      excludeIso3: "FRA",
      records,
      now: NOW,
      newIntroducedThisStretch: STUDY_NEW_CAP,
    });
    expect(picked).toBeNull();
  });

  it("prefers a due resurface entry over any FSRS due record or new pick", () => {
    const fra = tierCountry("FRA", 2, 2); // would be the new pick (notable)
    const deu = tierCountry("DEU", 1, 1);
    const pool = [fra, deu];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    // DEU is FSRS-due in the past; without resurface it would be picked.
    const past = new Date(NOW.getTime() - 86_400_000);
    const records: SrsRecords = { DEU: grade(null, "Again", past) };
    const picked = pickNextStudy({
      pool,
      byIso3,
      excludeIso3: "",
      records,
      now: NOW,
      newIntroducedThisStretch: 0,
      resurfaceQueue: [{ iso3: "FRA", dueAt: 3 }],
      step: 5,
    });
    expect(picked?.iso3).toBe("FRA");
  });

  it("ignores a resurface entry whose gap has not elapsed (dueAt > step)", () => {
    const fra = tierCountry("FRA", 2, 2);
    const deu = tierCountry("DEU", 1, 1);
    const pool = [fra, deu];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    const past = new Date(NOW.getTime() - 86_400_000);
    const records: SrsRecords = { DEU: grade(null, "Again", past) };
    const picked = pickNextStudy({
      pool,
      byIso3,
      excludeIso3: "",
      records,
      now: NOW,
      newIntroducedThisStretch: 0,
      resurfaceQueue: [{ iso3: "FRA", dueAt: 9 }],
      step: 5,
    });
    // FRA not yet due → falls through to the FSRS due record.
    expect(picked?.iso3).toBe("DEU");
  });

  it("ignores a due resurface entry that is not in the (spotlight-narrowed) pool", () => {
    // JPN was missed before a spotlight narrowed the pool to Europe-only.
    // It's due (dueAt <= step) but out of scope, so it must NOT surface —
    // it stays queued for when the scope widens again.
    const fra = tierCountry("FRA", 0, 0);
    const jpn = tierCountry("JPN", 2, 1);
    const europePool = [fra];
    const byIso3 = new Map([
      ["FRA", fra],
      ["JPN", jpn],
    ]);
    const records: SrsRecords = {};
    const picked = pickNextStudy({
      pool: europePool,
      byIso3,
      excludeIso3: "",
      records,
      now: NOW,
      newIntroducedThisStretch: 0,
      resurfaceQueue: [{ iso3: "JPN", dueAt: 0 }],
      step: 5,
    });
    // Falls through to the in-pool new introduction, not JPN.
    expect(picked?.iso3).toBe("FRA");
  });

  it("skips a resurface entry equal to excludeIso3 (never re-picks current)", () => {
    const fra = tierCountry("FRA", 2, 2);
    const deu = tierCountry("DEU", 1, 1);
    const pool = [fra, deu];
    const byIso3 = new Map(pool.map((c) => [c.iso3, c]));
    const past = new Date(NOW.getTime() - 86_400_000);
    const records: SrsRecords = { DEU: grade(null, "Again", past) };
    const picked = pickNextStudy({
      pool,
      byIso3,
      excludeIso3: "FRA",
      records,
      now: NOW,
      newIntroducedThisStretch: 0,
      resurfaceQueue: [{ iso3: "FRA", dueAt: 0 }],
      step: 5,
    });
    expect(picked?.iso3).toBe("DEU");
  });

  it("scope filter excludes out-of-scope records (caller passes pool)", () => {
    // Caller-side scope filtering — the function just trusts `pool`. We
    // verify that passing a narrowed pool excludes records outside it.
    const inEurope = tierCountry("FRA", 1, 1);
    const inAsia = tierCountry("JPN", 2, 1);
    const past = new Date(NOW.getTime() - 86_400_000);
    const records: SrsRecords = {
        FRA: grade(null, "Again", past),
        JPN: grade(null, "Again", past),
      };
    // Pool is Europe-only — JPN is due but not in scope, so we get FRA.
    const europePool = [inEurope];
    const byIso3 = new Map([
      ["FRA", inEurope],
      ["JPN", inAsia],
    ]);
    const picked = pickNextStudy({
      pool: europePool,
      byIso3,
      excludeIso3: "",
      records,
      now: NOW,
      newIntroducedThisStretch: 0,
    });
    expect(picked?.iso3).toBe("FRA");
  });
});

describe("pickSpotlight", () => {
  function mastery(
    entries: [Subregion, number, number][],
  ): Map<Subregion, { learned: number; total: number }> {
    const m = new Map<Subregion, { learned: number; total: number }>();
    for (const [sub, learned, total] of entries) m.set(sub, { learned, total });
    return m;
  }

  it("filters below-gate subregions BEFORE ranking (late-game bug)", () => {
    // Southern Africa 4/5: lowest ratio (.80) but remaining 1 < gate → drop.
    // Eastern Africa 13/16: ratio .8125, remaining 3 → clears the gate.
    // Rank-then-null-check would pick Southern Africa, fail the gate, and
    // return null. Filter-first correctly surfaces Eastern Africa.
    const result = pickSpotlight(
      mastery([
        ["Southern Africa", 4, 5],
        ["Eastern Africa", 13, 16],
      ]),
    );
    expect(result).toEqual({ subregion: "Eastern Africa", remaining: 3 });
  });

  it("ranks survivors by lowest learned/total ratio (most neglected first)", () => {
    const result = pickSpotlight(
      mastery([
        ["Western Africa", 0, 12], // ratio 0
        ["Eastern Africa", 5, 50], // ratio .10
      ]),
    );
    expect(result?.subregion).toBe("Western Africa");
  });

  it("tiebreaks equal ratios by largest remaining, then alphabetical", () => {
    // Both ratio 0; remaining 8 vs 4 → Middle Africa (8) wins.
    const byRemaining = pickSpotlight(
      mastery([
        ["Western Africa", 0, 4],
        ["Middle Africa", 0, 8],
      ]),
    );
    expect(byRemaining?.subregion).toBe("Middle Africa");
    // Both ratio 0 and remaining 5 → alphabetical: Eastern before Western.
    const byAlpha = pickSpotlight(
      mastery([
        ["Western Africa", 0, 5],
        ["Eastern Africa", 0, 5],
      ]),
    );
    expect(byAlpha?.subregion).toBe("Eastern Africa");
  });

  it("returns null when no subregion clears the gate", () => {
    const result = pickSpotlight(
      mastery([
        ["Northern America", 1, 3], // remaining 2 < 3
        ["Australia and New Zealand", 0, 2], // remaining 2 < 3
      ]),
    );
    expect(result).toBeNull();
  });

  it("returns null for an empty map", () => {
    expect(pickSpotlight(new Map())).toBeNull();
  });

  it("offers a subregion it cannot frame only when nothing else clears the gate", () => {
    const lastResort = new Set<Subregion>(["Micronesia"]);
    expect(
      pickSpotlight(mastery([["Micronesia", 0, 5], ["Melanesia", 2, 5]]), lastResort)?.subregion,
    ).toBe("Melanesia");
    // Melanesia's 2 remaining are under the gate: Micronesia is all there is.
    expect(
      pickSpotlight(mastery([["Micronesia", 0, 5], ["Melanesia", 3, 5]]), lastResort)?.subregion,
    ).toBe("Micronesia");
  });

  it("finds the subregions drawn only as markers in the real table", () => {
    expect([...markerOnlySubregions(countriesData as Country[])].sort()).toEqual([
      "Micronesia",
      "Polynesia",
    ]);
  });
});

describe("pickNextStudy — introduceFirst", () => {
  const now = new Date("2026-09-12T12:00:00Z");

  // Three fresh countries, deliberately in an order where notability alone
  // would not produce the answer we want.
  const POOL: Country[] = [
    { ...country("AAA"), notabilityTier: 2, sizeTier: 3 },
    { ...country("BBB"), notabilityTier: 0, sizeTier: 0 },
    { ...country("CCC"), notabilityTier: 1, sizeTier: 1 },
  ];
  const BY_ISO3 = new Map(POOL.map((c) => [c.iso3, c]));

  function pick(introduceFirst?: ReadonlySet<string>) {
    return pickNextStudy({
      pool: POOL,
      byIso3: BY_ISO3,
      excludeIso3: "",
      records: {},
      introduceFirst,
      now,
      newIntroducedThisStretch: 0,
    });
  }

  it("introduces a prerequisite country ahead of a more notable one", () => {
    // Without it AAA wins on notability; BBB is last by every other measure.
    expect(pick()?.iso3).toBe("AAA");
    expect(pick(new Set(["BBB"]))?.iso3).toBe("BBB");
  });

  it("keeps the usual order among the countries that qualify", () => {
    expect(pick(new Set(["BBB", "CCC"]))?.iso3).toBe("CCC");
  });

  it("falls through to the ordinary order when none qualify", () => {
    // A capital mode chosen deliberately by a learner who has placed nothing
    // must still have something to ask.
    expect(pick(new Set(["ZZZ"]))?.iso3).toBe("AAA");
    expect(pick(new Set())?.iso3).toBe("AAA");
  });
});
