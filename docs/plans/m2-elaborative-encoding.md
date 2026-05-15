# M2 — Reveal-time elaborative encoding (capitals + neighbors)

**Status: shipped on branch `claude/plan-retention-implementation-dfImg` — see commit "Surface capital and land neighbors on miss reveal (M2)".**

## Context

The retention roadmap (`RETENTION_ROADMAP.md`) lists five milestones. Its "Recommended sequencing" is explicit:

> If only one milestone ships: **M2** (metadata + neighbor reveal). Cheapest learning-science win, no behavioral change required from the user.

Picking M2 first. M1 (in-memory Leitner boxes) is intentionally redundant once M4 (FSRS) lands; M2 is independent of both and pays off whether we ship M4 or not. The bet is grounded in spatial-clustering / elaborative-encoding research — recalling a location co-activates its spatial neighbors, so highlighting them at miss-time turns each miss into a richer encoding event without changing the question or extending the reveal pause.

User decisions for this plan:
- **Scope**: full data layer (capital + neighbors + subregion + sizeTier + notabilityTier) — touch every row once, unlocks M3/M5.
- **Reveal frame**: extend `computeRevealTarget` to include neighbor bounds — neighbors are actually visible on small countries (Lesotho, Belgium, Singapore).
- **Island UX**: omit the "Bordered by:" line when `neighbors[]` is empty.

## Implementation

### 1. Data layer — `scripts/build-countries.mjs`

Every entry in the `COUNTRIES` table gets these fields:

```js
"250": {
  iso3: "FRA", name: "France", aliases: ["French Republic"], continent: "Europe",
  capital: "Paris",
  subregion: "Western Europe",      // UN M49
  sizeTier: 3,                       // derived from landAreaKm2 at build; see below
  notabilityTier: 2,                 // hand-curated: 0=obscure, 1=mid, 2=well-known
  landAreaKm2: 551695,               // raw input; bucketed into sizeTier
},
```

Notes on each field:

- **`capital`**: hand-enter all ~200, one-time effort, alongside `name`. Multi-capital de jure cases (Netherlands → Amsterdam, South Africa → Pretoria) take the constitutional capital; M3 will accept `capitalAliases` later — out of scope here.
- **`subregion`**: hand-enter from UN M49 (e.g. "Northern Africa", "South-Eastern Asia"). Define a `VALID_SUBREGIONS` set at the top of the script, validate every entry against it.
- **`landAreaKm2`**: hand-enter raw (sourced from a standard table during PR review). The build script buckets into `sizeTier`: `0` <50k km², `1` 50k–500k, `2` 500k–2M, `3` ≥2M. Bucketing logic is one helper in the script.
- **`notabilityTier`**: hand-curated 0/1/2. Used by M5 to seed introduction order — captures "well-known" independent of size (Singapore=2 even though tier-0 area; Kazakhstan=1 despite tier-3 area).
- **`neighbors`**: computed at build time — **do not hand-enter** for real ISO entries. Use `topojson-client`'s `neighbors(topology, geometries)` to derive land-adjacency from shared arcs, then convert numeric IDs → iso3 via the existing matched-entry index. `topojson-client@3.1.0` is already a dependency (verified). Synthetic entries (Kosovo, N. Cyprus, Somaliland) get a `neighborsOverride: iso3[]` field — the script uses the override and skips topology derivation for them.

**New validation block** (slot it after the continent validation around line 305 of `scripts/build-countries.mjs`):

- `capital` non-empty string for every entry.
- `subregion` in `VALID_SUBREGIONS`.
- `landAreaKm2` is a positive number.
- `notabilityTier` ∈ {0, 1, 2}.
- After topology-derived neighbors are computed: every iso3 in `neighbors` resolves to a matched entry. (Synthetic overrides go through the same final resolution check.)
- Symmetry warning (not error): if A is in B's neighbors, B should be in A's — log mismatches, they likely indicate a topology quirk worth a comment.

Output schema in `src/data/countries.json` gains: `capital`, `neighbors`, `subregion`, `sizeTier`, `notabilityTier`. `landAreaKm2` is build input only and is **not** emitted (keeps the JSON lean — sizeTier is the runtime field).

Run `npm run build:countries` after editing.

### 2. Types — `src/types.ts`

Extend `Country` with the new fields. Add `Subregion` as a string-literal union (UN M49 set) for compile-time safety on the JSON. `Feedback` is unchanged — neighbor data flows through `state.current.neighbors`, not through `Feedback`.

