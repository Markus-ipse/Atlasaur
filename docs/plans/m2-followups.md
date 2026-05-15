# M2 — Open follow-ups

Items called out in the senior-tech-lead review of the M2 implementation
that aren't yet addressed in code, organized by who needs to act and why
they were deferred from the original commit.

## Needs human verification

### Manual browser QA pass

The dev server boots, all tests pass, types check, and the data layer is
validated at build time — but no one has actually opened a browser and
clicked through a miss. Recommend verifying these specific cases before
merging M2 to `main`:

1. **Small country with neighbors that should fit.** Miss Belgium. Confirm
   `Brussels` appears in the control panel; France/Germany/Luxembourg/
   Netherlands paint in muted blue; the reveal frame includes all four
   neighbors without clipping.
2. **Microstate inside a single neighbor.** Miss Lesotho. Should reveal a
   tight frame with South Africa highlighted in blue around it.
3. **Island with no neighbors.** Miss Japan. `Capital: Tokyo` line shows;
   no "Bordered by:" line; reveal frames Japan alone.
4. **No capital case.** Miss Antarctica. `Correct answer: Antarctica`
   shows; no "Capital:" line; no "Bordered by:" line.
5. **High-neighbor degenerate case.** Miss Russia. 14 neighbors should
   paint blue across the northern hemisphere; the cascade should fall
   back to bare-primary framing so Russia is at a readable scale.
6. **Wrong-click overlap.** In name-to-click for France, click Germany
   (which IS one of France's neighbors). Germany should stay **red**, not
   blue — wrong-click takes precedence over neighbor.
7. **shape-to-name mode.** The existing `highlightedIso3` blue (`#3b82f6`)
   shouldn't compete with the neighbor blue (`#bfdbfe`). Verify the
   highlighted country still reads as "the prompt" during feedback.
8. **Mobile portrait layout.** The control panel is narrower in portrait
   (`max-h-[45dvh] overflow-y-auto`). Long "Bordered by:" lines (e.g.
   Russia's 14 neighbors) should wrap cleanly inside that scroll area.
9. **`prefers-reduced-motion`.** Reveal transitions should land instantly
   instead of animating; the cascade still applies.

If any of these fail, file as a separate issue rather than holding M2 — the
underlying architecture is correct; visual fixes are localized to
`COLOR_NEIGHBOR`, the `space-y-1` spacing in `ControlZone`, or the cascade
tuning in `revealZoom.ts`.

## Hand-curated data worth a second pair of eyes

These were filled in from memory while implementing M2. Each is defensible
under the roadmap's "constitutional/de jure capital" rule, but some have
common alternatives that users may protest. M3 will add `capitalAliases`
which is the long-term fix — accepting both names as correct answers in
`country-to-capital` mode.

### Capitals: contested calls

| iso3 | Country         | Picked          | Common alternative           | Why picked              |
|------|-----------------|-----------------|------------------------------|-------------------------|
| BOL  | Bolivia         | Sucre           | La Paz (seat of government)  | Constitutional capital  |
| LKA  | Sri Lanka       | Colombo         | Sri Jayawardenepura Kotte    | Commercial / common use |
| CIV  | Côte d'Ivoire   | Yamoussoukro    | Abidjan (de facto)           | Official capital        |
| BEN  | Benin           | Porto-Novo      | Cotonou (de facto)           | Official capital        |
| ZAF  | South Africa    | Pretoria        | Cape Town / Bloemfontein     | Executive (per plan)    |
| SWZ  | Eswatini        | Mbabane         | Lobamba (royal/legislative)  | Administrative          |
| NLD  | Netherlands     | Amsterdam       | The Hague (seat of govt)     | Constitutional (per plan)|
| ISR  | Israel          | Jerusalem       | Tel Aviv (recognized by some)| De jure declared        |
| PSE  | Palestine       | Ramallah        | East Jerusalem (claimed)     | De facto administrative |

If any of these are wrong by the project's preferred convention, the fix
is a one-line edit in `scripts/build-countries.mjs` followed by
`npm run build:countries`.

### notabilityTier: subjective by construction

The 0/1/2 axis is mine alone — 30-second judgement per country, ~180
rows. The values that drive M5 introduction order most are the tier-2
entries (introduced first); a few that might be controversial:

- **Tier 2** — included: Iraq, Belarus, Syria, North Korea, Iran,
  Saudi Arabia, UAE, Qatar, Israel, Palestine, Cuba, Czechia, Hungary,
  Austria, Iceland, Ireland.
- **Tier 1 → could be 2** — Botswana? Madagascar? Kazakhstan? Algeria?
- **Tier 0 → could be 1** — Bhutan, Bahamas, Trinidad and Tobago, Brunei?

Easy to retune later — values are a single column edit and rebuild. No
tests assert specific tiers (they're a soft scheduling hint, not a hard
contract).

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
