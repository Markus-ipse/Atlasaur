// The map's geometry, computed once at module load: the topology, the
// Equal-Earth projection, and the label anchor per country. Lives outside
// WorldMap.tsx so it can be imported by tests that survey the real country
// table (revealSurvey.test.ts) and so the component file keeps exporting
// only components, which React Fast Refresh expects. Nothing here depends on
// game state; everything depends only on the projection.

import { geoEqualEarth, geoPath, geoStream } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import polylabel from "polylabel";
import type { Topology } from "topojson-specification";
import topologyJson from "../data/world-110m.json";
import countriesData from "../data/countries.json";
import type { Country } from "../types";
import { H, W } from "./revealZoom";
import type { Label } from "./labelLayout";
import {
  largestRing,
  pointInRing,
  ringArea,
  ringBounds,
  type Polygon,
  type Ring,
} from "./polygon";

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

export function numericIdFor(f: Feature<Geometry, { name?: string }>): string | null {
  if (typeof f.id === "string") return f.id;
  const name = f.properties?.name;
  return (name && SYNTHETIC_NUMERIC_BY_TOPO_NAME.get(name)) ?? null;
}

export const collection = feature(
  topology,
  topology.objects.countries,
) as unknown as FeatureCollection<Geometry, { name?: string }>;
export const projection = geoEqualEarth().fitSize([W, H], collection);
export const pathGen = geoPath(projection);

// Stream the feature through the projection so antimeridian clipping (and
// any other projection-level clipping) happens before we see points;
// otherwise rings spanning ±180° (Fiji, Russia, Antarctica) project as a
// stripe across the whole map and polylabel lands in the ocean. The rings
// come back flat — the stream's polygon boundaries are not kept, since an
// antimeridian split emits disjoint pieces as rings of one polygon — and
// `groupPolygons` sorts holes from outers afterwards.
export function projectedRings(feat: Feature<Geometry>): Ring[] {
  const rings: Ring[] = [];
  let curRing: Ring | null = null;
  geoStream(
    feat,
    projection.stream({
      polygonStart() {},
      polygonEnd() {},
      lineStart() {
        curRing = [];
      },
      lineEnd() {
        if (curRing && curRing.length >= 3) rings.push(curRing);
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
  return rings;
}

// A polygon is an outer ring followed by its holes. The streamed rings do
// not say which is which, so a ring whose first vertex lies inside a larger
// ring of the same country is taken as that ring's hole. At 110m the only
// hole is Lesotho in South Africa; a label placed by the outer ring alone
// would sit in it.
export function groupPolygons(rings: readonly Ring[]): Polygon[] {
  const byArea = rings
    .map((ring) => ({ ring, area: ringArea(ring) }))
    .sort((a, b) => b.area - a.area);
  const polygons: Polygon[] = [];
  for (const { ring } of byArea) {
    const outer = polygons.find((poly) => pointInRing(ring[0], poly[0]));
    if (outer) outer.push(ring);
    else polygons.push([ring]);
  }
  return polygons;
}

// Every projected polygon of a country, on demand. The reveal's off-frame
// labels (R3.3a) read them all, because the part of a neighbour that touches
// the answer need not be its largest ring (Indonesia meets Timor-Leste on
// Timor, not Borneo) — but only a handful of countries per reveal, so they
// are streamed again on first use and cached rather than built for every
// country at load and held for the life of the tab.
const FEATURE_BY_NUMERIC = new Map<string, Feature<Geometry>>();
const POLYGONS_CACHE = new Map<string, readonly Polygon[]>();
export function polygonsFor(numericId: string): readonly Polygon[] {
  const hit = POLYGONS_CACHE.get(numericId);
  if (hit) return hit;
  const f = FEATURE_BY_NUMERIC.get(numericId);
  const polygons = f ? groupPolygons(projectedRings(f)) : [];
  POLYGONS_CACHE.set(numericId, polygons);
  return polygons;
}

export const LABELS: Label[] = [];
for (const f of collection.features) {
  const numericId = numericIdFor(f);
  if (!numericId) continue;
  const name = f.properties?.name;
  if (!name) continue;
  FEATURE_BY_NUMERIC.set(numericId, f);
  // Across all clipped rings, the largest by area is the country's "main"
  // landmass — that's where the label belongs (continental US, not Alaska;
  // mainland Russia, not Chukotka).
  const result = largestRing(projectedRings(f));
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

export const LABELS_BY_NUMERIC = new Map<string, Label>(
  LABELS.map((l) => [l.numericId, l]),
);
