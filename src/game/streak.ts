// Cross-day streak: the days on which the learner finished at least one
// round. Stored as local calendar dates (YYYY-MM-DD in the device's zone),
// so a round finished at 23:50 and one at 00:10 land on different days the
// way the learner experiences them. Forgiving by design: one missed day per
// rolling week is bridged, and today never counts against you until it is
// over. Copy that reads this must never scold — a broken streak is a gap,
// and the card says "welcome back".

const STREAK_STORAGE_KEY = "atlasaur:streak:v1";
const STORE_VERSION = 1;
// Enough history to compute any plausible streak; older days are dropped.
// Exported so a caller reporting a lifetime figure can tell when the history
// it is reading has been trimmed and say so rather than understate.
export const MAX_DAYS = 400;
// A missed day is bridged when no other bridge was used in the 7 days
// before it (looking backward from the more recent gap).
const FORGIVE_WINDOW_DAYS = 7;

export type StreakStore = { version: 1; days: string[] };

export type StreakInfo = {
  // Consecutive played days, with forgiven gaps, counted backward from
  // today (or from yesterday when today is not yet played).
  length: number;
  // A round was finished today.
  todayPlayed: boolean;
  // The day number the learner is on: the streak length if today is already
  // in it, otherwise the day they are about to make. Never 0.
  day: number;
};

export function emptyStreak(): StreakStore {
  return { version: STORE_VERSION, days: [] };
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

// The one definition of a stored day. Every store that keeps calendar days
// (streak, counters, expedition) validates against this and compares its
// days to `dayKey(now)`, so they can never disagree about what a day is.
export function isDayKey(value: unknown): value is string {
  return typeof value === "string" && DAY_KEY.test(value);
}

export function loadStreak(): StreakStore {
  try {
    const raw = window.localStorage.getItem(STREAK_STORAGE_KEY);
    if (!raw) return emptyStreak();
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: number }).version !== STORE_VERSION ||
      !Array.isArray((parsed as { days?: unknown }).days)
    ) {
      return emptyStreak();
    }
    const days = ((parsed as StreakStore).days as unknown[])
      .filter(isDayKey)
      .sort();
    return { version: STORE_VERSION, days: Array.from(new Set(days)) };
  } catch {
    return emptyStreak();
  }
}

export function saveStreak(store: StreakStore): void {
  try {
    window.localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage may be unavailable (private mode, SSR); ignore.
  }
}

// Local calendar date of `date` as YYYY-MM-DD.
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Previous calendar day of a YYYY-MM-DD key, computed in UTC so DST never
// skips or repeats a day.
function previousDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// Whole calendar days from `earlier` to `later`. Computed in UTC so a DST
// boundary never adds or drops one.
export function daysBetween(earlier: string, later: string): number {
  const [y1, m1, d1] = earlier.split("-").map(Number);
  const [y2, m2, d2] = later.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

// Record a finished round on the local day of `now`. Returns the same store
// object when the day is already recorded so callers can skip a save.
export function recordDay(store: StreakStore, now: Date): StreakStore {
  const key = dayKey(now);
  if (store.days.includes(key)) return store;
  const days = [...store.days, key].sort();
  return {
    version: STORE_VERSION,
    days: days.length > MAX_DAYS ? days.slice(days.length - MAX_DAYS) : days,
  };
}

export function streakInfo(store: StreakStore, now: Date): StreakInfo {
  const played = new Set(store.days);
  const today = dayKey(now);
  const todayPlayed = played.has(today);

  let length = 0;
  let cursor = today;
  let lastBridged: string | null = null;
  // Today is neither counted nor held against the learner until it is over.
  if (!todayPlayed) cursor = previousDay(cursor);

  // Walk backward over at most MAX_DAYS days.
  for (let i = 0; i < MAX_DAYS; i++) {
    if (played.has(cursor)) {
      length++;
    } else if (
      lastBridged === null ||
      daysBetween(cursor, lastBridged) >= FORGIVE_WINDOW_DAYS
    ) {
      // A missed day, bridged. Only counts as a bridge if the streak
      // actually continues behind it; a bridge onto nothing ends at 0.
      lastBridged = cursor;
    } else {
      break;
    }
    cursor = previousDay(cursor);
  }

  return { length, todayPlayed, day: todayPlayed ? length : length + 1 };
}
