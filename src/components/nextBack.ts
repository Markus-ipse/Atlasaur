import { dayKey, daysBetween } from "../game/streak";

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

// Said where a next-back line would go and nothing is scheduled at all,
// which in practice is a learner who has not met a country yet.
export const NOTHING_BACK_YET = "Nothing has been met yet";
