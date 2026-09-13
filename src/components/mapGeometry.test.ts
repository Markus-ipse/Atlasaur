import { describe, expect, it } from "vitest";
import countriesData from "../data/countries.json";
import { ALL_CONTINENTS, type Country } from "../types";
import {
  LABELS_BY_NUMERIC,
  MARKER_EXTENT_SVG,
  MARKER_LABELS,
  MARKER_RADIUS_PX,
  frameFor,
  projection,
} from "./mapGeometry";
import { H, W, visibleFrame } from "./revealZoom";

const COUNTRIES = countriesData as Country[];
const MARKERS = COUNTRIES.filter((c) => c.marker);

describe("markers (R3.4)", () => {
  it("gives every country in the table a label, as a shape or a marker", () => {
    const unlabelled = COUNTRIES.filter((c) => !LABELS_BY_NUMERIC.has(c.numeric));
    expect(unlabelled.map((c) => c.iso3)).toEqual([]);
  });

  it("draws the countries the topology cannot as markers", () => {
    expect(MARKERS.map((c) => c.iso3).sort()).toEqual([
      "AND", "ATG", "BHR", "BRB", "COM", "CPV", "DMA", "FSM", "GRD", "KIR",
      "KNA", "LCA", "LIE", "MCO", "MDV", "MHL", "MLT", "MUS", "NRU", "PLW",
      "SGP", "SMR", "STP", "SYC", "TON", "TUV", "VAT", "VCT", "WSM",
    ]);
    expect(MARKER_LABELS).toHaveLength(MARKERS.length);
  });

  it("draws every dot whole at a phone's world view", () => {
    // A 320 px map, the narrowest phone; the dot's on-screen radius plus
    // its outline must clear every edge.
    const unitsPerPx = W / 320;
    const r = (MARKER_RADIUS_PX + 1) * unitsPerPx;
    const clipped = MARKER_LABELS.filter((l) => l.cx - r < 0 || l.cx + r > W || l.cy - r < 0 || l.cy + r > H);
    expect(clipped.map((l) => l.name)).toEqual([]);
  });

  it("puts each marker at its projected capital, under its map name", () => {
    for (const c of MARKERS) {
      const label = LABELS_BY_NUMERIC.get(c.numeric)!;
      const [x, y] = projection(c.capitalLonLat!)!;
      expect(label.marker).toBe(true);
      expect(label.cx).toBeCloseTo(x);
      expect(label.cy).toBeCloseTo(y);
      expect(label.x1 - label.x0).toBeCloseTo(MARKER_EXTENT_SVG);
      expect(label.area).toBe(0);
      expect(label.name).toBe(c.mapName ?? c.name);
    }
  });
});

describe("frameFor", () => {
  // The markers of `group` that fall outside the frame fitted to it, as the
  // map would show that frame on a 2:1 screen; null when there is no frame.
  function markersOffFrame(group: readonly Country[]): string[] | null {
    const fit = frameFor(group.map((c) => c.numeric));
    if (!fit) return null;
    const f = visibleFrame({ x: W / 2 - fit.cx * fit.k, y: H / 2 - fit.cy * fit.k, k: fit.k });
    return group
      .filter((c) => c.marker)
      .filter((c) => {
        const l = LABELS_BY_NUMERIC.get(c.numeric)!;
        return l.cx < f.x0 || l.cx > f.x1 || l.cy < f.y0 || l.cy > f.y1;
      })
      .map((c) => c.iso3);
  }

  it("shows every continent's markers at its filter frame", () => {
    const off: string[] = [];
    for (const continent of ALL_CONTINENTS) {
      const pool = COUNTRIES.filter((c) => c.continent === continent && !c.territory);
      off.push(...(markersOffFrame(pool) ?? []));
    }
    // Samoa and Tonga included: the map's edge is at 168.4°W, east of both.
    expect(off).toEqual([]);
  });

  it("keeps Oceania's filter frame zoomed in", () => {
    const oceania = COUNTRIES.filter((c) => c.continent === "Oceania" && !c.territory);
    // The frame Oceania had before R3.4, when Samoa and Tonga were drawn
    // at the far left and a frame that showed them was the whole world.
    expect(frameFor(oceania.map((c) => c.numeric))!.k).toBeGreaterThan(1.5);
  });

  it("shows every marker in its subregion's frame, where the subregion has shapes to fit", () => {
    const subregions = [...new Set(COUNTRIES.map((c) => c.subregion))];
    const off: string[] = [];
    const unframed: string[] = [];
    for (const s of subregions) {
      const group = COUNTRIES.filter((c) => c.subregion === s);
      const result = markersOffFrame(group);
      if (result === null) unframed.push(s);
      else off.push(...result);
    }
    expect(off).toEqual([]);
    // Antarctica spans the map; the two Pacific subregions are all markers.
    // A small card there keeps the filter's frame and relies on its hit disc.
    expect(unframed.sort()).toEqual(["Antarctica", "Micronesia", "Polynesia"]);
  });
});
