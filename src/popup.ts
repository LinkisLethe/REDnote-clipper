import "./shared.css";
import "./popup.css";
import {
  extractXiaohongshuPage,
  normalizeExtractedNote,
  type ExtractionResponse
} from "./adapters/xiaohongshu";
import { createMarkdownFilename } from "./core/filename";
import { createMessageGetter, getUiLanguage, localizeDocument } from "./core/i18n";
import { applyOcrResults, renderMarkdown } from "./core/markdown";
import {
  estimateRemainingMs,
  initializationDurationMs,
  liveStageDurations
} from "./core/ocr-progress";
import { OCR_ENABLED_KEY, sameOcrJobSource } from "./core/ocr-job";
import {
  formatOcrPageList,
  resolveOcrImageIndexes,
  type OcrSelectionError,
  type OcrSelectionMode
} from "./core/ocr-selection";
import type {
  BackgroundRequest,
  Note,
  OcrJob,
  PopupJobProgressPatch,
  PopupJobUpdate
} from "./core/types";

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
const pauseOcrButton = document.querySelector<HTMLButtonElement>("#pauseOcrButton")!;
const stopOcrButton = document.querySelector<HTMLButtonElement>("#stopOcrButton")!;
const ocrSelectionPanel = document.querySelector<HTMLElement>("#ocrSelectionPanel")!;
const ocrSelectionSummary = document.querySelector<HTMLElement>("#ocrSelectionSummary")!;
const ocrSelectionInputs = [
  ...document.querySelectorAll<HTMLInputElement>('input[name="ocrSelectionMode"]')
];
const skipCoverInput = document.querySelector<HTMLInputElement>(
  'input[name="ocrSelectionMode"][value="skip-cover"]'
)!;
const ocrCustomRangeRow = document.querySelector<HTMLElement>("#ocrCustomRangeRow")!;
const ocrRangeInput = document.querySelector<HTMLInputElement>("#ocrRangeInput")!;
const startOcrButton = document.querySelector<HTMLButtonElement>("#startOcrButton")!;
const noteMeta = document.querySelector<HTMLElement>("#noteMeta")!;
const ocrToggle = document.querySelector<HTMLInputElement>("#ocrToggle")!;
const settingsButton = document.querySelector<HTMLButtonElement>("#settingsButton")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refreshButton")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copyButton")!;
const obsidianButton = document.querySelector<HTMLButtonElement>("#obsidianButton")!;
const obsidianFeedback = document.querySelector<HTMLElement>("#obsidianFeedback")!;
const obsidianFeedbackIcon = document.querySelector<HTMLElement>("#obsidianFeedbackIcon")!;
const obsidianFeedbackText = document.querySelector<HTMLElement>("#obsidianFeedbackText")!;
const obsidianFeedbackDetail = document.querySelector<HTMLElement>("#obsidianFeedbackDetail")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#downloadButton")!;

let note: Note | null = null;
let currentJob: OcrJob | null = null;
let previewDirty = false;

function isOcrJobActive(job: OcrJob | null): boolean {
  return Boolean(
    job && ["running", "pausing", "paused", "canceling"].includes(job.status)
  );
}

function selectedOcrMode(): OcrSelectionMode {
  const value = ocrSelectionInputs.find((input) => input.checked)?.value;
  return value === "skip-cover" || value === "custom" ? value : "all";
}

function selectionErrorMessage(error: OcrSelectionError): string {
  if (error === "range-required") return message("ocrRangeRequired");
  if (error === "range-invalid") return message("ocrRangeInvalid");
  if (error === "range-out-of-bounds") {
    return message("ocrRangeBounds", String(note?.images.length || 0));
  }
  return message("noImages");
}

function setSelectionFromJob(job: OcrJob): void {
  if (!note) return;
  const allIndexes = note.images.map((_image, index) => index);
  const skipCoverIndexes = allIndexes.slice(1);
  const value = job.imageIndexes.join(",");
  const allValue = allIndexes.join(",");
  const skipCoverValue = skipCoverIndexes.join(",");
  const mode: OcrSelectionMode =
    value === allValue
      ? "all"
      : skipCoverIndexes.length > 0 && value === skipCoverValue
        ? "skip-cover"
        : "custom";
  for (const input of ocrSelectionInputs) input.checked = input.value === mode;
  if (mode === "custom") ocrRangeInput.value = formatOcrPageList(job.imageIndexes);
}

