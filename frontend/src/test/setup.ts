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

// Node 26's jsdom does not expose `localStorage`. zustand's `persist`
// middleware calls `localStorage.setItem` the moment a persisted store is
// constructed, so importing any store module throws without it. An
// in-memory stub gives the tests an isolated store to read/write against.
//
// The `--localstorage-file` warning Node emits is harmless (it only applies
// to the built-in persistence layer our stub replaces), so it is suppressed
// to keep test output readable.
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (
    warning.name === "ExperimentalWarning" &&
    /localStorage is not available/.test(warning.message)
  ) {
    return;
  }
  console.warn(warning);
});
if (typeof (globalThis as unknown as { localStorage?: unknown }).localStorage === "undefined") {
  let store: Record<string, string> = {};

  const storageStub = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };

  (globalThis as unknown as { localStorage: unknown }).localStorage = storageStub;
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});
