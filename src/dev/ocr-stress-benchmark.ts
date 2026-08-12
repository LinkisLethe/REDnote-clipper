import { BrowserOcrEngine } from "../core/browser-ocr-engine";

interface MemoryBreakdownEntry {
  bytes: number;
}

interface UserAgentSpecificMemoryResult {
  bytes: number;
  breakdown?: MemoryBreakdownEntry[];
}

declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
    };
    measureUserAgentSpecificMemory?: () => Promise<UserAgentSpecificMemoryResult>;
  }
}

interface BenchmarkSample {
  iteration: number;
  durationMs: number;
  recognizedLines: number;
  detectedBoxes: number;
  jsHeapBytes?: number;
  totalMemoryBytes?: number;
}

function integerParameter(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = new URLSearchParams(location.search).get(name);
  if (value === null) return fallback;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(raw)));
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function createBenchmarkImage(width: number, height: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable.");
  context.fillStyle = "#f7f4ec";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#171717";
  context.font = "600 38px Arial, sans-serif";
  context.fillText("XHS CLIPPER OCR STRESS TEST", 54, 82);
  context.font = "28px Arial, sans-serif";
  const lines = [
    "GPA 3.82 / 4.00   TOEFL 108   GRE 327",
    "Computer Science 2027 Fall Application",
    "Research: computer vision and robotics",
    "Offer: University A, University B",
    "Timeline: September to January",
    "Internship: perception engineering",
    "Scholarship application checklist",
    "Statement of purpose and recommendation",
    "OCR must preserve every line in order",
    "Local processing, no image upload"
  ];
  for (let row = 0; row < 28; row += 1) {
    context.fillText(lines[row % lines.length] || "", 54, 140 + row * 38);
  }
  return context.getImageData(0, 0, width, height);
}

async function measureMemory(): Promise<{
  jsHeapBytes?: number;
  totalMemoryBytes?: number;
}> {
  const jsHeapBytes = performance.memory?.usedJSHeapSize;
  if (!performance.measureUserAgentSpecificMemory) return { jsHeapBytes };
  try {
    const result = await performance.measureUserAgentSpecificMemory();
    return { jsHeapBytes, totalMemoryBytes: result.bytes };
  } catch {
    return { jsHeapBytes };
  }
}

async function runBenchmark(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#runBenchmark")!;
  const status = document.querySelector<HTMLElement>("#benchmarkStatus")!;
  const output = document.querySelector<HTMLElement>("#benchmarkResult")!;
  const iterations = integerParameter("iterations", 30, 5, 200);
  const warmup = integerParameter("warmup", 2, 1, 10);
  const engine = new BrowserOcrEngine({ numThreads: 4, recognitionBatchSize: 8 });
  const image = createBenchmarkImage(960, 1280);
  const samples: BenchmarkSample[] = [];
  button.disabled = true;
  status.textContent = "initializing";
  const initStart = performance.now();
  const initialization = await engine.initialize();
  const initializationMs = performance.now() - initStart;

  try {
    for (let iteration = 0; iteration < warmup; iteration += 1) {
      status.textContent = `warmup ${iteration + 1}/${warmup}`;
      await engine.recognize(image);
    }
    const memoryBefore = await measureMemory();
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      status.textContent = `running ${iteration + 1}/${iterations}`;
      const startedAt = performance.now();
      const result = await engine.recognize(image);
      const durationMs = performance.now() - startedAt;
      samples.push({
        iteration: iteration + 1,
        durationMs: round(durationMs),
        recognizedLines: result.metrics.recognizedLines,
        detectedBoxes: result.metrics.detectedBoxes,
        jsHeapBytes: performance.memory?.usedJSHeapSize
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const durations = samples.map((sample) => sample.durationMs);
    const window = Math.max(3, Math.floor(iterations / 5));
    const firstWindow = durations.slice(0, window);
    const lastWindow = durations.slice(-window);
    const memoryAfter = await measureMemory();
    const result = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      crossOriginIsolated: globalThis.crossOriginIsolated,
      iterations,
      warmup,
      initializationMs: round(initializationMs),
      initialization: initialization.metrics,
      durationMs: {
        average: round(average(durations)),
        p50: round(percentile(durations, 0.5)),
        p95: round(percentile(durations, 0.95)),
        minimum: round(Math.min(...durations)),
        maximum: round(Math.max(...durations)),
        firstWindowAverage: round(average(firstWindow)),
        lastWindowAverage: round(average(lastWindow)),
        slowdownRatio: round(average(lastWindow) / Math.max(1, average(firstWindow)))
      },
      memoryBytes: {
        before: memoryBefore,
        after: {
          jsHeapBytes: memoryAfter.jsHeapBytes,
          totalMemoryBytes: memoryAfter.totalMemoryBytes
        },
        jsHeapGrowth: (memoryAfter.jsHeapBytes || 0) - (memoryBefore.jsHeapBytes || 0),
        totalGrowth:
          (memoryAfter.totalMemoryBytes || 0) - (memoryBefore.totalMemoryBytes || 0)
      },
      recognition: {
        minimumLines: Math.min(...samples.map((sample) => sample.recognizedLines)),
        maximumLines: Math.max(...samples.map((sample) => sample.recognizedLines)),
        failures: samples.filter((sample) => sample.recognizedLines === 0).length
      },
      samples
    };
    output.textContent = JSON.stringify(result, null, 2);
    status.textContent = "completed";
  } finally {
    await engine.dispose();
    button.disabled = false;
  }
}

document.querySelector<HTMLButtonElement>("#runBenchmark")?.addEventListener("click", () => {
  void runBenchmark().catch((error) => {
    document.querySelector<HTMLElement>("#benchmarkStatus")!.textContent = "failed";
    document.querySelector<HTMLElement>("#benchmarkResult")!.textContent =
      error instanceof Error ? error.stack || error.message : String(error);
  });
});

export {};
