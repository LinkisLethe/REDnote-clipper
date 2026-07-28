import { describe, expect, it } from "vitest";
import { estimateRemainingMs, liveStageDurations } from "../src/core/ocr-progress";
import type { OcrJob } from "../src/core/types";

function job(overrides: Partial<OcrJob> = {}): OcrJob {
  return {
    id: "job-1",
    noteId: "note-1",
    imageUrls: ["1", "2", "3"],
    status: "running",
    current: 1,
    total: 3,
    results: [{ imageIndex: 0, text: "", lines: [], status: "success", durationMs: 4_000 }, null, null],
    stage: "recognizing-images",
    progress: 65,
    startedAt: "2026-07-28T00:00:00.000Z",
    stageStartedAt: "2026-07-28T00:00:05.000Z",
    currentImage: 2,
    currentImageStartedAt: "2026-07-28T00:00:08.000Z",
    stageDurations: { "checking-cache": 100, "initializing-engine": 3_000 },
    updatedAt: "2026-07-28T00:00:08.000Z",
    ...overrides
  };
}

describe("OCR progress estimates", () => {
  it("uses completed image timings to estimate the remaining images", () => {
    expect(estimateRemainingMs(job(), Date.parse("2026-07-28T00:00:09.000Z"))).toBe(7_500);
  });

  it("adds the live time to the current stage", () => {
    const durations = liveStageDurations(job(), Date.parse("2026-07-28T00:00:09.000Z"));
    expect(durations["recognizing-images"]).toBe(4_000);
  });

  it("does not count cached model bytes as download speed", () => {
    const remaining = estimateRemainingMs(
      job({
        stage: "downloading-models",
        bytesCached: 10_000_000,
        bytesLoaded: 15_000_000,
        bytesTotal: 30_000_000,
        stageStartedAt: "2026-07-28T00:00:05.000Z"
      }),
      Date.parse("2026-07-28T00:00:10.000Z")
    );
    expect(remaining).toBe(29_000);
  });

  it("returns zero after completion", () => {
    expect(estimateRemainingMs(job({ status: "completed" }))).toBe(0);
  });

  it("stops estimating while paused", () => {
    const paused = job({ status: "paused" });
    expect(estimateRemainingMs(paused)).toBeUndefined();
    expect(liveStageDurations(paused, Date.parse("2026-07-28T00:00:09.000Z"))[
      "recognizing-images"
    ]).toBeUndefined();
  });
});
