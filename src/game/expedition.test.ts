// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EXPEDITION_SIZE,
  expeditionFor,
  expeditionPool,
  expeditionStatus,
  formatDay,
  glyphRow,
  loadExpedition,
  newExpedition,
  recordOutcome,
  saveExpedition,
  shareText,
  type ExpeditionStore,
} from "./expedition";
import countriesData from "../data/countries.json";
import type { Country } from "../types";

const ALL_COUNTRIES = countriesData as Country[];
const POOL = expeditionPool(ALL_COUNTRIES);
const VALID = new Set(ALL_COUNTRIES.map((c) => c.iso3));

// Local noon so dayKey is stable regardless of the test runner's zone.
function at(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function finished(day: string, found: number): ExpeditionStore {
  const s = newExpedition(day, POOL);
  return {
    ...s,
    outcomes: Array.from({ length: EXPEDITION_SIZE }, (_, i) =>
      i < found ? "found" : "missed",
    ),
  };
}

describe("expeditionFor", () => {
  it("yields the same ten for a date across runs", () => {
    expect(expeditionFor("2026-09-06", POOL)).toEqual(
      expeditionFor("2026-09-06", POOL),
    );
  });

  it("does not depend on the pool's order", () => {
    const reversed = [...POOL].reverse();
    const shuffled = [...POOL].sort((a, b) => a.name.localeCompare(b.name));
    expect(expeditionFor("2026-09-06", reversed)).toEqual(
      expeditionFor("2026-09-06", POOL),
    );
    expect(expeditionFor("2026-09-06", shuffled)).toEqual(
      expeditionFor("2026-09-06", POOL),
    );
  });

  it("is ten distinct countries from the pool", () => {
    const ten = expeditionFor("2026-09-06", POOL);
    expect(ten).toHaveLength(EXPEDITION_SIZE);
    expect(new Set(ten).size).toBe(EXPEDITION_SIZE);
    const inPool = new Set(POOL.map((c) => c.iso3));
    expect(ten.every((iso3) => inPool.has(iso3))).toBe(true);
  });

  it("changes from day to day", () => {
    const a = expeditionFor("2026-09-06", POOL);
    const b = expeditionFor("2026-09-07", POOL);
    expect(a).not.toEqual(b);
  });

  it("depends on the pool, so a grown pool changes the ten", () => {
    // R3.4 will add countries; the seed is over the pool rather than a fixed
    // table precisely so that the new arrivals can be asked.
    const smaller = POOL.slice(0, POOL.length - 1);
    expect(expeditionFor("2026-09-06", smaller)).not.toEqual(
      expeditionFor("2026-09-06", POOL),
    );
  });
});

describe("expeditionPool", () => {
  it("excludes territories whatever the learner's settings", () => {
    expect(POOL.some((c) => c.territory)).toBe(false);
    expect(POOL.length).toBeGreaterThan(EXPEDITION_SIZE);
  });
});

describe("expeditionStatus", () => {
  it("is fresh with no store, a store from another day, or no answer yet", () => {
    expect(expeditionStatus(null, at("2026-09-06"))).toEqual({ kind: "fresh" });
    const yesterday = finished("2026-09-05", 7);
    expect(expeditionStatus(yesterday, at("2026-09-06"))).toEqual({
      kind: "fresh",
    });
    const opened = newExpedition("2026-09-06", POOL);
    expect(expeditionStatus(opened, at("2026-09-06"))).toEqual({ kind: "fresh" });
  });

  it("reports an expedition in progress with its count so far", () => {
    let s = newExpedition("2026-09-06", POOL);
    s = recordOutcome(s, "found");
    s = recordOutcome(s, "missed");
    s = recordOutcome(s, "found");
    expect(expeditionStatus(s, at("2026-09-06"))).toEqual({
      kind: "in-progress",
      answered: 3,
      found: 2,
    });
  });

  it("reports a finished expedition until the day ends", () => {
    const s = finished("2026-09-06", 8);
    expect(expeditionStatus(s, at("2026-09-06"))).toEqual({
      kind: "finished",
      found: 8,
    });
    expect(expeditionStatus(s, at("2026-09-07"))).toEqual({ kind: "fresh" });
  });

  it("stops recording once the ten are answered", () => {
    const s = finished("2026-09-06", 10);
    expect(recordOutcome(s, "missed")).toBe(s);
  });
});

describe("shareText", () => {
  it("is the row and a caption, in order", () => {
    let s = newExpedition("2026-09-06", POOL);
    for (const o of [
      "found",
      "found",
      "missed",
      "found",
      "found",
      "found",
      "missed",
      "found",
      "found",
      "found",
    ] as const) {
      s = recordOutcome(s, o);
    }
    expect(shareText(s)).toBe("Atlasaur · 6 September 2026\n■■□■■■□■■■ 8/10");
  });

  it("formats the day the same everywhere", () => {
    expect(formatDay("2026-01-01")).toBe("1 January 2026");
    expect(formatDay("2026-12-31")).toBe("31 December 2026");
  });

  it("draws an empty glyph for a miss", () => {
    expect(glyphRow(["found", "missed"])).toBe("■□");
  });
});

describe("persistence", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("round-trips a store", () => {
    const s = recordOutcome(newExpedition("2026-09-06", POOL), "found");
    saveExpedition(s);
    expect(loadExpedition((iso3) => VALID.has(iso3))).toEqual(s);
  });

  it("removes the key when saving null", () => {
    saveExpedition(newExpedition("2026-09-06", POOL));
    saveExpedition(null);
    expect(loadExpedition(() => true)).toBeNull();
  });

  it("discards a store this build cannot ask", () => {
    const s = newExpedition("2026-09-06", POOL);
    saveExpedition(s);
    expect(loadExpedition((iso3) => iso3 !== s.iso3s[3])).toBeNull();
  });

  it("discards malformed stores", () => {
    const good = newExpedition("2026-09-06", POOL);
    const bad: unknown[] = [
      { ...good, version: 2 },
      { ...good, day: "2026-9-6" },
      { ...good, iso3s: good.iso3s.slice(0, 9) },
      { ...good, iso3s: [...good.iso3s.slice(0, 9), good.iso3s[0]] },
      { ...good, outcomes: ["found", "maybe"] },
      { ...good, outcomes: Array(EXPEDITION_SIZE + 1).fill("found") },
      "not an object",
    ];
    for (const b of bad) {
      window.localStorage.setItem("atlasaur:expedition:v1", JSON.stringify(b));
      expect(loadExpedition(() => true)).toBeNull();
    }
    window.localStorage.setItem("atlasaur:expedition:v1", "{not json");
    expect(loadExpedition(() => true)).toBeNull();
  });
});
