import { describe, expect, it } from "vitest";
import { OCR_PIPELINE_VERSION, shouldReuseOcrJob } from "../src/core/ocr-job";
import type { Note, OcrJob } from "../src/core/types";

const note: Note = {
  id: "note-1",
  url: "https://www.xiaohongshu.com/explore/note-1",
  platform: "xiaohongshu",
  title: "Note",
  body: "Body",
  authorName: "Author",
  images: [
    { index: 0, url: "https://example.com/1.jpg" },
    { index: 1, url: "https://example.com/2.jpg" }
  ],
  tags: [],
  capturedAt: "2026-07-28T00:00:00.000Z",
  metrics: {},
  extractionSource: "dom"
};

function job(status: OcrJob["status"]): OcrJob {
  return {
    id: "job-1",
    pipelineVersion: OCR_PIPELINE_VERSION,
    noteId: note.id,
    imageIndexes: [1],
    imageUrls: [note.images[1]?.url || ""],
    status,
    current: 0,
    total: 1,
    results: [null, null],
    stage: "checking-cache",
    progress: 0,
    startedAt: "2026-07-28T00:00:00.000Z",
    stageStartedAt: "2026-07-28T00:00:00.000Z",
    stageDurations: {},
    updatedAt: "2026-07-28T00:00:00.000Z"
  };
}

describe("shouldReuseOcrJob", () => {
  it("rejects a stored running job when its offscreen worker disappeared", () => {
    expect(shouldReuseOcrJob(job("running"), note, false)).toBe(false);
  });

  it("keeps a running job while its offscreen worker is alive", () => {
    expect(shouldReuseOcrJob(job("running"), note, true)).toBe(true);
  });

  it("keeps completed OCR results without requiring a worker", () => {
    expect(shouldReuseOcrJob(job("completed"), note, false)).toBe(true);
  });

  it("matches a selected subset against its original image indexes", () => {
    expect(shouldReuseOcrJob(job("completed"), note, false)).toBe(true);
  });

  it("reruns OCR when cached results were created by an older pipeline", () => {
    expect(
      shouldReuseOcrJob(
        { ...job("completed"), pipelineVersion: OCR_PIPELINE_VERSION - 1 },
        note,
        false
      )
    ).toBe(false);
  });

  it("rejects results belonging to another image set", () => {
    const changed = {
      ...note,
      images: [
        note.images[0]!,
        { index: 1, url: "https://example.com/changed.jpg" }
      ]
    };
    expect(shouldReuseOcrJob(job("completed"), changed, false)).toBe(false);
  });
});
