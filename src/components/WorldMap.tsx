import { useEffect, useRef, useState } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
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

// Path strings depend only on the (module-level) projection, so they're
// computed once. During pan/zoom we re-render but the d strings stay equal.
const PATHS: PathItem[] = collection.features.map((f, i) => ({
  key: typeof f.id === "string" ? f.id : `idx-${i}`,
  numericId: typeof f.id === "string" ? f.id : null,
  d: pathGen(f) ?? "",
}));

const FEATURE_BY_NUMERIC = new Map<
  string,
  Feature<Geometry, { name?: string }>
>();
for (const f of collection.features) {
  if (typeof f.id === "string") FEATURE_BY_NUMERIC.set(f.id, f);
}

type Props = {
  mode: Mode;
  highlightedIso3: string | null;
  feedback: Feedback | null;
  isoFromNumeric: (numeric: string) => string | undefined;
  numericFromIso3: (iso3: string) => string | undefined;
  onCountryClick: (iso3: string) => void;
};

function fillFor(
  iso3: string | undefined,
  highlightedIso3: string | null,
  feedback: Feedback | null,
): string {
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
  return COLOR_DEFAULT;
}

export function WorldMap({
  mode,
  highlightedIso3,
  feedback,
  isoFromNumeric,
  numericFromIso3,
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
    const feat = FEATURE_BY_NUMERIC.get(numeric);
    if (!feat) return;

    const [[x0, y0], [x1, y1]] = pathGen.bounds(feat);
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
            const fill = fillFor(iso3, highlightedIso3, feedback);
            const clickable = isClickMode && Boolean(iso3);
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
