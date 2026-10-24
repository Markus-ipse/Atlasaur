import { EXPEDITION_LINK_PARAM } from "./expedition";
import { isDayKey } from "./streak";

// The day a shared expedition link names (#57), read from the app's own
// query string: `?expedition=YYYY-MM-DD`, which the expedition page forwards
// to. Null when the page was not opened from a link. A link whose day cannot
// be read still asked for the expedition, so it opens on today's.
export function inviteDayFrom(search: string, today: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.has(EXPEDITION_LINK_PARAM)) return null;
  const day = params.get(EXPEDITION_LINK_PARAM);
  return isDayKey(day) ? day : today;
}

let taken: { day: string | null } | null = null;

// Reads the link once per page load and takes it out of the address bar, so
// a reload, a bookmark or the installed app opens on the app rather than on
// the invitation again. Kept for the life of the page: a state initialiser
// that runs twice (StrictMode) must see the same answer the second time,
// after the address has already been cleaned.
export function takeInviteDay(today: string): string | null {
  if (taken) return taken.day;
  let day: string | null = null;
  try {
    day = inviteDayFrom(window.location.search, today);
    if (day !== null) {
      const url = new URL(window.location.href);
      url.searchParams.delete(EXPEDITION_LINK_PARAM);
      window.history.replaceState(window.history.state, "", url);
    }
  } catch {
    // No window or no history (a test, a sandbox): the link is simply read.
  }
  taken = { day };
  return day;
}

// For tests: forget what this page load has read.
export function resetInviteForTests(): void {
  taken = null;
}
