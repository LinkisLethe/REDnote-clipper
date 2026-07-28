import { describe, expect, it } from "vitest";
import { shouldReuseOcrJob } from "../src/core/ocr-job";
import type { Note, OcrJob } from "../src/core/types";

const note: Note = {
  id: "note-1",
  url: "https://www.xiaohongshu.com/explore/note-1",
  platform: "xiaohongshu",
  title: "Note",
  body: "Body",
  authorName: "Author",
  images: [{ index: 0, url: "https://example.com/1.jpg" }],
  tags: [],
  capturedAt: "2026-07-28T00:00:00.000Z",
  metrics: {},
  extractionSource: "dom"
};

function job(status: OcrJob["status"]): OcrJob {
  return {
    id: "job-1",
    noteId: note.id,
    imageUrls: note.images.map((image) => image.url),
    status,
    current: 0,
    total: 1,
    results: [null],
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

  it("rejects results belonging to another image set", () => {
    const changed = { ...note, images: [{ index: 0, url: "https://example.com/2.jpg" }] };
    expect(shouldReuseOcrJob(job("completed"), changed, false)).toBe(false);
  });
});
