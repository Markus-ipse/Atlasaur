// The action hierarchy, shared so no screen copies its own button classes
// (#61). One PRIMARY per screen: the thing the learner most likely wants next.
// SECONDARY for the other ways on, QUIET for tertiary routes that read as
// links. Call sites add layout only (`w-full`, `flex-1`).

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

export const PRIMARY = `min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium enabled:hover:bg-ink-mid ${FOCUS} disabled:opacity-50 disabled:cursor-not-allowed`;

// The same ink as an index row, so a detour never outranks the continuation
// beside it; the primary stands out by its fill.
export const SECONDARY = `min-h-11 px-5 rounded border border-ink-faded text-ink-deep font-medium enabled:hover:bg-parchment-shadow ${FOCUS} disabled:opacity-50 disabled:cursor-not-allowed`;

export const QUIET = `min-h-11 px-3 rounded text-sm text-ink-mid underline underline-offset-4 decoration-ink-faded hover:text-ink-deep ${FOCUS}`;

// A secondary route that carries its reason: an index row (`IndexRow`). One
// line — the label on the left, a dotted leader, the reason as a short figure
// on the right, a chevron at the edge — so the reason can never be squeezed
// under the label. A reason that is a sentence rather than a figure belongs
// in the card's copy, not on the button. A button never carries a sub-line.
// Tighter sideways than SECONDARY's px-5: on a 390 px phone the card leaves
// a row about 310 px, and "See today's expedition · 7 of 10 found" has to
// fit on one line there. Where even that is too narrow (320 px, "10
// countries, one try") the row wraps and the leader, figure and chevron take
// a second line, right-aligned, rather than the figure running into the
// label. The vertical padding adds up to the 44 px minimum, since the items
// sit on the bottom edge and would otherwise ride low in a taller box.
export const ROW = `min-h-11 py-2.75 pl-3.5 pr-2.5 rounded border border-ink-faded text-ink-deep font-medium text-left flex flex-wrap items-end gap-2 leading-snug hover:bg-parchment-shadow ${FOCUS}`;
export const ROW_LEADER = "flex-1 min-w-4 mb-1.5 border-b border-dotted border-ink-faded";
// The figure stays at 14 px and in a reading ink: ink-faded is a border tone,
// under 3:1 on the dark theme's page.
export const ROW_FIGURE = "text-sm font-normal text-ink-mid tabular-nums whitespace-nowrap";
