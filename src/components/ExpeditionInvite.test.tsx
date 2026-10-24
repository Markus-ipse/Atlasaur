// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExpeditionInvite } from "./ExpeditionInvite";
import type { ExpeditionStatus } from "../game/expedition";

afterEach(cleanup);

const TODAY = "2026-10-24";

function renderInvite(
  over: Partial<{
    linkDay: string;
    status: ExpeditionStatus;
    newcomer: boolean;
  }> = {},
) {
  const onBegin = vi.fn();
  const onElsewhere = vi.fn();
  render(
    <ExpeditionInvite
      linkDay={over.linkDay ?? TODAY}
      today={TODAY}
      status={over.status ?? { kind: "fresh" }}
      newcomer={over.newcomer ?? false}
      onBegin={onBegin}
      onElsewhere={onElsewhere}
    />,
  );
  return { onBegin, onElsewhere };
}

describe("ExpeditionInvite", () => {
  it("asks for an explicit Begin, focused, and says nothing of the ten", () => {
    const { onBegin } = renderInvite();
    const begin = screen.getByRole("button", { name: "Begin today's ten" });
    expect(document.activeElement).toBe(begin);
    expect(screen.getByRole("dialog").textContent).toContain(
      "The same ten for everyone today, and one go each.",
    );
    fireEvent.click(begin);
    expect(onBegin).toHaveBeenCalledTimes(1);
  });

  it("introduces the app to a newcomer and offers ordinary learning", () => {
    const { onElsewhere } = renderInvite({ newcomer: true });
    expect(screen.getByText("Atlasaur")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain(
      "Atlasaur is a world map you learn by heart.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Just learn the map" }));
    expect(onElsewhere).toHaveBeenCalledTimes(1);
  });

  it("lets a returning learner say not now, by button or Escape, never by the backdrop", () => {
    const { onElsewhere, onBegin } = renderInvite();
    expect(screen.queryByText("Atlasaur")).toBeNull();
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onElsewhere).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onElsewhere).toHaveBeenCalledTimes(2);
    expect(onBegin).not.toHaveBeenCalled();
  });

  it("resumes an attempt in progress and opens a finished one's result", () => {
    renderInvite({ status: { kind: "in-progress", answered: 4, found: 3 } });
    expect(screen.getByRole("heading").textContent).toBe(
      "You're 4 of 10 into today's.",
    );
    expect(
      screen.getByRole("button", { name: "Resume today's expedition" }),
    ).toBeTruthy();
    cleanup();
    renderInvite({ status: { kind: "finished", found: 7 } });
    expect(screen.getByRole("heading").textContent).toBe(
      "You've done today's: 7 of 10 found.",
    );
    expect(
      screen.getByRole("button", { name: "See your result" }),
    ).toBeTruthy();
  });

  it("says when the link was for another day, and that scores won't compare", () => {
    renderInvite();
    expect(document.getElementById("invite-notice")).toBeNull();
    cleanup();
    renderInvite({ linkDay: "2026-10-23" });
    const old = document.getElementById("invite-notice")!;
    expect(old.textContent).toBe(
      "That link was for 23 October 2026. Every day has its own ten, so today's won't compare with the result you were sent.",
    );
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBe(
      "invite-notice invite-line",
    );
    cleanup();
    // Sent from a time zone already in tomorrow.
    renderInvite({ linkDay: "2026-10-25" });
    expect(document.getElementById("invite-notice")!.textContent).toBe(
      "That link is for 25 October 2026, which hasn't begun where you are. Today's ten are different, so your score won't compare with the one you were sent.",
    );
  });
});
