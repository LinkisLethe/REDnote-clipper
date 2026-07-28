import "./popup.css";
import {
  extractXiaohongshuPage,
  normalizeExtractedNote,
  type ExtractionResponse
} from "./adapters/xiaohongshu";
import { createMarkdownFilename } from "./core/filename";
import { createMessageGetter, getUiLanguage, localizeDocument } from "./core/i18n";
import { applyOcrResults, renderMarkdown } from "./core/markdown";
import { estimateRemainingMs, liveStageDurations } from "./core/ocr-progress";
import { sameOcrJobSource } from "./core/ocr-job";
import type {
  BackgroundRequest,
  Note,
  OcrJob,
  PopupJobUpdate
} from "./core/types";

const OCR_ENABLED_KEY = "ocrEnabled";
const language = getUiLanguage();
const message = createMessageGetter(language);

const preview = document.querySelector<HTMLTextAreaElement>("#markdownPreview")!;
const statusPanel = document.querySelector<HTMLElement>("#statusPanel")!;
const statusText = document.querySelector<HTMLElement>("#statusText")!;
const ocrProgressPanel = document.querySelector<HTMLElement>("#ocrProgressPanel")!;
const ocrStageText = document.querySelector<HTMLElement>("#ocrStageText")!;
const ocrProgressTrack = document.querySelector<HTMLElement>("#ocrProgressTrack")!;
const ocrProgressBar = document.querySelector<HTMLElement>("#ocrProgressBar")!;
const ocrProgressValue = document.querySelector<HTMLElement>("#ocrProgressValue")!;
const ocrElapsed = document.querySelector<HTMLElement>("#ocrElapsed")!;
const ocrRemaining = document.querySelector<HTMLElement>("#ocrRemaining")!;
const ocrProgressDetail = document.querySelector<HTMLElement>("#ocrProgressDetail")!;
const ocrStepTimings = document.querySelector<HTMLElement>("#ocrStepTimings")!;
const directModelDownloadButton = document.querySelector<HTMLButtonElement>(
  "#directModelDownloadButton"
)!;
const pauseOcrButton = document.querySelector<HTMLButtonElement>("#pauseOcrButton")!;
const stopOcrButton = document.querySelector<HTMLButtonElement>("#stopOcrButton")!;
const noteMeta = document.querySelector<HTMLElement>("#noteMeta")!;
const ocrToggle = document.querySelector<HTMLInputElement>("#ocrToggle")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refreshButton")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copyButton")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#downloadButton")!;
const versionText = document.querySelector<HTMLElement>("#versionText")!;

let note: Note | null = null;
let currentJob: OcrJob | null = null;
let previewDirty = false;

function isExtensionRuntime(): boolean {
  return Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.scripting);
}

function setStatus(
  text: string,
  state: "working" | "success" | "error" | "neutral" = "neutral"
): void {
  statusText.textContent = text;
  statusPanel.hidden = false;
  statusPanel.className = `status-panel ${state === "neutral" ? "" : `is-${state}`}`.trim();
}

function setReady(enabled: boolean): void {
  copyButton.disabled = !enabled;
  downloadButton.disabled = !enabled;
}

function renderPreview(force = false): void {
  if (!note || (previewDirty && !force)) return;
  preview.value = renderMarkdown(note, {
    language,
    includeOcr: ocrToggle.checked
  });
  previewDirty = false;
}

function updateNoteMeta(): void {
  if (!note) {
    noteMeta.textContent = "";
    return;
  }
  const source = message(
    note.extractionSource === "initial-state" ? "sourceState" : "sourceDom"
  );
  noteMeta.textContent = `${message("noteMeta", [note.authorName, String(note.images.length)])} · ${message("extractedBy", source)}`;
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, durationMs) / 1000;
  if (seconds < 60) {
    const value = seconds === 0 ? "0" : seconds < 10 ? seconds.toFixed(1) : seconds.toFixed(0);
    return message("durationSeconds", value);
  }
  return message("durationMinutes", [String(Math.floor(seconds / 60)), String(Math.round(seconds % 60))]);
}

