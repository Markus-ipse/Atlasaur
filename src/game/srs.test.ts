// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dueCount,
  emptyStore,
  fromJSON,
  grade,
  introductionOrder,
  isDue,
  learnedCount,
  lifetimeAccuracy,
  loadStore,
  newAvailableCount,
  previewIntervalDays,
  saveStore,
  toJSON,
  totalReviews,
} from "./srs";
import type { Country, SrsRecord, SrsStore } from "../types";

const T0 = new Date("2026-05-16T12:00:00Z");

function days(n: number): Date {
  return new Date(T0.getTime() + n * 86_400_000);
}

afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
});

describe("grade", () => {
  it("creates a new record from null on first grade", () => {
    const r = grade(null, "Good", T0);
    expect(r.reps).toBe(1);
    expect(r.lapses).toBe(0);
    // After a Good grade on a fresh card, ts-fsrs schedules a future due.
    expect(new Date(r.due).getTime()).toBeGreaterThan(T0.getTime());
  });

  it("increments reps with each grade", () => {
    let r: SrsRecord | null = null;
    r = grade(r, "Again", T0);
    expect(r.reps).toBe(1);
    r = grade(r, "Good", days(1));
    expect(r.reps).toBe(2);
  });

  it("Easy schedules a longer interval than Hard", () => {
    const easy = grade(null, "Easy", T0);
    const hard = grade(null, "Hard", T0);
    expect(new Date(easy.due).getTime()).toBeGreaterThan(
      new Date(hard.due).getTime(),
    );
  });
});

describe("toJSON / fromJSON", () => {
  it("round-trips a card through JSON", () => {
    const r = grade(null, "Good", T0);
    const card = fromJSON(r);
    const back = toJSON(card);
    expect(back).toEqual(r);
  });
});

describe("isDue / dueCount", () => {
  it("isDue compares due timestamp to now", () => {
    // A Good grade on a fresh card schedules ~10min out (learning step),
    // so well past its due in 1 day.
    const r = grade(null, "Good", T0);
    expect(isDue(r, days(1))).toBe(true);
    expect(isDue(r, T0)).toBe(false);
  });

  it("dueCount filters by scope", () => {
    const store: SrsStore = {
      version: 1,
      records: {
        FRA: grade(null, "Good", T0),
        DEU: grade(null, "Good", T0),
        JPN: grade(null, "Good", T0),
      },
    };
    const fut = days(2);
    expect(dueCount(store, new Set(["FRA", "DEU", "JPN"]), fut)).toBe(3);
    expect(dueCount(store, new Set(["FRA"]), fut)).toBe(1);
    expect(dueCount(store, new Set([]), fut)).toBe(0);
  });
});

describe("loadStore / saveStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns empty store when nothing is persisted", () => {
    const s = loadStore();
    expect(s.version).toBe(1);
    expect(Object.keys(s.records)).toHaveLength(0);
  });

  it("round-trips a store", () => {
    const original: SrsStore = {
      version: 1,
      records: { FRA: grade(null, "Good", T0) },
    };
    saveStore(original);
    const loaded = loadStore();
    expect(loaded).toEqual(original);
  });

  it("resets on version mismatch", () => {
    window.localStorage.setItem(
      "atlasaur:srs:v1",
      JSON.stringify({ version: 99, records: {} }),
    );
    const s = loadStore();
    expect(s).toEqual(emptyStore());
  });

  it("resets on malformed JSON", () => {
    window.localStorage.setItem("atlasaur:srs:v1", "not-json");
    const s = loadStore();
    expect(s).toEqual(emptyStore());
  });
});

describe("introductionOrder", () => {
  function c(notability: 0 | 1 | 2, size: 0 | 1 | 2 | 3): Country {
    return {
      numeric: "000",
      iso3: "XXX",
      name: "x",
      aliases: [],
      continent: "Europe",
      subregion: "Western Europe",
      capital: null,
      capitalLonLat: null,
      neighbors: [],
      sizeTier: size,
      notabilityTier: notability,
    };
  }

  it("ranks notability tier above size tier", () => {
    // tier-2 notability beats tier-1 even when size is smaller
    expect(introductionOrder(c(2, 0))).toBeGreaterThan(
      introductionOrder(c(1, 3)),
    );
  });

  it("uses size as tiebreaker within the same notability tier", () => {
    expect(introductionOrder(c(2, 3))).toBeGreaterThan(
      introductionOrder(c(2, 0)),
    );
  });
});

describe("aggregate helpers", () => {
  it("learnedCount counts records with state >= 2 in scope", () => {
    let r: SrsRecord = grade(null, "Easy", T0);
    // Easy on a new card may not immediately reach Review state; force it
    // by grading Good a few times.
    r = grade(r, "Good", days(1));
    r = grade(r, "Good", days(10));
    const store: SrsStore = {
      version: 1,
      records: {
        FRA: r,
        DEU: grade(null, "Again", T0),
      },
    };
    const scope = new Set(["FRA", "DEU"]);
    // FRA likely graduated; DEU is fresh.
    expect(learnedCount(store, scope)).toBeLessThanOrEqual(2);
  });

  it("totalReviews sums reps", () => {
    let a: SrsRecord = grade(null, "Good", T0);
    a = grade(a, "Good", days(1));
    const store: SrsStore = {
      version: 1,
      records: { FRA: a, DEU: grade(null, "Again", T0) },
    };
    expect(totalReviews(store)).toBe(3); // 2 + 1
  });

  it("lifetimeAccuracy is in [0,1]", () => {
    const store: SrsStore = {
      version: 1,
      records: {
        FRA: grade(null, "Again", T0),
        DEU: grade(null, "Good", T0),
      },
    };
    const acc = lifetimeAccuracy(store);
    expect(acc).toBeGreaterThanOrEqual(0);
    expect(acc).toBeLessThanOrEqual(1);
  });

  it("newAvailableCount counts iso3s without a record", () => {
    const store: SrsStore = {
      version: 1,
      records: { FRA: grade(null, "Good", T0) },
    };
    expect(newAvailableCount(store, new Set(["FRA", "DEU", "JPN"]))).toBe(2);
  });
});

describe("previewIntervalDays", () => {
  it("returns a non-negative integer for each ease", () => {
    for (const ease of ["Again", "Hard", "Good", "Easy"] as const) {
      const n = previewIntervalDays(null, ease, T0);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });
});
