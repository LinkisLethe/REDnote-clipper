import type {
  BackgroundRequest,
  Note,
  OcrJob,
  OffscreenRequest,
  PopupJobUpdate
} from "./core/types";
import { shouldReuseOcrJob } from "./core/ocr-job";

const OCR_JOB_KEY = "lastOcrJob";
const OCR_ENABLED_KEY = "ocrEnabled";
const OFFSCREEN_TIMEOUT_MS = 10_000;
const XIAOHONGSHU_NOTE_URL =
  /^https:\/\/([^.]+\.)?xiaohongshu\.com\/(?:explore|discovery\/item)\//i;
let creatingOffscreen: Promise<void> | null = null;
let prewarmingOcr: Promise<void> | null = null;

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

async function hasOffscreenDocument(): Promise<boolean> {
  if (chrome.runtime.getContexts) {
    const contexts = await withTimeout(
      chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [chrome.runtime.getURL("offscreen.html")]
      }),
      OFFSCREEN_TIMEOUT_MS,
      "Checking the OCR background page timed out."
    );
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = withTimeout(
      chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.BLOBS, chrome.offscreen.Reason.WORKERS],
        justification: "Run local OCR workers and process image blobs outside the popup."
      }),
      OFFSCREEN_TIMEOUT_MS,
      "Creating the OCR background page timed out."
    )
      .finally(() => {
        creatingOffscreen = null;
      });
  }
  await creatingOffscreen;
}

async function prewarmOcrForUrl(url: string | undefined): Promise<void> {
  if (!url || !XIAOHONGSHU_NOTE_URL.test(url)) return;
  const settings = await chrome.storage.local.get(OCR_ENABLED_KEY);
  if (!settings[OCR_ENABLED_KEY]) return;
  if (!prewarmingOcr) {
    prewarmingOcr = (async () => {
      await ensureOffscreenDocument();
      const request: OffscreenRequest = { target: "offscreen", type: "PREWARM_OCR" };
      await withTimeout(
        chrome.runtime.sendMessage(request),
        OFFSCREEN_TIMEOUT_MS,
        "Starting OCR prewarm timed out."
      );
    })().finally(() => {
      prewarmingOcr = null;
    });
  }
  await prewarmingOcr;
}

async function saveJob(job: OcrJob): Promise<void> {
  await chrome.storage.local.set({ [OCR_JOB_KEY]: job });
}

async function getJob(): Promise<OcrJob | undefined> {
  const value = await chrome.storage.local.get(OCR_JOB_KEY);
  return value[OCR_JOB_KEY] as OcrJob | undefined;
}

async function hasActiveOcrJob(jobId: string): Promise<boolean> {
  if (!(await hasOffscreenDocument())) return false;
  try {
    const request: OffscreenRequest = {
      target: "offscreen",
      type: "HAS_OCR_JOB",
      jobId
    };
    const response = (await withTimeout(
      chrome.runtime.sendMessage(request),
      OFFSCREEN_TIMEOUT_MS,
      "Checking the OCR task timed out."
    )) as { active?: boolean };
    return Boolean(response?.active);
  } catch {
    return false;
  }
}

async function notifyPopup(job: OcrJob): Promise<void> {
  const message: PopupJobUpdate = { target: "popup", type: "OCR_JOB_UPDATED", job };
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // The popup may be closed. The job remains available in extension storage.
  }
}

