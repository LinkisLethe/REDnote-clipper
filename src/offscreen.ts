import {
  BrowserOcrEngine,
  decodeImageBlob
} from "./core/browser-ocr-engine";
import type {
  BackgroundRequest,
  OcrImageResult,
  OcrLine,
  OcrStage,
  OcrStageDurations,
  OffscreenRequest
} from "./core/types";
import { createOrderedPrefetcher } from "./core/ordered-prefetch";

const IMAGE_PREFETCH_WINDOW = 3;
const OCR_NUM_THREADS = 4;
const OCR_RECOGNITION_BATCH_SIZE = 8;

type OcrInstance = BrowserOcrEngine;
let instancePromise: Promise<OcrInstance> | null = null;
let instanceReady = false;
let engineGeneration = 0;
let recognitionQueue = Promise.resolve();
const canceledJobs = new Set<string>();
const pausedJobs = new Set<string>();
const resumeWaiters = new Map<string, () => void>();
const imageDownloadControllers = new Map<string, Set<AbortController>>();
const activeJobs = new Set<string>();

interface StageExtras {
  currentImage?: number;
  currentImageStartedAt?: string;
  bytesLoaded?: number;
  bytesTotal?: number;
  bytesCached?: number;
}

type StageReporter = (
  stage: OcrStage,
  progress: number,
  extras?: StageExtras
) => Promise<void>;

interface InitializationState {
  stage: OcrStage;
  progress: number;
  extras?: StageExtras;
}

const initializationSubscribers = new Map<string, StageReporter>();
let initializationState: InitializationState | null = null;

function resetOcrEngine(): void {
  const pendingInstance = instancePromise;
  engineGeneration += 1;
  instancePromise = null;
  instanceReady = false;
  initializationState = null;
  if (pendingInstance) {
    void pendingInstance.then((instance) => instance.dispose()).catch(() => undefined);
  }
}

async function reportInitialization(
  stage: OcrStage,
  progress: number,
  extras?: StageExtras
): Promise<void> {
  initializationState = { stage, progress, extras };
  await Promise.all(
    [...initializationSubscribers.values()].map((report) =>
      report(stage, progress, extras).catch(() => undefined)
    )
  );
}

async function getOcrInstance(
  jobId: string,
  report: StageReporter
): Promise<OcrInstance> {
  if (instanceReady && instancePromise) return instancePromise;
  initializationSubscribers.set(jobId, report);
  if (initializationState) {
    await report(
      initializationState.stage,
      initializationState.progress,
      initializationState.extras
    );
  }
  try {
    return await ensureOcrInstance();
  } finally {
    initializationSubscribers.delete(jobId);
  }
}

function ensureOcrInstance(): Promise<OcrInstance> {
  if (!instancePromise) {
    const generation = engineGeneration;
    instancePromise = (async () => {
      await reportInitialization("loading-runtime", 5);
      const instance = new BrowserOcrEngine({
        numThreads: OCR_NUM_THREADS,
        recognitionBatchSize: OCR_RECOGNITION_BATCH_SIZE
      });
      let initializationStep = 0;
      await instance.initialize(() => {
        initializationStep += 1;
        if (initializationStep === 1) {
          void reportInitialization("loading-models", 25);
        } else {
          void reportInitialization("creating-sessions", Math.min(45, 29 + initializationStep * 5));
        }
      });
      if (generation !== engineGeneration) {
        await instance.dispose();
        throw new Error("OCR_INITIALIZATION_ABORTED");
      }
      instanceReady = true;
      initializationState = null;
      return instance;
    })().catch((error) => {
      instancePromise = null;
      instanceReady = false;
      initializationState = null;
      throw error;
    });
  }
  return instancePromise;
}

interface ImageTile {
  blob: Blob;
  top: number;
}

interface DownloadedImage {
  blob?: Blob;
  durationMs: number;
  error?: string;
}

async function canvasToBlob(canvas: OffscreenCanvas, type: string): Promise<Blob> {
  return canvas.convertToBlob({ type: type || "image/png", quality: 0.96 });
}

