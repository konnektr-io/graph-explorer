import { expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// jsdom's localStorage can be missing/non-functional depending on the jsdom
// build; zustand's persist middleware calls setItem on every state change, so
// provide a working in-memory fallback when it's broken (vitest env, issue #22 work).
const ls = globalThis.localStorage;
let storageWorks = false;
try {
  const k = "__vitest_probe__";
  ls?.setItem(k, "1");
  storageWorks = ls?.getItem(k) === "1";
  ls?.removeItem(k);
} catch {
  storageWorks = false;
}
if (!storageWorks) {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => void mem.clear(),
      key: (i: number) => Array.from(mem.keys())[i] ?? null,
      get length() {
        return mem.size;
      },
    },
  });
}

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
