import { dayKey, daysBetween } from "./streak";

// One line saying when the next country comes back, shared by every surface
// that says it so they keep one voice. No final stop: a sub-line takes it as
// is and a sentence appends its own. Under an hour it says "a few minutes"
// (a learning step is ten), which also covers a card already back that the
// hourly-refreshed count has not caught up with. Beyond that it counts
// calendar days, not 24-hour spans, so 23:30 → 01:30 reads "tomorrow". Null
// when nothing is scheduled.
export function nextBackLine(next: Date | null, now: Date): string | null {
  if (next === null) return null;
  if (next.getTime() - now.getTime() < 3_600_000) {
    return "More come back in a few minutes";
  }
  const d = daysBetween(dayKey(now), dayKey(next));
  if (d <= 0) return "More come back later today";
  if (d === 1) return "The next ones come back tomorrow";
  return `The next ones come back in ${d} days`;
}

// The line for a surface that always says something: where nothing is
// scheduled at all, which in practice is a learner who has not met a country
// yet. CaughtUp alone reads the null, to fall back to "Come back later".
export function nextBackOrNothing(line: string | null): string {
  return line ?? "Nothing has been met yet";
}

// Why unseen countries are not next: the stretch's new cards are used up.
export const NO_MORE_NEW = "No more new ones for now";
