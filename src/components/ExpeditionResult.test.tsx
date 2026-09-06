// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExpeditionResult } from "./ExpeditionResult";
import type { ExpeditionStore } from "../game/expedition";

const NAMES: Record<string, string> = {
  FRA: "France",
  BRA: "Brazil",
  JPN: "Japan",
  EGY: "Egypt",
  AUS: "Australia",
  CAN: "Canada",
  IND: "India",
  ARG: "Argentina",
  NGA: "Nigeria",
  DEU: "Germany",
};

const STORE: ExpeditionStore = {
  version: 1,
  day: "2026-09-06",
  iso3s: Object.keys(NAMES),
  outcomes: [
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
  ],
};

function renderCard(onClose = vi.fn()) {
  render(
    <ExpeditionResult
      store={STORE}
      streakDay={3}
      nameFromIso3={(iso3) => NAMES[iso3] ?? iso3}
      onClose={onClose}
    />,
  );
  return onClose;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("ExpeditionResult", () => {
  it("shows the row, the caption and the ten by name", () => {
    renderCard();
    expect(screen.getByText("■■□■■■□■■■")).toBeTruthy();
    expect(screen.getByText("Japan")).toBeTruthy();
    // The spoken row names each of the ten with its outcome.
    expect(
      document.getElementById("expedition-result-outcomes")?.textContent,
    ).toContain("Japan missed");
    expect(screen.getByRole("heading", { name: "A good day out." })).toBeTruthy();
  });

  it("keeps the spoken row out of the selectable text", () => {
    // Selecting the box by hand must yield what Share sends, nothing more.
    renderCard();
    const line = document.getElementById("expedition-result-line")!;
    expect(line.textContent).toBe("Atlasaur · 6 September 2026\n■■□■■■□■■■ 8/10");
  });

  it("hands the text to the share sheet where there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({
      text: "Atlasaur · 6 September 2026\n■■□■■■□■■■ 8/10",
    });
  });

  it("copies to the clipboard otherwise and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(
      "Atlasaur · 6 September 2026\n■■□■■■□■■■ 8/10",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy(),
    );
  });

  it("points at the selectable text when neither works", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
  });

  it("closes on Escape and on Back to studying", () => {
    const onClose = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Back to studying" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
