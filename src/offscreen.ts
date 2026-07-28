import { PaddleOCR } from "@paddleocr/paddleocr-js";
import type { OcrResult, OcrResultItem } from "@paddleocr/paddleocr-js";
import type {
  BackgroundRequest,
  OcrImageResult,
  OcrLine,
  OcrStage,
  OcrStageDurations,
  OffscreenRequest
} from "./core/types";

const MODEL_CACHE = "rednote-paddleocr-models-v6-small-v1";
const ORT_JSEP_MJS_URL = new URL(
  "../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs",
  import.meta.url
).href;
const ORT_JSEP_WASM_URL = new URL(
  "../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm",
  import.meta.url
).href;
const MODEL_URLS = {
  detection:
    "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv6_small_det_onnx_infer.tar",
  recognition:
    "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv6_small_rec_onnx_infer.tar"
} as const;
const MODEL_SIZES: Record<string, number> = {
  [MODEL_URLS.detection]: 9_891_840,
  [MODEL_URLS.recognition]: 21_319_680
};
const MODEL_DOWNLOAD_TIMEOUT_MS = 120_000;
const MODEL_CACHE_TIMEOUT_MS = 10_000;

function modelSize(url: string): number {
  return MODEL_SIZES[url] ?? 0;
}

type OcrInstance = Awaited<ReturnType<typeof PaddleOCR.create>>;
let instancePromise: Promise<OcrInstance> | null = null;
let instanceReady = false;
let recognitionQueue = Promise.resolve();
const canceledJobs = new Set<string>();
const pausedJobs = new Set<string>();
const resumeWaiters = new Map<string, () => void>();
const modelObjectUrls: string[] = [];
const modelDownloadControllers = new Set<AbortController>();
const imageDownloadControllers = new Map<string, AbortController>();

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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
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

async function downloadModel(
  cache: Cache,
  url: string,
  onProgress: (loaded: number, total: number) => void
): Promise<Blob> {
  const controller = new AbortController();
  modelDownloadControllers.add(controller);
  const timeout = setTimeout(() => controller.abort(), MODEL_DOWNLOAD_TIMEOUT_MS);
  try {
    const downloaded = await fetch(url, { signal: controller.signal });
    if (!downloaded.ok) {
      throw new Error(`OCR model download failed: HTTP ${downloaded.status}`);
    }
    const expectedSize = modelSize(url);
    const total = Number(downloaded.headers.get("content-length")) || expectedSize;
    if (!downloaded.body) {
      const blob = await downloaded.blob();
      onProgress(blob.size, total || blob.size);
      const stored = new Response(blob, {
        headers: { "content-type": downloaded.headers.get("content-type") || "application/octet-stream" }
      });
      try {
        await withTimeout(
          cache.put(url, stored.clone()),
          MODEL_CACHE_TIMEOUT_MS,
          "Saving the OCR model cache timed out."
        );
      } catch {
        // The downloaded model can still be used for this run.
      }
      return blob;
    }

    const reader = downloaded.body.getReader();
    const chunks: BlobPart[] = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value.slice());
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
    const blob = new Blob(chunks, {
      type: downloaded.headers.get("content-type") || "application/octet-stream"
    });
    const stored = new Response(blob);
    try {
      await withTimeout(
        cache.put(url, stored.clone()),
        MODEL_CACHE_TIMEOUT_MS,
        "Saving the OCR model cache timed out."
      );
    } catch {
      // The downloaded model can still be used for this run.
    }
    onProgress(blob.size, total || blob.size);
    return blob;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("OCR model download timed out after 120 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    modelDownloadControllers.delete(controller);
  }
}

