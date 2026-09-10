import { expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with @testing-library/jest-dom matchers
expect.extend(matchers);

// jsdom does not implement ResizeObserver, but the Radix primitives the app is
// built on (ScrollArea, Popover, ...) instantiate one on mount. A no-op stub
// lets component tests render them instead of crashing on the missing global.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub;
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});
