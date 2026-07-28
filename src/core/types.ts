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

export type OcrStage =
  | "checking-cache"
  | "downloading-models"
  | "initializing-engine"
  | "recognizing-images"
  | "finalizing";

export type OcrStageDurations = Partial<Record<OcrStage, number>>;

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
  status:
    | "running"
    | "pausing"
    | "paused"
    | "completed"
    | "canceling"
    | "canceled"
    | "error";
  current: number;
  total: number;
  results: Array<OcrImageResult | null>;
  stage: OcrStage;
  progress: number;
  startedAt: string;
  stageStartedAt: string;
  currentImage?: number;
  currentImageStartedAt?: string;
  bytesLoaded?: number;
  bytesTotal?: number;
  bytesCached?: number;
  stageDurations: OcrStageDurations;
  durationMs?: number;
  error?: string;
  updatedAt: string;
}

export type BackgroundRequest =
  | { target: "background"; type: "RUN_OCR"; note: Note }
  | { target: "background"; type: "CANCEL_OCR"; jobId: string }
  | { target: "background"; type: "PAUSE_OCR"; jobId: string }
  | { target: "background"; type: "RESUME_OCR"; jobId: string }
  | { target: "background"; type: "OCR_PAUSED"; jobId: string }
  | {
      target: "background";
      type: "OCR_STAGE_PROGRESS";
      jobId: string;
      stage: OcrStage;
      progress: number;
      stageStartedAt: string;
      currentImage?: number;
      currentImageStartedAt?: string;
      bytesLoaded?: number;
      bytesTotal?: number;
      bytesCached?: number;
      stageDurations?: OcrStageDurations;
    }
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
      durationMs?: number;
      stageDurations?: OcrStageDurations;
      error?: string;
    };

export type OffscreenRequest =
  | {
      target: "offscreen";
      type: "PROCESS_OCR";
      jobId: string;
      imageUrls: string[];
    }
  | {
      target: "offscreen";
      type: "CANCEL_OCR";
      jobId: string;
      abortInitialization?: boolean;
    }
  | { target: "offscreen"; type: "PAUSE_OCR"; jobId: string }
  | { target: "offscreen"; type: "RESUME_OCR"; jobId: string };

export interface PopupJobUpdate {
  target: "popup";
  type: "OCR_JOB_UPDATED";
  job: OcrJob;
}
