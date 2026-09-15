// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SessionSummary } from "./SessionSummary";
import { emptyStore } from "../game/srs";
import countriesJson from "../data/countries.json";
import type { Country, Fact, SrsRecord, Subregion } from "../types";

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

function renderStudy(
  fact: Fact,
  sitting = { cards: 0, right: 0, fresh: 0 },
  figures: {
    dueCount?: number;
    newAvailableCount?: number;
    nextBack?: string | null;
    caughtUp?: boolean;
    spotlightSubregion?: Subregion | null;
    scope?: ReadonlySet<string>;
    recovered?: number;
    progressSaved?: boolean;
    missQueued?: boolean;
    noRecords?: boolean;
  } = {},
  handlers: { onKeepStudying?: () => void } = {},
) {
  const store = emptyStore();
  if (!figures.noRecords) {
    // In scope, known, answered right three times.
    store.facts.location.FRA = record(2, 3, 0);
    // Out of scope and another fact: in the lifetime totals, not the scoped four.
    store.facts.capital.JPN = record(1, 0, 1);
  }
  render(
    <SessionSummary
      practiceMode="study"
      score={0}
      total={0}
      missed={[]}
      unlearnedCount={0}
      completedCount={0}
      totalInScope={2}
      dueCount={figures.dueCount ?? 0}
      nextBack={figures.nextBack ?? null}
      caughtUp={figures.caughtUp ?? false}
      spotlightSubregion={figures.spotlightSubregion ?? null}
      newAvailableCount={figures.newAvailableCount ?? 1}
      srsStore={store}
      sittingCards={sitting.cards}
      sittingRight={sitting.right}
      sittingNew={sitting.fresh}
      sittingRecovered={figures.recovered ?? 0}
      missQueued={figures.missQueued ?? false}
      progressSaved={figures.progressSaved ?? false}
      fact={fact}
      scopeIso3s={figures.scope ?? new Set(["FRA", "DEU"])}
      countries={COUNTRIES}
      onReview={vi.fn()}
      onPlayAgain={vi.fn()}
      onStartTest={vi.fn()}
      onBackToStudy={vi.fn()}
      onKeepStudying={handlers.onKeepStudying ?? vi.fn()}
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

describe("StudySummary sitting line", () => {
  it("reports the sitting that just ended", () => {
    renderStudy("location", { cards: 14, right: 11, fresh: 3 });
    expect(
      screen.getByText("This sitting: 11 of 14 right · 3 newly seen"),
    ).toBeTruthy();
  });

  it("leaves out newly seen when nothing was new", () => {
    renderStudy("location", { cards: 5, right: 5, fresh: 0 });
    expect(screen.getByText("This sitting: 5 of 5 right")).toBeTruthy();
  });

  it("omits the line when nothing was answered", () => {
    renderStudy("location");
    expect(screen.queryByText(/This sitting/)).toBeNull();
  });
});

describe("StudySummary rest", () => {
  const NONE = { cards: 0, right: 0, fresh: 0 };

  it("acknowledges the finish rather than grading it", () => {
    renderStudy("location", { cards: 4, right: 1, fresh: 2 });
    expect(screen.getByRole("heading", { name: "That's it for now." })).toBeTruthy();
    expect(screen.queryByText("Nice work")).toBeNull();
  });

  it("stays at rest on Escape and a backdrop click", () => {
    const onKeepStudying = vi.fn();
    renderStudy("location", NONE, {}, { onKeepStudying });
    fireEvent.keyDown(document, { key: "Escape" });
    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.click(backdrop);
    expect(onKeepStudying).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Keep going/ }));
    expect(onKeepStudying).toHaveBeenCalledTimes(1);
  });

  it("names the misses put right later in the sitting", () => {
    renderStudy("location", { cards: 6, right: 4, fresh: 2 }, { recovered: 2 });
    expect(screen.getByText("You got 2 right that you'd missed earlier.")).toBeTruthy();
    cleanup();
    renderStudy("location", { cards: 6, right: 4, fresh: 2 }, { recovered: 1 });
    expect(screen.getByText("You got 1 right that you'd missed earlier.")).toBeTruthy();
    cleanup();
    renderStudy("location", { cards: 6, right: 4, fresh: 2 });
    expect(screen.queryByText(/missed earlier/)).toBeNull();
  });

  it("leads with the recovery, then the sitting's tally", () => {
    renderStudy("location", { cards: 6, right: 4, fresh: 2 }, { recovered: 2 });
    const lines = [
      ...document.querySelectorAll("#study-summary-sitting p"),
    ].map((p) => p.textContent);
    expect(lines[0]).toMatch(/missed earlier/);
    expect(lines[1]).toMatch(/^This sitting/);
  });

  it("says progress is saved only when this browser can save it", () => {
    renderStudy("location", NONE, { progressSaved: true });
    expect(screen.getByText("Kept in this browser — no account needed.")).toBeTruthy();
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBe(
      "study-summary-sitting",
    );
    cleanup();
    renderStudy("location", NONE, { progressSaved: false });
    expect(screen.queryByText(/Kept in this browser/)).toBeNull();
  });

  it("says nothing of 'anyway' while a missed card is queued to come back", () => {
    renderStudy("location", NONE, {
      dueCount: 0,
      newAvailableCount: 0,
      caughtUp: true,
      missQueued: true,
    });
    expect(screen.queryByRole("button", { name: /Keep going anyway/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Keep going/ })).toBeTruthy();
  });

  it("keeps quiet about saving before anything has been kept", () => {
    renderStudy("location", NONE, { progressSaved: true, noRecords: true });
    expect(screen.queryByText(/Kept in this browser/)).toBeNull();
  });

  it("tucks the figures and the other doors under a disclosure that names them", () => {
    renderStudy("location", NONE, {
      scope: new Set(COUNTRIES.map((c) => c.iso3)),
    });
    const more = screen.getByText("Figures, focus and tests").closest("details")!;
    expect(more.open).toBe(false);
    expect(within(more).getByRole("region", { name: "Places" })).toBeTruthy();
    expect(within(more).getByRole("region", { name: "All time" })).toBeTruthy();
    expect(within(more).getByRole("button", { name: /^Focus on/ })).toBeTruthy();
    expect(within(more).getByRole("button", { name: /Test me on these/ })).toBeTruthy();
    expect(within(more).queryByRole("button", { name: /^Keep going/ })).toBeNull();
  });
});

