/*
 * Browser-only PP-OCRv6 benchmark.
 * Model preprocessing and decoding follow PaddleOCR.js behavior (Apache-2.0),
 * while OpenCV-dependent geometry is replaced with Canvas and TypeScript.
 */

import * as ort from "onnxruntime-web/wasm";

const DET_MODEL_URL = new URL(
  "../../public/models/PP-OCRv6_tiny_det_onnx_infer.tar",
  import.meta.url
).href;
const REC_MODEL_URL = new URL(
  "../../public/models/PP-OCRv6_tiny_rec_onnx_infer.tar",
  import.meta.url
).href;
const ORT_MJS_URL = new URL(
  "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
  import.meta.url
).href;
const ORT_WASM_URL = new URL(
  "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
  import.meta.url
).href;

const DET_LIMIT_SIDE = 960;
const DET_MAX_SIDE = 4000;
const DET_THRESHOLD = 0.2;
const DET_BOX_THRESHOLD = 0.4;
const DET_UNCLIP_RATIO = 1.4;
const DET_MAX_CANDIDATES = 3000;
const DET_MIN_SIDE = 3;
const REC_HEIGHT = 48;
const REC_BASE_WIDTH = 320;
const REC_MAX_WIDTH = 3200;
const DEFAULT_REC_BATCH_SIZE = 8;
const DEFAULT_NUM_THREADS = 4;

type Point = [number, number];

interface ModelFiles {
  model: Uint8Array;
  config: string;
}

interface DetectionBox {
  poly: Point[];
  score: number;
}

interface DetectionPrep {
  tensor: ort.Tensor;
  srcWidth: number;
  srcHeight: number;
  dstWidth: number;
  dstHeight: number;
}

interface RecognitionSample {
  inputIndex: number;
  width: number;
  chw: Float32Array;
}

export interface InitializationMetrics {
  assetsMs: number;
  detectionSessionMs: number;
  recognitionSessionMs: number;
  totalMs: number;
  detectionModelBytes: number;
  recognitionModelBytes: number;
  runtimeBytes: number;
  numThreads: number;
  recognitionBatchSize: number;
  crossOriginIsolated: boolean;
}

export interface BrowserOcrEngineOptions {
  numThreads?: number;
  recognitionBatchSize?: number;
}

export interface InitializationResult {
  metrics: InitializationMetrics;
  reused: boolean;
}

export interface RecognitionMetrics {
  detectionPreprocessMs: number;
  detectionInferenceMs: number;
  detectionPostprocessMs: number;
  cropMs: number;
  recognitionPreprocessMs: number;
  recognitionInferenceMs: number;
  recognitionDecodeMs: number;
  totalMs: number;
  detectedBoxes: number;
  recognizedLines: number;
}

export interface RecognitionResult {
  text: string;
  lines: Array<{ text: string; score: number; poly: Point[] }>;
  metrics: RecognitionMetrics;
}

export type StageReporter = (stage: string) => void;

function now(): number {
  return performance.now();
}

