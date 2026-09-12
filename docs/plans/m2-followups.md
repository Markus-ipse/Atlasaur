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

**Closed by R3.3a (2026-09-12).** The Tailwind blues this note was written
against were replaced by a warm ochre in the period palette, and R2.1's
mastery paint then put that ochre at 1.0–1.4 contrast against every ambient
fill in light theme — a neighbour was the same paint as a known country.
The neighbour fill is now the teal-engraving pigment in both themes (min
1.87 against the ambient fills), and `fillFor.test.ts` pins a floor.

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
