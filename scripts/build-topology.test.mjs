import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { feature, neighbors as topoNeighbors } from "topojson-client";
import { splitFrenchGuiana } from "./build-topology.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

async function loadUpstream() {
  return JSON.parse(
    await readFile(
      resolve(root, "node_modules/world-atlas/countries-110m.json"),
      "utf8",
    ),
  );
}

describe("splitFrenchGuiana", () => {
  it("removes one polygon from France and adds a French Guiana feature", async () => {
    const topology = await loadUpstream();
    const gufIdx = splitFrenchGuiana(topology);
    expect(gufIdx).toBe(0);
    const geoms = topology.objects.countries.geometries;
    const fra = geoms.find((g) => g.id === "250");
    expect(fra?.type).toBe("MultiPolygon");
    expect(fra?.arcs).toHaveLength(2);
    const guf = geoms.find((g) => g.id === "254");
    expect(guf).toBeDefined();
    expect(guf?.type).toBe("Polygon");
    expect(guf?.properties?.name).toBe("French Guiana");
  });

  it("places GUF in South America (bbox sanity)", async () => {
    const topology = await loadUpstream();
    splitFrenchGuiana(topology);
    const gufFeature = feature(topology, topology.objects.countries).features.find(
      (f) => f.id === "254",
    );
    const ring = gufFeature.geometry.coordinates[0];
    let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
    for (const [lon, lat] of ring) {
      if (lon < lonMin) lonMin = lon;
      if (lon > lonMax) lonMax = lon;
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
    }
    expect(lonMin).toBeGreaterThan(-55);
    expect(lonMax).toBeLessThan(-50);
    expect(latMin).toBeGreaterThan(1);
    expect(latMax).toBeLessThan(7);
  });

  it("produces correct land adjacencies after the split", async () => {
    const topology = await loadUpstream();
    splitFrenchGuiana(topology);
    const geoms = topology.objects.countries.geometries;
    const adj = topoNeighbors(geoms);
    const indexById = new Map(geoms.map((g, i) => [g.id, i]));
    const idsOf = (id) =>
      new Set(adj[indexById.get(id)].map((j) => geoms[j].id));

    const fra = idsOf("250");
    const guf = idsOf("254");
    const bra = idsOf("076");
    const sur = idsOf("740");

    expect(fra).toEqual(new Set(["056", "276", "380", "442", "724", "756"])); // BEL DEU ITA LUX ESP CHE
    expect(guf).toEqual(new Set(["076", "740"])); // BRA SUR
    expect(bra.has("254")).toBe(true);
    expect(bra.has("250")).toBe(false);
    expect(sur.has("254")).toBe(true);
    expect(sur.has("250")).toBe(false);
  });

  it("fails loudly if re-run on an already-split topology (upstream-change canary)", async () => {
    const topology = await loadUpstream();
    splitFrenchGuiana(topology);
    expect(() => splitFrenchGuiana(topology)).toThrow(/exactly 3 polygons/);
  });
});
