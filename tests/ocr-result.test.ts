import { describe, expect, it } from "vitest";
import { compactOcrResult } from "../src/core/ocr-result";
import type { OcrImageResult } from "../src/core/types";

describe("compactOcrResult", () => {
  it("keeps cleaned OCR text while dropping heavy line geometry", () => {
    const result: OcrImageResult = {
      imageIndex: 2,
      text: "fallback",
      status: "success",
      durationMs: 500,
      lines: [
        {
          text: "GPA3.82",
          score: 0.98,
          poly: [[0, 0], [100, 0], [100, 20], [0, 20]]
        },
        {
          text: "TOEFL108",
          score: 0.97,
          poly: [[0, 24], [100, 24], [100, 44], [0, 44]]
        }
      ]
    };

    const compacted = compactOcrResult(result);

    expect(compacted).toMatchObject({
      imageIndex: 2,
      status: "success",
      durationMs: 500,
      lines: []
    });
    expect(compacted.text).toContain("GPA3.82");
    expect(compacted.text).toContain("TOEFL108");
    expect(JSON.stringify(compacted).length).toBeLessThan(JSON.stringify(result).length);
  });

  it("does not rewrite results that already contain only text", () => {
    const result: OcrImageResult = {
      imageIndex: 0,
      text: "already compact",
      lines: [],
      status: "success"
    };

    expect(compactOcrResult(result)).toBe(result);
  });
});
