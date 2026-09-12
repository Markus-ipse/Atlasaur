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
import { pointInRing, type Label } from "./labelLayout";

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

export type ProjRing = [number, number][];

export function ringArea(ring: ProjRing): number {
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
// stripe across the whole map and polylabel lands in the ocean. Holes are
// not distinguished: at 110m resolution real holes are rare, and antimeridian
// splits emit disjoint pieces as multiple rings of one polygon, so a strict
// outer/hole reading wouldn't be reliable anyway.
export function projectedRings(feat: Feature<Geometry>): ProjRing[] {
  const rings: ProjRing[] = [];
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

// Across all clipped rings, pick the largest by area as the country's
// "main" landmass — that's where the label belongs (continental US, not
// Alaska; mainland Russia, not Chukotka).
function pickLargestRing(
  rings: readonly ProjRing[],
): { ring: ProjRing; area: number } | null {
  let best: ProjRing | null = null;
  let bestArea = 0;
  for (const ring of rings) {
    const a = ringArea(ring);
    if (a > bestArea) {
      best = ring;
      bestArea = a;
    }
  }
  return best ? { ring: best, area: bestArea } : null;
}

// A polygon is an outer ring followed by its holes. The streamed rings do
// not say which is which, so a ring whose first vertex lies inside a larger
// ring of the same country is taken as that ring's hole. At 110m the only
// hole is Lesotho in South Africa; a label placed by the outer ring alone
// would sit in it.
export type ProjPolygon = ProjRing[];

export function groupPolygons(rings: readonly ProjRing[]): ProjPolygon[] {
  const byArea = rings
    .map((ring) => ({ ring, area: ringArea(ring) }))
    .sort((a, b) => b.area - a.area);
  const polygons: ProjPolygon[] = [];
  for (const { ring } of byArea) {
    const outer = polygons.find((poly) => pointInRing(ring[0], poly[0]));
    if (outer) outer.push(ring);
    else polygons.push([ring]);
  }
  return polygons;
}

// Every projected polygon per country, keyed by numeric. LABELS below reads
// the largest ring; the reveal's off-frame neighbour labels (R3.3a) read
// them all, because the part of a neighbour that touches the answer need not
// be its largest ring (Indonesia meets Timor-Leste on Timor, not Borneo).
export const POLYGONS_BY_NUMERIC = new Map<string, ProjPolygon[]>();

export const LABELS: Label[] = [];
for (const f of collection.features) {
  const numericId = numericIdFor(f);
  if (!numericId) continue;
  const name = f.properties?.name;
  if (!name) continue;
  const rings = projectedRings(f);
  POLYGONS_BY_NUMERIC.set(numericId, groupPolygons(rings));
  const result = pickLargestRing(rings);
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
