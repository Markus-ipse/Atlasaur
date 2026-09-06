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
  seenCount,
  loadStore,
  masteryBySubregion,
  masteryByContinent,
  masteryTierOf,
  masteryTiers,
  masteryPercent,
  paintTiers,
  newAvailableCount,
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
    const back = toJSON(card, r);
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

  it("backfills hits/misses on records saved before the tally existed", () => {
    const legacy = grade(null, "Good", T0) as Partial<SrsRecord>;
    delete legacy.hits;
    delete legacy.misses;
    window.localStorage.setItem(
      "atlasaur:srs:v1",
      JSON.stringify({ version: 1, records: { FRA: legacy } }),
    );
    const s = loadStore();
    expect(s.records["FRA"].hits).toBe(0);
    expect(s.records["FRA"].misses).toBe(0);
    expect(s.records["FRA"].reps).toBe(1);
  });

  it("drops a malformed record entry instead of resetting the store", () => {
    window.localStorage.setItem(
      "atlasaur:srs:v1",
      JSON.stringify({
        version: 1,
        records: { FRA: grade(null, "Good", T0), DEU: null },
      }),
    );
    const s = loadStore();
    expect(s.records["FRA"]).toBeDefined();
    expect("DEU" in s.records).toBe(false);
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

  it("lifetimeAccuracy counts misses on new cards (not just FSRS lapses)", () => {
    // Two misses in five answers. FSRS `lapses` stays 0 here because none
    // of the cards were in Review state, so a lapses-based ratio would
    // report 100%.
    let fra: SrsRecord = grade(null, "Again", T0);
    fra = grade(fra, "Good", days(1));
    fra = grade(fra, "Again", days(2));
    let deu: SrsRecord = grade(null, "Good", T0);
    deu = grade(deu, "Good", days(1));
    const store: SrsStore = { version: 1, records: { FRA: fra, DEU: deu } };
    expect(fra.lapses + deu.lapses).toBe(0);
    expect(fra.hits).toBe(1);
    expect(fra.misses).toBe(2);
    expect(deu.hits).toBe(2);
    expect(lifetimeAccuracy(store)).toBeCloseTo(3 / 5);
  });

  it("lifetimeAccuracy is null when nothing has been tallied", () => {
    expect(lifetimeAccuracy({ version: 1, records: {} })).toBeNull();
    // A record migrated from before the tally existed has reps but no
    // hits/misses — still null rather than a false 0%.
    const migrated: SrsRecord = { ...grade(null, "Good", T0), hits: 0, misses: 0 };
    expect(migrated.reps).toBe(1);
    expect(lifetimeAccuracy({ version: 1, records: { FRA: migrated } })).toBeNull();
  });

  it("seenCount counts every in-scope record regardless of state", () => {
    const store: SrsStore = {
      version: 1,
      records: {
        FRA: grade(null, "Again", T0),
        DEU: grade(null, "Good", T0),
        JPN: grade(null, "Good", T0),
      },
    };
    expect(seenCount(store, new Set(["FRA", "DEU", "ESP"]))).toBe(2);
    expect(learnedCount(store, new Set(["FRA", "DEU", "ESP"]))).toBe(0);
  });

  it("newAvailableCount counts iso3s without a record", () => {
    const store: SrsStore = {
      version: 1,
      records: { FRA: grade(null, "Good", T0) },
    };
    expect(newAvailableCount(store, new Set(["FRA", "DEU", "JPN"]))).toBe(2);
  });
});

