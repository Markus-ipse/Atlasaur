import { describe, expect, it } from "vitest";
import { ALL_CONTINENTS } from "../types";
import { scopeLine, scopeOf, testDoor } from "./scopeSummary";

describe("scopeOf", () => {
  it("is the whole world when every chip is on", () => {
    expect(scopeOf(ALL_CONTINENTS, false, "location")).toEqual({ kind: "world" });
    expect(scopeOf(ALL_CONTINENTS, true, "location")).toEqual({ kind: "world" });
  });

  it("does not name a hidden continent", () => {
    // Antarctica has no chip with territories off, so every visible chip on
    // is still the whole world, and Antarctica is never named beside another.
    const visible = ALL_CONTINENTS.filter((c) => c !== "Antarctica");
    expect(scopeOf(visible, false, "location")).toEqual({ kind: "world" });
    expect(scopeOf(["Europe", "Antarctica"], false, "location")).toEqual({
      kind: "in",
      names: "Europe",
    });
    expect(scopeOf(["Europe", "Antarctica"], true, "location")).toEqual({
      kind: "in",
      names: "Antarctica and Europe",
    });
  });

  it("joins several in the order of the chips", () => {
    expect(scopeOf(["Europe", "Africa", "Asia"], false, "location")).toEqual({
      kind: "in",
      names: "Africa, Asia and Europe",
    });
  });

  it("names what is left out once more than half is on", () => {
    const visible = ALL_CONTINENTS.filter((c) => c !== "Antarctica");
    expect(scopeOf(visible, true, "location")).toEqual({
      kind: "except",
      names: "Antarctica",
    });
    expect(
      scopeOf(["Africa", "Asia", "Europe", "North America"], false, "location"),
    ).toEqual({ kind: "except", names: "Oceania and South America" });
  });
});

describe("scope copy", () => {
  it("names the scope and its size, fact-aware", () => {
    expect(scopeLine(["South America"], false, "location", 12)).toBe(
      "South America · 12 countries",
    );
    expect(scopeLine(ALL_CONTINENTS, false, "capital", 1)).toBe(
      "The whole world · 1 capital",
    );
    expect(scopeLine(["Africa", "Asia", "Europe", "North America", "Oceania"], false, "location", 187)).toBe(
      "Everywhere but South America · 187 countries",
    );
  });

  it("names the scope on the test door and puts its size in the figure", () => {
    expect(testDoor(["South America"], false, "location", 12)).toEqual({
      label: "Test South America",
      figure: "12 countries",
    });
    expect(testDoor(ALL_CONTINENTS, false, "location", 199)).toEqual({
      label: "Test the whole world",
      figure: "199 countries",
    });
    expect(testDoor(["Antarctica"], true, "location", 1)).toEqual({
      label: "Test Antarctica",
      figure: "1 country",
    });
    expect(
      testDoor(["Africa", "Asia", "Europe", "North America"], false, "location", 150),
    ).toEqual({
      label: "Test everywhere but Oceania and South America",
      figure: "150 countries",
    });
    expect(testDoor(["Europe"], false, "capital", 44).figure).toBe("44 capitals");
  });
});
