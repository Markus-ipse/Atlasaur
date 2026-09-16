// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExpeditionResult } from "./ExpeditionResult";
import { shareText, type ExpeditionStore } from "../game/expedition";

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

function renderCard(
  onClose = vi.fn(),
  {
    store = STORE,
    onReview = vi.fn(),
    lookDone = false,
  }: { store?: ExpeditionStore; onReview?: () => void; lookDone?: boolean } = {},
) {
  render(
    <ExpeditionResult
      store={store}
      streakDay={3}
      nameFromIso3={(iso3) => NAMES[iso3] ?? iso3}
      onReview={onReview}
      lookDone={lookDone}
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
    // Leads with the count, then the acknowledgement (#64).
    expect(screen.getByRole("heading", { name: "8 of 10 found." })).toBeTruthy();
    expect(screen.getByText("A good day out.")).toBeTruthy();
  });

  it("says what the squares mean", () => {
    renderCard();
    expect(screen.getByText("■ found · □ missed")).toBeTruthy();
  });

  it("offers the misses as the next step, with Share secondary (#64)", () => {
    const onReview = vi.fn();
    renderCard(vi.fn(), { onReview });
    const review = screen.getByRole("button", { name: "Review 2 missed" });
    expect(document.activeElement).toBe(review);
    expect(screen.getByText(/Today's result stays as it is\./)).toBeTruthy();
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Review 2 missed", "Share", "Back to studying"]);
    fireEvent.click(review);
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("with all ten found, offers no review and defaults to Back to studying", () => {
    const store: ExpeditionStore = {
      ...STORE,
      outcomes: STORE.outcomes.map(() => "found"),
    };
    renderCard(vi.fn(), { store });
    expect(screen.getByRole("heading", { name: "All 10 found." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Review/ })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Back to studying" }),
    );
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Back to studying", "Share"]);
  });

  it("after a finished look, says so and defaults to Back to studying", () => {
    const onReview = vi.fn();
    renderCard(vi.fn(), { onReview, lookDone: true });
    expect(
      screen.getByText("A good day out. Found again on a second look."),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Back to studying" }),
    );
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Back to studying", "Share", "Review 2 missed"]);
    expect(screen.queryByText(/Today's result stays as it is/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review 2 missed" }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("keeps the spoken row out of the selectable text", () => {
    // Selecting the box by hand must yield what Share sends, nothing more.
    renderCard();
    const line = document.getElementById("expedition-result-line")!;
    expect(line.textContent).toBe(shareText(STORE));
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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Shared" })).toBeTruthy(),
    );
    expect(screen.getByRole("status").textContent).toBe("Shared");
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

  it("falls back to the clipboard when the share sheet fails", async () => {
    const share = vi.fn().mockRejectedValue(new Error("not allowed"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy(),
    );
  });

  it("treats a dismissed share sheet as a change of mind", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
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

  it("closes on Back to studying, and stays at rest on Escape and the backdrop", () => {
    const onClose = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Back to studying" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