function stageMessage(job: OcrJob): string {
  if (job.status === "pausing") return message("ocrPausing");
  if (job.status === "paused") return message("ocrPaused");
  if (job.status === "completed") return message("ocrCompleted");
  if (job.status === "canceled") return message("ocrCanceled");
  if (job.status === "error") return message("ocrFailed", job.error || "Unknown error");
  switch (job.stage) {
    case "checking-cache":
      return message("ocrStageChecking");
    case "downloading-models":
      return message("ocrStageDownloading");
    case "initializing-engine":
      return message("ocrStageInitializing");
    case "recognizing-images":
      return message("ocrStageRecognizing", [
        String(job.currentImage || Math.min(job.current + 1, job.total)),
        String(job.total)
      ]);
    case "finalizing":
      return message("ocrStageFinalizing");
    default:
      return message("ocrStarting");
  }
}

function renderOcrProgress(job: OcrJob): void {
  const now = Date.now();
  const progress = job.status === "completed" ? 100 : Math.round(job.progress || 0);
  const startedAt = Date.parse(job.startedAt || job.updatedAt);
  const elapsedMs =
    job.durationMs ?? Math.max(0, now - (Number.isFinite(startedAt) ? startedAt : now));
  const remainingMs = estimateRemainingMs(job, now);
  const durations = liveStageDurations(job, now);

  ocrProgressPanel.hidden = false;
  statusPanel.hidden = true;
  ocrProgressPanel.classList.toggle(
    "is-paused",
    job.status === "pausing" || job.status === "paused"
  );
  ocrProgressPanel.classList.toggle("is-error", job.status === "error");
  ocrStageText.textContent = stageMessage(job);
  ocrProgressValue.textContent = `${progress}%`;
  ocrProgressBar.style.width = `${progress}%`;
  ocrProgressTrack.setAttribute("aria-valuenow", String(progress));
  ocrProgressTrack.classList.toggle(
    "is-indeterminate",
    job.status === "running" &&
      ["checking-cache", "initializing-engine", "finalizing"].includes(job.stage)
  );
  ocrElapsed.textContent = message("ocrElapsed", formatDuration(elapsedMs));
  ocrRemaining.textContent =
    job.status === "pausing" || job.status === "paused"
      ? message("ocrResumeToContinue")
      : job.status !== "running" && job.status !== "canceling"
      ? message("ocrFinishedIn", formatDuration(elapsedMs))
      : remainingMs === undefined
        ? message("ocrEstimating")
        : message("ocrRemaining", formatDuration(remainingMs));

  if (job.stage === "downloading-models" && job.bytesTotal) {
    ocrProgressDetail.textContent = message("ocrDownloadedBytes", [
      (Math.min(job.bytesLoaded || 0, job.bytesTotal) / 1_000_000).toFixed(1),
      (job.bytesTotal / 1_000_000).toFixed(1)
    ]);
  } else if (job.stage === "recognizing-images") {
    const completed = job.results
      .map((result) => result?.durationMs)
      .filter((duration): duration is number => typeof duration === "number" && duration > 0);
    ocrProgressDetail.textContent = completed.length
      ? message(
          "ocrAverageImage",
          formatDuration(completed.reduce((sum, duration) => sum + duration, 0) / completed.length)
        )
      : message("ocrFirstImageEstimate");
  } else {
    ocrProgressDetail.textContent = "";
  }

  const timingLabels = [
    ["checking-cache", "ocrTimeCache"],
    ["downloading-models", "ocrTimeDownload"],
    ["initializing-engine", "ocrTimeInitialize"],
    ["recognizing-images", "ocrTimeRecognize"],
    ["finalizing", "ocrTimeFinalize"]
  ] as const;
  ocrStepTimings.replaceChildren(
    ...timingLabels.map(([stage, key]) => {
      const item = document.createElement("span");
      item.textContent = message(key, formatDuration(durations[stage] || 0));
      return item;
    })
  );
  const controllable = ["running", "pausing", "paused"].includes(job.status);
  directModelDownloadButton.hidden = !(
    controllable && job.stage === "checking-cache"
  );
  pauseOcrButton.hidden = !(
    controllable && job.stage === "recognizing-images"
  );
  stopOcrButton.hidden = !controllable;
  pauseOcrButton.textContent =
    job.status === "pausing" || job.status === "paused"
      ? message("resumeOcr")
      : message("pauseOcr");
}

