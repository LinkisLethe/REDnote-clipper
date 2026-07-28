import "./popup.css";
import {
  extractXiaohongshuPage,
  normalizeExtractedNote,
  type ExtractionResponse
} from "./adapters/xiaohongshu";
import { createMarkdownFilename } from "./core/filename";
import { createMessageGetter, getUiLanguage, localizeDocument } from "./core/i18n";
import { applyOcrResults, renderMarkdown } from "./core/markdown";
import type {
  BackgroundRequest,
  Note,
  OcrJob,
  PopupJobUpdate
} from "./core/types";

const OCR_ENABLED_KEY = "ocrEnabled";
const OCR_JOB_KEY = "lastOcrJob";
const language = getUiLanguage();
const message = createMessageGetter(language);

const preview = document.querySelector<HTMLTextAreaElement>("#markdownPreview")!;
const statusPanel = document.querySelector<HTMLElement>("#statusPanel")!;
const statusText = document.querySelector<HTMLElement>("#statusText")!;
const noteMeta = document.querySelector<HTMLElement>("#noteMeta")!;
const ocrToggle = document.querySelector<HTMLInputElement>("#ocrToggle")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refreshButton")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copyButton")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#downloadButton")!;

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

function sameJobSource(job: OcrJob, value: Note): boolean {
  return (
    job.noteId === value.id &&
    job.imageUrls.length === value.images.length &&
    job.imageUrls.every((url, index) => url === value.images[index]?.url)
  );
}

function applyJob(job: OcrJob): void {
  if (!note || !sameJobSource(job, note)) return;
  currentJob = job;
  note = applyOcrResults(note, job.results);
  renderPreview();
  switch (job.status) {
    case "running":
      setStatus(
        job.current > 0
          ? message("ocrProgress", [String(job.current), String(job.total)])
          : message("ocrStarting"),
        "working"
      );
      break;
    case "canceling":
      setStatus(message("canceling"), "working");
      break;
    case "completed":
      setStatus(message("ocrCompleted"), "success");
      break;
    case "canceled":
      setStatus(message("ocrCanceled"), "neutral");
      break;
    case "error":
      setStatus(message("ocrFailed", job.error || "Unknown error"), "error");
      break;
  }
}

async function restoreOrStartOcr(): Promise<void> {
  if (!note || !ocrToggle.checked) return;
  if (note.images.length === 0) {
    setStatus(message("noImages"), "neutral");
    renderPreview(true);
    return;
  }
  const stored = await chrome.storage.local.get(OCR_JOB_KEY);
  const job = stored[OCR_JOB_KEY] as OcrJob | undefined;
  if (job && sameJobSource(job, note) && ["running", "canceling", "completed"].includes(job.status)) {
    applyJob(job);
    return;
  }
  setStatus(message("ocrStarting"), "working");
  const request: BackgroundRequest = { target: "background", type: "RUN_OCR", note };
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
  if (
    isExtensionRuntime() &&
    currentJob &&
    (currentJob.status === "running" || currentJob.status === "canceling")
  ) {
    setStatus(message("canceling"), "working");
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
  preview.addEventListener("input", () => {
    previewDirty = true;
  });
  await capturePage();
}

void initialize();
