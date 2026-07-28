import type {
  BackgroundRequest,
  Note,
  OcrJob,
  OffscreenRequest,
  PopupJobUpdate
} from "./core/types";

const OCR_JOB_KEY = "lastOcrJob";
let creatingOffscreen: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL("offscreen.html")]
    });
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.BLOBS],
        justification: "Run local OCR and process image blobs outside the popup."
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }
  await creatingOffscreen;
}

async function saveJob(job: OcrJob): Promise<void> {
  await chrome.storage.local.set({ [OCR_JOB_KEY]: job });
}

async function getJob(): Promise<OcrJob | undefined> {
  const value = await chrome.storage.local.get(OCR_JOB_KEY);
  return value[OCR_JOB_KEY] as OcrJob | undefined;
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
  if (previous && ["running", "pausing", "paused", "canceling"].includes(previous.status)) {
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
    stage: "checking-cache",
    progress: 0,
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
  await chrome.runtime.sendMessage(request);
  return job;
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
      operation = startOcr((request as Extract<BackgroundRequest, { type: "RUN_OCR" }>).note);
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
