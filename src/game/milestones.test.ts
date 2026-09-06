import { describe, expect, it } from "vitest";
import { crossesIntoKnown, milestoneFor, streakNote } from "./milestones";
import { grade } from "./srs";
import type { Country, SrsRecord, SrsStore } from "../types";

const T0 = new Date("2026-05-16T12:00:00Z");

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

function record(state: SrsRecord["state"]): SrsRecord {
  return {
    due: T0.toISOString(),
    stability: 10,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 10,
    learning_steps: 0,
    reps: 3,
    lapses: 0,
    state,
    hits: 3,
    misses: 0,
  };
}

describe("streakNote", () => {
  it("marks exactly the thresholds, so each is a moment not a badge", () => {
    expect(streakNote(5)).toBe("A steady hand.");
    expect(streakNote(10)).toBe("Cartographer's eye.");
    expect(streakNote(20)).toBe("Drawn from memory.");
  });

  it("says nothing between or beyond the thresholds", () => {
    for (const n of [0, 1, 4, 6, 9, 11, 19, 21, 50]) {
      expect(streakNote(n)).toBeNull();
    }
  });
});

describe("crossesIntoKnown", () => {
  it("fires when a learning card graduates", () => {
    expect(crossesIntoKnown(record(1), record(2))).toBe(true);
  });

  it("fires for a country with no record that lands straight in review", () => {
    expect(crossesIntoKnown(undefined, record(2))).toBe(true);
  });

  it("does not fire twice for a card already known", () => {
    expect(crossesIntoKnown(record(2), record(2))).toBe(false);
    // Relearning still counts as known, so a lapse and a recovery are silent.
    expect(crossesIntoKnown(record(2), record(3))).toBe(false);
    expect(crossesIntoKnown(record(3), record(2))).toBe(false);
  });

  it("does not fire when the card stays in learning", () => {
    expect(crossesIntoKnown(record(1), record(1))).toBe(false);
    expect(crossesIntoKnown(undefined, record(1))).toBe(false);
  });
});

describe("milestoneFor", () => {
  const FRA = country("FRA", "Europe");
  const DEU = country("DEU", "Europe");
  const NGA = country("NGA", "Africa");
  const POOL = [FRA, DEU, NGA];

  it("returns null when the answer does not carry the country into known", () => {
    const store: SrsStore = { version: 1, records: { FRA: record(1) } };
    expect(milestoneFor(FRA, store, record(1), POOL)).toBeNull();
  });

  it("names the country that just landed on the map", () => {
    const store: SrsStore = { version: 1, records: {} };
    const m = milestoneFor(FRA, store, record(2), POOL);
    expect(m).toEqual({ iso3: "FRA", name: "FRA", continentComplete: null });
  });

  it("seals the continent when it was the last one in scope", () => {
    // Germany already known; France is the last European country in the pool.
    const store: SrsStore = { version: 1, records: { DEU: record(2) } };
    const m = milestoneFor(FRA, store, record(2), POOL);
    expect(m?.continentComplete).toBe("Europe");
  });

  it("does not seal while another country on the continent is unknown", () => {
    const store: SrsStore = { version: 1, records: {} };
    const m = milestoneFor(FRA, store, record(2), POOL);
    expect(m?.continentComplete).toBeNull();
  });

  it("ignores other continents when deciding to seal", () => {
    // Nigeria is untouched, but it is not in Europe.
    const store: SrsStore = { version: 1, records: { DEU: record(2) } };
    expect(milestoneFor(FRA, store, record(2), POOL)?.continentComplete).toBe(
      "Europe",
    );
  });

  it("seals against the learner's scope, not the whole continent", () => {
    // Only France is in scope, so France alone finishes Europe. Widening the
    // scope later un-finishes it, exactly as the map percentage does.
    const store: SrsStore = { version: 1, records: {} };
    expect(milestoneFor(FRA, store, record(2), [FRA])?.continentComplete).toBe(
      "Europe",
    );
  });

  it("does not seal a continent the country is not in scope for", () => {
    const store: SrsStore = { version: 1, records: {} };
    expect(
      milestoneFor(FRA, store, record(2), [NGA])?.continentComplete,
    ).toBeNull();
  });
});

describe("prediction matches the commit", () => {
  // applyCorrect grades a throwaway copy at answer time to decide the
  // ceremony; dismissFeedback grades for real a beat later. A ceremony the
  // commit does not deliver would be a lie, so pin that the tier transition
  // is the same however long the flash lasts.
  const CASES: (SrsRecord | null)[] = [
    null,
    { ...record(0), learning_steps: 0 },
    { ...record(1), learning_steps: 0 },
    // The one state where a Good actually graduates: a card on its last
    // learning step. Without this the whole suite below is vacuous, because
    // every other case answers "no" on both sides.
    { ...record(1), learning_steps: 1 },
    { ...record(2), learning_steps: 0 },
    { ...record(3), learning_steps: 0 },
  ];

  it("covers at least one case that actually crosses, so the pin is not vacuous", () => {
    const crossings = CASES.filter((before) =>
      crossesIntoKnown(before ?? undefined, grade(before, "Good", T0)),
    );
    expect(crossings.length).toBeGreaterThan(0);
  });

  it("agrees for every card state across the length of the flash", () => {
    const answeredAt = T0;
    // MILESTONE_DURATION is 2400ms; go well past it.
    const committedAt = new Date(T0.getTime() + 5000);
    for (const before of CASES) {
      const predicted = grade(before, "Good", answeredAt);
      const committed = grade(before, "Good", committedAt);
      expect(crossesIntoKnown(before ?? undefined, predicted)).toBe(
        crossesIntoKnown(before ?? undefined, committed),
      );
    }
  });

  it("agrees for a miss as well, where the ceremony must not fire", () => {
    for (const before of CASES) {
      const predicted = grade(before, "Again", T0);
      const committed = grade(before, "Again", new Date(T0.getTime() + 5000));
      expect(crossesIntoKnown(before ?? undefined, predicted)).toBe(
        crossesIntoKnown(before ?? undefined, committed),
      );
    }
  });
});
