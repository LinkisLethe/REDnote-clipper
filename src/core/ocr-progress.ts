import type { OcrJob, OcrStageDurations } from "./types";

const DEFAULT_INITIALIZATION_MS = 500;
const DEFAULT_RUNTIME_LOAD_MS = 50;
const DEFAULT_MODEL_READ_MS = 150;
const DEFAULT_SESSION_CREATE_MS = 300;
const DEFAULT_IMAGE_MS = 500;
const DEFAULT_FINALIZATION_MS = 100;

const INITIALIZATION_STAGES = [
  "loading-runtime",
  "initializing-opencv",
  "probing-webgpu",
  "loading-models",
  "creating-sessions"
] as const;

export function initializationDurationMs(durations: OcrStageDurations): number {
  return INITIALIZATION_STAGES.reduce(
    (total, stage) => total + (durations[stage] || 0),
    0
  );
}

function timestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function liveStageDurations(
  job: OcrJob,
  now = Date.now()
): OcrStageDurations {
  const durations = { ...(job.stageDurations || {}) };
  if (job.status === "running" || job.status === "pausing" || job.status === "canceling") {
    const liveDuration = Math.max(0, now - timestamp(job.stageStartedAt));
    durations[job.stage] = (durations[job.stage] || 0) + liveDuration;
  }
  return durations;
}

export function estimateRemainingMs(job: OcrJob, now = Date.now()): number | undefined {
  if (job.status === "paused") return undefined;
  if (!["running", "pausing", "canceling"].includes(job.status)) return 0;
  const stageElapsed = Math.max(0, now - timestamp(job.stageStartedAt));
  const completedDurations = job.results
    .map((result) => result?.durationMs)
    .filter((duration): duration is number => typeof duration === "number" && duration > 0);
  const averageImageMs = completedDurations.length
    ? completedDurations.reduce((sum, duration) => sum + duration, 0) /
      completedDurations.length
    : DEFAULT_IMAGE_MS;
  const imagesRemaining = Math.max(0, job.total - job.current);
  const imageStartedAt = timestamp(job.currentImageStartedAt);
  const currentImageElapsed =
    job.stage === "recognizing-images" && job.currentImage
      ? Math.max(0, now - imageStartedAt)
      : 0;
  const recognitionRemaining = Math.max(
    0,
    imagesRemaining * averageImageMs - currentImageElapsed
  );

  switch (job.stage) {
    case "checking-cache":
      return DEFAULT_INITIALIZATION_MS + recognitionRemaining + DEFAULT_FINALIZATION_MS;
    case "downloading-models": {
      const cached = job.bytesCached || 0;
      const loaded = Math.max(0, (job.bytesLoaded || 0) - cached);
      const total = Math.max(0, (job.bytesTotal || 0) - cached);
      const downloadRemaining =
        loaded > 0 && total > loaded ? (stageElapsed * (total - loaded)) / loaded : undefined;
      if (downloadRemaining === undefined) return undefined;
      return downloadRemaining + DEFAULT_INITIALIZATION_MS + recognitionRemaining;
    }
    case "initializing-engine":
      return (
        Math.max(0, DEFAULT_INITIALIZATION_MS - stageElapsed) +
        recognitionRemaining +
        DEFAULT_FINALIZATION_MS
      );
    case "loading-runtime":
      return (
        Math.max(0, DEFAULT_RUNTIME_LOAD_MS - stageElapsed) +
        DEFAULT_MODEL_READ_MS +
        DEFAULT_SESSION_CREATE_MS +
        recognitionRemaining +
        DEFAULT_FINALIZATION_MS
      );
    case "initializing-opencv":
    case "probing-webgpu":
      return (
        DEFAULT_MODEL_READ_MS +
        DEFAULT_SESSION_CREATE_MS +
        recognitionRemaining +
        DEFAULT_FINALIZATION_MS
      );
    case "loading-models":
      return (
        Math.max(0, DEFAULT_MODEL_READ_MS - stageElapsed) +
        DEFAULT_SESSION_CREATE_MS +
        recognitionRemaining +
        DEFAULT_FINALIZATION_MS
      );
    case "creating-sessions":
      return (
        Math.max(0, DEFAULT_SESSION_CREATE_MS - stageElapsed) +
        recognitionRemaining +
        DEFAULT_FINALIZATION_MS
      );
    case "recognizing-images":
      return recognitionRemaining + DEFAULT_FINALIZATION_MS;
    case "finalizing":
      return Math.max(0, DEFAULT_FINALIZATION_MS - stageElapsed);
  }
}