async function cachedModelObjectUrls(report: StageReporter): Promise<[string, string]> {
  let cache = await withTimeout(
    caches.open(MODEL_CACHE),
    MODEL_CACHE_TIMEOUT_MS,
    "Opening the OCR model cache timed out."
  );
  const urls = [MODEL_URLS.detection, MODEL_URLS.recognition] as const;
  let cachedResponses: Array<Response | undefined>;
  try {
    cachedResponses = await withTimeout(
      Promise.all(urls.map((url) => cache.match(url))),
      MODEL_CACHE_TIMEOUT_MS,
      "Reading the OCR model cache timed out."
    );
  } catch {
    await caches.delete(MODEL_CACHE);
    cache = await withTimeout(
      caches.open(MODEL_CACHE),
      MODEL_CACHE_TIMEOUT_MS,
      "Resetting the OCR model cache timed out."
    );
    cachedResponses = [undefined, undefined];
  }

  const cached = await Promise.all(
    cachedResponses.map(async (response, index) => {
      if (!response) return undefined;
      const url = urls[index];
      if (!url) return undefined;
      try {
        const blob = await withTimeout(
          response.blob(),
          MODEL_CACHE_TIMEOUT_MS,
          "Loading a cached OCR model timed out."
        );
        if (blob.size < modelSize(url) * 0.9) {
          await cache.delete(url);
          return undefined;
        }
        return blob;
      } catch {
        await cache.delete(url);
        return undefined;
      }
    })
  );
  const loadedByUrl = new Map<string, number>();
  const totalBytes = urls.reduce((sum, url) => sum + modelSize(url), 0);
  urls.forEach((url, index) => {
    if (cached[index]) loadedByUrl.set(url, modelSize(url));
  });
  const cachedBytes = urls.reduce((sum, url) => sum + (loadedByUrl.get(url) || 0), 0);
  if (cached.some((response) => !response)) {
    await report("downloading-models", 5 + Math.round((cachedBytes / totalBytes) * 35), {
      bytesLoaded: cachedBytes,
      bytesTotal: totalBytes,
      bytesCached: cachedBytes
    });
  }

  let lastReportAt = 0;
  let reporting = Promise.resolve();
  const reportDownload = (url: string, loaded: number, total: number): void => {
    loadedByUrl.set(url, Math.min(loaded, total || modelSize(url)));
    const totalLoaded = urls.reduce((sum, item) => sum + (loadedByUrl.get(item) || 0), 0);
    const now = performance.now();
    if (now - lastReportAt < 200 && totalLoaded < totalBytes) return;
    lastReportAt = now;
    reporting = reporting.then(() =>
      report("downloading-models", 5 + Math.round((totalLoaded / totalBytes) * 35), {
        bytesLoaded: totalLoaded,
        bytesTotal: totalBytes,
        bytesCached: cachedBytes
      })
    );
  };

  const blobs = await Promise.all(
    urls.map(async (url, index) => {
      const hit = cached[index];
      if (hit) return hit;
      return downloadModel(cache, url, (loaded, total) => reportDownload(url, loaded, total));
    })
  );
  await reporting;

  const objectUrls = await Promise.all(
    blobs.map(async (blob) => {
      const objectUrl = URL.createObjectURL(blob);
      modelObjectUrls.push(objectUrl);
      return objectUrl;
    })
  );
  return objectUrls as [string, string];
}

async function getOcrInstance(jobId: string, report: StageReporter): Promise<OcrInstance> {
  if (instanceReady && instancePromise) return instancePromise;
  initializationSubscribers.set(jobId, report);
  if (initializationState) {
    await report(
      initializationState.stage,
      initializationState.progress,
      initializationState.extras
    );
  }
  if (!instancePromise) {
    instancePromise = (async () => {
      const [detectionUrl, recognitionUrl] = await cachedModelObjectUrls(reportInitialization);
      await reportInitialization("initializing-engine", 45);
      const instance = await PaddleOCR.create({
        textDetectionModelName: "PP-OCRv6_small_det",
        textDetectionModelAsset: { url: detectionUrl },
        textRecognitionModelName: "PP-OCRv6_small_rec",
        textRecognitionModelAsset: { url: recognitionUrl },
        worker: true,
        ortOptions: {
          backend: "wasm",
          wasmPaths: {
            mjs: ORT_JSEP_MJS_URL,
            wasm: ORT_JSEP_WASM_URL
          } as unknown as string,
          numThreads: 1,
          simd: true
        },
        textDetectionBatchSize: 1,
        textRecognitionBatchSize: 8
      });
      instanceReady = true;
      initializationState = null;
      return instance;
    })().catch(async (error) => {
      instancePromise = null;
      instanceReady = false;
      initializationState = null;
      await caches.delete(MODEL_CACHE);
      for (const url of modelObjectUrls.splice(0)) URL.revokeObjectURL(url);
      throw error;
    });
  }
  try {
    return await instancePromise;
  } finally {
    initializationSubscribers.delete(jobId);
  }
}

