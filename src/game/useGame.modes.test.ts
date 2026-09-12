// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  matchTypedCapital,
  matchTypedName,
  useGame,
} from "./useGame";
import { loadCounters } from "./counters";
import countriesData from "../data/countries.json";
import type { Country } from "../types";

// R3.2. The hook owns what the reducer cannot: which matcher a typed answer
// goes through, the persisted question mode, and the answer still on screen
// when the mode changes under it.

const ALL_COUNTRIES = countriesData as Country[];
const TODAY = new Date(2026, 8, 12, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

const country = (iso3: string): Country =>
  ALL_COUNTRIES.find((c) => c.iso3 === iso3)!;

describe("typed capitals", () => {
  it("accepts the capital, its alternates, its aliases and no accents", () => {
    // The primary and an alternate — both are real capitals of South Africa,
    // and both are named in the reveal.
    expect(matchTypedCapital("Pretoria", country("ZAF"))).toBe("ZAF");
    expect(matchTypedCapital("Cape Town", country("ZAF"))).toBe("ZAF");

    expect(matchTypedCapital("Kyiv", country("UKR"))).toBe("UKR");
    // An alias: accepted, never displayed.
    expect(matchTypedCapital("Kiev", country("UKR"))).toBe("UKR");

    expect(matchTypedCapital("  LIMA ", country("PER"))).toBe("PER");
    // normalize strips the accent, so the learner need not type one.
    expect(matchTypedCapital("bogota", country("COL"))).toBe("COL");
    // A "… City" capital answers to its bare name too.
    expect(matchTypedCapital("Mexico", country("MEX"))).toBe("MEX");
  });

  it("resolves a wrong capital to the country it belongs to", () => {
    // So the map can paint and label THAT country red, the same courtesy
    // Shape → Name already does for a wrong country name.
    expect(matchTypedCapital("Lima", country("ECU"))).toBe("PER");
  });

  it("checks the current country first", () => {
    // No two countries may share a normalised capital (the build script makes
    // that fatal), but the current card is checked first regardless, so a
    // correct answer can never resolve somewhere else.
    expect(matchTypedCapital("Lima", country("PER"))).toBe("PER");
  });

  it("returns no match for a word that is nobody's capital", () => {
    expect(matchTypedCapital("Narnia", country("PER"))).toBe("");
    expect(matchTypedCapital("   ", country("PER"))).toBe("");
  });

  it("never matches a capital-less country", () => {
    // Antarctica is out of every capital pool, but the matcher must not
    // resolve an empty answer onto it either.
    expect(matchTypedCapital("", country("ATA"))).toBe("");
  });

  it("the name matcher stays about names", () => {
    expect(matchTypedName("Peru")).toBe("PER");
    expect(matchTypedName("Lima")).toBe("");
  });
});

describe("useGame — the question mode is remembered", () => {
  it("survives a reload", () => {
    const first = renderHook(() => useGame());
    act(() => first.result.current.setMode("capital-to-click"));
    first.unmount();

    const second = renderHook(() => useGame());
    expect(second.result.current.state.mode).toBe("capital-to-click");
  });

  it("is not overwritten by an expedition's forced Name → Click", () => {
    const first = renderHook(() => useGame());
    act(() => first.result.current.setMode("country-to-capital"));
    act(() => first.result.current.startExpedition());
    expect(first.result.current.state.mode).toBe("name-to-click");
    first.unmount();

    const second = renderHook(() => useGame());
    expect(second.result.current.state.mode).toBe("country-to-capital");
  });

  it("is left alone by Erase all progress, like any other preference", () => {
    const first = renderHook(() => useGame());
    act(() => first.result.current.setMode("shape-to-name"));
    act(() => first.result.current.resetSrs());
    first.unmount();

    const second = renderHook(() => useGame());
    expect(second.result.current.state.mode).toBe("shape-to-name");
  });
});

describe("useGame — erasing all progress", () => {
  it("removes both SRS keys, so v1 is not migrated back", () => {
    window.localStorage.setItem(
      "atlasaur:srs:v1",
      JSON.stringify({ version: 1, records: { FRA: { state: 2 } } }),
    );
    const { result } = renderHook(() => useGame());
    act(() => result.current.resetSrs());
    expect(window.localStorage.getItem("atlasaur:srs:v1")).toBeNull();

    // The save effect writes an empty v2 back; what matters is that nothing
    // is resurrected from v1 on the next load.
    const second = renderHook(() => useGame());
    expect(second.result.current.state.srsStore.facts.location).toEqual({});
  });
});

describe("useGame — switching question mode", () => {
  it("counts the answer still on screen against the mode it was given in", () => {
    // It cannot be counted through cardsAnswered: the counters effect reads
    // the mode through a ref, which already holds the new one by then.
    const { result } = renderHook(() => useGame());
    expect(result.current.state.mode).toBe("name-to-click");
    const shown = result.current.state.current.iso3;
    act(() => result.current.answer(shown === "FRA" ? "DEU" : "FRA"));
    expect(result.current.state.feedback).not.toBeNull();

    act(() => result.current.setMode("shape-to-name"));
    expect(loadCounters().answersByQuestionMode["name-to-click"]).toBe(1);
    expect(loadCounters().answersByQuestionMode["shape-to-name"]).toBe(0);
  });

  it("records nothing when the switch is a no-op", () => {
    const { result } = renderHook(() => useGame());
    const shown = result.current.state.current.iso3;
    act(() => result.current.answer(shown === "FRA" ? "DEU" : "FRA"));
    act(() => result.current.setMode("name-to-click"));
    expect(loadCounters().answersByQuestionMode["name-to-click"]).toBe(0);
  });
});
