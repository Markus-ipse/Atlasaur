import { describe, expect, it } from "vitest";
import { capitalOffer } from "./offer";
import { grade } from "./srs";
import { storeWith } from "./srsFixtures";
import type { Country, SrsRecord, SrsStore } from "../types";

const T0 = new Date("2026-09-12T12:00:00Z");
const LATER = new Date(T0.getTime() + 30 * 86_400_000);

function country(iso3: string, capital: string | null): Country {
  return {
    numeric: "000",
    iso3,
    name: iso3,
    aliases: [],
    continent: "Europe",
    subregion: "Western Europe",
    capital,
    capitalLonLat: capital === null ? null : [0, 0],
    neighbors: [],
    sizeTier: 0,
    notabilityTier: 0,
  };
}

// state 2 = Review, which is what "known" means everywhere else.
function known(): SrsRecord {
  return { ...grade(null, "Good", T0), state: 2 };
}

const COUNTRIES = [
  country("FRA", "Paris"),
  country("DEU", "Berlin"),
  country("ESP", "Madrid"),
  country("ATA", null),
];
const SCOPE = new Set(["FRA", "DEU", "ESP", "ATA"]);

function withFacts(location = {}, capital = {}): SrsStore {
  const store = storeWith(location);
  store.facts.capital = capital;
  return store;
}

describe("capitalOffer", () => {
  it("offers nothing to a learner who knows no countries yet", () => {
    // Meeting a country is not knowing it; the offer waits for the tier-2
    // crossing, so a first session is never handed the whole atlas.
    const store = withFacts({ FRA: grade(null, "Good", T0) });
    expect(capitalOffer(store, COUNTRIES, SCOPE, T0)).toBeNull();
  });

  it("offers exactly the countries the learner can already place", () => {
    const store = withFacts({ FRA: known(), DEU: known() });
    expect(capitalOffer(store, COUNTRIES, SCOPE, T0)).toEqual({
      due: 0,
      ready: 2,
    });
  });

  it("never offers a country with no capital to ask about", () => {
    const store = withFacts({ ATA: known() });
    expect(capitalOffer(store, COUNTRIES, SCOPE, T0)).toBeNull();
  });

  it("respects the learner's scope", () => {
    const store = withFacts({ FRA: known(), DEU: known() });
    expect(capitalOffer(store, COUNTRIES, new Set(["FRA"]), T0)).toEqual({
      due: 0,
      ready: 1,
    });
  });

  it("counts a met capital as due rather than ready, once it comes round", () => {
    const store = withFacts(
      { FRA: known(), DEU: known() },
      { FRA: grade(null, "Good", T0) },
    );
    // Not yet due: FRA is met and waiting, DEU is still unmet but ready.
    expect(capitalOffer(store, COUNTRIES, SCOPE, T0)).toEqual({
      due: 0,
      ready: 1,
    });
    // A month on, FRA's capital has come round again.
    expect(capitalOffer(store, COUNTRIES, SCOPE, LATER)).toEqual({
      due: 1,
      ready: 1,
    });
  });

  it("offers a due capital even for a country whose location has lapsed", () => {
    // The gate is on introducing a capital, not on reviewing one already met.
    const store = withFacts({}, { FRA: grade(null, "Good", T0) });
    expect(capitalOffer(store, COUNTRIES, SCOPE, LATER)).toEqual({
      due: 1,
      ready: 0,
    });
  });

  it("stops offering once every known country's capital has been met", () => {
    const store = withFacts(
      { FRA: known() },
      { FRA: grade(null, "Good", T0) },
    );
    expect(capitalOffer(store, COUNTRIES, SCOPE, T0)).toBeNull();
  });
});
