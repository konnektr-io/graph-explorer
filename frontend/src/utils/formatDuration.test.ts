import { describe, expect, it } from "vitest";
import { formatDuration } from "@/utils/formatDuration";

describe("formatDuration", () => {
  it("formats sub-second durations as milliseconds", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(830)).toBe("830ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("formats sub-minute durations as seconds with one decimal", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(12400)).toBe("12.4s");
    expect(formatDuration(59999)).toBe("60.0s"); // just under the minute threshold
  });

  it("formats minute-plus durations as m + padded s", () => {
    expect(formatDuration(60_000)).toBe("1m00s");
    expect(formatDuration(63_400)).toBe("1m03s");
    expect(formatDuration(753_000)).toBe("12m33s");
  });
});
