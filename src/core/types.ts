export type UiLanguage = "zh-CN" | "zh-TW" | "en";

export interface NoteMetrics {
  likedCount?: string;
  collectedCount?: string;
  commentCount?: string;
  sharedCount?: string;
}

export type OcrPoint = [number, number];

export interface OcrLine {
  text: string;
  score: number;
  poly?: OcrPoint[];
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
  | "loading-runtime"
  | "loading-models"
  | "creating-sessions"
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
  pipelineVersion: number;
  noteId: string;
  imageIndexes: number[];
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
  currentSourceImage?: number;
  currentImageStartedAt?: string;
  stageDurations: OcrStageDurations;
  durationMs?: number;
  error?: string;
  updatedAt: string;
}

export type AutoClipOutput = "download" | "obsidian";

export type AutoClipDuplicatePolicy = "skip" | "new-version" | "overwrite";

export interface AutoClipCandidate {
  url: string;
  title: string;
}

export type AutoClipItemStatus =
  | "queued"
  | "opening"
  | "extracting"
  | "ocr"
  | "exporting"
  | "completed"
  | "skipped"
  | "error";

export interface AutoClipQueueItem extends AutoClipCandidate {
  status: AutoClipItemStatus;
  noteId?: string;
  filename?: string;
  error?: string;
}

export interface AutoClipHistoryEntry {
  noteId: string;
  title: string;
  url: string;
  filename: string;
  output: AutoClipOutput;
  completedAt: string;
}

export interface AutoClipPanelState {
  taskId?: string;
  running: boolean;
  output?: AutoClipOutput;
  currentIndex: number;
  total: number;
  progress: number;
  stage?: OcrStage;
  queue: AutoClipQueueItem[];
  history: AutoClipHistoryEntry[];
}

export type BackgroundRequest =
  | {
      target: "background";
      type: "AUTO_CLIP_BATCH";
      items: AutoClipCandidate[];
      output: AutoClipOutput;
      duplicatePolicy: AutoClipDuplicatePolicy;
      ocrEnabled: boolean;
      ocrMode: "all" | "skip-cover" | "custom";
      ocrRange: string;
    }
  | { target: "background"; type: "OPEN_OPTIONS_PAGE" }
  | { target: "background"; type: "GET_AUTO_CLIP_STATE" }
  | {
      target: "background";
      type: "TEST_OBSIDIAN_CONNECTION";
      apiBaseUrl: string;
      apiKey: string;
    }
  | {
      target: "background";
      type: "WRITE_OBSIDIAN_NOTE";
      filename: string;
      markdown: string;
      overwrite?: boolean;
    }
  | {
      target: "background";
      type: "RUN_OCR";
      note: Note;
      imageIndexes: number[];
    }
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
      currentSourceImage?: number;
      currentImageStartedAt?: string;
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

export interface AutoClipStatusMessage {
  target: "content";
  type: "AUTO_CLIP_STATUS";
  state: AutoClipPanelState;
}

export type OffscreenRequest =
  | { target: "offscreen"; type: "PREWARM_OCR" }
  | {
      target: "offscreen";
      type: "PROCESS_OCR";
      jobId: string;
      images: Array<{ imageIndex: number; url: string }>;
    }
  | {
      target: "offscreen";
      type: "CANCEL_OCR";
      jobId: string;
      abortInitialization?: boolean;
    }
  | { target: "offscreen"; type: "PAUSE_OCR"; jobId: string }
  | { target: "offscreen"; type: "RESUME_OCR"; jobId: string }
  | { target: "offscreen"; type: "HAS_OCR_JOB"; jobId: string };

export interface PopupJobUpdate {
  target: "popup";
  type: "OCR_JOB_UPDATED";
  job: OcrJob;
}

export interface PopupJobProgressPatch {
  target: "popup";
  type: "OCR_JOB_PROGRESS";
  jobId: string;
  patch: Partial<
    Pick<
      OcrJob,
      | "stage"
      | "progress"
      | "stageStartedAt"
      | "currentImage"
      | "currentSourceImage"
      | "currentImageStartedAt"
      | "stageDurations"
      | "updatedAt"
    >
  >;
}
