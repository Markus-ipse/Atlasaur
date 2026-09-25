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
  onSetContinents?: (continents: readonly Continent[]) => void;
  totalInScope?: number;
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
      totalInScope={overrides.totalInScope ?? 199}
      onSetContinents={overrides.onSetContinents ?? (() => {})}
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
      "Countries, on the map",
      "Countries, by typing",
      "Capitals, on the map",
      "Capitals, by typing",
    ]) {
      expect(option(label)).toBeDefined();
    }
  });

  it("names the answer, not the mechanism, with every example in view", () => {
    open({ mode: "capital-to-click" });
    expect(screen.getAllByText("On the map")).toHaveLength(2);
    expect(screen.getAllByText("By typing")).toHaveLength(2);
    expect(screen.queryByText(/→/)).toBeNull();
    // Readable before choosing, on touch too: printed, not a tooltip.
    for (const example of [
      "Find Peru",
      "Name the country shown",
      "Given Lima, find Peru",
      "Given Peru, type Lima",
    ]) {
      expect(screen.getByText(example)).toBeDefined();
    }
    expect(option("Capitals, on the map").getAttribute("aria-describedby")).toBe(
      "settings-example-capital-to-click",
    );
  });

  it("describes a disabled option by its example and the reason", () => {
    open({ selectedContinents: ["Antarctica"], includeTerritories: true });
    expect(option("Capitals, by typing").getAttribute("aria-describedby")).toBe(
      "settings-example-country-to-capital settings-question-note",
    );
  });

  it("says what the chosen scope holds", () => {
    open({ selectedContinents: ["South America"], totalInScope: 12 });
    expect(screen.getByText("South America · 12 countries")).toBeDefined();
  });

  it("marks the active question and picks a new one", () => {
    const onSetMode = vi.fn();
    open({ mode: "country-to-capital", onSetMode });
    expect(option("Capitals, by typing").getAttribute("aria-checked")).toBe("true");
    expect(option("Countries, on the map").getAttribute("aria-checked")).toBe("false");

    fireEvent.click(option("Capitals, on the map"));
    expect(onSetMode).toHaveBeenCalledWith("capital-to-click");
  });

  it("disables the capital pair when nothing in scope has a capital", () => {
    // Antarctica's two rows have none, so a capital mode would have nothing
    // to ask. The selection is never rewritten to make room for one.
    open({ selectedContinents: ["Antarctica"], includeTerritories: true });
    expect(option("Capitals, on the map").disabled).toBe(true);
    expect(option("Capitals, by typing").disabled).toBe(true);
    expect(option("Countries, on the map").disabled).toBe(false);
    expect(screen.getByText("Nothing in this scope has a capital.")).toBeDefined();
  });

  it("enables them again as soon as one continent can be asked", () => {
    open({ selectedContinents: ["Antarctica", "Europe"], includeTerritories: true });
    expect(option("Capitals, on the map").disabled).toBe(false);
    expect(screen.queryByText("Nothing in this scope has a capital.")).toBeNull();
  });

  it("locks every option during an expedition", () => {
    open({ modeLocked: true });
    for (const label of [
      "Countries, on the map",
      "Countries, by typing",
      "Capitals, on the map",
      "Capitals, by typing",
    ]) {
      expect(option(label).disabled).toBe(true);
    }
    expect(
      screen.getByText("An expedition always asks you to find countries on the map, anywhere in the world."),
    ).toBeDefined();
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

describe("SettingsMenu — editing the selection", () => {
  it("drops a hidden continent when a visible chip is edited", () => {
    // South America picked alone from the world while territories were off
    // left Antarctica selected out of sight; turning territories on then
    // asked about it.
    const onSetContinents = vi.fn();
    open({
      selectedContinents: ["South America", "Europe", "Antarctica"],
      onSetContinents,
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Europe" }));
    expect(onSetContinents).toHaveBeenCalledWith(["South America"]);
  });

  it("keeps a visible Antarctica when another chip is edited", () => {
    const onSetContinents = vi.fn();
    open({
      selectedContinents: ["South America", "Europe", "Antarctica"],
      includeTerritories: true,
      onSetContinents,
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Europe" }));
    expect(onSetContinents).toHaveBeenCalledWith(["Antarctica", "South America"]);
  });
});

describe("SettingsMenu — the popup", () => {
  const innerWidth = window.innerWidth;
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", { value: innerWidth, configurable: true });
  });

  function gearAt(left: number, viewport: number) {
    Object.defineProperty(window, "innerWidth", { value: viewport, configurable: true });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left,
      right: left + 44,
      top: 60,
      bottom: 104,
      width: 44,
      height: 44,
      x: left,
      y: 60,
      toJSON: () => ({}),
    });
  }

  it("has an accessible name", () => {
    open({});
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeDefined();
  });

  it("stays inside a narrow viewport when the gear wraps to the left", () => {
    // 320px phone, header wrapped: the gear sits at the left of a second line.
    gearAt(16, 320);
    open({});
    const popup = screen.getByRole("dialog", { name: "Settings" });
    expect(popup.style.width).toBe("288px");
    // left edge = 320 - 24 - 288 = 8
    expect(popup.style.right).toBe("24px");
  });

  it("spans the viewport less its gutters where the popup cannot fit", () => {
    gearAt(200, 280);
    open({});
    const popup = screen.getByRole("dialog", { name: "Settings" });
    expect(popup.style.width).toBe("264px");
    expect(popup.style.right).toBe("8px");
  });

  it("still anchors to the gear's right edge where there is room", () => {
    gearAt(1200, 1280);
    open({});
    const popup = screen.getByRole("dialog", { name: "Settings" });
    expect(popup.style.right).toBe("36px");
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