describe("StudySummary doors", () => {
  const NONE = { cards: 0, right: 0, fresh: 0 };

  it("runs the tiles unseen first, known after", () => {
    renderStudy("location");
    const places = screen.getByRole("region", { name: "Places" });
    expect(places.textContent).toMatch(
      /Not yet seen\d+Seen\d+Known\d+Coming back\d+/,
    );
    expect(screen.queryByText("To review")).toBeNull();
  });

  it("puts the reasons on the doors, not in a hint above them", () => {
    renderStudy("location", { cards: 3, right: 2, fresh: 1 });
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBe(
      "study-summary-sitting",
    );
    expect(document.getElementById("study-summary-hint")).toBeNull();
  });

  it("describes the dialog by nothing rather than a line that isn't there", () => {
    renderStudy("location");
    expect(screen.getByRole("dialog").hasAttribute("aria-describedby")).toBe(false);
  });

  it("focuses the dialog, not a door, so Enter starts nothing", () => {
    renderStudy("location");
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("promises no order during a focus, whose picks are the region's", () => {
    renderStudy("location", NONE, {
      dueCount: 5,
      spotlightSubregion: "Western Africa",
    });
    expect(
      screen.getByRole("button", {
        name: /^Keep going.*Still focusing on Western Africa/,
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/coming back first/)).toBeNull();
  });

  it("says what has come back goes first", () => {
    renderStudy("location", NONE, { dueCount: 3 });
    expect(
      screen.getByRole("button", { name: /^Keep going.*3 coming back first/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Keep going anyway/ })).toBeNull();
  });

  it("says new places are next when nothing has come back", () => {
    renderStudy("location", NONE, { dueCount: 0, newAvailableCount: 1 });
    expect(
      screen.getByRole("button", { name: /^Keep going.*New countries next/ }),
    ).toBeTruthy();
  });

  it("goes on anyway once this stretch's new cards are used up", () => {
    // Closing the summary does not refill the cap, so new countries remaining
    // in scope are not what Keep going brings.
    renderStudy("location", NONE, {
      dueCount: 0,
      newAvailableCount: 5,
      caughtUp: true,
      nextBack: "More come back later today",
    });
    expect(
      screen.getByRole("button", {
        name: /Keep going anyway.*No more new ones for now · More come back later today/,
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /New countries next/ })).toBeNull();
  });

  it("goes on anyway, and says when, with nothing waiting", () => {
    renderStudy("location", NONE, {
      dueCount: 0,
      newAvailableCount: 0,
      nextBack: "The next ones come back tomorrow",
    });
    expect(
      screen.getByRole("button", { name: /Keep going anyway.*tomorrow/ }),
    ).toBeTruthy();
  });

  it("gives the focus door its count", () => {
    renderStudy("location", NONE, {
      scope: new Set(COUNTRIES.map((c) => c.iso3)),
    });
    expect(
      screen.getByRole("button", {
        name: /^Focus on .*\d+ waiting there — just that region for now/,
      }),
    ).toBeTruthy();
  });
});
