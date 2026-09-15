// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { emptyStore, saveStore } from "./srs";

const realStorage = Object.getOwnPropertyDescriptor(window, "localStorage")!;

afterEach(() => {
  Object.defineProperty(window, "localStorage", realStorage);
  window.localStorage.clear();
});

describe("saveStore", () => {
  it("reports whether the write landed, so the rest card never claims a failed save", () => {
    expect(saveStore(emptyStore())).toBe(true);
    // A storage that refuses the write, as a full quota does.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        setItem: () => {
          throw new DOMException("full", "QuotaExceededError");
        },
      },
    });
    expect(saveStore(emptyStore())).toBe(false);
  });
});