async function startOcr(note: Note): Promise<OcrJob> {
  const previous = await getJob();
  if (
    previous &&
    ["running", "pausing", "paused", "canceling"].includes(previous.status)
  ) {
    try {
      await ensureOffscreenDocument();
      const cancel: OffscreenRequest = {
        target: "offscreen",
        type: "CANCEL_OCR",
        jobId: previous.id,
        abortInitialization: false
      };
      await chrome.runtime.sendMessage(cancel);
    } catch {
      // A new job supersedes the old one even if its worker has already stopped.
    }
  }
  const startedAt = new Date().toISOString();
  const job: OcrJob = {
    id: crypto.randomUUID(),
    noteId: note.id,
    imageUrls: note.images.map((image) => image.url),
    status: "running",
    current: 0,
    total: note.images.length,
    results: note.images.map(() => null),
    stage: "loading-runtime",
    progress: 5,
    startedAt,
    stageStartedAt: startedAt,
    stageDurations: {},
    updatedAt: startedAt
  };
  await saveJob(job);
  await ensureOffscreenDocument();
  const request: OffscreenRequest = {
    target: "offscreen",
    type: "PROCESS_OCR",
    jobId: job.id,
    imageUrls: job.imageUrls
  };
  await withTimeout(
    chrome.runtime.sendMessage(request),
    OFFSCREEN_TIMEOUT_MS,
    "Starting the OCR task timed out."
  );
  return job;
}

async function restoreOrStartOcr(note: Note): Promise<OcrJob> {
  const stored = await getJob();
  if (stored) {
    const workerActive = stored.status === "completed"
      ? false
      : await hasActiveOcrJob(stored.id);
    if (shouldReuseOcrJob(stored, note, workerActive)) return stored;
  }
  return startOcr(note);
}

async function updateStage(
  message: Extract<BackgroundRequest, { type: "OCR_STAGE_PROGRESS" }>
): Promise<OcrJob | undefined> {
  const job = await getJob();
  if (!job || job.id !== message.jobId) return undefined;
  if (["completed", "canceled", "error"].includes(job.status)) return job;
  const updated: OcrJob = {
    ...job,
    stage: message.stage,
    progress: Math.max(0, Math.min(100, message.progress)),
    stageStartedAt: message.stageStartedAt,
    currentImage: message.currentImage,
    currentImageStartedAt: message.currentImageStartedAt,
    bytesLoaded: message.bytesLoaded,
    bytesTotal: message.bytesTotal,
    bytesCached: message.bytesCached,
    stageDurations: { ...job.stageDurations, ...message.stageDurations },
    updatedAt: new Date().toISOString()
  };
  await saveJob(updated);
  await notifyPopup(updated);
  return updated;
}

async function cancelOcr(jobId: string): Promise<OcrJob | undefined> {
  const job = await getJob();
  if (!job || job.id !== jobId || !["running", "pausing", "paused"].includes(job.status)) {
    return job;
  }
  const updated: OcrJob = {
    ...job,
    status: "canceled",
    durationMs: Math.max(
      0,
      Date.now() - (Date.parse(job.startedAt || job.updatedAt) || Date.now())
    ),
    updatedAt: new Date().toISOString()
  };
  await saveJob(updated);
  await notifyPopup(updated);
  await ensureOffscreenDocument();
  const request: OffscreenRequest = {
    target: "offscreen",
    type: "CANCEL_OCR",
    jobId,
    abortInitialization: true
  };
  await chrome.runtime.sendMessage(request);
  return updated;
}

async function pauseOcr(jobId: string): Promise<OcrJob | undefined> {
  const job = await getJob();
  if (!job || job.id !== jobId || job.status !== "running") return job;
  const updated: OcrJob = {
    ...job,
    status: "pausing",
    updatedAt: new Date().toISOString()
  };
  await saveJob(updated);
  await notifyPopup(updated);
  await ensureOffscreenDocument();
  const request: OffscreenRequest = { target: "offscreen", type: "PAUSE_OCR", jobId };
  await chrome.runtime.sendMessage(request);
  return updated;
}

async function markPaused(jobId: string): Promise<OcrJob | undefined> {
  const job = await getJob();
  if (!job || job.id !== jobId || job.status !== "pausing") return job;
  const updated: OcrJob = {
    ...job,
    status: "paused",
    updatedAt: new Date().toISOString()
  };
  await saveJob(updated);
  await notifyPopup(updated);
  return updated;
}

