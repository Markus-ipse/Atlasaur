// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { SessionSummary } from "./SessionSummary";
import { emptyStore } from "../game/srs";
import countriesJson from "../data/countries.json";
import type { Country, Fact, SrsRecord } from "../types";

const COUNTRIES = countriesJson as Country[];

function record(state: SrsRecord["state"], hits: number, misses: number): SrsRecord {
  return {
    due: "2026-09-20T00:00:00.000Z",
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    learning_steps: 0,
    reps: hits + misses,
    lapses: 0,
    state,
    hits,
    misses,
  };
}

afterEach(cleanup);

function renderStudy(fact: Fact) {
  const store = emptyStore();
  // In scope, known, answered right three times.
  store.facts.location.FRA = record(2, 3, 0);
  // Out of scope and another fact: in the lifetime totals, not the scoped four.
  store.facts.capital.JPN = record(1, 0, 1);
  render(
    <SessionSummary
      practiceMode="study"
      score={0}
      total={0}
      missed={[]}
      unlearnedCount={0}
      completedCount={0}
      totalInScope={2}
      dueCount={0}
      newAvailableCount={1}
      srsStore={store}
      fact={fact}
      scopeIso3s={new Set(["FRA", "DEU"])}
      countries={COUNTRIES}
      onReview={vi.fn()}
      onPlayAgain={vi.fn()}
      onStartTest={vi.fn()}
      onBackToStudy={vi.fn()}
      onKeepStudying={vi.fn()}
      onSetSpotlight={vi.fn()}
      expedition={{ kind: "fresh" }}
      onExpedition={vi.fn()}
    />,
  );
}

function tile(group: HTMLElement, label: string): string | null {
  return within(group).getByText(label).nextElementSibling?.textContent ?? null;
}

describe("StudySummary figures", () => {
  it("heads the scoped four with the fact and the lifetime two separately", () => {
    renderStudy("location");
    const places = screen.getByRole("region", { name: "Places" });
    const lifetime = screen.getByRole("region", { name: "All time" });

    expect(tile(places, "Known")).toBe("1");
    expect(tile(places, "Seen")).toBe("1");
    expect(within(places).queryByText("Answers")).toBeNull();

    // Four answers across both facts and outside the scope, three right.
    expect(tile(lifetime, "Answers")).toBe("4");
    expect(tile(lifetime, "Right")).toBe("75%");
    expect(within(lifetime).queryByText("Known")).toBeNull();
  });

  it("names the capital fact on the scoped group only", () => {
    renderStudy("capital");
    const capitals = screen.getByRole("region", { name: "Capitals" });
    expect(tile(capitals, "Known")).toBe("0");
    expect(tile(capitals, "Seen")).toBe("0");
    expect(tile(screen.getByRole("region", { name: "All time" }), "Answers")).toBe("4");
  });
});