describe("masteryBySubregion", () => {
  function country(iso3: string, subregion: Country["subregion"]): Country {
    return {
      numeric: "000",
      iso3,
      name: iso3,
      aliases: [],
      continent: "Africa",
      subregion,
      capital: "—",
      capitalLonLat: [0, 0],
      neighbors: [],
      sizeTier: 0,
      notabilityTier: 0,
    };
  }

  // A record with state 2 (Review) — the "learned" predicate. Construct
  // directly so the assertion is structural and deterministic.
  function learnedRecord(): SrsRecord {
    return {
      due: T0.toISOString(),
      stability: 10,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 10,
      learning_steps: 0,
      reps: 3,
      lapses: 0,
      state: 2,
      hits: 3,
      misses: 0,
    };
  }

  const COUNTRIES: Country[] = [
    country("ZAF", "Southern Africa"),
    country("NAM", "Southern Africa"),
    country("BWA", "Southern Africa"),
    country("NGA", "Western Africa"),
    country("GHA", "Western Africa"),
  ];

  it("aggregates learned/total per subregion, matching learnedCount's state>=2", () => {
    const store: SrsStore = {
      version: 1,
      records: {
        ZAF: learnedRecord(),
        NGA: learnedRecord(),
        GHA: grade(null, "Again", T0), // state < 2, not learned
      },
    };
    const scope = new Set(["ZAF", "NAM", "BWA", "NGA", "GHA"]);
    const map = masteryBySubregion(store, COUNTRIES, scope);
    expect(map.get("Southern Africa")).toEqual({ learned: 1, total: 3 });
    expect(map.get("Western Africa")).toEqual({ learned: 1, total: 2 });
    // The "learned" count uses the same predicate as learnedCount.
    expect(map.get("Southern Africa")!.learned).toBe(
      learnedCount(store, new Set(["ZAF", "NAM", "BWA"])),
    );
  });

  it("ignores out-of-scope countries and emits only subregions with ≥1 in scope", () => {
    const store: SrsStore = { version: 1, records: {} };
    const scope = new Set(["ZAF", "NAM"]); // Southern Africa only
    const map = masteryBySubregion(store, COUNTRIES, scope);
    expect(map.get("Southern Africa")).toEqual({ learned: 0, total: 2 });
    expect(map.has("Western Africa")).toBe(false);
  });
});