async function resumeOcr(jobId: string): Promise<OcrJob | undefined> {
  const job = await getJob();
  if (!job || job.id !== jobId || !["pausing", "paused"].includes(job.status)) return job;
  const updated: OcrJob = {
    ...job,
    status: "running",
    updatedAt: new Date().toISOString()
  };
  await saveJob(updated);
  await notifyPopup(updated);
  await ensureOffscreenDocument();
  const request: OffscreenRequest = { target: "offscreen", type: "RESUME_OCR", jobId };
  await chrome.runtime.sendMessage(request);
  return updated;
}

async function updateProgress(
  message: Extract<BackgroundRequest, { type: "OCR_PROGRESS" }>
): Promise<OcrJob | undefined> {
  const job = await getJob();
  if (!job || job.id !== message.jobId) return undefined;
  if (["completed", "canceled", "error"].includes(job.status)) return job;
  const results = [...job.results];
  results[message.result.imageIndex] = message.result;
  const updated: OcrJob = {
    ...job,
    current: message.current,
    total: message.total,
    results,
    stage: "recognizing-images",
    progress: Math.max(
      job.progress || 0,
      50 + Math.round((message.current / Math.max(1, message.total)) * 45)
    ),
    updatedAt: new Date().toISOString()
  };
  await saveJob(updated);
  await notifyPopup(updated);
  return updated;
}

async function finishOcr(
  message: Extract<BackgroundRequest, { type: "OCR_FINISHED" }>
): Promise<OcrJob | undefined> {
  const job = await getJob();
  if (!job || job.id !== message.jobId) return undefined;
  const finalStatus = job.status === "canceled" ? "canceled" : message.status;
  const updated: OcrJob = {
    ...job,
    status: finalStatus,
    error: finalStatus === "canceled" ? undefined : message.error,
    current: finalStatus === "completed" ? job.total : job.current,
    progress: finalStatus === "completed" ? 100 : job.progress,
    durationMs:
      message.durationMs ??
      Math.max(0, Date.now() - (Date.parse(job.startedAt || job.updatedAt) || Date.now())),
    stageDurations: { ...job.stageDurations, ...message.stageDurations },
    updatedAt: new Date().toISOString()
  };
  await saveJob(updated);
  await notifyPopup(updated);
  return updated;
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const request = message as Partial<BackgroundRequest>;
  if (request.target !== "background") return false;

  let operation: Promise<unknown>;
  switch (request.type) {
    case "RUN_OCR":
      operation = startOcr(
        (request as Extract<BackgroundRequest, { type: "RUN_OCR" }>).note
      );
      break;
    case "RESTORE_OR_RUN_OCR":
      operation = restoreOrStartOcr(
        (request as Extract<BackgroundRequest, { type: "RESTORE_OR_RUN_OCR" }>).note
      );
      break;
    case "CANCEL_OCR":
      operation = cancelOcr(
        (request as Extract<BackgroundRequest, { type: "CANCEL_OCR" }>).jobId
      );
      break;
    case "PAUSE_OCR":
      operation = pauseOcr(
        (request as Extract<BackgroundRequest, { type: "PAUSE_OCR" }>).jobId
      );
      break;
    case "RESUME_OCR":
      operation = resumeOcr(
        (request as Extract<BackgroundRequest, { type: "RESUME_OCR" }>).jobId
      );
      break;
    case "OCR_PAUSED":
      operation = markPaused(
        (request as Extract<BackgroundRequest, { type: "OCR_PAUSED" }>).jobId
      );
      break;
    case "OCR_PROGRESS":
      operation = updateProgress(
        request as Extract<BackgroundRequest, { type: "OCR_PROGRESS" }>
      );
      break;
    case "OCR_STAGE_PROGRESS":
      operation = updateStage(
        request as Extract<BackgroundRequest, { type: "OCR_STAGE_PROGRESS" }>
      );
      break;
    case "OCR_FINISHED":
      operation = finishOcr(
        request as Extract<BackgroundRequest, { type: "OCR_FINISHED" }>
      );
      break;
    default:
      return false;
  }

  operation.then(sendResponse).catch((error: unknown) => {
    sendResponse({ error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  void prewarmOcrForUrl(url).catch((error) => {
    console.warn("OCR prewarm was skipped", error);
  });
});
