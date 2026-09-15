import { describe, expect, it } from "vitest";
import { askableBySubregion, grade } from "./srs";
import countriesJson from "../data/countries.json";
import type { Country, SrsRecords } from "../types";

const COUNTRIES = countriesJson as Country[];
const NOW = new Date("2026-09-15T12:00:00Z");
const HOUR = 3_600_000;

describe("askableBySubregion", () => {
  it("counts only what a focus can ask now: unseen or due", () => {
    const region = COUNTRIES.filter(
      (c) => c.subregion === "Southern Africa" && !c.territory,
    );
    const [known, learning, due, ...unseen] = region;
    const met = grade(null, "Good", new Date(NOW.getTime() - 24 * HOUR));
    const records: SrsRecords = {
      // Known and not due: nothing to ask.
      [known.iso3]: { ...met, state: 2, due: new Date(NOW.getTime() + 24 * HOUR).toISOString() },
      // Still learning but not due yet: not known, and still not askable now.
      [learning.iso3]: { ...met, state: 1, due: new Date(NOW.getTime() + HOUR).toISOString() },
      // Due: askable.
      [due.iso3]: { ...met, state: 2, due: new Date(NOW.getTime() - HOUR).toISOString() },
    };
    const scope = new Set(region.map((c) => c.iso3));
    const entry = askableBySubregion(records, COUNTRIES, scope, NOW).get(
      "Southern Africa",
    )!;
    expect(entry.total).toBe(region.length);
    expect(entry.total - entry.learned).toBe(unseen.length + 1);
  });
});
