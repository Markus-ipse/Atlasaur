import { describe, expect, it } from "vitest";
import countriesData from "../data/countries.json";
import type { Country } from "../types";
import { LABELS_BY_NUMERIC, polygonsFor } from "./mapGeometry";
import { H, MIN_ZOOM, W, computeRevealTarget, visibleFrame, widenForContext } from "./revealZoom";
import { LABEL_EM, TARGET_LABEL_PX, pinOffFrameLabels, type Label } from "./labelLayout";
import { pointInPolygon, type Polygon } from "./polygon";

const COUNTRIES = countriesData as Country[];
const BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));

function labelOf(iso3: string): Label | undefined {
  const c = BY_ISO3.get(iso3);
  return c ? LABELS_BY_NUMERIC.get(c.numeric) : undefined;
}

// The frame the reveal settles on for `answer`, as WorldMap computes it with
// the map resting at the whole world. A continent filter or the R1.6
// small-country frame floors the pull-back higher and is not surveyed here;
// the claims below are for the world resting frame.
function finalFrame(answer: Label, neighbours: Label[]) {
  const t = widenForContext(computeRevealTarget(answer, null, neighbours), answer, MIN_ZOOM);
  return { k: t.k, ...visibleFrame({ x: W / 2 - t.cx * t.k, y: H / 2 - t.cy * t.k, k: t.k }) };
}

describe("reveal survey over the real table", () => {
  it("counts answers with a neighbour label anchor outside the final frame", () => {
    const offFrame: string[] = [];
    for (const c of COUNTRIES) {
      const answer = labelOf(c.iso3);
      if (!answer || c.neighbors.length === 0) continue;
      const neighbours = c.neighbors.map(labelOf).filter((l): l is Label => !!l);
      const f = finalFrame(answer, neighbours);
      const out = neighbours.filter((n) => n.cx < f.x0 || n.cx > f.x1 || n.cy < f.y0 || n.cy > f.y1);
      if (out.length) offFrame.push(`${c.iso3}: ${out.map((n) => n.name).join(", ")}`);
    }
    // R2.3 left these 26, every one an answer beside a giant neighbour that
    // computeRevealTarget drops from the frame on purpose. R3.4 added three
    // of the same kind: Andorra, Monaco and Vatican City are points whose
    // only neighbours are countries a thousand times their size. If this
    // list moves, the topology or the framing changed; look before re-pinning.
    expect(offFrame).toEqual([
      "AND: Spain, France",
      "AZE: Russia",
      "BLR: Russia",
      "BLZ: Mexico",
      "BTN: China, India",
      "DNK: Germany",
      "GNQ: Cameroon",
      "EST: Russia",
      "SWZ: Mozambique, South Africa",
      "FIN: Russia",
      "GUF: Brazil",
      "GEO: Russia",
      "GTM: Mexico",
      "GNB: Senegal",
      "KWT: Iraq, Saudi Arabia",
      "KGZ: China",
      "LVA: Russia",
      "LTU: Russia",
      "LUX: France",
      "MCO: France",
      "NPL: China",
      "PRK: Russia",
      "NOR: Russia",
      "POL: Russia",
      "SUR: Brazil",
      "TLS: Indonesia",
      "UKR: Russia",
      "URY: Brazil",
      "VAT: Italy",
    ]);
  });

  const onLand = (p: readonly [number, number], polygons: readonly Polygon[]) =>
    polygons.some((poly) => pointInPolygon(p, poly));

  // Label em at the desktop reference and on a 390px phone, where the label
  // is far larger against the frame (WorldMap scales em by the rendered
  // width) and a visible piece's pole is more often already taken.
  const PHONE_EM = TARGET_LABEL_PX / (390 / W);

  it.each([
    ["desktop", LABEL_EM],
    ["phone", PHONE_EM],
  ])("moves every off-frame neighbour label onto that neighbour's visible land on %s, and drops none", (_, em) => {
    const dropped: string[] = [];
    const escaped: string[] = [];
    const offLand: string[] = [];
    for (const c of COUNTRIES) {
      const answer = labelOf(c.iso3);
      if (!answer || c.neighbors.length === 0) continue;
      const neighbours = c.neighbors.map(labelOf).filter((l): l is Label => !!l);
      const f = finalFrame(answer, neighbours);
      const placed = pinOffFrameLabels([answer, ...neighbours], {
        frame: f,
        k: f.k,
        em,
        answerNumericId: answer.numericId,
        revealNumerics: new Set([answer.numericId, ...neighbours.map((n) => n.numericId)]),
        polygonsOf: polygonsFor,
      });
      for (const n of neighbours) {
        const p = placed.find((q) => q.label.numericId === n.numericId);
        if (!p) dropped.push(`${c.iso3}: ${n.name}`);
        else if (p.x < f.x0 || p.x > f.x1 || p.y < f.y0 || p.y > f.y1) escaped.push(`${c.iso3}: ${n.name}`);
        else if (p.pinned && !onLand([p.x, p.y], polygonsFor(n.numericId)))
          offLand.push(`${c.iso3}: ${n.name}`);
      }
    }
    expect(escaped).toEqual([]);
    expect(offLand).toEqual([]);
    expect(dropped).toEqual([]);
  });
});
