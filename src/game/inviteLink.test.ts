// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  inviteDayFrom,
  resetInviteForTests,
  takeInviteDay,
} from "./inviteLink";

const TODAY = "2026-10-24";

afterEach(() => {
  resetInviteForTests();
  window.history.replaceState(null, "", "/");
});

describe("inviteDayFrom", () => {
  it("is null for a page not opened from a link", () => {
    expect(inviteDayFrom("", TODAY)).toBeNull();
    expect(inviteDayFrom("?utm_source=x", TODAY)).toBeNull();
  });

  it("reads the day a link names, today's or not", () => {
    expect(inviteDayFrom("?expedition=2026-10-24", TODAY)).toBe("2026-10-24");
    expect(inviteDayFrom("?expedition=2026-10-01", TODAY)).toBe("2026-10-01");
    expect(inviteDayFrom("?expedition=2026-10-25", TODAY)).toBe("2026-10-25");
  });

  it("opens on today's when the day cannot be read", () => {
    // The link still asked for the expedition.
    expect(inviteDayFrom("?expedition=", TODAY)).toBe(TODAY);
    expect(inviteDayFrom("?expedition=yesterday", TODAY)).toBe(TODAY);
  });
});

describe("takeInviteDay", () => {
  it("takes the link out of the address bar and keeps the rest", () => {
    window.history.replaceState(
      null,
      "",
      "/Atlasaur/?expedition=2026-10-01&x=1#h",
    );
    expect(takeInviteDay(TODAY)).toBe("2026-10-01");
    expect(window.location.pathname).toBe("/Atlasaur/");
    expect(window.location.search).toBe("?x=1");
    expect(window.location.hash).toBe("#h");
  });

  it("answers the same twice in one load, after the address is clean", () => {
    // A state initialiser runs twice under StrictMode.
    window.history.replaceState(null, "", "/?expedition=2026-10-01");
    expect(takeInviteDay(TODAY)).toBe("2026-10-01");
    expect(window.location.search).toBe("");
    expect(takeInviteDay(TODAY)).toBe("2026-10-01");
  });

  it("leaves an address without a link alone", () => {
    window.history.replaceState(null, "", "/?x=1");
    expect(takeInviteDay(TODAY)).toBeNull();
    expect(window.location.search).toBe("?x=1");
  });
});
