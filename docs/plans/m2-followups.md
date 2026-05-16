# M2 — Open follow-ups

Items called out in the senior-tech-lead review of the M2 implementation
that aren't yet addressed in code, organized by who needs to act and why
they were deferred from the original commit.

## Needs human verification

### Manual browser QA pass

Moved to a runnable, self-contained checklist:
**[`m2-qa-checklist.md`](./m2-qa-checklist.md)**. Cases that can be
asserted in Vitest (Japan no-neighbors, Antarctica null-capital, wrong-
click precedence, single-neighbor render, Russia text + cascade) are
now covered by automated tests; the manual list covers only the visual /
layout / motion axes that still need an eyeball.

## Hand-curated data worth a second pair of eyes

Resolved in **[`m2-capital-decisions.md`](./m2-capital-decisions.md)**:

- Multi-capital countries now carry an optional `capitalAlternates`
  field; the miss-reveal renders `Capitals: primary, ...alternates`
  on those 7 rows (BOL, LKA, CIV, BEN, ZAF, SWZ, NLD). ISR / PSE
  stay single-capital — those are territorial disputes, not
  administrative splits.
- `notabilityTier`: only Madagascar moved (1 → 2). The other
  borderline rows stayed where they were; see the linked doc for
  rationale per row.

## Deferred design improvements

### Color contrast of `COLOR_NEIGHBOR`

`#bfdbfe` (blue-200) vs `#cbd5e1` (slate-300, default) differentiate by
hue rather than lightness — visible to most users, potentially hard for
some red-green deficient viewers. Inherits the existing pale-on-pale
problem with `COLOR_INERT`/`COLOR_DEFAULT`, doesn't introduce a new one.
Worth investigating only as part of a broader palette accessibility pass;
swapping to blue-300 (`#93c5fd`) would conflict perceptually with the
shape-to-name `COLOR_HIGHLIGHT` (blue-500 `#3b82f6`) so isn't a drop-in.

### Smarter cascade for high-neighbor countries

Russia has 14 land neighbors; the current cascade drops *all* neighbors
as a group when the union doesn't fit. A more nuanced version would drop
the **furthest** neighbors first and iterate until the union fits — so
Russia would keep, say, Finland/Norway/Belarus/Ukraine/Kazakhstan and
drop Mongolia/China/North Korea. Marginal value (Russia is the only
realistic case); not worth the cost vs the cleanly-degraded
"bare-primary" fallback we have now. Revisit if user feedback says the
neighbor cue feels missing on continent-spanning countries.

### Per-mode SRS state (separate concern — slated for M4)

Once M4's SRS lands, the per-country record is shared across modes for v1
per the roadmap. If users report "I know the shape but never the capital"
or vice versa, that's the signal to split records by mode. Tracking here
because M2's metadata enables the modes that would expose the issue.
