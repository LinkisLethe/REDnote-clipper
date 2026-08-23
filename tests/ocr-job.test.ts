import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { OCR_PIPELINE_VERSION, sameOcrJobSource } from "../src/core/ocr-job";
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

function job(): OcrJob {
  return {
    id: "job-1",
    pipelineVersion: OCR_PIPELINE_VERSION,
    noteId: note.id,
    imageIndexes: [1],
    imageUrls: [note.images[1]?.url || ""],
    status: "running",
    current: 0,
    total: 1,
    results: [null, null],
    stage: "loading-runtime",
    progress: 0,
    startedAt: "2026-07-28T00:00:00.000Z",
    stageStartedAt: "2026-07-28T00:00:00.000Z",
    stageDurations: {},
    updatedAt: "2026-07-28T00:00:00.000Z"
  };
}

describe("sameOcrJobSource", () => {
  it("matches a selected subset against its original image indexes", () => {
    expect(sameOcrJobSource(job(), note)).toBe(true);
  });

  it("rejects results belonging to another image set", () => {
    const changed = {
      ...note,
      images: [
        note.images[0]!,
        { index: 1, url: "https://example.com/changed.jpg" }
      ]
    };
    expect(sameOcrJobSource(job(), changed)).toBe(false);
  });

  it("rejects results belonging to another note", () => {
    expect(sameOcrJobSource({ ...job(), noteId: "note-2" }, note)).toBe(false);
  });
});

describe("temporary OCR job lifecycle", () => {
  const background = readFileSync("src/background.ts", "utf8");
  const popup = readFileSync("src/popup.ts", "utf8");
  const types = readFileSync("src/core/types.ts", "utf8");

  it("does not expose stored-job restoration or result reuse", () => {
    expect(background).not.toContain("restoreOcr");
    expect(popup).not.toContain("restoreOcr");
    expect(types).not.toContain("RESTORE_OCR");
    expect(background).not.toContain("shouldReuseOcrJob");
  });

  it("removes terminal, canceled, failed, and stale job state", () => {
    expect(background).toContain("chrome.storage.local.remove(OCR_JOB_KEY)");
    expect(background).toContain("await clearJob(failed.id)");
    expect(background.match(/await clearJob\(updated\.id\)/g)).toHaveLength(2);
    expect(background).toContain("void clearStaleJobState().catch(() => undefined)");
  });
});
