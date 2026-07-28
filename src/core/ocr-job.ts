import type { Note, OcrJob } from "./types";

export function sameOcrJobSource(job: OcrJob, note: Note): boolean {
  return (
    job.noteId === note.id &&
    job.imageUrls.length === note.images.length &&
    job.imageUrls.every((url, index) => url === note.images[index]?.url)
  );
}

export function shouldReuseOcrJob(job: OcrJob, note: Note, workerActive: boolean): boolean {
  if (!sameOcrJobSource(job, note)) return false;
  if (job.status === "completed") return true;
  return (
    workerActive &&
    ["running", "pausing", "paused", "canceling"].includes(job.status)
  );
}