function applyJob(job: OcrJob): void {
  if (!note || !sameOcrJobSource(job, note)) return;
  if (
    currentJob?.id === job.id &&
    Date.parse(currentJob.updatedAt) > Date.parse(job.updatedAt)
  ) {
    return;
  }
  currentJob = job;
  note = applyOcrResults(note, job.results);
  renderPreview();
  if (!ocrToggle.checked) {
    ocrProgressPanel.hidden = true;
    statusPanel.hidden = false;
    return;
  }
  renderOcrProgress(job);
}

async function restoreOrStartOcr(): Promise<void> {
  if (!note || !ocrToggle.checked) return;
  if (note.images.length === 0) {
    setStatus(message("noImages"), "neutral");
    renderPreview(true);
    return;
  }
  setStatus(message("ocrStarting"), "working");
  const request: BackgroundRequest = {
    target: "background",
    type: "RESTORE_OR_RUN_OCR",
    note
  };
  const response = (await chrome.runtime.sendMessage(request)) as OcrJob | { error: string };
  if ("error" in response) {
    setStatus(message("ocrFailed", response.error), "error");
    return;
  }
  applyJob(response);
}

function demoNote(): Note {
  return {
    id: "demo-note",
    url: "https://www.xiaohongshu.com/explore/demo-note",
    platform: "xiaohongshu",
    title: "周末在杭州散步：三条安静路线",
    body: "避开热门景点，从北山街走到茅家埠。沿路树荫很多，下午四点以后光线最好。\n\n#杭州旅行 #城市散步",
    authorName: "山野记录员",
    images: [
      { index: 0, url: "https://example.com/1.jpg" },
      { index: 1, url: "https://example.com/2.jpg" },
      { index: 2, url: "https://example.com/3.jpg" }
    ],
    tags: ["杭州旅行", "城市散步"],
    publishedAt: "2026-07-26T08:30:00.000Z",
    capturedAt: new Date().toISOString(),
    metrics: { likedCount: "128", collectedCount: "54", commentCount: "12" },
    extractionSource: "initial-state"
  };
}

async function capturePage(): Promise<void> {
  note = null;
  currentJob = null;
  ocrProgressPanel.hidden = true;
  previewDirty = false;
  preview.value = "";
  updateNoteMeta();
  setReady(false);
  setStatus(message("loadingPage"), "working");
  refreshButton.disabled = true;
  try {
    if (!isExtensionRuntime()) {
      note = demoNote();
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || !/^https:\/\/([^.]+\.)?xiaohongshu\.com\//i.test(tab.url)) {
        setStatus(message("unsupportedPage"), "error");
        return;
      }
      const injection = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: extractXiaohongshuPage
      });
      const response = injection[0]?.result as ExtractionResponse | undefined;
      if (!response?.ok || !response.data) {
        setStatus(
          message(response?.error === "unsupported" ? "unsupportedPage" : "captureFailed"),
          "error"
        );
        return;
      }
      note = normalizeExtractedNote(response.data);
    }
    updateNoteMeta();
    renderPreview(true);
    setReady(true);
    setStatus(message("ready"), "success");
    if (ocrToggle.checked && isExtensionRuntime()) await restoreOrStartOcr();
  } catch (error) {
    console.error(error);
    setStatus(message("captureFailed"), "error");
  } finally {
    refreshButton.disabled = false;
  }
}

async function handleOcrToggle(): Promise<void> {
  previewDirty = false;
  if (isExtensionRuntime()) {
    await chrome.storage.local.set({ [OCR_ENABLED_KEY]: ocrToggle.checked });
  }
  renderPreview(true);
  if (ocrToggle.checked) {
    if (isExtensionRuntime()) await restoreOrStartOcr();
    return;
  }
  ocrProgressPanel.hidden = true;
  if (
    isExtensionRuntime() &&
    currentJob &&
    ["running", "pausing", "paused", "canceling"].includes(currentJob.status)
  ) {
    setStatus(message("ready"), "success");
    const request: BackgroundRequest = {
      target: "background",
      type: "CANCEL_OCR",
      jobId: currentJob.id
    };
    await chrome.runtime.sendMessage(request);
  } else if (note) {
    setStatus(message("ready"), "success");
  }
}