function elapsed(start: number): number {
  return Math.round((now() - start) * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.trunc(clamp(value, minimum, maximum));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function canvasFor(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function resizeImageData(source: ImageData, width: number, height: number): ImageData {
  const sourceCanvas = canvasFor(source.width, source.height);
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  sourceContext.putImageData(source, 0, 0);

  const targetCanvas = canvasFor(width, height);
  const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!targetContext) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  targetContext.imageSmoothingEnabled = true;
  targetContext.imageSmoothingQuality = "high";
  targetContext.drawImage(sourceCanvas, 0, 0, width, height);
  return targetContext.getImageData(0, 0, width, height);
}

export async function decodeImageBlob(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = canvasFor(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

export async function decodeImageFile(file: File): Promise<ImageData> {
  return decodeImageBlob(file);
}

function readTarString(bytes: Uint8Array, start: number, length: number): string {
  let end = start;
  const limit = Math.min(bytes.length, start + length);
  while (end < limit && bytes[end] !== 0) end += 1;
  return new TextDecoder().decode(bytes.subarray(start, end)).trim();
}

function extractTar(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const bytes = new Uint8Array(buffer);
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const name = readTarString(bytes, offset, 100);
    if (!name) break;
    const sizeText = readTarString(bytes, offset + 124, 12).replace(/\0/g, "").trim();
    const size = sizeText ? Number.parseInt(sizeText, 8) : 0;
    const type = bytes[offset + 156];
    const contentStart = offset + 512;
    if ((type === 0 || type === 48) && size > 0) {
      files.set(name, bytes.slice(contentStart, contentStart + size));
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

async function loadModel(url: string, role: string): Promise<ModelFiles> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${role}模型读取失败：HTTP ${response.status}`);
  const files = extractTar(await response.arrayBuffer());
  const modelEntry = [...files.entries()].find(([name]) => name.endsWith("/inference.onnx"));
  const configEntry = [...files.entries()].find(([name]) => name.endsWith("/inference.yml"));
  if (!modelEntry || !configEntry) throw new Error(`${role}模型包内容不完整`);
  return {
    model: modelEntry[1],
    config: new TextDecoder().decode(configEntry[1])
  };
}

function parseYamlScalar(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseCharacterDictionary(config: string): string[] {
  const lines = config.split(/\r?\n/);
  const dictionary: string[] = [];
  let collecting = false;
  for (const line of lines) {
    if (/^\s{2}character_dict:\s*$/.test(line)) {
      collecting = true;
      continue;
    }
    if (!collecting) continue;
    const match = line.match(/^\s{2}-\s(.*)$/);
    if (!match) {
      if (line.trim()) break;
      continue;
    }
    dictionary.push(parseYamlScalar(match[1] ?? ""));
  }
  if (dictionary.length < 100) throw new Error("识别模型字符表解析失败");
  dictionary.push(" ");
  return dictionary;
}

function rgbaToBgrChw(
  image: ImageData,
  mean: readonly number[],
  std: readonly number[]
): Float32Array {
  const pixels = image.width * image.height;
  const output = new Float32Array(pixels * 3);
  const data = image.data;
  for (let index = 0; index < pixels; index += 1) {
    const rgba = index * 4;
    output[index] = ((data[rgba + 2] ?? 0) / 255 - (mean[0] ?? 0)) / (std[0] ?? 1);
    output[index + pixels] =
      ((data[rgba + 1] ?? 0) / 255 - (mean[1] ?? 0)) / (std[1] ?? 1);
    output[index + pixels * 2] =
      ((data[rgba] ?? 0) / 255 - (mean[2] ?? 0)) / (std[2] ?? 1);
  }
  return output;
}

function prepareDetection(image: ImageData): DetectionPrep {
  const srcWidth = image.width;
  const srcHeight = image.height;
  const maxSide = Math.max(srcWidth, srcHeight);
  const scale = maxSide > DET_LIMIT_SIDE ? DET_LIMIT_SIDE / maxSide : 1;
  let dstWidth = Math.max(32, Math.round((srcWidth * scale) / 32) * 32);
  let dstHeight = Math.max(32, Math.round((srcHeight * scale) / 32) * 32);
  if (Math.max(dstWidth, dstHeight) > DET_MAX_SIDE) {
    const limitScale = DET_MAX_SIDE / Math.max(dstWidth, dstHeight);
    dstWidth = Math.max(32, Math.round((dstWidth * limitScale) / 32) * 32);
    dstHeight = Math.max(32, Math.round((dstHeight * limitScale) / 32) * 32);
  }
  const resized = resizeImageData(image, dstWidth, dstHeight);
  const chw = rgbaToBgrChw(
    resized,
    [0.485, 0.456, 0.406],
    [0.229, 0.224, 0.225]
  );
  return {
    tensor: new ort.Tensor("float32", chw, [1, 3, dstHeight, dstWidth]),
    srcWidth,
    srcHeight,
    dstWidth,
    dstHeight
  };
}

function cross(origin: Point, a: Point, b: Point): number {
  return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
}

function convexHull(points: Point[]): Point[] {
  if (points.length <= 2) return points.slice();
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function orderQuad(points: Point[]): Point[] {
  const byX = points.slice().sort((a, b) => a[0] - b[0]);
  const left = byX.slice(0, 2).sort((a, b) => a[1] - b[1]);
  const right = byX.slice(-2).sort((a, b) => a[1] - b[1]);
  return [left[0]!, right[0]!, right[1]!, left[1]!];
}

function minimumAreaRectangle(points: Point[]): Point[] | null {
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  let bestArea = Number.POSITIVE_INFINITY;
  let best: Point[] | null = null;
  for (let edge = 0; edge < hull.length; edge += 1) {
    const a = hull[edge]!;
    const b = hull[(edge + 1) % hull.length]!;
    const edgeLength = distance(a, b);
    if (edgeLength < 1e-6) continue;
    const ux = (b[0] - a[0]) / edgeLength;
    const uy = (b[1] - a[1]) / edgeLength;
    const vx = -uy;
    const vy = ux;
    let minU = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    for (const point of hull) {
      const u = point[0] * ux + point[1] * uy;
      const v = point[0] * vx + point[1] * vy;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area >= bestArea) continue;
    const project = (u: number, v: number): Point => [u * ux + v * vx, u * uy + v * vy];
    best = orderQuad([
      project(minU, minV),
      project(maxU, minV),
      project(maxU, maxV),
      project(minU, maxV)
    ]);
    bestArea = area;
  }
  return best;
}

function pointInPolygon(x: number, y: number, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    if (
      pi[1] > y !== pj[1] > y &&
      x < ((pj[0] - pi[0]) * (y - pi[1])) / (pj[1] - pi[1] || 1e-9) + pi[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonScore(probabilities: Float32Array, width: number, height: number, polygon: Point[]): number {
  const xs = polygon.map((point) => point[0]);
  const ys = polygon.map((point) => point[1]);
  const minX = clamp(Math.floor(Math.min(...xs)), 0, width - 1);
  const maxX = clamp(Math.ceil(Math.max(...xs)), 0, width - 1);
  const minY = clamp(Math.floor(Math.min(...ys)), 0, height - 1);
  const maxY = clamp(Math.ceil(Math.max(...ys)), 0, height - 1);
  let sum = 0;
  let count = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInPolygon(x + 0.5, y + 0.5, polygon)) continue;
      sum += probabilities[y * width + x] ?? 0;
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

function expandRectangle(box: Point[], ratio: number): Point[] {
  const width = distance(box[0]!, box[1]!);
  const height = distance(box[1]!, box[2]!);
  const perimeter = 2 * (width + height);
  if (!perimeter || !width || !height) return box;
  const offset = (width * height * ratio) / perimeter;
  const center: Point = [
    box.reduce((sum, point) => sum + point[0], 0) / 4,
    box.reduce((sum, point) => sum + point[1], 0) / 4
  ];
  const ux = (box[1]![0] - box[0]![0]) / width;
  const uy = (box[1]![1] - box[0]![1]) / width;
  const vx = (box[3]![0] - box[0]![0]) / height;
  const vy = (box[3]![1] - box[0]![1]) / height;
  const halfWidth = width / 2 + offset;
  const halfHeight = height / 2 + offset;
  return orderQuad([
    [center[0] - ux * halfWidth - vx * halfHeight, center[1] - uy * halfWidth - vy * halfHeight],
    [center[0] + ux * halfWidth - vx * halfHeight, center[1] + uy * halfWidth - vy * halfHeight],
    [center[0] + ux * halfWidth + vx * halfHeight, center[1] + uy * halfWidth + vy * halfHeight],
    [center[0] - ux * halfWidth + vx * halfHeight, center[1] - uy * halfWidth + vy * halfHeight]
  ]);
}

interface Component {
  boundary: Point[];
  pixels: number;
}

function findComponents(mask: Uint8Array, width: number, height: number): Component[] {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components: Component[] = [];
  const neighbors = [-1, 0, 1];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 1;
    let pixels = 0;
    const boundary: Point[] = [];
    queue[0] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % width;
      const y = Math.floor(index / width);
      pixels += 1;
      let isBoundary = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      for (const dy of neighbors) {
        for (const dx of neighbors) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            isBoundary = true;
            continue;
          }
          const neighborIndex = ny * width + nx;
          if (!mask[neighborIndex]) {
            if (dx === 0 || dy === 0) isBoundary = true;
            continue;
          }
          if (!visited[neighborIndex]) {
            visited[neighborIndex] = 1;
            queue[tail++] = neighborIndex;
          }
        }
      }
      if (isBoundary) boundary.push([x, y]);
    }
    if (pixels >= 4 && boundary.length >= 4) components.push({ boundary, pixels });
  }
  components.sort((a, b) => b.pixels - a.pixels);
  return components.slice(0, DET_MAX_CANDIDATES);
}

function sortReadingOrder(boxes: DetectionBox[]): void {
  boxes.sort((a, b) => a.poly[0]![1] - b.poly[0]![1] || a.poly[0]![0] - b.poly[0]![0]);
  for (let index = 0; index < boxes.length - 1; index += 1) {
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const current = boxes[cursor]!;
      const next = boxes[cursor + 1]!;
      if (Math.abs(next.poly[0]![1] - current.poly[0]![1]) < 10 && next.poly[0]![0] < current.poly[0]![0]) {
        boxes[cursor] = next;
        boxes[cursor + 1] = current;
      } else {
        break;
      }
    }
  }
}

function decodeDetection(output: ort.Tensor, prep: DetectionPrep): DetectionBox[] {
  const dims = output.dims;
  if (dims.length !== 3 && dims.length !== 4) {
    throw new Error(`检测模型输出尺寸异常：[${dims.join(", ")}]`);
  }
  const height = dims.length === 4 ? dims[2]! : dims[1]!;
  const width = dims.length === 4 ? dims[3]! : dims[2]!;
  const probabilities = output.data as Float32Array;
  const planeSize = height * width;
  const plane = probabilities.length === planeSize ? probabilities : probabilities.subarray(0, planeSize);
  const mask = new Uint8Array(planeSize);
  for (let index = 0; index < planeSize; index += 1) {
    mask[index] = (plane[index] ?? 0) > DET_THRESHOLD ? 1 : 0;
  }
  const boxes: DetectionBox[] = [];
  for (const component of findComponents(mask, width, height)) {
    const mini = minimumAreaRectangle(component.boundary);
    if (!mini) continue;
    if (Math.min(distance(mini[0]!, mini[1]!), distance(mini[1]!, mini[2]!)) < DET_MIN_SIDE) continue;
    const score = polygonScore(plane, width, height, mini);
    if (score < DET_BOX_THRESHOLD) continue;
    const expanded = expandRectangle(mini, DET_UNCLIP_RATIO);
    if (Math.min(distance(expanded[0]!, expanded[1]!), distance(expanded[1]!, expanded[2]!)) < DET_MIN_SIDE + 2) continue;
    boxes.push({
      score,
      poly: expanded.map((point): Point => [
        clamp(Math.round((point[0] * prep.srcWidth) / width), 0, prep.srcWidth - 1),
        clamp(Math.round((point[1] * prep.srcHeight) / height), 0, prep.srcHeight - 1)
      ])
    });
  }
  sortReadingOrder(boxes);
  return boxes;
}

function sampleRgba(source: ImageData, x: number, y: number, output: Uint8ClampedArray, offset: number): void {
  const x0 = clamp(Math.floor(x), 0, source.width - 1);
  const y0 = clamp(Math.floor(y), 0, source.height - 1);
  const x1 = clamp(x0 + 1, 0, source.width - 1);
  const y1 = clamp(y0 + 1, 0, source.height - 1);
  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);
  const indices = [
    (y0 * source.width + x0) * 4,
    (y0 * source.width + x1) * 4,
    (y1 * source.width + x0) * 4,
    (y1 * source.width + x1) * 4
  ];
  for (let channel = 0; channel < 3; channel += 1) {
    const top = (source.data[indices[0]! + channel] ?? 0) * (1 - tx) + (source.data[indices[1]! + channel] ?? 0) * tx;
    const bottom = (source.data[indices[2]! + channel] ?? 0) * (1 - tx) + (source.data[indices[3]! + channel] ?? 0) * tx;
    output[offset + channel] = Math.round(top * (1 - ty) + bottom * ty);
  }
  output[offset + 3] = 255;
}

function cropQuadrilateral(source: ImageData, rawPoly: Point[]): ImageData {
  const poly = orderQuad(rawPoly);
  const width = Math.max(1, Math.floor(Math.max(distance(poly[0]!, poly[1]!), distance(poly[3]!, poly[2]!))));
  const height = Math.max(1, Math.floor(Math.max(distance(poly[0]!, poly[3]!), distance(poly[1]!, poly[2]!))));
  const output = new Uint8ClampedArray(width * height * 4);
  const p0 = poly[0]!;
  const p1 = poly[1]!;
  const p2 = poly[2]!;
  const p3 = poly[3]!;
  const dx1 = p1[0] - p2[0];
  const dx2 = p3[0] - p2[0];
  const dy1 = p1[1] - p2[1];
  const dy2 = p3[1] - p2[1];
  const sx = p0[0] - p1[0] + p2[0] - p3[0];
  const sy = p0[1] - p1[1] + p2[1] - p3[1];
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(denominator) < 1e-8 ? 0 : (sx * dy2 - dx2 * sy) / denominator;
  const h = Math.abs(denominator) < 1e-8 ? 0 : (dx1 * sy - sx * dy1) / denominator;
  const a = p1[0] - p0[0] + g * p1[0];
  const b = p3[0] - p0[0] + h * p3[0];
  const c = p0[0];
  const d = p1[1] - p0[1] + g * p1[1];
  const e = p3[1] - p0[1] + h * p3[1];
  const f = p0[1];
  for (let y = 0; y < height; y += 1) {
    const v = height === 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = width === 1 ? 0 : x / (width - 1);
      const divisor = g * u + h * v + 1;
      sampleRgba(source, (a * u + b * v + c) / divisor, (d * u + e * v + f) / divisor, output, (y * width + x) * 4);
    }
  }
  const cropped = new ImageData(output, width, height);
  return height / width >= 1.5 ? rotateCounterClockwise(cropped) : cropped;
}

function rotateCounterClockwise(source: ImageData): ImageData {
  const output = new Uint8ClampedArray(source.width * source.height * 4);
  const targetWidth = source.height;
  const targetHeight = source.width;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4;
      const targetX = y;
      const targetY = source.width - x - 1;
      const targetOffset = (targetY * targetWidth + targetX) * 4;
      output.set(source.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return new ImageData(output, targetWidth, targetHeight);
}

function prepareRecognition(crops: ImageData[]): RecognitionSample[] {
  return crops.map((crop, inputIndex) => {
    const ratio = crop.width / Math.max(1, crop.height);
    const maxRatio = Math.max(REC_BASE_WIDTH / REC_HEIGHT, ratio);
    const targetWidth = clamp(Math.trunc(REC_HEIGHT * maxRatio), 1, REC_MAX_WIDTH);
    const resizedWidth = Math.min(targetWidth, Math.ceil(REC_HEIGHT * ratio));
    const resized = resizeImageData(crop, resizedWidth, REC_HEIGHT);
    const resizedChw = rgbaToBgrChw(resized, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
    const chw = new Float32Array(3 * REC_HEIGHT * targetWidth);
    const sourcePlane = REC_HEIGHT * resizedWidth;
    const targetPlane = REC_HEIGHT * targetWidth;
    for (let channel = 0; channel < 3; channel += 1) {
      for (let row = 0; row < REC_HEIGHT; row += 1) {
        const sourceStart = channel * sourcePlane + row * resizedWidth;
        const targetStart = channel * targetPlane + row * targetWidth;
        chw.set(resizedChw.subarray(sourceStart, sourceStart + resizedWidth), targetStart);
      }
    }
    return { inputIndex, width: targetWidth, chw };
  });
}

function packRecognitionBatch(samples: RecognitionSample[]): ort.Tensor {
  const maxWidth = Math.max(...samples.map((sample) => sample.width));
  const targetPlane = REC_HEIGHT * maxWidth;
  const output = new Float32Array(samples.length * 3 * targetPlane);
  samples.forEach((sample, sampleIndex) => {
    const sourcePlane = REC_HEIGHT * sample.width;
    for (let channel = 0; channel < 3; channel += 1) {
      for (let row = 0; row < REC_HEIGHT; row += 1) {
        const sourceStart = channel * sourcePlane + row * sample.width;
        const targetStart = sampleIndex * 3 * targetPlane + channel * targetPlane + row * maxWidth;
        output.set(sample.chw.subarray(sourceStart, sourceStart + sample.width), targetStart);
      }
    }
  });
  return new ort.Tensor("float32", output, [samples.length, 3, REC_HEIGHT, maxWidth]);
}

function decodeRecognition(output: ort.Tensor, dictionary: string[]): Array<{ text: string; score: number }> {
  const dims = output.dims;
  if (dims.length !== 3) throw new Error(`识别模型输出尺寸异常：[${dims.join(", ")}]`);
  const [samples, steps, classes] = dims as readonly number[];
  const data = output.data as Float32Array;
  const results: Array<{ text: string; score: number }> = [];
  for (let sample = 0; sample < samples!; sample += 1) {
    let previous = -1;
    let text = "";
    let scoreSum = 0;
    let scoreCount = 0;
    for (let step = 0; step < steps!; step += 1) {
      let bestClass = 0;
      let bestScore = Number.NEGATIVE_INFINITY;
      const offset = sample * steps! * classes! + step * classes!;
      for (let classIndex = 0; classIndex < classes!; classIndex += 1) {
        const score = data[offset + classIndex] ?? Number.NEGATIVE_INFINITY;
        if (score > bestScore) {
          bestScore = score;
          bestClass = classIndex;
        }
      }
      if (bestClass > 0 && bestClass !== previous) {
        const character = dictionary[bestClass - 1];
        if (character !== undefined) {
          text += character;
          scoreSum += bestScore;
          scoreCount += 1;
        }
      }
      previous = bestClass;
    }
    results.push({ text, score: scoreCount ? scoreSum / scoreCount : 0 });
  }
  return results;
}

async function runSession(session: ort.InferenceSession, tensor: ort.Tensor): Promise<ort.Tensor> {
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  if (!inputName || !outputName) throw new Error("模型输入或输出名称缺失");
  const outputs = await session.run({ [inputName]: tensor });
  const output = outputs[outputName];
  if (!output) throw new Error("模型没有返回输出");
  return output;
}

export class BrowserOcrEngine {
  private detectionSession: ort.InferenceSession | null = null;
  private recognitionSession: ort.InferenceSession | null = null;
  private dictionary: string[] = [];
  private initializationMetrics: InitializationMetrics | null = null;
  private readonly numThreads: number;
  private readonly recognitionBatchSize: number;

  constructor(options: BrowserOcrEngineOptions = {}) {
    this.numThreads = clampInteger(options.numThreads, 1, 8, DEFAULT_NUM_THREADS);
    this.recognitionBatchSize = clampInteger(
      options.recognitionBatchSize,
      1,
      32,
      DEFAULT_REC_BATCH_SIZE
    );
  }

  get initialized(): boolean {
    return Boolean(this.detectionSession && this.recognitionSession);
  }

  async initialize(report: StageReporter = () => undefined): Promise<InitializationResult> {
    if (this.initializationMetrics && this.initialized) {
      return { metrics: this.initializationMetrics, reused: true };
    }
    const totalStart = now();
    const effectiveThreads = globalThis.crossOriginIsolated === true ? this.numThreads : 1;
    ort.env.wasm.numThreads = effectiveThreads;
    ort.env.wasm.simd = true;
    ort.env.wasm.proxy = false;
    ort.env.wasm.initTimeout = 30_000;
    ort.env.wasm.wasmPaths = { mjs: ORT_MJS_URL, wasm: ORT_WASM_URL };

    report("读取本地 tiny 模型");
    const assetsStart = now();
    const [detectionFiles, recognitionFiles] = await Promise.all([
      loadModel(DET_MODEL_URL, "检测"),
      loadModel(REC_MODEL_URL, "识别")
    ]);
    const assetsMs = elapsed(assetsStart);
    this.dictionary = parseCharacterDictionary(recognitionFiles.config);

    report("初始化 WASM 和检测模型");
    const detectionStart = now();
    this.detectionSession = await ort.InferenceSession.create(detectionFiles.model, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
    const detectionSessionMs = elapsed(detectionStart);

    report("初始化识别模型");
    const recognitionStart = now();
    this.recognitionSession = await ort.InferenceSession.create(recognitionFiles.model, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
    const recognitionSessionMs = elapsed(recognitionStart);

    this.initializationMetrics = {
      assetsMs,
      detectionSessionMs,
      recognitionSessionMs,
      totalMs: elapsed(totalStart),
      detectionModelBytes: detectionFiles.model.byteLength,
      recognitionModelBytes: recognitionFiles.model.byteLength,
      runtimeBytes: 12_361_745,
      numThreads: effectiveThreads,
      recognitionBatchSize: this.recognitionBatchSize,
      crossOriginIsolated: globalThis.crossOriginIsolated === true
    };
    report("OCR 引擎已就绪");
    return { metrics: this.initializationMetrics, reused: false };
  }

  async recognize(image: ImageData, report: StageReporter = () => undefined): Promise<RecognitionResult> {
    if (!this.detectionSession || !this.recognitionSession) await this.initialize(report);
    const detectionSession = this.detectionSession;
    const recognitionSession = this.recognitionSession;
    if (!detectionSession || !recognitionSession) throw new Error("OCR 引擎未初始化");

    const totalStart = now();
    report("检测预处理");
    const detPrepStart = now();
    const prep = prepareDetection(image);
    const detectionPreprocessMs = elapsed(detPrepStart);

    report("检测文字区域");
    const detInferenceStart = now();
    const detectionOutput = await runSession(detectionSession, prep.tensor);
    const detectionInferenceMs = elapsed(detInferenceStart);

    report("整理文字区域");
    const detPostStart = now();
    const boxes = decodeDetection(detectionOutput, prep);
    const detectionPostprocessMs = elapsed(detPostStart);

    report(`裁剪 ${boxes.length} 个文字区域`);
    const cropStart = now();
    const crops = boxes.map((box) => cropQuadrilateral(image, box.poly));
    const cropMs = elapsed(cropStart);

    report("识别预处理");
    const recPrepStart = now();
    const samples = prepareRecognition(crops);
    const recognitionPreprocessMs = elapsed(recPrepStart);
    const decoded: Array<{ inputIndex: number; text: string; score: number }> = [];
    let recognitionInferenceMs = 0;
    let recognitionDecodeMs = 0;
    const ordered = samples.slice().sort((a, b) => a.width - b.width);
    for (let offset = 0; offset < ordered.length; offset += this.recognitionBatchSize) {
      const batch = ordered.slice(offset, offset + this.recognitionBatchSize);
      report(`识别文字 ${Math.min(offset + batch.length, ordered.length)}/${ordered.length}`);
      const inferenceStart = now();
      const output = await runSession(recognitionSession, packRecognitionBatch(batch));
      recognitionInferenceMs += elapsed(inferenceStart);
      const decodeStart = now();
      const batchResults = decodeRecognition(output, this.dictionary);
      recognitionDecodeMs += elapsed(decodeStart);
      batchResults.forEach((result, index) => {
        const sample = batch[index];
        if (sample) decoded.push({ inputIndex: sample.inputIndex, ...result });
      });
    }
    decoded.sort((a, b) => a.inputIndex - b.inputIndex);
    const lines = decoded
      .map((result, index) => ({ ...result, poly: boxes[index]?.poly ?? [] }))
      .filter((result) => result.text.trim().length > 0);

    return {
      text: lines.map((line) => line.text).join("\n"),
      lines,
      metrics: {
        detectionPreprocessMs,
        detectionInferenceMs,
        detectionPostprocessMs,
        cropMs,
        recognitionPreprocessMs,
        recognitionInferenceMs: Math.round(recognitionInferenceMs * 10) / 10,
        recognitionDecodeMs: Math.round(recognitionDecodeMs * 10) / 10,
        totalMs: elapsed(totalStart),
        detectedBoxes: boxes.length,
        recognizedLines: lines.length
      }
    };
  }

  async dispose(): Promise<void> {
    await Promise.all([this.detectionSession?.release(), this.recognitionSession?.release()]);
    this.detectionSession = null;
    this.recognitionSession = null;
    this.dictionary = [];
    this.initializationMetrics = null;
  }
}
