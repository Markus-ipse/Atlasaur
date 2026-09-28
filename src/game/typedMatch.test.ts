import { describe, expect, it } from "vitest";
import countriesData from "../data/countries.json";
import type { Country } from "../types";
import {
  nearMatches,
  readTyped,
  withinOneEdit,
  type Spelling,
} from "./typedMatch";

// #64: a slip is offered, never graded. These pin the offers against the
// real table, and that the pairs a looser rule would collapse stay distinct.

const COUNTRIES = countriesData as Country[];
const country = (iso3: string) => COUNTRIES.find((c) => c.iso3 === iso3)!;
// The card on screen only matters to the capital matcher's current-first
// rule; France's capital is not near any spelling these tests type.
const FRA = country("FRA");
const nearMatchNames = (input: string) =>
  readTyped(input, "location", FRA).suggestions;
const nearMatchCapitals = (input: string) =>
  readTyped(input, "capital", FRA).suggestions;
const isos = (input: string) => nearMatchNames(input).map((s) => s.iso3);

describe("withinOneEdit", () => {
  it("allows one insert, delete, substitution or adjacent swap", () => {
    expect(withinOneEdit("iceland", "iceland")).toBe(true);
    expect(withinOneEdit("icland", "iceland")).toBe(true); // insert
    expect(withinOneEdit("icelands", "iceland")).toBe(true); // delete
    expect(withinOneEdit("icelant", "iceland")).toBe(true); // substitute
    expect(withinOneEdit("icelnad", "iceland")).toBe(true); // swap
    expect(withinOneEdit("ciealnd", "iceland")).toBe(false);
  });

  it("rejects two edits", () => {
    expect(withinOneEdit("iclnd", "iceland")).toBe(false);
    expect(withinOneEdit("australia", "austria")).toBe(false);
    expect(withinOneEdit("niger", "nigeria")).toBe(false);
    expect(withinOneEdit("abcd", "badc")).toBe(false);
  });
});

describe("readTyped on the real table", () => {
  it("offers the one country a slip is nearest", () => {
    expect(nearMatchNames("Icland")).toEqual([
      { iso3: "ISL", label: "Iceland" },
    ]);
    expect(isos("Brasil")).toEqual(["BRA"]);
  });

  it("offers every country a slip could be, in alphabetical order", () => {
    expect(isos("Austrlia")).toEqual(["AUS", "AUT"]);
    expect(isos("Nigera")).toEqual(["NER", "NGA"]);
    expect(isos("Nambia")).toEqual(["GMB", "NAM", "ZMB"]);
  });

  it("offers the capital's own words in a capital mode", () => {
    expect(nearMatchCapitals("Kingstwn")).toEqual([
      { iso3: "JAM", label: "Kingston" },
      { iso3: "VCT", label: "Kingstown" },
    ]);
    // An alternate capital is a real one and is shown as itself…
    expect(nearMatchCapitals("Cape Twon")).toEqual([
      { iso3: "ZAF", label: "Cape Town" },
    ]);
    // …an alias is never shown, so its offer names the primary capital.
    expect(nearMatchCapitals("Kievv")).toEqual([
      { iso3: "UKR", label: "Kyiv" },
    ]);
    // …unless it shortens an alternate, which it is then labelled as.
    expect(nearMatchCapitals("Kottte")).toEqual([
      { iso3: "LKA", label: "Sri Jayawardenepura Kotte" },
    ]);
  });

  it("keeps the close pairs distinct: typed exactly, each is itself", () => {
    const pairs: [string, string][] = [
      ["Iran", "IRN"],
      ["Iraq", "IRQ"],
      ["Niger", "NER"],
      ["Nigeria", "NGA"],
      ["Austria", "AUT"],
      ["Australia", "AUS"],
      ["Iceland", "ISL"],
      ["Ireland", "IRL"],
      ["Gambia", "GMB"],
      ["Zambia", "ZMB"],
    ];
    for (const [typed, iso3] of pairs) {
      // Each is one edit from its pair, so without the exact match first
      // "Iran" would be offered Iraq.
      expect(readTyped(typed, "location", FRA)).toEqual({
        iso3,
        suggestions: [],
      });
    }
  });

  it("grades a capital exactly, the current country first", () => {
    expect(readTyped("Kingston", "capital", country("JAM"))).toEqual({
      iso3: "JAM",
      suggestions: [],
    });
    expect(readTyped("Kingston", "capital", FRA).iso3).toBe("JAM");
  });

  it("offers nothing between abbreviations or for an empty answer", () => {
    expect(nearMatchNames("ul")).toEqual([]);
    expect(nearMatchNames("rsb")).toEqual([]);
    expect(nearMatchNames("  ")).toEqual([]);
    expect(nearMatchNames("Atlantis")).toEqual([]);
  });
});

describe("nearMatches limits", () => {
  const spelling = (iso3: string, normalized: string): Spelling => ({
    iso3,
    normalized,
    label: normalized,
  });

  it("offers nothing when more than three countries are a slip away", () => {
    const four = ["bata", "cata", "data", "fata"].map((s, i) =>
      spelling(`X${i}`, s),
    );
    expect(nearMatches("gata", four.slice(0, 3))).toHaveLength(3);
    expect(nearMatches("gata", four)).toEqual([]);
  });

  it("offers a country once, however many of its spellings are near", () => {
    const two = [spelling("XAA", "abcde"), spelling("XAA", "abcdf")];
    expect(nearMatches("abcdg", two)).toEqual([
      { iso3: "XAA", label: "abcde" },
    ]);
  });
});