async function handlePauseOcr(): Promise<void> {
  if (!currentJob || !["running", "pausing", "paused"].includes(currentJob.status)) return;
  pauseOcrButton.disabled = true;
  try {
    const request: BackgroundRequest = {
      target: "background",
      type: currentJob.status === "running" ? "PAUSE_OCR" : "RESUME_OCR",
      jobId: currentJob.id
    };
    const response = (await chrome.runtime.sendMessage(request)) as OcrJob | { error: string };
    if ("error" in response) {
      setStatus(message("ocrFailed", response.error), "error");
      return;
    }
    applyJob(response);
  } finally {
    pauseOcrButton.disabled = false;
  }
}

async function handleDirectModelDownload(): Promise<void> {
  if (!note) return;
  directModelDownloadButton.disabled = true;
  try {
    ocrToggle.checked = true;
    await chrome.storage.local.set({ [OCR_ENABLED_KEY]: true });
    ocrProgressPanel.hidden = true;
    setStatus(message("directModelDownloadStarting"), "working");
    const request: BackgroundRequest = {
      target: "background",
      type: "RUN_OCR",
      note,
      bypassModelCache: true
    };
    const response = (await chrome.runtime.sendMessage(request)) as OcrJob | { error: string };
    if ("error" in response) {
      setStatus(message("ocrFailed", response.error), "error");
      return;
    }
    applyJob(response);
  } finally {
    directModelDownloadButton.disabled = false;
  }
}

async function handleStopOcr(): Promise<void> {
  if (!currentJob || !["running", "pausing", "paused"].includes(currentJob.status)) return;
  stopOcrButton.disabled = true;
  try {
    const request: BackgroundRequest = {
      target: "background",
      type: "CANCEL_OCR",
      jobId: currentJob.id
    };
    const response = (await chrome.runtime.sendMessage(request)) as OcrJob | { error: string };
    if ("error" in response) {
      setStatus(message("ocrFailed", response.error), "error");
      return;
    }
    ocrToggle.checked = false;
    await chrome.storage.local.set({ [OCR_ENABLED_KEY]: false });
    previewDirty = false;
    renderPreview(true);
    applyJob(response);
    setStatus(message("ready"), "success");
  } finally {
    stopOcrButton.disabled = false;
  }
}

async function copyMarkdown(): Promise<void> {
  try {
    await navigator.clipboard.writeText(preview.value);
    setStatus(message("copied"), "success");
  } catch {
    setStatus(message("copyFailed"), "error");
  }
}

async function downloadMarkdown(): Promise<void> {
  if (!note) return;
  const blob = new Blob([preview.value], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = createMarkdownFilename(note.title, note.authorName, note.publishedAt);
  try {
    if (isExtensionRuntime()) {
      await chrome.downloads.download({
        url,
        filename,
        conflictAction: "uniquify",
        saveAs: false
      });
    } else {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    }
    setStatus(message("downloaded"), "success");
  } catch (error) {
    setStatus(message("downloadFailed", error instanceof Error ? error.message : String(error)), "error");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

async function initialize(): Promise<void> {
  document.documentElement.lang = language;
  localizeDocument(message);
  document.title = message("extensionName");
  if (isExtensionRuntime()) {
    versionText.textContent = `${message("languageHint")} · v${chrome.runtime.getManifest().version}`;
  }
  if (isExtensionRuntime()) {
    const settings = await chrome.storage.local.get(OCR_ENABLED_KEY);
    ocrToggle.checked = Boolean(settings[OCR_ENABLED_KEY]);
    chrome.runtime.onMessage.addListener((incoming: unknown) => {
      const update = incoming as Partial<PopupJobUpdate>;
      if (update.target === "popup" && update.type === "OCR_JOB_UPDATED" && update.job) {
        applyJob(update.job);
      }
      return false;
    });
  }
  ocrToggle.addEventListener("change", () => void handleOcrToggle());
  refreshButton.addEventListener("click", () => void capturePage());
  copyButton.addEventListener("click", () => void copyMarkdown());
  downloadButton.addEventListener("click", () => void downloadMarkdown());
  pauseOcrButton.addEventListener("click", () => void handlePauseOcr());
  directModelDownloadButton.addEventListener(
    "click",
    () => void handleDirectModelDownload()
  );
  stopOcrButton.addEventListener("click", () => void handleStopOcr());
  preview.addEventListener("input", () => {
    previewDirty = true;
  });
  window.setInterval(() => {
    if (currentJob && !ocrProgressPanel.hidden) renderOcrProgress(currentJob);
  }, 1000);
  await capturePage();
}

void initialize();
