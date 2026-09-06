// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CorrectHero } from "./CorrectHero";
import type { Country } from "../types";

const FRANCE: Country = {
  numeric: "250",
  iso3: "FRA",
  name: "France",
  aliases: [],
  continent: "Europe",
  subregion: "Western Europe",
  capital: "Paris",
  capitalLonLat: [2.33, 48.87],
  neighbors: [],
  sizeTier: 2,
  notabilityTier: 2,
};

describe("CorrectHero — ceremony", () => {
  afterEach(cleanup);

  it("names the country and says nothing else on an ordinary answer", () => {
    const { container } = render(
      <CorrectHero current={FRANCE} streak={3} milestone={null} />,
    );
    expect(container.textContent).toContain("France");
    expect(container.textContent).not.toContain("now on your map");
    expect(container.textContent).not.toContain("A steady hand");
  });

  it("remarks on a run at the thresholds only", () => {
    const { container } = render(
      <CorrectHero current={FRANCE} streak={5} milestone={null} />,
    );
    expect(container.textContent).toContain("A steady hand.");
    cleanup();

    const { container: six } = render(
      <CorrectHero current={FRANCE} streak={6} milestone={null} />,
    );
    expect(six.textContent).not.toContain("A steady hand.");
  });

  it("marks a country landing on the map", () => {
    const { container } = render(
      <CorrectHero
        current={FRANCE}
        streak={3}
        milestone={{ iso3: "FRA", name: "France", continentComplete: null }}
      />,
    );
    expect(container.textContent).toContain("France, now on your map.");
  });

  it("presses a wax seal when a continent is finished", () => {
    const { container } = render(
      <CorrectHero
        current={FRANCE}
        streak={3}
        milestone={{ iso3: "FRA", name: "France", continentComplete: "Europe" }}
      />,
    );
    expect(container.textContent).toContain("Europe complete.");
    expect(container.querySelector(".wax-seal")).not.toBeNull();
    // The seal supersedes the country line; two ceremonies at once would be
    // the pile-on the house style exists to avoid.
    expect(container.textContent).not.toContain("now on your map");
  });

  it("lets a milestone supersede a streak note landing on the same answer", () => {
    const { container } = render(
      <CorrectHero
        current={FRANCE}
        streak={5}
        milestone={{ iso3: "FRA", name: "France", continentComplete: null }}
      />,
    );
    expect(container.textContent).toContain("now on your map");
    expect(container.textContent).not.toContain("A steady hand");
  });
});