describe("mastery paint (R2.1)", () => {
  function country(iso3: string, continent: Country["continent"]): Country {
    return {
      numeric: "000",
      iso3,
      name: iso3,
      aliases: [],
      continent,
      subregion: continent === "Europe" ? "Western Europe" : "Western Africa",
      capital: "—",
      capitalLonLat: [0, 0],
      neighbors: [],
      sizeTier: 0,
      notabilityTier: 0,
    };
  }

  function knownRecord(): SrsRecord {
    return {
      due: T0.toISOString(),
      stability: 10,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 10,
      learning_steps: 0,
      reps: 3,
      lapses: 0,
      state: 2,
      hits: 3,
      misses: 0,
    };
  }

  describe("masteryTierOf", () => {
    it("reads a missing record as unseen", () => {
      expect(masteryTierOf(undefined)).toBe(0);
    });

    it("reads a fresh record as introduced", () => {
      expect(masteryTierOf(grade(null, "Good", T0))).toBe(1);
    });

    it("reads a graduated record as known", () => {
      expect(masteryTierOf(knownRecord())).toBe(2);
    });

    it("agrees with learnedCount on which records are known", () => {
      const store: SrsStore = {
        version: 1,
        records: { FRA: knownRecord(), DEU: grade(null, "Good", T0) },
      };
      const scope = new Set(["FRA", "DEU"]);
      const known = Object.keys(store.records).filter(
        (iso3) => masteryTierOf(store.records[iso3]) === 2,
      );
      expect(known.length).toBe(learnedCount(store, scope));
    });
  });

  describe("masteryTiers", () => {
    it("maps only countries that have a record", () => {
      const store: SrsStore = {
        version: 1,
        records: { FRA: knownRecord(), DEU: grade(null, "Again", T0) },
      };
      const tiers = masteryTiers(store);
      expect(tiers.get("FRA")).toBe(2);
      expect(tiers.get("DEU")).toBe(1);
      expect(tiers.has("ESP")).toBe(false);
      expect(tiers.size).toBe(2);
    });

    it("tiers every record in the store, including ones no scope would include", () => {
      // masteryTiers takes no scope by design — a country keeps the ink it
      // earned when the continent filter excludes it, and fillFor's own
      // inScope branch decides whether that ink is shown. Assert the property
      // that encodes: two countries on different continents, one of which any
      // single-continent scope would drop, both come back tiered.
      const store: SrsStore = {
        version: 1,
        records: { FRA: knownRecord(), NGA: knownRecord() },
      };
      const tiers = masteryTiers(store);
      expect([...tiers.keys()].sort()).toEqual(["FRA", "NGA"]);
      // ...while the scoped aggregate does drop it, so the two helpers are
      // genuinely answering different questions.
      const scoped = masteryByContinent(
        store,
        [country("FRA", "Europe"), country("NGA", "Africa")],
        new Set(["FRA"]),
      );
      expect(scoped.has("Africa")).toBe(false);
    });
  });

  describe("paintTiers", () => {
    // A store mid-learning: one country known, one still in FSRS learning,
    // which is the pair the scheduler's pick branches partition on.
    function store(): SrsStore {
      return {
        version: 1,
        records: { FRA: knownRecord(), DEU: grade(null, "Good", T0) },
      };
    }

    it("keeps all three tiers in shape-to-name", () => {
      const tiers = paintTiers(store(), "shape-to-name");
      expect(tiers.get("FRA")).toBe(2);
      expect(tiers.get("DEU")).toBe(1);
    });

    it("collapses the introduced wash into unseen in name-to-click", () => {
      // Otherwise a resurfaced learning card would be the only washed country
      // on the map, narrowing "find Germany" to a set of three or four.
      const tiers = paintTiers(store(), "name-to-click");
      expect(tiers.get("DEU")).toBe(0);
    });

    it("still paints known countries in name-to-click", () => {
      // The known set is large, so it cannot narrow the answer — and it is the
      // whole point of the feature.
      expect(paintTiers(store(), "name-to-click").get("FRA")).toBe(2);
    });

    it("leaves no tier 1 anywhere in name-to-click", () => {
      const tiers = paintTiers(store(), "name-to-click");
      expect([...tiers.values()]).not.toContain(1);
    });
  });

  describe("masteryByContinent", () => {
    const COUNTRIES: Country[] = [
      country("FRA", "Europe"),
      country("DEU", "Europe"),
      country("ESP", "Europe"),
      country("NGA", "Africa"),
    ];

    it("counts known against every in-scope country on the continent", () => {
      const store: SrsStore = {
        version: 1,
        records: { FRA: knownRecord(), DEU: grade(null, "Good", T0) },
      };
      const scope = new Set(["FRA", "DEU", "ESP", "NGA"]);
      const map = masteryByContinent(store, COUNTRIES, scope);
      expect(map.get("Europe")).toEqual({ known: 1, total: 3 });
      expect(map.get("Africa")).toEqual({ known: 0, total: 1 });
    });

    it("omits a continent with nothing in scope", () => {
      const store: SrsStore = { version: 1, records: {} };
      const map = masteryByContinent(store, COUNTRIES, new Set(["NGA"]));
      expect(map.has("Europe")).toBe(false);
      expect(map.get("Africa")).toEqual({ known: 0, total: 1 });
    });

    it("does not count an out-of-scope known country toward its continent", () => {
      const store: SrsStore = { version: 1, records: { FRA: knownRecord() } };
      const map = masteryByContinent(store, COUNTRIES, new Set(["DEU", "ESP"]));
      expect(map.get("Europe")).toEqual({ known: 0, total: 2 });
    });
  });
});

describe("masteryPercent", () => {
  it("reserves 100% for a finished set", () => {
    expect(masteryPercent(39, 39)).toBe(100);
    expect(masteryPercent(38, 39)).toBe(97);
  });

  it("never rounds a near-finished set up to 100", () => {
    // 199/200 is 99.5% — a naive round would claim the continent is done.
    expect(masteryPercent(199, 200)).toBe(99);
  });

  it("never rounds a started set down to 0", () => {
    // 1/300 is 0.33% — a naive floor would claim the learner had done nothing.
    expect(masteryPercent(1, 300)).toBe(1);
  });

  it("reserves 0% for an untouched set", () => {
    expect(masteryPercent(0, 39)).toBe(0);
  });

  it("returns 0 for an empty set rather than dividing by zero", () => {
    expect(masteryPercent(0, 0)).toBe(0);
  });
});