interface ImageTile {
  blob: Blob;
  top: number;
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

function itemPosition(item: OcrResultItem): [number, number] {
  const xs = item.poly.map((point) => point[0]);
  const ys = item.poly.map((point) => point[1]);
  return [Math.min(...ys), Math.min(...xs)];
}

function orderedLines(result: OcrResult): OcrLine[] {
  return [...result.items]
    .filter((item) => item.text.trim())
    .sort((left, right) => {
      const [leftY, leftX] = itemPosition(left);
      const [rightY, rightX] = itemPosition(right);
      return Math.abs(leftY - rightY) < 12 ? leftX - rightX : leftY - rightY;
    })
    .map((item) => ({ text: item.text.trim(), score: item.score }));
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

async function recognizeImageWithInstance(
  ocr: OcrInstance,
  url: string,
  imageIndex: number,
  jobId: string
): Promise<OcrImageResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  imageDownloadControllers.set(jobId, controller);
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { credentials: "omit", signal: controller.signal });
    if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
    const tiles = await splitLongImage(await response.blob());
    const lines: OcrLine[] = [];
    for (const tile of tiles) {
      const [result] = await ocr.predict(tile.blob, {
        textDetLimitSideLen: 1280,
        textDetLimitType: "max",
        textDetMaxSideLimit: 4096,
        textRecScoreThresh: 0
      });
      if (result) lines.push(...orderedLines(result));
    }
    const cleaned = dedupeAdjacentLines(lines);
    return {
      imageIndex,
      text: cleaned.map((line) => line.text).join("\n"),
      lines: cleaned,
      status: cleaned.length > 0 ? "success" : "empty",
      durationMs: Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    return {
      imageIndex,
      text: "",
      lines: [],
      status: "error",
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
    imageDownloadControllers.delete(jobId);
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

function cancelJob(jobId: string, abortInitialization: boolean): void {
  canceledJobs.add(jobId);
  pausedJobs.delete(jobId);
  initializationSubscribers.delete(jobId);
  imageDownloadControllers.get(jobId)?.abort();
  imageDownloadControllers.delete(jobId);
  const resume = resumeWaiters.get(jobId);
  if (resume) resume();
  resumeWaiters.delete(jobId);
  if (abortInitialization && initializationSubscribers.size === 0 && !instanceReady) {
    for (const controller of modelDownloadControllers) controller.abort();
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

async function processJob(jobId: string, imageUrls: string[]): Promise<void> {
  const jobStartedAt = performance.now();
  const tracker = createStageTracker(jobId);
  try {
    await tracker.report("checking-cache", 2);
    const ocr = await getOcrInstance(jobId, tracker.report);
    await runRecognitionQueued(async () => {
      for (let index = 0; index < imageUrls.length; index += 1) {
        if (canceledJobs.has(jobId)) return;
        await waitUntilResumed(jobId);
        if (canceledJobs.has(jobId)) return;
        const url = imageUrls[index];
        if (!url) continue;
        await tracker.report(
          "recognizing-images",
          50 + Math.round((index / Math.max(1, imageUrls.length)) * 45),
          { currentImage: index + 1, currentImageStartedAt: new Date().toISOString() }
        );
        const result = await recognizeImageWithInstance(ocr, url, index, jobId);
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
  if (request.type === "PROCESS_OCR") {
    const job = request as Extract<OffscreenRequest, { type: "PROCESS_OCR" }>;
    void processJob(job.jobId, job.imageUrls);
    sendResponse({ accepted: true });
    return false;
  }
  return false;
});
