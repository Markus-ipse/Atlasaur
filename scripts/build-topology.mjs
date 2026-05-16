#!/usr/bin/env node
// Generates src/data/world-110m.json from world-atlas/countries-110m.json.
// Run: npm run build:topology  (also chained from build:countries)
//
// world-atlas at 110m resolution folds French Guiana into France's
// MultiPolygon (feature id "250") as polygon index 0. That makes GUF
// unrenderable, unlabelable, and unclickable, and it makes
// topojson-client's neighbors() infer France↔Brazil and France↔Suriname
// adjacencies via the shared coastline arcs on GUF.
//
// This script splits French Guiana out at the TopoJSON arc-reference
// layer: the underlying `topology.arcs` array is untouched, so shared
// arcs between GUF and Brazil/Suriname remain shared — they just live on
// the new GUF geometry now, not on France. After the split, neighbors()
// produces the correct adjacencies naturally and no neighborsOverride is
// needed for FRA, BRA, or SUR.
//
// The output is committed to src/data/world-110m.json and is the
// canonical topology consumed by both build-countries.mjs and WorldMap.tsx.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { feature } from "topojson-client";

// French Guiana's geographic bbox at 110m, with a margin. Surrounding
// territories (mainland France, Corsica, Brazil, Suriname) sit well
// outside this box, so a single bbox match uniquely identifies GUF
// without depending on polygon order — which lets a future world-atlas
// update fail loudly if the geometry stops looking like French Guiana.
const GUF_BBOX = { lonMin: -55, lonMax: -50, latMin: 1, latMax: 7 };

function polygonBbox(polygon) {
  const ring = polygon[0];
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
  }
  return { lonMin, lonMax, latMin, latMax };
}

function bboxInsideGuf(b) {
  return (
    b.lonMin >= GUF_BBOX.lonMin &&
    b.lonMax <= GUF_BBOX.lonMax &&
    b.latMin >= GUF_BBOX.latMin &&
    b.latMax <= GUF_BBOX.latMax
  );
}

// Mutates `topology` in place. Returns the polygon index that was
// extracted (useful for logs and tests).
export function splitFrenchGuiana(topology) {
  const geometries = topology.objects.countries.geometries;
  const fraIdx = geometries.findIndex((g) => g.id === "250");
  if (fraIdx === -1) {
    throw new Error('France (id "250") not found in topology.objects.countries.geometries.');
  }
  const fraGeom = geometries[fraIdx];
  if (fraGeom.type !== "MultiPolygon") {
    throw new Error(`Expected France to be a MultiPolygon, got ${fraGeom.type}.`);
  }
  if (fraGeom.arcs.length !== 3) {
    throw new Error(
      `Expected France to have exactly 3 polygons (mainland, Corsica, French Guiana); got ${fraGeom.arcs.length}. The world-atlas topology may have changed — review and update this script.`,
    );
  }

  // Dereference France to GeoJSON only to compute each polygon's bbox.
  // The arc-level structure we actually splice is back on the TopoJSON
  // representation below.
  const fraFeature = feature(topology, {
    type: "GeometryCollection",
    geometries: [fraGeom],
  }).features[0];

  const matchingIndices = [];
  fraFeature.geometry.coordinates.forEach((polygon, i) => {
    if (bboxInsideGuf(polygonBbox(polygon))) matchingIndices.push(i);
  });
  if (matchingIndices.length === 0) {
    throw new Error(
      "No polygon in France's MultiPolygon matches the French Guiana bbox. The world-atlas topology may have changed.",
    );
  }
  if (matchingIndices.length > 1) {
    throw new Error(
      `Expected exactly 1 French Guiana polygon, found ${matchingIndices.length} matching the bbox. Tighten GUF_BBOX or update the script.`,
    );
  }
  const gufIdx = matchingIndices[0];

  // Splice France's MultiPolygon. The new GUF geometry steals polygon
  // gufIdx (arc-ref ring-array preserved by reference, so shared arcs
  // with Brazil/Suriname stay shared in the underlying topology.arcs).
  const gufPolygonArcs = fraGeom.arcs[gufIdx];
  fraGeom.arcs = fraGeom.arcs.filter((_, i) => i !== gufIdx);

  geometries.push({
    type: "Polygon",
    arcs: gufPolygonArcs,
    id: "254",
    properties: { name: "French Guiana" },
  });

  return gufIdx;
}

// CLI entry point. Skipped when imported (e.g. from the test).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const root = resolve(__dirname, "..");
  const topology = JSON.parse(
    await readFile(
      resolve(root, "node_modules/world-atlas/countries-110m.json"),
      "utf8",
    ),
  );
  let gufIdx;
  try {
    gufIdx = splitFrenchGuiana(topology);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  await mkdir(resolve(root, "src/data"), { recursive: true });
  await writeFile(
    resolve(root, "src/data/world-110m.json"),
    JSON.stringify(topology) + "\n",
  );
  console.log(
    `Wrote src/data/world-110m.json (split French Guiana polygon ${gufIdx} out of France into id "254")`,
  );
}
