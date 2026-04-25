import { useEffect, useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { select } from "d3-selection";
import {
  zoom as d3zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import topology from "world-atlas/countries-110m.json";
import type { Feedback, Mode } from "../types";

const W = 800;
const H = 400;

const COLOR_DEFAULT = "#e5e7eb";
const COLOR_INERT = "#f3f4f6";
const COLOR_HIGHLIGHT = "#3b82f6";
const COLOR_CORRECT = "#22c55e";
const COLOR_WRONG = "#ef4444";
const COLOR_SKIPPED = "#eab308";

type CountryFeature = Feature<Geometry, { name?: string }>;

const collection = feature(
  topology,
  topology.objects.countries,
) as unknown as FeatureCollection<Geometry, { name?: string }>;
const projection = geoEqualEarth().fitSize([W, H], collection);
const pathGen = geoPath(projection);

type Props = {
  mode: Mode;
  highlightedIso3: string | null;
  feedback: Feedback | null;
  isoFromNumeric: (numeric: string) => string | undefined;
  onCountryClick: (iso3: string) => void;
};

function fillFor(
  iso3: string | undefined,
  highlightedIso3: string | null,
  feedback: Feedback | null,
): string {
  if (!iso3) return COLOR_INERT;
  if (feedback) {
    if (feedback.correctIso3 === iso3) {
      if (feedback.kind === "correct") return COLOR_CORRECT;
      if (feedback.kind === "wrong") return COLOR_CORRECT;
      if (feedback.kind === "skipped") return COLOR_SKIPPED;
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
  onCountryClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 12])
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

  const resetView = () => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  };

  const features = useMemo(
    () => collection.features as CountryFeature[],
    [],
  );

  const isClickMode = mode === "name-to-click" && !feedback;

  return (
    <div className="relative w-full">
      <div className="w-full max-w-5xl mx-auto aspect-[2/1] border border-slate-200 rounded-lg overflow-hidden bg-sky-50">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full touch-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <g transform={transform.toString()}>
            {features.map((f) => {
              const numeric = typeof f.id === "string" ? f.id : null;
              const iso3 = numeric ? isoFromNumeric(numeric) : undefined;
              const fill = fillFor(iso3, highlightedIso3, feedback);
              const clickable = isClickMode && Boolean(iso3);
              return (
                <path
                  key={numeric ?? f.properties.name ?? Math.random()}
                  d={pathGen(f) ?? ""}
                  fill={fill}
                  stroke="#fff"
                  strokeWidth={0.5 / transform.k}
                  className={
                    clickable
                      ? "cursor-pointer transition-[filter] duration-100 hover:brightness-95"
                      : ""
                  }
                  onClick={
                    clickable && iso3 ? () => onCountryClick(iso3) : undefined
                  }
                  style={{ transition: "fill 200ms ease" }}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <div className="mt-2 flex justify-center gap-2 text-sm text-slate-600">
        <button
          type="button"
          onClick={resetView}
          className="min-h-9 px-3 rounded border border-slate-300 hover:bg-slate-100"
        >
          Reset view
        </button>
        <span className="self-center text-slate-500">
          Drag to pan · scroll or pinch to zoom
        </span>
      </div>
    </div>
  );
}
