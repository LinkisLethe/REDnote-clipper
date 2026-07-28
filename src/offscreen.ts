import { PaddleOCR } from "@paddleocr/paddleocr-js";
import type { OcrResult, OcrResultItem } from "@paddleocr/paddleocr-js";
import type {
  BackgroundRequest,
  OcrImageResult,
  OcrLine,
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

type OcrInstance = Awaited<ReturnType<typeof PaddleOCR.create>>;
let instancePromise: Promise<OcrInstance> | null = null;
let processingQueue = Promise.resolve();
const canceledJobs = new Set<string>();
const modelObjectUrls: string[] = [];

async function cachedModelObjectUrl(url: string): Promise<string> {
  const cache = await caches.open(MODEL_CACHE);
  let response = await cache.match(url);
  if (!response) {
    const downloaded = await fetch(url);
    if (!downloaded.ok) {
      throw new Error(`OCR model download failed: HTTP ${downloaded.status}`);
    }
    await cache.put(url, downloaded.clone());
    response = downloaded;
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  modelObjectUrls.push(objectUrl);
  return objectUrl;
}

async function getOcrInstance(): Promise<OcrInstance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const [detectionUrl, recognitionUrl] = await Promise.all([
        cachedModelObjectUrl(MODEL_URLS.detection),
        cachedModelObjectUrl(MODEL_URLS.recognition)
      ]);
      return PaddleOCR.create({
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
    })().catch((error) => {
      instancePromise = null;
      for (const url of modelObjectUrls.splice(0)) URL.revokeObjectURL(url);
      throw error;
    });
  }
  return instancePromise;
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

async function recognizeImage(url: string, imageIndex: number): Promise<OcrImageResult> {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
    const tiles = await splitLongImage(await response.blob());
    const ocr = await getOcrInstance();
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
  }
}

async function sendBackground(message: BackgroundRequest): Promise<void> {
  await chrome.runtime.sendMessage(message);
}

async function processJob(jobId: string, imageUrls: string[]): Promise<void> {
  try {
    await getOcrInstance();
    for (let index = 0; index < imageUrls.length; index += 1) {
      if (canceledJobs.has(jobId)) {
        await sendBackground({
          target: "background",
          type: "OCR_FINISHED",
          jobId,
          status: "canceled"
        });
        return;
      }
      const url = imageUrls[index];
      if (!url) continue;
      const result = await recognizeImage(url, index);
      await sendBackground({
        target: "background",
        type: "OCR_PROGRESS",
        jobId,
        result,
        current: index + 1,
        total: imageUrls.length
      });
    }
    await sendBackground({
      target: "background",
      type: "OCR_FINISHED",
      jobId,
      status: canceledJobs.has(jobId) ? "canceled" : "completed"
    });
  } catch (error) {
    await sendBackground({
      target: "background",
      type: "OCR_FINISHED",
      jobId,
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    canceledJobs.delete(jobId);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const request = message as Partial<OffscreenRequest>;
  if (request.target !== "offscreen") return false;
  if (request.type === "CANCEL_OCR") {
    canceledJobs.add((request as Extract<OffscreenRequest, { type: "CANCEL_OCR" }>).jobId);
    sendResponse({ accepted: true });
    return false;
  }
  if (request.type === "PROCESS_OCR") {
    const job = request as Extract<OffscreenRequest, { type: "PROCESS_OCR" }>;
    processingQueue = processingQueue.then(() => processJob(job.jobId, job.imageUrls));
    sendResponse({ accepted: true });
    return false;
  }
  return false;
});
