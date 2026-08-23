import { describe, expect, it } from "vitest";
import { applyOcrResults, renderMarkdown } from "../src/core/markdown";
import { compactOcrResult } from "../src/core/ocr-result";
import type { Note, OcrImageResult, OcrJob, OcrLine } from "../src/core/types";

const IMAGE_COUNT = 80;
const LINES_PER_IMAGE = 80;

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function makeLine(imageIndex: number, lineIndex: number): OcrLine {
  const top = lineIndex * 28;
  return {
    text: `Image ${imageIndex + 1} line ${lineIndex + 1} GPA 3.82 TOEFL 108 application record`,
    score: 0.96,
    poly: [
      [24, top],
      [900, top],
      [900, top + 24],
      [24, top + 24]
    ]
  };
}

function makeResult(imageIndex: number): OcrImageResult {
  const lines = Array.from({ length: LINES_PER_IMAGE }, (_value, lineIndex) =>
    makeLine(imageIndex, lineIndex)
  );
  return {
    imageIndex,
    text: lines.map((line) => line.text).join("\n"),
    lines,
    status: "success",
    durationMs: 500
  };
}

function makeNote(): Note {
  return {
    id: "stress-note",
    url: "https://www.xiaohongshu.com/explore/stress-note",
    platform: "xiaohongshu",
    title: "Stress note",
    body: "Body",
    authorName: "Author",
    images: Array.from({ length: IMAGE_COUNT }, (_value, index) => ({
      index,
      url: `https://example.com/${index}.jpg`
    })),
    tags: ["stress"],
    capturedAt: "2026-08-13T00:00:00.000Z",
    metrics: {},
    extractionSource: "dom"
  };
}

function makeJob(note: Note): OcrJob {
  return {
    id: "stress-job",
    pipelineVersion: 1,
    noteId: note.id,
    imageIndexes: note.images.map((_image, index) => index),
    imageUrls: note.images.map((image) => image.url),
    status: "running",
    current: 0,
    total: note.images.length,
    results: note.images.map(() => null),
    stage: "recognizing-images",
    progress: 50,
    startedAt: "2026-08-13T00:00:00.000Z",
    stageStartedAt: "2026-08-13T00:00:00.000Z",
    stageDurations: {},
    updatedAt: "2026-08-13T00:00:00.000Z"
  };
}

function processWorkspaceUpdate(note: Note, job: OcrJob): number {
  const startedAt = performance.now();
  const updatedNote = applyOcrResults(note, job.results);
  renderMarkdown(updatedNote, { language: "zh-CN", includeOcr: true });
  structuredClone(job);
  JSON.stringify(job);
  return performance.now() - startedAt;
}

function processProgressPatch(job: OcrJob): number {
  const startedAt = performance.now();
  const patch = {
    target: "content",
    type: "OCR_JOB_PROGRESS",
    jobId: job.id,
    patch: {
      stage: job.stage,
      progress: job.progress,
      currentImage: job.current + 1,
      currentSourceImage: job.current + 1,
      currentImageStartedAt: job.updatedAt,
      stageStartedAt: job.stageStartedAt,
      stageDurations: job.stageDurations,
      updatedAt: job.updatedAt
    }
  };
  structuredClone(patch);
  return performance.now() - startedAt;
}

describe("OCR job state stress metrics", () => {
  it("reports cumulative workspace and storage overhead", () => {
    const note = makeNote();
    const job = makeJob(note);
    const perImageMs: number[] = [];

    for (let imageIndex = 0; imageIndex < IMAGE_COUNT; imageIndex += 1) {
      const stageMs = processProgressPatch(job);
      job.results[imageIndex] = compactOcrResult(makeResult(imageIndex));
      job.current = imageIndex + 1;
      job.progress = 50 + Math.round((job.current / job.total) * 45);
      const resultMs = processWorkspaceUpdate(note, job);
      perImageMs.push(stageMs + resultMs);
    }

    const window = 10;
    const firstAverage = average(perImageMs.slice(0, window));
    const lastAverage = average(perImageMs.slice(-window));
    const report = {
      images: IMAGE_COUNT,
      linesPerImage: LINES_PER_IMAGE,
      totalMs: round(perImageMs.reduce((sum, value) => sum + value, 0)),
      first10AverageMs: round(firstAverage),
      last10AverageMs: round(lastAverage),
      slowdownRatio: round(lastAverage / Math.max(0.001, firstAverage)),
      finalSerializedBytes: new TextEncoder().encode(JSON.stringify(job)).byteLength
    };
    console.log(`XHS_JOB_STATE_STRESS=${JSON.stringify(report)}`);
    expect(report.finalSerializedBytes).toBeGreaterThan(100_000);
    expect(report.totalMs).toBeLessThan(1_000);
    expect(report.last10AverageMs).toBeLessThan(20);
  });
});