### 3. ControlZone — `src/components/ControlZone.tsx:47-57`

Replace the single `<p>` feedback block with a grouped status region. Capital is always shown (even for the "you skipped" case); "Bordered by" is omitted when `neighbors` is empty:

```tsx
{state.feedback && state.feedback.kind !== "correct" && (
  <div role="status" className="space-y-1 text-sm">
    <p className="text-red-600">
      {state.mode === "name-to-click" && state.feedback.kind === "wrong" && (
        <>You selected: {game.nameFromIso3(state.feedback.answerIso3)}<br/></>
      )}
      Correct answer: {state.current.name}
    </p>
    <p className="text-slate-600">Capital: {state.current.capital}</p>
    {state.current.neighbors.length > 0 && (
      <p className="text-slate-600">
        Bordered by: {state.current.neighbors.map(game.nameFromIso3).join(", ")}
      </p>
    )}
  </div>
)}
```

Why slate-600 for the supplementary lines: keeps the red as the urgent signal ("you missed this") and tones the elaborative info as informational. Still WCAG-AA on white.

Why a single `role="status"` wrapping all three lines: screen readers announce it as one update, matching how a sighted user reads it.

`state.current` is already a full `Country`, so no new prop or GameApi method is needed here.

### 4. WorldMap — `src/components/WorldMap.tsx`

Three changes, all confined to the existing fillFor and reveal-effect paths.

**New color** alongside the existing `COLOR_*` constants near line 61:
```ts
const COLOR_NEIGHBOR = "#bfdbfe"; // blue-200, muted highlight
```

**New prop** on `WorldMap`:
```ts
correctNeighborIso3s: readonly string[];
```

App.tsx fills it from `state.current.neighbors` when feedback is non-correct, otherwise an empty array. (Define one stable `EMPTY: readonly string[] = []` at module top to avoid re-renders when feedback is null.)

**Memoized set** inside `WorldMap`:
```ts
const neighborSet = useMemo(
  () => new Set(correctNeighborIso3s),
  [correctNeighborIso3s],
);
```

**`fillFor` precedence** (extends the function at `src/components/WorldMap.tsx:228-253`):
1. correct country (green / yellow) — unchanged
2. wrong-clicked country (red) — unchanged
3. **neighbor of correct country (blue-200)** — NEW, only when `feedback != null`
4. shape-to-name highlighted country (blue-500) — unchanged
5. inert / default — unchanged

A neighbor that's also the wrong-clicked country stays red (rule 2 wins). A neighbor never coincides with the correct country (a country is not its own neighbor) so no precedence concern there.

**Reveal frame** — see step 5.

### 5. Reveal framing — `src/components/revealZoom.ts`

Extend `computeRevealTarget` with a third parameter:

```ts
computeRevealTarget(
  primary: Bounds,
  secondary: Bounds | null,
  neighbors: readonly Bounds[],     // NEW, default []
): { k: number; cx: number; cy: number }
```

Cascade fallback (each tier uses the existing union-too-wide check):
1. **Try** `primary ∪ secondary ∪ neighbors` — full context.
2. **Else** `primary ∪ neighbors` — drops the far wrong-click but keeps elaborative neighbors. (Common case: user clicked something distant.)
3. **Else** `primary` alone — current behavior on degenerate inputs.

Implement as a small helper `tryFitUnion(bounds[]): {k,cx,cy} | null` that the three tiers call. Keeps the file purely geometric and easy to unit-test.

WorldMap's reveal effect (`src/components/WorldMap.tsx:323-351`) gains:
```ts
const neighborBounds = correctNeighborIso3s
  .map((iso3) => numericFromIso3(iso3))
  .map((n) => (n ? LABELS_BY_NUMERIC.get(n) ?? null : null))
  .filter((b): b is Label => b !== null);
const { k, cx, cy } = computeRevealTarget(label, wrongLabel, neighborBounds);
```

Performance: `correctNeighborIso3s.length` is ≤ 14 in the worst case (Russia); per-effect cost is negligible. `fillFor`'s extra `Set.has()` is O(1) per country per render — well under the existing render budget.

### 6. App.tsx wiring

