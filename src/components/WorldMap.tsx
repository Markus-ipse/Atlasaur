import { useEffect, useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoGraticule10, geoPath, geoStream } from "d3-geo";
import { select } from "d3-selection";
import {
  zoom as d3zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";
import "d3-transition";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import polylabel from "polylabel";
import type { Topology } from "topojson-specification";
import topologyJson from "../data/world-110m.json";
import countriesData from "../data/countries.json";
import { ALL_CONTINENTS, type Continent, type Country, type Feedback, type QuestionMode } from "../types";
import {
  W,
  H,
  MIN_ZOOM,
  MAX_ZOOM,
  computeRevealTarget,
  tryFitUnion,
  type Bounds,
  type Target,
} from "./revealZoom";
import {
  COLLISION_PADDING,
  GLYPH_W_RATIO,
  LABEL_EM,
  TARGET_LABEL_PX,
  computeVisibleLabels,
  fontSizeFor,
  type Label,
  type Rect,
} from "./labelLayout";
import { fillFor, type Palette } from "./fillFor";
import { Wordmark } from "./Wordmark";

const topology = topologyJson as unknown as Topology;

// Identifier wiring only — for partially-recognized territories whose
// topology features have no ISO numeric id, the build script assigns a
// synthetic numeric and records the matching topology `properties.name`
// here. We read it once at module load so PATHS/LABELS can use the
// synthetic id uniformly. WorldMap deliberately does not consume any
// game data (names/aliases/continents) from countries.json.
const SYNTHETIC_NUMERIC_BY_TOPO_NAME = new Map<string, string>(
  (countriesData as Country[])
    .filter((c) => c.topoName)
    .map((c) => [c.topoName as string, c.numeric]),
);

function numericIdFor(f: Feature<Geometry, { name?: string }>): string | null {
  if (typeof f.id === "string") return f.id;
  const name = f.properties?.name;
  return (name && SYNTHETIC_NUMERIC_BY_TOPO_NAME.get(name)) ?? null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

// Two-stage reveal-zoom timing for a wrong click that fits both countries on
// screen: animate to the both-countries frame (stage 1), hold, then settle on
// the correct country + its neighbors (stage 2). A far miss / skip / reduced
// motion skips stage 1 and uses REVEAL_STAGE2_MS for a single transition.
const REVEAL_STAGE1_MS = 700;
const REVEAL_HOLD_MS = 500;
const REVEAL_STAGE2_MS = 700;

// Ocean labels: target on-screen size scales linearly with rendered SVG
// width between these caps. Min keeps mobile legible; max stops them
// ballooning on large desktops.
const OCEAN_MIN_PX = 11;
const OCEAN_MAX_PX = 18;
const OCEAN_PX_PER_SVG_PX = 0.022;
// Zoom growth exponent: 0 = constant on-screen size, 1 = scales 1:1 with k.
// 0.2 gives roughly +30% size at k=4 — a noticeable but mild grow-on-zoom.
const OCEAN_ZOOM_GROWTH = 0.2;

const collection = feature(
  topology,
  topology.objects.countries,
) as unknown as FeatureCollection<Geometry, { name?: string }>;
const projection = geoEqualEarth().fitSize([W, H], collection);
const pathGen = geoPath(projection);

type PathItem = {
  key: string;
  numericId: string | null;
  d: string;
};

// Path strings depend only on the (module-level) projection, so they're
// computed once. During pan/zoom we re-render but the d strings stay equal.
const PATHS: PathItem[] = collection.features.map((f, i) => {
  const numericId = numericIdFor(f);
  return {
    key: numericId ?? `idx-${i}`,
    numericId,
    d: pathGen(f) ?? "",
  };
});

// Graticule (latitude/longitude grid) — period-cartography hallmark.
// Default `geoGraticule10` emits meridians and parallels every 10°, with
// 90° at the extreme meridians. Rendered once at module load behind the
// country paths; scales with the zoom-transform group so it stays
// geographically anchored.
const GRATICULE_D = pathGen(geoGraticule10()) ?? "";

type ProjRing = [number, number][];

function ringArea(ring: ProjRing): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function ringBounds(
  ring: ProjRing,
): { x0: number; x1: number; y0: number; y1: number } {
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const [x, y] of ring) {
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  return { x0: xMin, x1: xMax, y0: yMin, y1: yMax };
}

// Stream the feature through the projection so antimeridian clipping (and
// any other projection-level clipping) happens before we see points;
// otherwise rings spanning ±180° (Fiji, Russia, Antarctica) project as a
// stripe across the whole map and polylabel lands in the ocean.
//
// Across all clipped rings, pick the largest by area as the country's
// "main" landmass — that's where the label belongs (continental US, not
// Alaska; mainland Russia, not Chukotka). Holes are ignored: at 110m
// resolution real holes are rare, and antimeridian splits emit disjoint
// pieces as multiple rings of one polygon, so a strict outer/hole reading
// wouldn't be reliable anyway.
function pickLargestRing(
  feat: Feature<Geometry>,
): { ring: ProjRing; area: number } | null {
  let best: ProjRing | null = null;
  let bestArea = 0;
  let curRing: ProjRing | null = null;
  geoStream(
    feat,
    projection.stream({
      polygonStart() {},
      polygonEnd() {},
      lineStart() {
        curRing = [];
      },
      lineEnd() {
        if (curRing && curRing.length >= 3) {
          const a = ringArea(curRing);
          if (a > bestArea) {
            best = curRing;
            bestArea = a;
          }
        }
        curRing = null;
      },
      point(x: number, y: number) {
        if (curRing && Number.isFinite(x) && Number.isFinite(y)) {
          curRing.push([x, y]);
        }
      },
      sphere() {},
    }),
  );
  return best ? { ring: best, area: bestArea } : null;
}

// Two-line labels — qualifier above "Ocean" — keep label width narrow
// enough that adjacent oceans don't overlap on a 375px-wide phone.
const OCEAN_LABEL_DATA: { qualifier: string; lon: number; lat: number }[] = [
  { qualifier: "North Pacific", lon: -125, lat: 30 },
  { qualifier: "South Pacific", lon: -115, lat: -25 },
  { qualifier: "North Atlantic", lon: -40, lat: 30 },
  { qualifier: "South Atlantic", lon: -20, lat: -25 },
  { qualifier: "Indian", lon: 75, lat: -25 },
  { qualifier: "Arctic", lon: 0, lat: 78 },
  { qualifier: "Southern", lon: 20, lat: -65 },
];
const OCEAN_LABELS: { qualifier: string; cx: number; cy: number }[] =
  OCEAN_LABEL_DATA.flatMap((o) => {
    const p = projection([o.lon, o.lat]);
    return p ? [{ qualifier: o.qualifier, cx: p[0], cy: p[1] }] : [];
  });

const LABELS: Label[] = [];
for (const f of collection.features) {
  const numericId = numericIdFor(f);
  if (!numericId) continue;
  const name = f.properties?.name;
  if (!name) continue;
  const result = pickLargestRing(f);
  if (!result) continue;
  const { ring, area } = result;
  // Pole of inaccessibility — point inside the polygon furthest from any
  // edge. Beats centroid for concave shapes (e.g. Croatia's crescent
  // around Bosnia would land outside the country with a centroid).
  const [cx, cy] = polylabel([ring], 1.0);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
  const { x0, x1, y0, y1 } = ringBounds(ring);
  LABELS.push({ numericId, name, cx, cy, x0, x1, y0, y1, area });
}

const LABELS_BY_NUMERIC = new Map<string, Label>(
  LABELS.map((l) => [l.numericId, l]),
);

// Full projected bounds (all rings) per country, keyed by numeric. Unlike
// LABELS (largest ring only), this covers every drawn island — used to gate
// the capital dot: at 110m resolution a capital can sit on an island too
// small to render (e.g. Vanuatu's Efate / Port Vila), which would strand the
// dot in open ocean far from the drawn land once the reveal zoom magnifies
// the gap. We omit the dot in that case rather than point at empty water.
// Caveat: antimeridian crossers (Fiji, Russia) get full-map-width bounds from
// pathGen.bounds (same pitfall the reveal-zoom avoids via LABELS — see the
// comment at the computeRevealTarget effect below), so the gate is a no-op for
// them. Acceptable: it fails open (dot shows), matching pre-gate behavior, and
// their capitals are on rendered land today.
const BOUNDS_BY_NUMERIC = new Map<string, [[number, number], [number, number]]>();
for (const f of collection.features) {
  const numericId = numericIdFor(f);
  if (!numericId) continue;
  const b = pathGen.bounds(f);
  if (Number.isFinite(b[0][0])) BOUNDS_BY_NUMERIC.set(numericId, b);
}

// Continent → numeric ids, used to compute the resting-zoom frame from
// `selectedContinents`. Built once at module load; the continent assignment
// is static per country.
const NUMERICS_BY_CONTINENT = new Map<Continent, string[]>();
for (const c of countriesData as Country[]) {
  const list = NUMERICS_BY_CONTINENT.get(c.continent);
  if (list) list.push(c.numeric);
  else NUMERICS_BY_CONTINENT.set(c.continent, [c.numeric]);
}

// Resting-zoom frame: when the user has narrowed the pool with the
// continent filter, fit the union of those continents' countries instead
// of returning to the full world. Reuses `tryFitUnion` from the reveal-
// zoom math so padding/MIN_ZOOM behaviour is identical. Pure (no hooks)
// so the component can seed `transform` state on first render and avoid
// a flicker of the "Reset" button before the mount effect syncs d3-zoom.
function computeBaseTransform(
  selectedContinents: readonly Continent[],
): ZoomTransform {
  if (selectedContinents.length === ALL_CONTINENTS.length) return zoomIdentity;
  const bounds: Bounds[] = [];
  for (const cont of selectedContinents) {
    const numerics = NUMERICS_BY_CONTINENT.get(cont);
    if (!numerics) continue;
    for (const n of numerics) {
      const lab = LABELS_BY_NUMERIC.get(n);
      if (lab) bounds.push(lab);
    }
  }
  const fit = tryFitUnion(bounds);
  if (!fit) return zoomIdentity;
  return zoomIdentity
    .translate(W / 2 - fit.cx * fit.k, H / 2 - fit.cy * fit.k)
    .scale(fit.k);
}

type Props = {
  mode: QuestionMode;
  highlightedIso3: string | null;
  feedback: Feedback | null;
  showLabelsOnReveal: boolean;
  // Neighbors of the correct country, painted in a muted tone during a
  // wrong/skipped reveal. Empty when feedback is null or the correct
  // country has no land neighbors (islands).
  correctNeighborIso3s: readonly string[];
  // Countries inside the active Study spotlight subregion, tinted with an
  // ambient ochre wash. Empty when no spotlight is active.
  spotlightIso3Set: ReadonlySet<string>;
  // [lon, lat] of the correct country's capital during a wrong/skipped
  // reveal; null when feedback is null, kind === "correct", or the country
  // has no capital (e.g. Antarctica). Drives the capital-marker dot.
  revealCapitalLonLat: [number, number] | null;
  // Active continent filter — drives the resting-zoom frame so a filtered
  // pool (e.g. Europe only) lands the user near their selection instead of
  // on the full world map.
  selectedContinents: readonly Continent[];
  isoFromNumeric: (numeric: string) => string | undefined;
  numericFromIso3: (iso3: string) => string | undefined;
  isInScope: (iso3: string) => boolean;
  onCountryClick: (iso3: string) => void;
  // When false, country clicks are suppressed. Used by Study mode's
  // CaughtUp banner so a stray click doesn't bypass it.
  interactive?: boolean;
  // Active theme palette — passed in so SVG fill/stroke values stay as
  // literal hex strings (var() refs don't interpolate reliably across
  // animated attribute changes; see CLAUDE.md).
  palette: Palette;
};

export function WorldMap({
  mode,
  highlightedIso3,
  feedback,
  showLabelsOnReveal,
  correctNeighborIso3s,
  spotlightIso3Set,
  revealCapitalLonLat,
  selectedContinents,
  isoFromNumeric,
  numericFromIso3,
  isInScope,
  onCountryClick,
  interactive = true,
  palette,
}: Props) {
  const neighborSet = useMemo(
    () => new Set(correctNeighborIso3s),
    [correctNeighborIso3s],
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  // Seed from the resting frame so the first paint already matches what
  // the mount effect will sync into d3-zoom — otherwise `isPanned` would
  // briefly be true and flash the Reset button on load with a filtered
  // continent set.
  const [transform, setTransform] = useState<ZoomTransform>(() =>
    computeBaseTransform(selectedContinents),
  );
  // Rendered SVG dimensions in CSS pixels — used to scale label em so
  // the on-screen label size stays readable on mobile (~375px) without
  // ballooning on large desktops (~1920px+). Tracks both axes because
  // preserveAspectRatio="xMidYMid meet" uses the smaller of W/H ratios.
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .translateExtent([
        [0, 0],
        [W, H],
      ])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        setTransform(event.transform);
      });
    zoomRef.current = z;
    svg.call(z);
    return () => {
      svg.on(".zoom", null);
    };
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      // Dedupe — the observer can fire with unchanged dims (e.g. on
      // visibility transitions) and would otherwise force a re-render.
      setSvgSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // On wrong/skipped, frame the correct country. On wrong, also frame the
  // country the user clicked so they get spatial context (close miss vs.
  // way off). Skips have no second reference point.
  const revealCorrectIso3 =
    feedback && feedback.kind !== "correct" ? feedback.correctIso3 : null;
  const revealWrongIso3 =
    feedback?.kind === "wrong" && feedback.answerIso3 !== feedback.correctIso3
      ? feedback.answerIso3
      : null;

  useEffect(() => {
    if (!revealCorrectIso3) return;
    const svgEl = svgRef.current;
    const zoomB = zoomRef.current;
    if (!svgEl || !zoomB) return;
    const numeric = numericFromIso3(revealCorrectIso3);
    if (!numeric) return;
    // Frame the largest clipped ring rather than pathGen.bounds(feat) —
    // for antimeridian-crossing features (Fiji, Russia, Antarctica) the
    // raw feature bounds span the whole map width, which collapses the
    // zoom factor to ~1 and the user never lands on the country.
    const label = LABELS_BY_NUMERIC.get(numeric);
    if (!label) return;
    const wrongNumeric = revealWrongIso3
      ? numericFromIso3(revealWrongIso3)
      : undefined;
    const wrongLabel = wrongNumeric
      ? LABELS_BY_NUMERIC.get(wrongNumeric) ?? null
      : null;

    const neighborBounds: Label[] = [];
    for (const iso3 of correctNeighborIso3s) {
      const n = numericFromIso3(iso3);
      const lab = n ? LABELS_BY_NUMERIC.get(n) : undefined;
      if (lab) neighborBounds.push(lab);
    }

    const toTransform = (t: Target) =>
      zoomIdentity.translate(W / 2 - t.cx * t.k, H / 2 - t.cy * t.k).scale(t.k);

    const reduced = prefersReducedMotion();
    // Stage-1 frame for a wrong click — only when the clicked and correct
    // countries fit together at a meaningful zoom (tryFitUnion returns null
    // when the union would need k < MIN_ZOOM). The final frame is always the
    // correct country + its neighbors.
    const stage1Fit = wrongLabel ? tryFitUnion([label, wrongLabel]) : null;
    const finalTarget = toTransform(
      computeRevealTarget(label, null, neighborBounds),
    );
    // Unnamed transitions on purpose: d3-zoom's gesture handlers call the
    // default-name interrupt(this), so a user pan/pinch mid-reveal cancels
    // the animation and takes over. They also supersede each other, so the
    // dismiss/base effects' transitions naturally take over when feedback
    // clears — no manual interrupt/cleanup needed.
    const sel = select(svgEl);

    if (stage1Fit && !reduced) {
      // Two-stage: frame both countries, hold, then settle on correct +
      // neighbors. The chained transition starts when the first ends; the
      // delay is the hold at the both-countries frame.
      sel
        .transition()
        .duration(REVEAL_STAGE1_MS)
        .call(zoomB.transform, toTransform(stage1Fit))
        .transition()
        .delay(REVEAL_HOLD_MS)
        .duration(REVEAL_STAGE2_MS)
        .call(zoomB.transform, finalTarget);
    } else {
      // Far miss / skip / reduced motion: one smooth transition to the final
      // frame (no intermediate both-countries stop, no hold).
      sel
        .transition()
        .duration(reduced ? 0 : REVEAL_STAGE2_MS)
        .call(zoomB.transform, finalTarget);
    }
  }, [revealCorrectIso3, revealWrongIso3, correctNeighborIso3s, numericFromIso3]);

  const baseTransform = useMemo<ZoomTransform>(
    () => computeBaseTransform(selectedContinents),
    [selectedContinents],
  );

  const hasFeedback = feedback !== null;
  const prevHadFeedbackRef = useRef(false);
  useEffect(() => {
    const wasShown = prevHadFeedbackRef.current;
    prevHadFeedbackRef.current = hasFeedback;
    if (!wasShown || hasFeedback) return;
    if (!svgRef.current || !zoomRef.current) return;
    const duration = prefersReducedMotion() ? 0 : 450;
    select(svgRef.current)
      .transition()
      .duration(duration)
      .call(zoomRef.current.transform, baseTransform);
  }, [hasFeedback, baseTransform]);

  // Apply the resting frame on first mount (instant, so the map appears
  // already framed instead of gliding in) and on subsequent continent-
  // filter changes (animated). Defers to the reveal-zoom effect while
  // feedback is showing.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!svgRef.current || !zoomRef.current) return;
    if (hasFeedback) return;
    const sel = select(svgRef.current);
    if (!didMountRef.current) {
      didMountRef.current = true;
      sel.call(zoomRef.current.transform, baseTransform);
      return;
    }
    const duration = prefersReducedMotion() ? 0 : 450;
    sel.transition().duration(duration).call(zoomRef.current.transform, baseTransform);
    // hasFeedback intentionally excluded — when feedback clears the
    // dedicated effect above handles the return-to-base animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseTransform]);

  const resetView = () => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.transform, baseTransform);
  };

  const isClickMode = interactive && mode === "name-to-click" && !feedback;
  const isPanned = transform !== baseTransform;

  // The effective projection-to-pixel scale matches preserveAspectRatio
  // ="xMidYMid meet": the smaller of the two axis ratios. Using width
  // alone would be wrong on landscape containers wider than the
  // viewBox's 2:1 ratio (where height is the constraint and the map is
  // letterboxed horizontally). Falls back to LABEL_EM until the resize
  // observer reports dimensions.
  const effectiveScale =
    svgSize.width > 0 && svgSize.height > 0
      ? Math.min(svgSize.width / W, svgSize.height / H)
      : 0;
  const labelEm = effectiveScale > 0 ? TARGET_LABEL_PX / effectiveScale : LABEL_EM;

  const labelFontSize = fontSizeFor(transform.k, labelEm);
  // Use rendered map width (effectiveScale * W), not container width — on
  // letterboxed viewports the container is wider than the actual map.
  const renderedMapWidth = effectiveScale * W;
  const oceanScreenPx = Math.max(
    OCEAN_MIN_PX,
    Math.min(OCEAN_MAX_PX, renderedMapWidth * OCEAN_PX_PER_SVG_PX),
  );
  const baseOceanEm =
    effectiveScale > 0 ? oceanScreenPx / effectiveScale : LABEL_EM;
  const oceanLabelFontSize =
    baseOceanEm / Math.pow(transform.k, 1 - OCEAN_ZOOM_GROWTH);

  // Reveal targets — countries that must always render their label.
  // Always the answer; on a wrong click, also the country the user
  // clicked (so they see "you clicked here, the answer was there").
  const revealIso3s = useMemo(() => {
    const set = new Set<string>();
    if (revealCorrectIso3) set.add(revealCorrectIso3);
    if (revealWrongIso3) set.add(revealWrongIso3);
    // M2: neighbors of the correct country bypass scope, fit-check, and
    // obstacle rejection so the spatial-name binding completes — without
    // labels the muted-blue fill alone doesn't tell you which country is
    // which.
    for (const iso3 of correctNeighborIso3s) set.add(iso3);
    return set;
  }, [revealCorrectIso3, revealWrongIso3, correctNeighborIso3s]);

  // Ocean labels participate in the country-label collision graph as
  // fixed obstacles — country labels yield to oceans (reveal targets
  // bypass). Memoized on font size so pan/zoom doesn't rebuild.
  const oceanObstacles = useMemo<Rect[]>(() => {
    const pad = oceanLabelFontSize * COLLISION_PADDING;
    const lineHeight = oceanLabelFontSize;
    const oceanLineLen = "Ocean".length;
    return OCEAN_LABELS.map((o) => {
      const longestChars = Math.max(o.qualifier.length, oceanLineLen);
      const halfW = (longestChars * oceanLabelFontSize * GLYPH_W_RATIO) / 2 + pad;
      const halfH = lineHeight + pad;
      return {
        x0: o.cx - halfW,
        x1: o.cx + halfW,
        y0: o.cy - halfH,
        y1: o.cy + halfH,
      };
    });
  }, [oceanLabelFontSize]);

  // Compute the visible label set on every zoom change while a reveal is
  // showing. Memoized so pure pans (which re-render but don't change k)
  // don't redo the O(N²) collision pass.
  const visibleLabels = useMemo(
    () =>
      revealCorrectIso3 && showLabelsOnReveal
        ? computeVisibleLabels(LABELS, {
            k: transform.k,
            em: labelEm,
            effectiveScale,
            isInScope,
            isoFromNumeric,
            revealIso3s,
            obstacles: oceanObstacles,
          })
        : [],
    [
      revealCorrectIso3,
      showLabelsOnReveal,
      transform.k,
      labelEm,
      effectiveScale,
      isInScope,
      isoFromNumeric,
      revealIso3s,
      oceanObstacles,
    ],
  );

  // Project the reveal capital once per change; the projection itself is
  // module-level and never moves, so this only runs when the answer flips.
  // Suppress the dot when the capital projects outside the answer country's
  // drawn geometry (+ a small slack for generalized coastlines): at 110m the
  // capital's island may not be rendered, and the reveal zoom would otherwise
  // strand the dot in open ocean. The capital name still shows in ControlZone.
  const capitalDotXY = useMemo(() => {
    if (!revealCapitalLonLat || !revealCorrectIso3) return null;
    const xy = projection(revealCapitalLonLat);
    if (!xy) return null;
    const numeric = numericFromIso3(revealCorrectIso3);
    const b = numeric ? BOUNDS_BY_NUMERIC.get(numeric) : undefined;
    if (!b) return null;
    const m = 2; // px slack — keeps coastal capitals (Dakar, Tripoli) drawn
    if (
      xy[0] < b[0][0] - m ||
      xy[0] > b[1][0] + m ||
      xy[1] < b[0][1] - m ||
      xy[1] > b[1][1] + m
    ) {
      return null;
    }
    return xy;
  }, [revealCapitalLonLat, revealCorrectIso3, numericFromIso3]);

  return (
    <div
      className="parchment-grain relative h-full w-full overflow-hidden [overscroll-behavior:none]"
      style={{ backgroundColor: palette.oceanTint }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full touch-none"
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform={transform.toString()}>
          {/* Graticule — period-cartography grid behind the country
              paths. Pointer-events disabled so it never intercepts
              clicks. */}
          <path
            d={GRATICULE_D}
            fill="none"
            stroke={palette.border}
            strokeWidth={0.25}
            vectorEffect="non-scaling-stroke"
            opacity={0.18}
            pointerEvents="none"
          />
          {PATHS.map((p) => {
            const iso3 = p.numericId ? isoFromNumeric(p.numericId) : undefined;
            const inScope = iso3 ? isInScope(iso3) : false;
            const fill = fillFor(
              {
                iso3,
                highlightedIso3,
                feedback,
                inScope,
                neighborSet,
                spotlightSet: spotlightIso3Set,
              },
              palette,
            );
            const clickable = isClickMode && Boolean(iso3) && inScope;
            // Glow pulse on the country the user just got right — the map
            // half of the correct-answer celebration (the panel shows
            // CorrectHero). Animates `filter` only, so it doesn't fight the
            // zoom <g>'s transform.
            const correctPulse =
              feedback?.kind === "correct" && iso3 === feedback.correctIso3;
            const className = [
              clickable && "country-clickable cursor-pointer",
              correctPulse && "correct-pulse",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <path
                key={p.key}
                d={p.d}
                fill={fill}
                stroke={palette.border}
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
                className={className}
                onClick={clickable && iso3 ? () => onCountryClick(iso3) : undefined}
                style={{ transition: "fill 200ms ease, filter 100ms ease" }}
              />
            );
          })}
          <g
            style={{
              fontStyle: "italic",
              letterSpacing: "0.08em",
              fontWeight: 500,
              pointerEvents: "none",
            }}
          >
            {OCEAN_LABELS.map((o) => (
              <text
                key={o.qualifier}
                x={o.cx}
                y={o.cy}
                fontSize={oceanLabelFontSize}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={palette.oceanLabel}
                stroke={palette.oceanTint}
                strokeWidth={oceanLabelFontSize * 0.22}
                paintOrder="stroke"
              >
                <tspan x={o.cx} dy="-0.55em">{o.qualifier}</tspan>
                <tspan x={o.cx} dy="1.1em">Ocean</tspan>
              </text>
            ))}
          </g>
          {visibleLabels.map((l) => (
            <text
              key={l.numericId}
              x={l.cx}
              y={l.cy}
              fontSize={labelFontSize}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={palette.border}
              stroke={palette.oceanTint}
              strokeWidth={labelFontSize * 0.22}
              paintOrder="stroke"
              style={{ pointerEvents: "none" }}
            >
              {l.name}
            </text>
          ))}
          {/* Capital marker — drawn after labels so the location signal wins
              over the (mostly redundant) country label on miss-reveal.
              Radii divided by transform.k so the dot stays a constant ~4px
              halo / 2.5px center regardless of reveal zoom (labels and path
              strokes use the same counter-scale convention). */}
          {capitalDotXY && (
            <g aria-hidden="true" style={{ pointerEvents: "none" }}>
              <circle
                cx={capitalDotXY[0]}
                cy={capitalDotXY[1]}
                r={4 / transform.k}
                fill={palette.capitalDotHalo}
              />
              <circle
                cx={capitalDotXY[0]}
                cy={capitalDotXY[1]}
                r={2.5 / transform.k}
                fill={palette.capitalDot}
              />
            </g>
          )}
        </g>
      </svg>
      {/* Edge vignette — CSS radial gradient on the wrapper so it scales
          with the actual viewport regardless of SVG letterboxing. Faint
          ink at the corners suggests aged parchment held under light. */}
      <div className="absolute inset-0 pointer-events-none map-vignette" />
      {/* Title cartouche. DOM overlay so it sits in the actual viewport
          corner regardless of how the SVG letterboxes its content. */}
      <Wordmark />
      {isPanned && (
        <button
          type="button"
          onClick={resetView}
          aria-label="Reset map view"
          className="absolute top-2 right-2 min-h-11 min-w-11 px-3 rounded-full border border-ink-faded bg-parchment-base/90 backdrop-blur text-sm text-ink-deep shadow-sm hover:bg-parchment-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
        >
          Reset
        </button>
      )}
    </div>
  );
}
