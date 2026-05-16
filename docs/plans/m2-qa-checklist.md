# M2 — Manual browser QA checklist

A runnable checklist for the M2 miss-reveal feature (capital + neighbor
highlighting). Cases that can be tested without a browser are covered by
Vitest — see the "Covered by automated tests" section below. The cases
listed here are the visual / layout / motion cases that require an
eyeball.

## Covered by automated tests

These M2 invariants are pinned by Vitest and don't need a manual pass:

- **Case 3** (Japan, no neighbors line) — `ControlZone.test.tsx` *"omits
  the Bordered by line for countries with no land neighbors"*.
- **Case 4** (Antarctica, no capital line) — `ControlZone.test.tsx`
  *"omits the Capital line when capital is null"*.
- **Case 5 text** (Russia, alphabetical neighbor list) —
  `ControlZone.test.tsx` *"renders many neighbors comma-joined and
  alphabetically sorted (Russia)"*.
- **Case 5 cascade** (Russia, wide-spread neighbors fall through) —
  `revealZoom.test.ts` *"many wide-spread neighbors fall through to
  bare-primary framing (Russia)"*.
- **Case 6** (wrong-click overlap precedence) — `fillFor.test.ts`
  *"wrong-clicked country that is ALSO a neighbor stays red, not blue"*.
- **Case 10 / 11 text** (single-neighbor render, no trailing comma) —
  `ControlZone.test.tsx` *"renders a single neighbor without a trailing
  comma (Lesotho)"*.

The manual checklist below covers the **visual / layout / motion** axes
those tests can't reach.

## Setup

1. `npm run dev`, open `http://localhost:5173/`.
2. Default to mode **name-to-click** and all continents selected unless
   the case says otherwise.
3. Between cases, clear `atlasaur:*` localStorage keys via DevTools to
   reset the retry queue (no UI Reset button yet). Page reload after.
4. The picker is random — narrowing `selectedContinents` to the
   relevant continent cuts the pool roughly 4× and speeds up getting
   to a specific country.

## Cases

### 1. Small country with neighbors that should fit (Belgium)

- **Setup**: Continents = Europe. Play until Belgium is the prompt.
  Miss it (click any non-Belgium country, or Skip).
- **Expected**:
  - `Capital: Brussels` appears in the control panel.
  - France, Germany, Luxembourg, Netherlands paint in muted blue
    (`#bfdbfe`).
  - The reveal frame includes all four neighbors without clipping.
- **Pass / Fail**: [ ]

### 2. Microstate inside a single neighbor (Lesotho)

- **Setup**: Continents = Africa. Play until Lesotho is the prompt.
  Skip it.
- **Expected**:
  - Tight frame zooms in on Lesotho.
  - South Africa paints muted blue around Lesotho.
  - `Bordered by: South Africa` (no trailing comma — single neighbor).
- **Pass / Fail**: [ ]

### 5. High-neighbor degenerate case (Russia, frame portion)

- **Setup**: Continents = Europe + Asia. Miss Russia.
- **Expected**:
  - All 14 neighbors paint muted blue across the northern hemisphere.
  - Cascade falls back to bare-primary framing — Russia at a readable
    scale rather than zoomed all the way out to fit Mongolia and
    Norway in the same frame.
  - "Bordered by:" line wraps cleanly inside the control panel.
- **Pass / Fail**: [ ]

### 7. shape-to-name mode highlight contrast

- **Setup**: Switch mode to **shape-to-name**. Get any country prompted
  (the country shape is highlighted with `COLOR_HIGHLIGHT` = `#3b82f6`
  bright blue). Type a wrong guess to trigger the miss-reveal.
- **Expected**:
  - During feedback, neighbor blue (`#bfdbfe` pale) doesn't compete
    perceptually with the highlight blue (`#3b82f6` bright). The
    highlighted prompt country still reads as "the question".
  - Correct country lights up green and overrides any neighbor overlap.
- **Pass / Fail**: [ ]

### 8. Mobile portrait layout (Russia stress)

- **Setup**: DevTools → device emulator → portrait phone (e.g. iPhone
  SE 375×667). Miss Russia (same as case 5).
- **Expected**:
  - Control panel sits at the bottom (portrait layout), not the side.
  - "Bordered by:" line wraps inside the control panel's
    `max-h-[45dvh] overflow-y-auto`.
  - No horizontal scroll, no text clipping.
- **Pass / Fail**: [ ]

### 9. `prefers-reduced-motion`

- **Setup**: macOS System Settings → Accessibility → Display → Reduce
  motion, or DevTools emulation. Reload page. Miss any country.
- **Expected**:
  - Reveal frame jumps instantly to the framed view rather than
    animating.
  - Cascade logic still applies (neighbors paint, frame includes
    them where they fit).
- **Pass / Fail**: [ ]

### 10. Reveal labels on neighbors (`showLabelsOnReveal` ON)

- **Setup**: Toggle "Show labels on reveal" ON. Continents = Europe.
  Miss France.
- **Expected**:
  - Germany, Italy, Spain, Belgium, Luxembourg, Switzerland render
    their names alongside the muted-blue fill.
  - Label collisions are tolerable. (Russia is the stress test — try
    that with the toggle still on; ~14 names will compete.)
  - With the toggle OFF, only France's label shows.
- **Pass / Fail**: [ ]

### 11. Out-of-scope neighbor labels (Egypt)

- **Setup**: Continents = **only** Africa. "Show labels on reveal" ON.
  Miss Egypt.
- **Expected**:
  - Israel and Palestine (in Asia, **not** in the active scope) still
    paint muted blue AND render their names — the elaborative cue
    teaches geographic context regardless of the active filter.
- **Pass / Fail**: [ ]

### 12. Multi-capital miss-reveal (Bolivia + South Africa)

- **Setup**: Continents = South America. Miss Bolivia.
  Then continents = Africa, miss South Africa.
- **Expected**:
  - Bolivia: `Capitals: Sucre, La Paz` (plural label, comma-separated).
  - South Africa: `Capitals: Pretoria, Cape Town, Bloemfontein` (three
    names on one line — wraps if narrow).
  - No layout break in either the portrait or landscape control panel.
- **Pass / Fail**: [ ]

## Troubleshooting

If a case fails, the three places visual regressions usually live:

- `src/components/fillFor.ts` — `COLOR_NEIGHBOR` and the precedence
  rule for which fill wins when feedback is active.
- `src/components/RevealHero.tsx` — `space-y-1`-style spacing and the
  `Capital(s):` / `Bordered by:` text rendering.
- `src/components/revealZoom.ts` — cascade tuning (`computeRevealTarget`
  and `tryFitUnion`); add a `console.log` of the chosen `(cx, cy, k)`
  to debug framing decisions.

File any new regressions discovered here as a separate issue — the
underlying M2 architecture is sound, and visual fixes are localized.