One new prop pass on the `WorldMap`:
```tsx
correctNeighborIso3s={
  state.feedback && state.feedback.kind !== "correct"
    ? state.current.neighbors
    : EMPTY_NEIGHBORS
}
```
(`EMPTY_NEIGHBORS` is a module-level `readonly string[] = []` to keep referential equality when there's no feedback.)

## Files

- `scripts/build-countries.mjs` — new fields in `COUNTRIES`, `VALID_SUBREGIONS` set, `landAreaKm2`→`sizeTier` bucketing, topojson-client neighbor derivation, validations.
- `src/data/countries.json` — regenerated; gains `capital`, `neighbors`, `subregion`, `sizeTier`, `notabilityTier`.
- `src/types.ts` — extend `Country`, add `Subregion`.
- `src/components/ControlZone.tsx:47-57` — capital + neighbors block.
- `src/components/WorldMap.tsx` — `COLOR_NEIGHBOR`, `correctNeighborIso3s` prop, `neighborSet`, `fillFor` extension, neighbor bounds in reveal effect.
- `src/components/revealZoom.ts` — third `neighbors` parameter, cascading fallback.
- `src/App.tsx:16-25` — pass `correctNeighborIso3s` to `WorldMap`.
- New `src/components/revealZoom.test.ts` (or extension) — unit tests for the three-tier fallback.

## Gotchas caught during plan review

1. **Test fixtures need new fields.** `src/game/useGame.test.ts:9` and `:250` and `src/components/ControlZone.test.tsx:8` construct `Country` literally. Widening `Country` breaks typecheck on these. Behavior assertions don't need to change, just the fixture shape.
2. **`topojson-client.neighbors()` returns indexes**, not numeric IDs. The script needs to map `geometries[i]` → `numeric/topoName` → iso3 via the existing `matched` table.
3. **The build script naively spreads `info`** into the output object (lines 266/273). New build-only fields (`landAreaKm2`) must be explicitly dropped before write, not just absent from the type. Strip with `const { landAreaKm2: _drop, ...rest } = info`.
4. **Reveal-zoom effect deps**: add `correctNeighborIso3s` to the dep array at `src/components/WorldMap.tsx:351`. It's referentially stable (it comes from `state.current.neighbors`, which is the same array reference until `state.current` changes), so this doesn't add re-render churn.
5. **Subregion vocabulary**: use the 22 standard UN M49 subregions plus "Antarctica" as a 23rd. Define once in the script and once as the TS union.

## Verification

Beyond the roadmap's "Test invariants that must not regress" section:

- `npm run build:countries` — clean run, no warnings about missing topology features, no neighbor resolution failures.
- `npm test` — existing `src/game/useGame.test.ts` passes unchanged; new `revealZoom` tests pass.
- `npm run build` — typecheck clean; `tsc` will catch missing fields on any `COUNTRIES` row via the widened `Country` type once the JSON is fed through.
- `npm run lint` — clean.
- **Manual smoke**:
  1. `npm run dev`, name-to-click mode, miss a small country (e.g. Belgium). Confirm: neighbors are visible in blue-200, capital "Brussels" appears, frame zooms to include Belgium + the 4 neighbors.
  2. Skip a country. Same neighbor + capital reveal, but answer country fills yellow.
  3. Miss an island (Japan). Capital appears; "Bordered by" line is absent.
  4. Miss Russia. 14 neighbors render; either the full frame fits or the cascade falls back to bare-primary without throwing.
  5. shape-to-name mode: behavior identical; the existing blue-500 highlight on `state.current` doesn't clash because feedback overrides take precedence.
  6. Prefers-reduced-motion: reveal frame still lands correctly (transition is just instant).

## UX / performance / quality notes baked in

- **UX**: capital is always shown on miss (universal value); "Bordered by" is conditional (clean for islands). Frame expansion makes the highlight actually do its job on microstates. Reveal duration unchanged — the pause is still the encoding step. Color hierarchy preserved (red = your miss; blue-200 = context; blue-500 = "this is the prompt").
- **Performance**: build-time neighbor derivation (zero runtime cost). `Set.has()` in `fillFor`. JSON grows ~50KB — acceptable for the value; if it ever matters, switch `vite` to minify the import.
- **Codebase quality**: single source of truth (`Country.neighbors`); no parallel state, no new GameApi methods, no new `Feedback` fields. `fillFor` remains the only decision point for color. `revealZoom.ts` remains pure geometry. Synthetic entries handled via a documented `neighborsOverride` escape hatch, validated like everything else.
