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

// Cleanup after each test
afterEach(() => {
  cleanup();
});
