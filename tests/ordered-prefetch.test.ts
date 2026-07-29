import { describe, expect, it } from "vitest";
import { createOrderedPrefetcher } from "../src/core/ordered-prefetch";

describe("ordered prefetcher", () => {
  it("starts a bounded window and refills it in order", async () => {
    const started: number[] = [];
    const resolvers = new Map<number, (value: string) => void>();
    const prefetcher = createOrderedPrefetcher(
      ["a", "b", "c", "d"],
      async (_value, index) => {
        started.push(index);
        return new Promise<string>((resolve) => resolvers.set(index, resolve));
      },
      2
    );

    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    resolvers.get(1)?.("second");
    resolvers.get(0)?.("first");
    await expect(prefetcher.take(0)).resolves.toBe("first");
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);

    await expect(prefetcher.take(1)).resolves.toBe("second");
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2, 3]);
  });

  it("uses at least one prefetch slot", async () => {
    const prefetcher = createOrderedPrefetcher([3], async (value) => value * 2, 0);
    await expect(prefetcher.take(0)).resolves.toBe(6);
  });
});
