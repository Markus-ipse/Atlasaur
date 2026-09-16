// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TodayCard } from "./TodayCard";

afterEach(cleanup);

describe("TodayCard", () => {
  it("closes on Escape and the backdrop without taking either as Begin", () => {
    const onBegin = vi.fn();
    const onDismiss = vi.fn();
    render(
      <TodayCard
        dueCount={0}
        nextBack={null}
        newToday={0}
        day={2}
        expedition={{ kind: "fresh" }}
        onExpedition={vi.fn()}
        capitalOffer={null}
        onTryCapitals={vi.fn()}
        onBegin={onBegin}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onBegin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Begin/ }));
    expect(onBegin).toHaveBeenCalledTimes(1);
  });
});
