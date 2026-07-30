import type { Note, OcrJob } from "./types";

export const OCR_PIPELINE_VERSION = 4;
export const OCR_ENABLED_KEY = "ocrEnabled";

export function sameOcrJobSource(job: OcrJob, note: Note): boolean {
  return (
    job.noteId === note.id &&
    job.imageIndexes.length === job.imageUrls.length &&
    job.imageIndexes.length > 0 &&
    job.imageUrls.every(
      (url, index) => url === note.images[job.imageIndexes[index] ?? -1]?.url
    )
  );
}

export function shouldReuseOcrJob(job: OcrJob, note: Note, workerActive: boolean): boolean {
  if (job.pipelineVersion !== OCR_PIPELINE_VERSION) return false;
  if (!sameOcrJobSource(job, note)) return false;
  if (job.status === "completed") return true;
  return (
    workerActive &&
    ["running", "pausing", "paused", "canceling"].includes(job.status)
  );
}
