import { describe, expect, it } from "vitest";
import {
  formatOcrPageList,
  resolveOcrImageIndexes
} from "../src/core/ocr-selection";

describe("resolveOcrImageIndexes", () => {
  it("selects every image", () => {
    expect(resolveOcrImageIndexes("all", "", 4)).toEqual({
      ok: true,
      imageIndexes: [0, 1, 2, 3]
    });
  });

  it("skips the cover while preserving source indexes", () => {
    expect(resolveOcrImageIndexes("skip-cover", "", 4)).toEqual({
      ok: true,
      imageIndexes: [1, 2, 3]
    });
  });

  it("accepts ranges, individual pages, Chinese separators, and duplicates", () => {
    expect(resolveOcrImageIndexes("custom", "1，3至5,3", 6)).toEqual({
      ok: true,
      imageIndexes: [0, 2, 3, 4]
    });
  });

  it("rejects missing, malformed, reversed, and out-of-range input", () => {
    expect(resolveOcrImageIndexes("custom", "", 4)).toEqual({
      ok: false,
      error: "range-required"
    });
    expect(resolveOcrImageIndexes("custom", "1,,3", 4)).toEqual({
      ok: false,
      error: "range-invalid"
    });
    expect(resolveOcrImageIndexes("custom", "4-2", 4)).toEqual({
      ok: false,
      error: "range-out-of-bounds"
    });
    expect(resolveOcrImageIndexes("custom", "2-5", 4)).toEqual({
      ok: false,
      error: "range-out-of-bounds"
    });
  });

  it("does not allow skipping the only image", () => {
    expect(resolveOcrImageIndexes("skip-cover", "", 1)).toEqual({
      ok: false,
      error: "no-images"
    });
  });
});

describe("formatOcrPageList", () => {
  it("formats zero-based indexes as compact one-based page ranges", () => {
    expect(formatOcrPageList([0, 2, 3, 4, 6])).toBe("1,3-5,7");
  });
});
