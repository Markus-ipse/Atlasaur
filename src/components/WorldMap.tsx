import { useEffect, useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoPath, geoStream } from "d3-geo";
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
import topology from "world-atlas/countries-110m.json";
import countriesData from "../data/countries.json";
import { ALL_CONTINENTS, type Continent, type Country, type Feedback, type Mode } from "../types";
import {
  W,
  H,
  MIN_ZOOM,
  MAX_ZOOM,
  computeRevealTarget,
  tryFitUnion,
  type Bounds,
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

const COLOR_DEFAULT = "#cbd5e1";
const COLOR_INERT = "#e2e8f0";
const COLOR_HIGHLIGHT = "#3b82f6";
const COLOR_CORRECT = "#22c55e";
const COLOR_WRONG = "#ef4444";
const COLOR_SKIPPED = "#eab308";
// Muted tone for the correct country's land neighbors at miss-reveal —
// elaborative spatial cue, never the primary signal. Sits visually under
// the correct/wrong fills so it doesn't compete with them.
const COLOR_NEIGHBOR = "#bfdbfe";
const COLOR_BORDER = "#475569";
const COLOR_OCEAN_LABEL = "#0369a1";
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

// Continent → numeric ids, used to compute the resting-zoom frame from
// `selectedContinents`. Built once at module load; the continent assignment
// is static per country.
const NUMERICS_BY_CONTINENT = new Map<Continent, string[]>();
for (const c of countriesData as Country[]) {
  const list = NUMERICS_BY_CONTINENT.get(c.continent);
  if (list) list.push(c.numeric);
  else NUMERICS_BY_CONTINENT.set(c.continent, [c.numeric]);
}

type Props = {
  mode: Mode;
  highlightedIso3: string | null;
  feedback: Feedback | null;
  showLabelsOnReveal: boolean;
  // Neighbors of the correct country, painted in a muted tone during a
  // wrong/skipped reveal. Empty when feedback is null or the correct
  // country has no land neighbors (islands).
  correctNeighborIso3s: readonly string[];
  // Active continent filter — drives the resting-zoom frame so a filtered
  // pool (e.g. Europe only) lands the user near their selection instead of
  // on the full world map.
  selectedContinents: readonly Continent[];
  isoFromNumeric: (numeric: string) => string | undefined;
  numericFromIso3: (iso3: string) => string | undefined;
  isInScope: (iso3: string) => boolean;
  onCountryClick: (iso3: string) => void;
};

function fillFor(args: {
  iso3: string | undefined;
  highlightedIso3: string | null;
  feedback: Feedback | null;
  inScope: boolean;
  neighborSet: ReadonlySet<string>;
}): string {
  const { iso3, highlightedIso3, feedback, inScope, neighborSet } = args;
  if (!iso3) return COLOR_INERT;
  if (feedback) {
    // The correct country always lights up — green when answered (right or
    // wrong, since "wrong" reveals the answer too) and yellow when skipped.
    if (feedback.correctIso3 === iso3) {
      return feedback.kind === "skipped" ? COLOR_SKIPPED : COLOR_CORRECT;
    }
    if (
      feedback.kind === "wrong" &&
      feedback.answerIso3 === iso3 &&
      feedback.answerIso3 !== feedback.correctIso3
    ) {
      return COLOR_WRONG;
    }
    // Elaborative-encoding cue: paint land neighbors of the correct country.
    // Wrong-clicked country is handled above so it stays red if it happens
    // to also be a neighbor.
    if (neighborSet.has(iso3)) return COLOR_NEIGHBOR;
  }
  if (highlightedIso3 === iso3) return COLOR_HIGHLIGHT;
  if (!inScope) return COLOR_INERT;
  return COLOR_DEFAULT;
}

export function WorldMap({
  mode,
  highlightedIso3,
  feedback,
  showLabelsOnReveal,
  correctNeighborIso3s,
  selectedContinents,
  isoFromNumeric,
  numericFromIso3,
  isInScope,
  onCountryClick,
}: Props) {
  const neighborSet = useMemo(
    () => new Set(correctNeighborIso3s),
    [correctNeighborIso3s],
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
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
    if (!svgRef.current || !zoomRef.current) return;
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

    const { k, cx, cy } = computeRevealTarget(label, wrongLabel, neighborBounds);
    const target = zoomIdentity
      .translate(W / 2 - cx * k, H / 2 - cy * k)
      .scale(k);

    const duration = prefersReducedMotion() ? 0 : 700;
    select(svgRef.current)
      .transition()
      .duration(duration)
      .call(zoomRef.current.transform, target);
  }, [revealCorrectIso3, revealWrongIso3, correctNeighborIso3s, numericFromIso3]);

  // Resting-zoom frame: when the user has narrowed the pool with the
  // continent filter, fit the union of those continents' countries instead
  // of returning to the full world. Reuses `tryFitUnion` from the reveal-
  // zoom math so padding/MIN_ZOOM behaviour is identical.
  const baseTransform = useMemo<ZoomTransform>(() => {
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
  }, [selectedContinents]);

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

  const isClickMode = mode === "name-to-click" && !feedback;
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

  return (
    <div className="relative h-full w-full overflow-hidden bg-sky-100 [overscroll-behavior:none]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full touch-none"
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform={transform.toString()}>
          {PATHS.map((p) => {
            const iso3 = p.numericId ? isoFromNumeric(p.numericId) : undefined;
            const inScope = iso3 ? isInScope(iso3) : false;
            const fill = fillFor({ iso3, highlightedIso3, feedback, inScope, neighborSet });
            const clickable = isClickMode && Boolean(iso3) && inScope;
            return (
              <path
                key={p.key}
                d={p.d}
                fill={fill}
                stroke={COLOR_BORDER}
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
                className={clickable ? "country-clickable cursor-pointer" : ""}
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
                fill={COLOR_OCEAN_LABEL}
                stroke="white"
                strokeWidth={oceanLabelFontSize * 0.18}
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
              fill="#0f172a"
              stroke="white"
              strokeWidth={labelFontSize * 0.18}
              paintOrder="stroke"
              style={{ pointerEvents: "none", fontWeight: 500 }}
            >
              {l.name}
            </text>
          ))}
        </g>
      </svg>
      {isPanned && (
        <button
          type="button"
          onClick={resetView}
          aria-label="Reset map view"
          className="absolute top-2 right-2 min-h-11 min-w-11 px-3 rounded-full border border-slate-300 bg-white/90 backdrop-blur text-sm text-slate-700 shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Reset
        </button>
      )}
    </div>
  );
}
