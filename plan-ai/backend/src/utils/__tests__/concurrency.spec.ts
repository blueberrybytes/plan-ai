import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../concurrency";

describe("mapWithConcurrency", () => {
  it("keeps the order and never runs more than the limit at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 15 }, (_, i) => i);

    const results = await mapWithConcurrency(items, 4, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((res) => setTimeout(res, 15 - n));
      inFlight--;
      return n * 2;
    });

    expect(results).toEqual(items.map((n) => n * 2));
    expect(peak).toBe(4);
  });

  it("handles an empty list and a limit larger than the list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 10, async (n) => n + 1)).toEqual([2, 3]);
  });
});
