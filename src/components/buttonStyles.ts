// The action hierarchy, shared so no screen copies its own button classes
// (#61). One PRIMARY per screen: the thing the learner most likely wants next.
// SECONDARY for the other ways on, QUIET for tertiary routes that read as
// links. Call sites add layout only (`w-full`, `flex-1`, `STACKED`).

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

export const PRIMARY = `min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium enabled:hover:bg-ink-mid ${FOCUS} disabled:opacity-50 disabled:cursor-not-allowed`;

export const SECONDARY = `min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium enabled:hover:bg-parchment-shadow ${FOCUS} disabled:opacity-50 disabled:cursor-not-allowed`;

export const QUIET = `min-h-11 px-3 rounded text-sm text-ink-mid underline underline-offset-4 decoration-ink-faded hover:text-ink-deep ${FOCUS}`;

// A button with a sub-line under its label saying why or what next.
export const STACKED = "flex flex-col items-center justify-center leading-tight";

// Sub-lines stay at 14 px and in a reading ink: ink-faded is a border tone,
// under 3:1 on the dark theme's page.
export const PRIMARY_SUB = "text-sm font-normal text-parchment-base/80";
export const SECONDARY_SUB = "text-sm font-normal text-ink-mid";