async function splitLongImage(blob: Blob): Promise<ImageTile[]> {
  const bitmap = await createImageBitmap(blob);
  try {
    const tileHeight = Math.max(1200, Math.min(2200, Math.round(bitmap.width * 1.6)));
    if (bitmap.height <= tileHeight * 1.15) return [{ blob, top: 0 }];
    const overlap = Math.min(140, Math.round(tileHeight * 0.08));
    const step = tileHeight - overlap;
    const tiles: ImageTile[] = [];
    for (let top = 0; top < bitmap.height; top += step) {
      const height = Math.min(tileHeight, bitmap.height - top);
      const canvas = new OffscreenCanvas(bitmap.width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D is unavailable.");
      context.drawImage(bitmap, 0, top, bitmap.width, height, 0, 0, bitmap.width, height);
      tiles.push({ blob: await canvasToBlob(canvas, "image/png"), top });
      if (top + height >= bitmap.height) break;
    }
    return tiles;
  } finally {
    bitmap.close();
  }
}

function dedupeAdjacentLines(lines: OcrLine[]): OcrLine[] {
  const output: OcrLine[] = [];
  const normalize = (value: string) => value.replace(/[\s，。！？、,.!?;；:：]/g, "").toLowerCase();
  for (const line of lines) {
    const previous = output.at(-1);
    if (previous && normalize(previous.text) === normalize(line.text)) {
      if (line.score > previous.score) output[output.length - 1] = line;
      continue;
    }
    output.push(line);
  }
  return output;
}

function addDownloadController(jobId: string, controller: AbortController): void {
  const controllers = imageDownloadControllers.get(jobId) || new Set<AbortController>();
  controllers.add(controller);
  imageDownloadControllers.set(jobId, controllers);
}

function removeDownloadController(jobId: string, controller: AbortController): void {
  const controllers = imageDownloadControllers.get(jobId);
  if (!controllers) return;
  controllers.delete(controller);
  if (controllers.size === 0) imageDownloadControllers.delete(jobId);
}

async function downloadImage(url: string, jobId: string): Promise<DownloadedImage> {
  const startedAt = performance.now();
  if (!url) return { durationMs: 0, error: "Image URL is missing." };
  const controller = new AbortController();
  addDownloadController(jobId, controller);
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { credentials: "omit", signal: controller.signal });
    if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
    return {
      blob: await response.blob(),
      durationMs: Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    return {
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
    removeDownloadController(jobId, controller);
  }
}

async function recognizeImageWithInstance(
  ocr: OcrInstance,
  downloaded: DownloadedImage,
  imageIndex: number,
  jobId: string
): Promise<OcrImageResult> {
  const startedAt = performance.now();
  try {
    if (!downloaded.blob) throw new Error(downloaded.error || "Image download failed.");
    const tiles = await splitLongImage(downloaded.blob);
    const lines: OcrLine[] = [];
    for (const tile of tiles) {
      if (canceledJobs.has(jobId)) break;
      const image = await decodeImageBlob(tile.blob);
      const result = await ocr.recognize(image);
      lines.push(
        ...result.lines.map((line) => ({
          text: line.text.trim(),
          score: line.score
        }))
      );
    }
    const cleaned = dedupeAdjacentLines(lines);
    return {
      imageIndex,
      text: cleaned.map((line) => line.text).join("\n"),
      lines: cleaned,
      status: cleaned.length > 0 ? "success" : "empty",
      durationMs: downloaded.durationMs + Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    return {
      imageIndex,
      text: "",
      lines: [],
      status: "error",
      durationMs: downloaded.durationMs + Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function sendBackground(message: BackgroundRequest): Promise<void> {
  await chrome.runtime.sendMessage(message);
}

function createStageTracker(jobId: string): {
  report: StageReporter;
  snapshot: () => OcrStageDurations;
} {
  let currentStage: OcrStage | null = null;
  let stageStartedAt = performance.now();
  let stageStartedIso = new Date().toISOString();
  const durations: OcrStageDurations = {};

  const closeCurrentStage = (now: number): void => {
    if (!currentStage) return;
    durations[currentStage] = Math.round(
      (durations[currentStage] || 0) + now - stageStartedAt
    );
  };

  return {
    report: async (stage, progress, extras = {}) => {
      const now = performance.now();
      if (stage !== currentStage) {
        closeCurrentStage(now);
        currentStage = stage;
        stageStartedAt = now;
        stageStartedIso = new Date().toISOString();
      }
      await sendBackground({
        target: "background",
        type: "OCR_STAGE_PROGRESS",
        jobId,
        stage,
        progress,
        stageStartedAt: stageStartedIso,
        stageDurations: { ...durations },
        ...extras
      });
    },
    snapshot: () => {
      closeCurrentStage(performance.now());
      stageStartedAt = performance.now();
      return { ...durations };
    }
  };
}

function cancelJob(jobId: string, abortInitialization = false): void {
  canceledJobs.add(jobId);
  pausedJobs.delete(jobId);
  initializationSubscribers.delete(jobId);
  for (const controller of imageDownloadControllers.get(jobId) || []) controller.abort();
  imageDownloadControllers.delete(jobId);
  const resume = resumeWaiters.get(jobId);
  if (resume) resume();
  resumeWaiters.delete(jobId);
  if (abortInitialization && instancePromise && !instanceReady) {
    resetOcrEngine();
  }
}

function resumeJob(jobId: string): void {
  pausedJobs.delete(jobId);
  const resume = resumeWaiters.get(jobId);
  if (resume) resume();
  resumeWaiters.delete(jobId);
}

async function waitUntilResumed(jobId: string): Promise<void> {
  if (!pausedJobs.has(jobId) || canceledJobs.has(jobId)) return;
  await sendBackground({ target: "background", type: "OCR_PAUSED", jobId });
  await new Promise<void>((resolve) => {
    resumeWaiters.set(jobId, resolve);
  });
}

async function runRecognitionQueued(operation: () => Promise<void>): Promise<void> {
  const scheduled = recognitionQueue.then(operation, operation);
  recognitionQueue = scheduled.catch(() => undefined);
  await scheduled;
}

async function processJob(
  jobId: string,
  imageUrls: string[]
): Promise<void> {
  activeJobs.add(jobId);
  const jobStartedAt = performance.now();
  const tracker = createStageTracker(jobId);
  const prefetcher = createOrderedPrefetcher(
    imageUrls,
    (url) => downloadImage(url, jobId),
    IMAGE_PREFETCH_WINDOW
  );
  try {
    await tracker.report("loading-runtime", 5);
    const ocr = await getOcrInstance(jobId, tracker.report);
    await runRecognitionQueued(async () => {
      for (let index = 0; index < imageUrls.length; index += 1) {
        if (canceledJobs.has(jobId)) return;
        await waitUntilResumed(jobId);
        if (canceledJobs.has(jobId)) return;
        await tracker.report(
          "recognizing-images",
          50 + Math.round((index / Math.max(1, imageUrls.length)) * 45),
          { currentImage: index + 1, currentImageStartedAt: new Date().toISOString() }
        );
        const downloaded = await prefetcher.take(index);
        if (canceledJobs.has(jobId)) return;
        const result = await recognizeImageWithInstance(ocr, downloaded, index, jobId);
        if (canceledJobs.has(jobId)) return;
        await sendBackground({
          target: "background",
          type: "OCR_PROGRESS",
          jobId,
          result,
          current: index + 1,
          total: imageUrls.length
        });
      }
    });
    if (!canceledJobs.has(jobId)) await tracker.report("finalizing", 98);
    await sendBackground({
      target: "background",
      type: "OCR_FINISHED",
      jobId,
      status: canceledJobs.has(jobId) ? "canceled" : "completed",
      durationMs: Math.round(performance.now() - jobStartedAt),
      stageDurations: tracker.snapshot()
    });
  } catch (error) {
    await sendBackground({
      target: "background",
      type: "OCR_FINISHED",
      jobId,
      status: canceledJobs.has(jobId) ? "canceled" : "error",
      durationMs: Math.round(performance.now() - jobStartedAt),
      stageDurations: tracker.snapshot(),
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    activeJobs.delete(jobId);
    initializationSubscribers.delete(jobId);
    canceledJobs.delete(jobId);
    pausedJobs.delete(jobId);
    resumeWaiters.delete(jobId);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const request = message as Partial<OffscreenRequest>;
  if (request.target !== "offscreen") return false;
  if (request.type === "CANCEL_OCR") {
    const cancel = request as Extract<OffscreenRequest, { type: "CANCEL_OCR" }>;
    cancelJob(cancel.jobId, Boolean(cancel.abortInitialization));
    sendResponse({ accepted: true });
    return false;
  }
  if (request.type === "PAUSE_OCR") {
    pausedJobs.add((request as Extract<OffscreenRequest, { type: "PAUSE_OCR" }>).jobId);
    sendResponse({ accepted: true });
    return false;
  }
  if (request.type === "RESUME_OCR") {
    resumeJob((request as Extract<OffscreenRequest, { type: "RESUME_OCR" }>).jobId);
    sendResponse({ accepted: true });
    return false;
  }
  if (request.type === "HAS_OCR_JOB") {
    const jobId = (request as Extract<OffscreenRequest, { type: "HAS_OCR_JOB" }>).jobId;
    sendResponse({ active: activeJobs.has(jobId) });
    return false;
  }
  if (request.type === "PREWARM_OCR") {
    void ensureOcrInstance().catch((error) => {
      console.error("OCR prewarm failed", error);
    });
    sendResponse({ accepted: true });
    return false;
  }
  if (request.type === "PROCESS_OCR") {
    const job = request as Extract<OffscreenRequest, { type: "PROCESS_OCR" }>;
    void processJob(job.jobId, job.imageUrls);
    sendResponse({ accepted: true });
    return false;
  }
  return false;
});
