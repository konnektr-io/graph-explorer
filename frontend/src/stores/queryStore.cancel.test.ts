import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQueryStore } from "@/stores/queryStore";

/**
 * Tests for query cancellation + execution timing (issue #22).
 *
 * The Azure SDK client is mocked: `queryTwins` returns an async iterable
 * whose pages we control, so tests can simulate long-running queries and
 * aborts without a network.
 */

vi.mock("@/services/digitalTwinsClientFactory", () => ({
  digitalTwinsClientFactory: vi.fn(async () => mockClient),
}));

vi.mock("@/stores/connectionStore", () => ({
  useConnectionStore: {
    getState: () => ({
      getCurrentConnection: () => ({
        id: "test-connection",
        adtHost: "test.example.com",
        authProvider: "none",
      }),
    }),
  },
}));

type AsyncPage = { value: unknown; done: false } | { done: true; value: undefined };

let mockClient: {
  queryTwins: ReturnType<typeof vi.fn>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reset the singleton store to a pre-run state between tests. */
function resetStore() {
  useQueryStore.setState({
    isExecuting: false,
    queryResults: null,
    queryError: null,
    abortController: undefined,
    lastExecutionTime: undefined,
    lastRunCancelled: false,
    queryHistory: [],
    currentQuery: "SELECT * FROM c",
  });
}

beforeEach(() => {
  resetStore();
});

describe("executeQuery timing (issue #22)", () => {
  it("records executionTime on success and keeps lastRunCancelled false", async () => {
    mockClient = {
      queryTwins: vi.fn(() => ({
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            next: async (): Promise<AsyncPage> => {
              if (i < 2) {
                i += 1;
                return { value: { id: i }, done: false };
              }
              return { done: true, value: undefined };
            },
          };
        },
      })),
    };

    await useQueryStore.getState().executeQuery("SELECT * FROM c");

    const s = useQueryStore.getState();
    expect(s.isExecuting).toBe(false);
    expect(s.lastRunCancelled).toBe(false);
    expect(s.lastExecutionTime).toBeGreaterThanOrEqual(0);
    expect(s.queryResults).toEqual([{ id: 1 }, { id: 2 }]);
    expect(s.queryHistory[0].executionTime).toBeGreaterThanOrEqual(0);
    expect(s.queryHistory[0].resultCount).toBe(2);
    expect(s.queryHistory[0].cancelled).toBeUndefined();
  });

  it("passes an abortSignal to the SDK query call", async () => {
    mockClient = {
      queryTwins: vi.fn(() => emptyIterable()),
    };

    await useQueryStore.getState().executeQuery("SELECT * FROM c");

    expect(mockClient.queryTwins).toHaveBeenCalledWith(
      "SELECT * FROM c",
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) })
    );
  });
});

describe("cancelQuery (issue #22)", () => {
  it("cancels mid-iteration: partial results kept, marked cancelled, no error UI", async () => {
    // Page 1 arrives immediately; page 2 takes 25ms — the cancel lands while
    // the loop is waiting on it.
    mockClient = {
      queryTwins: vi.fn(() => ({
        [Symbol.asyncIterator]() {
          let first = true;
          return {
            next: async (): Promise<AsyncPage> => {
              if (first) {
                first = false;
                return { value: { id: 1 }, done: false };
              }
              await sleep(25);
              return { done: true, value: undefined };
            },
          };
        },
      })),
    };

    const run = useQueryStore.getState().executeQuery("SELECT * FROM c");
    await sleep(5); // let page 1 land, loop now waiting on page 2
    expect(useQueryStore.getState().isExecuting).toBe(true);

    useQueryStore.getState().cancelQuery();
    await run;

    const s = useQueryStore.getState();
    expect(s.isExecuting).toBe(false);
    expect(s.lastRunCancelled).toBe(true);
    expect(s.queryError).toBeNull(); // NOT the error UI
    expect(s.queryResults).toEqual([{ id: 1 }]); // partial results kept
    expect(s.lastExecutionTime).toBeGreaterThanOrEqual(0);
    expect(s.abortController).toBeUndefined();
    expect(s.queryHistory[0].cancelled).toBe(true);
    expect(s.queryHistory[0].resultCount).toBe(1);
  });

  it("handles the SDK surfacing cancel as an AbortError", async () => {
    // Page 1 fine; page 2 rejects with an AbortError as soon as the signal fires.
    mockClient = {
      queryTwins: vi.fn((_q: string, opts?: { abortSignal?: AbortSignal }) => ({
        [Symbol.asyncIterator]() {
          let first = true;
          return {
            next: async (): Promise<AsyncPage> => {
              if (first) {
                first = false;
                return { value: { id: 1 }, done: false };
              }
              return await new Promise<AsyncPage>((_resolve, reject) => {
                opts?.abortSignal?.addEventListener("abort", () => {
                  const err = new Error("Request was aborted");
                  err.name = "AbortError";
                  reject(err);
                });
              });
            },
          };
        },
      })),
    };

    const run = useQueryStore.getState().executeQuery("SELECT * FROM c");
    await sleep(5);
    useQueryStore.getState().cancelQuery();
    await run;

    const s = useQueryStore.getState();
    expect(s.isExecuting).toBe(false);
    expect(s.lastRunCancelled).toBe(true);
    expect(s.queryError).toBeNull();
    expect(s.queryHistory[0].cancelled).toBe(true);
  });

  it("cancelQuery is a safe no-op when idle", () => {
    expect(() => useQueryStore.getState().cancelQuery()).not.toThrow();
    expect(useQueryStore.getState().abortController).toBeUndefined();
  });

  it("a new run resets the cancelled flag and replaces the abort handle", async () => {
    mockClient = {
      queryTwins: vi.fn(() => emptyIterable()),
    };

    // Simulate a stale cancelled state from a previous run
    useQueryStore.setState({
      lastRunCancelled: true,
      abortController: new AbortController(),
    });

    await useQueryStore.getState().executeQuery("SELECT * FROM c");

    const s = useQueryStore.getState();
    expect(s.lastRunCancelled).toBe(false);
    expect(s.abortController).toBeUndefined();
  });
});

describe("real errors still behave (issue #22 regression guard)", () => {
  it("a genuine failure is not mistaken for a cancel", async () => {
    mockClient = {
      queryTwins: vi.fn(() => ({
        [Symbol.asyncIterator]() {
          return {
            next: async (): Promise<AsyncPage> => {
              throw new Error("429: too many requests");
            },
          };
        },
      })),
    };

    await useQueryStore.getState().executeQuery("SELECT * FROM c");

    const s = useQueryStore.getState();
    expect(s.isExecuting).toBe(false);
    expect(s.lastRunCancelled).toBe(false);
    expect(s.queryError).toContain("429");
    expect(s.lastExecutionTime).toBeGreaterThanOrEqual(0);
    expect(s.queryHistory[0].cancelled).toBeUndefined();
  });
});

/** Minimal empty async iterable helper. */
function emptyIterable() {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: async (): Promise<AsyncPage> => ({ done: true, value: undefined }),
      };
    },
  };
}
