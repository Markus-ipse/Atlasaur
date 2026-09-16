// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScorePanel } from "./ScorePanel";

afterEach(cleanup);

describe("ScorePanel", () => {
  it("counts found countries without a fraction that reads as a score", () => {
    const { container } = render(
      <ScorePanel
        tally={{ size: 12, firstTry: 11, recovered: 1, stillMissed: 0, notAsked: 0 }}
      />,
    );
    expect(container.textContent).toBe("12 done·1 recovered");
    expect(container.textContent).not.toContain("/");
  });

  it("names what is waiting to be tried again and leaves out zeros", () => {
    const { container } = render(
      <ScorePanel
        tally={{ size: 12, firstTry: 8, recovered: 0, stillMissed: 1, notAsked: 3 }}
      />,
    );
    expect(container.textContent).toBe("8 done·1 to try again");
  });
});