function renderOcrSelection(): void {
  const visible = Boolean(ocrToggle.checked && note);
  ocrSelectionPanel.hidden = !visible;
  if (!visible || !note) return;

  const active = isOcrJobActive(currentJob);
  if (skipCoverInput.checked && note.images.length <= 1) {
    const allInput = ocrSelectionInputs.find((input) => input.value === "all");
    if (allInput) allInput.checked = true;
  }
  for (const input of ocrSelectionInputs) {
    input.disabled = active || (input === skipCoverInput && note.images.length <= 1);
  }
  const mode = selectedOcrMode();
  ocrCustomRangeRow.hidden = mode !== "custom";
  ocrRangeInput.disabled = active;
  startOcrButton.disabled = active || note.images.length === 0;
  startOcrButton.textContent =
    currentJob?.status === "completed" ? message("rerunOcr") : message("startOcr");

  const selection = resolveOcrImageIndexes(
    mode,
    ocrRangeInput.value,
    note.images.length
  );
  ocrSelectionSummary.textContent = selection.ok
    ? message("ocrSelectionSummary", [
        String(selection.imageIndexes.length),
        String(note.images.length),
        formatOcrPageList(selection.imageIndexes)
      ])
    : "";
}

function clearNoteOcrResults(value: Note): Note {
  return {
    ...value,
    images: value.images.map((image) => {
      const next = { ...image };
      delete next.ocr;
      return next;
    })
  };
}

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

function setObsidianFeedback(
  text: string,
  state: "working" | "success" | "error" | "neutral",
  detail = ""
): void {
  obsidianFeedbackIcon.textContent =
    state === "success" ? "✓" : state === "error" ? "!" : state === "neutral" ? "•" : "…";
  obsidianFeedbackText.textContent = text;
  obsidianFeedbackDetail.textContent = detail;
  obsidianFeedbackDetail.hidden = !detail;
  obsidianFeedback.title = detail || text;
  obsidianFeedback.className = `obsidian-feedback is-visible${
    state === "success" || state === "neutral" ? "" : ` is-${state}`
  }`;
  obsidianFeedback.setAttribute("aria-hidden", "false");
}

function setReady(enabled: boolean): void {
  copyButton.disabled = !enabled;
  obsidianButton.disabled = !enabled;
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
  const meta =
    ocrToggle.checked && currentJob
      ? message("noteMetaOcr", [
          note.authorName,
          String(currentJob.imageIndexes.length),
          String(note.images.length)
        ])
      : message("noteMeta", [note.authorName, String(note.images.length)]);
  noteMeta.textContent = `${meta} · ${message("extractedBy", source)}`;
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, durationMs) / 1000;
  if (seconds < 60) {
    const value = seconds === 0 ? "0" : seconds < 10 ? seconds.toFixed(1) : seconds.toFixed(0);
    return message("durationSeconds", value);
  }
  return message("durationMinutes", [String(Math.floor(seconds / 60)), String(Math.round(seconds % 60))]);
}

function localizeOcrError(error?: string): string {
  if (!error) return message("ocrErrorUnknown");
  if (error === "OCR_IMAGE_SELECTION_INVALID") return message("ocrRangeInvalid");
  if (error.startsWith("OCR_MODEL_READ_FAILED:")) return message("ocrErrorModelRead");
  return error;
}

