// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsMenu } from "./SettingsMenu";
import { emptyCounters } from "../game/counters";
import { ALL_CONTINENTS, type Continent, type QuestionMode } from "../types";

// R3.2 gave the picker four options in two rows, and made the capital pair
// conditional on there being a capital in scope.

afterEach(cleanup);

function open(overrides: {
  mode?: QuestionMode;
  selectedContinents?: readonly Continent[];
  includeTerritories?: boolean;
  onSetMode?: (mode: QuestionMode) => void;
  modeLocked?: boolean;
}) {
  render(
    <SettingsMenu
      mode={overrides.mode ?? "name-to-click"}
      fact={
        overrides.mode === "capital-to-click" ||
        overrides.mode === "country-to-capital"
          ? "capital"
          : "location"
      }
      onSetMode={overrides.onSetMode ?? (() => {})}
      modeLocked={overrides.modeLocked}
      selectedContinents={overrides.selectedContinents ?? ALL_CONTINENTS}
      onSetContinents={() => {}}
      includeTerritories={overrides.includeTerritories ?? false}
      onSetIncludeTerritories={() => {}}
      dueCount={0}
      newAvailableCount={0}
      learnedCount={0}
      seenCount={0}
      totalReviews={0}
      lifetimeAccuracy={null}
      counters={emptyCounters()}
      returns={{ daysPlayed: 0, longestGap: null, capped: false }}
      onResetSrs={() => {}}
      themePref="system"
      onSetThemePref={() => {}}
    />,
  );
  fireEvent.click(screen.getByLabelText("Settings"));
}

function option(label: string): HTMLButtonElement {
  return screen.getByRole("radio", { name: label }) as HTMLButtonElement;
}

describe("SettingsMenu — the question picker", () => {
  it("offers all four questions, in two labelled rows", () => {
    open({});
    expect(screen.getByText("Countries")).toBeDefined();
    expect(screen.getByText("Capitals")).toBeDefined();
    for (const label of [
      "Name → Click",
      "Shape → Name",
      "Capital → Click",
      "Country → Capital",
    ]) {
      expect(option(label)).toBeDefined();
    }
  });

  it("marks the active question and picks a new one", () => {
    const onSetMode = vi.fn();
    open({ mode: "country-to-capital", onSetMode });
    expect(option("Country → Capital").getAttribute("aria-checked")).toBe("true");
    expect(option("Name → Click").getAttribute("aria-checked")).toBe("false");

    fireEvent.click(option("Capital → Click"));
    expect(onSetMode).toHaveBeenCalledWith("capital-to-click");
  });

  it("disables the capital pair when nothing in scope has a capital", () => {
    // Antarctica's two rows have none, so a capital mode would have nothing
    // to ask. The selection is never rewritten to make room for one.
    open({ selectedContinents: ["Antarctica"], includeTerritories: true });
    expect(option("Capital → Click").disabled).toBe(true);
    expect(option("Country → Capital").disabled).toBe(true);
    expect(option("Name → Click").disabled).toBe(false);
    expect(screen.getByText("Nothing in this scope has a capital.")).toBeDefined();
  });

  it("enables them again as soon as one continent can be asked", () => {
    open({ selectedContinents: ["Antarctica", "Europe"], includeTerritories: true });
    expect(option("Capital → Click").disabled).toBe(false);
    expect(screen.queryByText("Nothing in this scope has a capital.")).toBeNull();
  });

  it("locks every option during an expedition", () => {
    open({ modeLocked: true });
    for (const label of [
      "Name → Click",
      "Shape → Name",
      "Capital → Click",
      "Country → Capital",
    ]) {
      expect(option(label).disabled).toBe(true);
    }
    expect(screen.getByText("An expedition is always Name → Click.")).toBeDefined();
  });
});

describe("SettingsMenu — continent chips", () => {
  it("hides a continent with nothing askable under the current fact", () => {
    // Antarctica is hidden with territories off because it holds only
    // territories, and in a capital mode because its rows have no capital.
    open({ includeTerritories: true });
    expect(screen.getByRole("checkbox", { name: "Antarctica" })).toBeDefined();

    cleanup();
    open({ mode: "country-to-capital", includeTerritories: true });
    expect(screen.queryByRole("checkbox", { name: "Antarctica" })).toBeNull();
  });
});

describe("SettingsMenu — the stats say which fact they count", () => {
  it("names places or capitals above the scoped figures", () => {
    open({});
    expect(screen.getByText("Places")).toBeDefined();
    expect(screen.getByText("All time")).toBeDefined();
    expect(screen.queryByText("Capitals", { selector: "p.italic" })).toBeNull();

    cleanup();
    open({ mode: "country-to-capital" });
    // "Capitals" is also the picker's row label, so pin the caption itself.
    expect(screen.getByText("Capitals", { selector: "p.italic" })).toBeDefined();
    expect(screen.queryByText("Places")).toBeNull();
  });
});
