export type UiLanguage = "zh-CN" | "en";

export interface NoteMetrics {
  likedCount?: string;
  collectedCount?: string;
  commentCount?: string;
  sharedCount?: string;
}

export interface OcrLine {
  text: string;
  score: number;
}

export interface OcrImageResult {
  imageIndex: number;
  text: string;
  lines: OcrLine[];
  status: "success" | "empty" | "error";
  durationMs?: number;
  error?: string;
}

export interface NoteImage {
  index: number;
  url: string;
  width?: number;
  height?: number;
  ocr?: OcrImageResult;
}

export interface Note {
  id: string;
  url: string;
  platform: "xiaohongshu";
  title: string;
  body: string;
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
  cover?: string;
  images: NoteImage[];
  tags: string[];
  publishedAt?: string;
  capturedAt: string;
  metrics: NoteMetrics;
  extractionSource: "initial-state" | "dom";
}

export interface OcrJob {
  id: string;
  noteId: string;
  imageUrls: string[];
  status: "running" | "completed" | "canceling" | "canceled" | "error";
  current: number;
  total: number;
  results: Array<OcrImageResult | null>;
  error?: string;
  updatedAt: string;
}

export type BackgroundRequest =
  | { target: "background"; type: "RUN_OCR"; note: Note }
  | { target: "background"; type: "CANCEL_OCR"; jobId: string }
  | {
      target: "background";
      type: "OCR_PROGRESS";
      jobId: string;
      result: OcrImageResult;
      current: number;
      total: number;
    }
  | {
      target: "background";
      type: "OCR_FINISHED";
      jobId: string;
      status: "completed" | "canceled" | "error";
      error?: string;
    };

export type OffscreenRequest =
  | {
      target: "offscreen";
      type: "PROCESS_OCR";
      jobId: string;
      imageUrls: string[];
    }
  | { target: "offscreen"; type: "CANCEL_OCR"; jobId: string };

export interface PopupJobUpdate {
  target: "popup";
  type: "OCR_JOB_UPDATED";
  job: OcrJob;
}