function stageMessage(job: OcrJob): string {
  if (job.status === "pausing") return message("ocrPausing");
  if (job.status === "paused") return message("ocrPaused");
  if (job.status === "completed") return message("ocrCompleted");
  if (job.status === "canceled") return message("ocrCanceled");
  if (job.status === "error") {
    return message("ocrFailed", localizeOcrError(job.error || "Unknown error"));
  }
  switch (job.stage) {
    case "loading-runtime":
      return message("ocrStageRuntime");
    case "loading-models":
      return message("ocrStageModels");
    case "creating-sessions":
      return message("ocrStageSessions");
    case "recognizing-images":
      return message("ocrStageRecognizing", [
        String(job.currentImage || Math.min(job.current + 1, job.total)),
        String(job.total),
        String(job.currentSourceImage || job.currentImage || 1)
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
      [
        "loading-runtime",
        "loading-models",
        "creating-sessions",
        "finalizing"
      ].includes(job.stage)
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

  if (job.stage === "recognizing-images") {
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
    ["ocrTimeInitialize", initializationDurationMs(durations)],
    ["ocrTimeRecognize", durations["recognizing-images"] || 0],
    ["ocrTimeFinalize", durations.finalizing || 0]
  ] as const;
  ocrStepTimings.replaceChildren(
    ...timingLabels.map(([key, duration]) => {
      const item = document.createElement("span");
      item.textContent = message(key, formatDuration(duration));
      return item;
    })
  );
  const controllable = ["running", "pausing", "paused"].includes(job.status);
  pauseOcrButton.hidden = !(
    controllable && job.stage === "recognizing-images"
  );
  stopOcrButton.hidden = !controllable;
  pauseOcrButton.textContent =
    job.status === "pausing" || job.status === "paused"
      ? message("resumeOcr")
      : message("pauseOcr");
  renderOcrSelection();
}

function applyJob(job: OcrJob): void {
  if (!note || !sameOcrJobSource(job, note)) return;
  if (
    currentJob?.id === job.id &&
    Date.parse(currentJob.updatedAt) > Date.parse(job.updatedAt)
  ) {
    return;
  }
  const changedJob = currentJob?.id !== job.id;
  currentJob = job;
  if (changedJob) setSelectionFromJob(job);
  note = applyOcrResults(note, job.results);
  updateNoteMeta();
  renderPreview();
  if (!ocrToggle.checked) {
    ocrProgressPanel.hidden = true;
    statusPanel.hidden = false;
    return;
  }
  renderOcrProgress(job);
}

async function handleStartOcr(): Promise<void> {
  if (!note || !ocrToggle.checked || isOcrJobActive(currentJob)) return;
  const selection = resolveOcrImageIndexes(
    selectedOcrMode(),
    ocrRangeInput.value,
    note.images.length
  );
  if (!selection.ok) {
    setStatus(selectionErrorMessage(selection.error), "error");
    if (selectedOcrMode() === "custom") ocrRangeInput.focus();
    return;
  }
  if (!isExtensionRuntime()) return;

  note = clearNoteOcrResults(note);
  currentJob = null;
  ocrProgressPanel.hidden = true;
  previewDirty = false;
  renderPreview(true);
  setStatus(message("ocrStarting"), "working");
  startOcrButton.disabled = true;
  try {
    const request: BackgroundRequest = {
      target: "background",
      type: "RUN_OCR",
      note,
      imageIndexes: selection.imageIndexes
    };
    const response = (await chrome.runtime.sendMessage(request)) as OcrJob | { error: string };
    if ("error" in response) {
      setStatus(message("ocrFailed", localizeOcrError(response.error)), "error");
      return;
    }
    applyJob(response);
  } finally {
    renderOcrSelection();
  }
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
      if (!import.meta.env.DEV) {
        setStatus(message("unsupportedPage"), "error");
        return;
      }
      const { createDemoNote } = await import("./dev/demo-note");
      note = createDemoNote();
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
    renderOcrSelection();
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
  updateNoteMeta();
  renderOcrSelection();
  if (ocrToggle.checked) {
    if (note) {
      setStatus(
        note.images.length > 0 ? message("ocrSelectionReady") : message("noImages"),
        "neutral"
      );
    }
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
      setStatus(message("ocrFailed", localizeOcrError(response.error)), "error");
      return;
    }
    applyJob(response);
  } finally {
    pauseOcrButton.disabled = false;
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
      setStatus(message("ocrFailed", localizeOcrError(response.error)), "error");
      return;
    }
    ocrToggle.checked = false;
    await chrome.storage.local.set({ [OCR_ENABLED_KEY]: false });
    previewDirty = false;
    renderPreview(true);
    updateNoteMeta();
    renderOcrSelection();
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

function obsidianWriteErrorMessage(error: string): string {
  if (error === "OBSIDIAN_NOT_CONFIGURED") return message("obsidianNotConfigured");
  if (error === "OBSIDIAN_CONTENT_EMPTY") return message("obsidianContentEmpty");
  if (error === "OBSIDIAN_CONNECTION_TIMEOUT") return message("obsidianConnectionTimeout");
  if (error === "OBSIDIAN_CONNECTION_FAILED") return message("obsidianConnectionFailed");
  if (error === "OBSIDIAN_UNAUTHORIZED") return message("obsidianUnauthorized");
  if (error.startsWith("OBSIDIAN_HTTP_ERROR:")) {
    return message("obsidianHttpError", error.split(":")[1] || "?");
  }
  return message("obsidianWriteFailed");
}

async function writeToObsidian(): Promise<void> {
  if (!note || !isExtensionRuntime()) return;
  const filename = createMarkdownFilename(note.title, note.authorName, note.publishedAt);
  obsidianButton.disabled = true;
  setObsidianFeedback(message("obsidianWritingShort"), "working");
  try {
    const sendWriteRequest = async (overwrite: boolean) => {
      const request: BackgroundRequest = {
        target: "background",
        type: "WRITE_OBSIDIAN_NOTE",
        filename,
        markdown: preview.value,
        overwrite
      };
      return (await chrome.runtime.sendMessage(request)) as {
        ok?: boolean;
        conflict?: true;
        path?: string;
        error?: string;
      };
    };

    let response = await sendWriteRequest(false);
    if (response.error) throw new Error(response.error);
    if (response.conflict) {
      const overwrite = window.confirm(
        message("obsidianOverwriteConfirm", response.path || filename)
      );
      if (!overwrite) {
        setObsidianFeedback(message("obsidianWriteCanceledShort"), "neutral");
        return;
      }
      setObsidianFeedback(message("obsidianWritingShort"), "working");
      response = await sendWriteRequest(true);
      if (response.error) throw new Error(response.error);
    }
    if (!response.ok) throw new Error("OBSIDIAN_WRITE_FAILED");
    setObsidianFeedback(
      message("obsidianWrittenShort"),
      "success",
      response.path || filename
    );
  } catch (error) {
    const errorText = obsidianWriteErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
    setObsidianFeedback(
      message("obsidianWriteFailedShort"),
      "error",
      errorText
    );
  } finally {
    obsidianButton.disabled = !note;
  }
}

async function initialize(): Promise<void> {
  document.documentElement.lang = language;
  localizeDocument(message);
  document.title = message("extensionName");
  if (isExtensionRuntime()) {
    const settings = await chrome.storage.local.get(OCR_ENABLED_KEY);
    ocrToggle.checked = Boolean(settings[OCR_ENABLED_KEY]);
    chrome.runtime.onMessage.addListener((incoming: unknown) => {
      const update = incoming as Partial<PopupJobUpdate | PopupJobProgressPatch>;
      if (update.target === "popup" && update.type === "OCR_JOB_UPDATED") {
        applyJob((update as PopupJobUpdate).job);
      }
      if (
        update.target === "popup" &&
        update.type === "OCR_JOB_PROGRESS" &&
        currentJob?.id === (update as PopupJobProgressPatch).jobId
      ) {
        const progress = update as PopupJobProgressPatch;
        const nextJob = { ...currentJob, ...progress.patch };
        currentJob = nextJob;
        renderOcrProgress(nextJob);
      }
      return false;
    });
  }
  ocrToggle.addEventListener("change", () => void handleOcrToggle());
  for (const input of ocrSelectionInputs) {
    input.addEventListener("change", () => {
      renderOcrSelection();
      if (selectedOcrMode() === "custom") ocrRangeInput.focus();
    });
  }
  ocrRangeInput.addEventListener("input", renderOcrSelection);
  ocrRangeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void handleStartOcr();
  });
  startOcrButton.addEventListener("click", () => void handleStartOcr());
  settingsButton.addEventListener("click", () => void chrome.runtime.openOptionsPage());
  refreshButton.addEventListener("click", () => void capturePage());
  copyButton.addEventListener("click", () => void copyMarkdown());
  obsidianButton.addEventListener("click", () => void writeToObsidian());
  downloadButton.addEventListener("click", () => void downloadMarkdown());
  pauseOcrButton.addEventListener("click", () => void handlePauseOcr());
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
