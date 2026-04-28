import { useEffect, useRef, useState } from "react";
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
import type { Feedback, Mode } from "../types";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

const W = 800;
const H = 400;

const MIN_ZOOM = 1;
// MAX_ZOOM picked to make the smallest countries comfortably clickable on
// mobile. Revisit if it's still hard to hit micro-states (e.g. Singapore).
const MAX_ZOOM = 24;

const COLOR_DEFAULT = "#e5e7eb";
const COLOR_INERT = "#f3f4f6";
const COLOR_HIGHLIGHT = "#3b82f6";
const COLOR_CORRECT = "#22c55e";
const COLOR_WRONG = "#ef4444";
const COLOR_SKIPPED = "#eab308";
const COLOR_BORDER = "#64748b";

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

type LabelItem = {
  numericId: string;
  name: string;
  cx: number;
  cy: number;
  // Bounding box of the largest projected ring, used to (a) frame the
  // reveal-zoom and (b) decide whether the label fits inside the country.
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  // True when even at moderate zoom the label can't fit inside the country
  // — i.e. small islands and microstates whose label always overflows the
  // coastline. For these, render the label regardless of zoom; gating
  // them by fit means the user has to zoom way in to ever see the name.
  bypassFit: boolean;
};

// Path strings depend only on the (module-level) projection, so they're
// computed once. During pan/zoom we re-render but the d strings stay equal.
const PATHS: PathItem[] = collection.features.map((f, i) => ({
  key: typeof f.id === "string" ? f.id : `idx-${i}`,
  numericId: typeof f.id === "string" ? f.id : null,
  d: pathGen(f) ?? "",
}));

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
function pickLargestRing(feat: Feature<Geometry>): ProjRing | null {
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
  return best;
}

// "Moderate" zoom for the bypassFit threshold — countries whose label
// can't fit at this zoom level always overflow their coastline, so we
// render their labels at any zoom rather than gating them.
const BYPASS_FIT_K = 1.5;
// 0.55 ≈ average glyph width / em, matched against the rendering check.
const GLYPH_W_RATIO = 0.55;

const LABELS: LabelItem[] = [];
for (const f of collection.features) {
  if (typeof f.id !== "string") continue;
  const name = f.properties?.name;
  if (!name) continue;
  const ring = pickLargestRing(f);
  if (!ring) continue;
  // Pole of inaccessibility — point inside the polygon furthest from any
  // edge. Beats centroid for concave shapes (e.g. Croatia's crescent
  // around Bosnia would land outside the country with a centroid).
  const [cx, cy] = polylabel([ring], 1.0);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
  const { x0, x1, y0, y1 } = ringBounds(ring);
  const bw = x1 - x0;
  const bypassFit = name.length * (8 / BYPASS_FIT_K) * GLYPH_W_RATIO > bw;
  LABELS.push({ numericId: f.id, name, cx, cy, x0, x1, y0, y1, bypassFit });
}

const LABELS_BY_NUMERIC = new Map<string, LabelItem>(
  LABELS.map((l) => [l.numericId, l]),
);

type Props = {
  mode: Mode;
  highlightedIso3: string | null;
  feedback: Feedback | null;
  showLabelsOnReveal: boolean;
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
}): string {
  const { iso3, highlightedIso3, feedback, inScope } = args;
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
  isoFromNumeric,
  numericFromIso3,
  isInScope,
  onCountryClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

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

  const revealIso3 =
    feedback && feedback.kind !== "correct" ? feedback.correctIso3 : null;

  useEffect(() => {
    if (!revealIso3) return;
    if (!svgRef.current || !zoomRef.current) return;
    const numeric = numericFromIso3(revealIso3);
    if (!numeric) return;
    // Frame the largest clipped ring rather than pathGen.bounds(feat) —
    // for antimeridian-crossing features (Fiji, Russia, Antarctica) the
    // raw feature bounds span the whole map width, which collapses the
    // zoom factor to ~1 and the user never lands on the country.
    const label = LABELS_BY_NUMERIC.get(numeric);
    if (!label) return;
    const { x0, x1, y0, y1 } = label;
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    const k = Math.min(MAX_ZOOM, 0.55 * Math.min(W / w, H / h));
    const target = zoomIdentity
      .translate(W / 2 - cx * k, H / 2 - cy * k)
      .scale(k);

    const duration = prefersReducedMotion() ? 0 : 700;
    select(svgRef.current)
      .transition()
      .duration(duration)
      .call(zoomRef.current.transform, target);
  }, [revealIso3, numericFromIso3]);

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
      .call(zoomRef.current.transform, zoomIdentity);
  }, [hasFeedback]);

  const resetView = () => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  };

  const isClickMode = mode === "name-to-click" && !feedback;
  const isPanned = transform !== zoomIdentity;

  return (
    <div className="relative h-full w-full overflow-hidden bg-sky-50 [overscroll-behavior:none]">
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
            const fill = fillFor({ iso3, highlightedIso3, feedback, inScope });
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
          {revealIso3 && showLabelsOnReveal &&
            LABELS.map((l) => {
              const iso3 = isoFromNumeric(l.numericId);
              if (!iso3) return null;
              if (!isInScope(iso3) && iso3 !== feedback?.correctIso3) return null;
              // Scaled inverse to zoom so labels stay constant-sized on screen.
              const fontSize = 8 / transform.k;
              const approxWidth = l.name.length * fontSize * GLYPH_W_RATIO;
              const bw = l.x1 - l.x0;
              if (!l.bypassFit && approxWidth > bw) return null;
              return (
                <text
                  key={l.numericId}
                  x={l.cx}
                  y={l.cy}
                  fontSize={fontSize}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#0f172a"
                  stroke="white"
                  strokeWidth={fontSize * 0.18}
                  paintOrder="stroke"
                  style={{ pointerEvents: "none", fontWeight: 500 }}
                >
                  {l.name}
                </text>
              );
            })}
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
