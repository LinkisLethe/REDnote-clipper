import type {
  AutoClipHistoryEntry,
  AutoClipDuplicatePolicy,
  AutoClipPanelState,
  AutoClipQueueItem,
  AutoClipStatusMessage,
  BackgroundRequest,
  Note,
  OcrJob,
  OffscreenRequest,
  PopupJobProgressPatch,
  PopupJobUpdate
} from "./core/types";
import {
  extractXiaohongshuPage,
  normalizeExtractedNote,
  type ExtractionResponse
} from "./adapters/xiaohongshu";
import { createMarkdownFilename, createVersionedMarkdownFilename } from "./core/filename";
import { applyOcrResults, readMarkdownNoteId, renderMarkdown } from "./core/markdown";
import { isXiaohongshuNoteUrl, noteIdFromXiaohongshuUrl } from "./core/automation";
import { resolveOcrImageIndexes, type OcrSelectionMode } from "./core/ocr-selection";
import {
  OCR_ENABLED_KEY,
  OCR_PIPELINE_VERSION,
  shouldReuseOcrJob
} from "./core/ocr-job";
import {
  DEFAULT_OBSIDIAN_SETTINGS,
  OBSIDIAN_API_KEY_KEY,
  OBSIDIAN_SETTINGS_KEY,
  createObsidianNotePath,
  encodeObsidianVaultPath,
  normalizeObsidianSettings,
  validateObsidianSettings,
  type ObsidianSettings
} from "./core/obsidian";

const OCR_JOB_KEY = "lastOcrJob";
const AUTO_CLIP_TASK_KEY = "localAutomationTask";
const AUTO_CLIP_HISTORY_KEY = "localAutomationHistory";
const AUTO_CLIP_OBSIDIAN_FOLDER = "Clippings/XHS";
const AUTO_CLIP_BATCH_LIMIT = 20;
const OFFSCREEN_TIMEOUT_MS = 10_000;
const OBSIDIAN_TIMEOUT_MS = 7_000;
let creatingOffscreen: Promise<void> | null = null;
let prewarmingOcr: Promise<void> | null = null;
let autoClipStarting = false;
const activeAutoClipTasks = new Set<string>();

interface AutoClipTask {
  taskId: string;
  running: boolean;
  output: "download" | "obsidian";
  duplicatePolicy: AutoClipDuplicatePolicy;
  ocrEnabled: boolean;
  ocrMode: OcrSelectionMode;
  ocrRange: string;
  currentIndex: number;
  progress: number;
  queue: AutoClipQueueItem[];
  originTabId?: number;
  articleTabId?: number;
  jobId?: string;
  note?: Note;
  startedAt: string;
}

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
  if (!url || !isXiaohongshuNoteUrl(url)) return;
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

async function getAutoClipHistory(): Promise<AutoClipHistoryEntry[]> {
  const stored = await chrome.storage.local.get(AUTO_CLIP_HISTORY_KEY);
  return (stored[AUTO_CLIP_HISTORY_KEY] as AutoClipHistoryEntry[] | undefined) || [];
}

async function autoClipPanelState(task?: AutoClipTask): Promise<AutoClipPanelState> {
  const current = task || (await chrome.storage.local.get(AUTO_CLIP_TASK_KEY))[AUTO_CLIP_TASK_KEY] as AutoClipTask | undefined;
  const history = await getAutoClipHistory();
  return {
    taskId: current?.taskId,
    running: Boolean(current?.running),
    output: current?.output,
    currentIndex: current?.currentIndex || 0,
    total: current?.queue.length || 0,
    progress: current?.progress || 0,
    stage: current?.jobId ? (await getJob())?.stage : undefined,
    queue: current?.queue || [],
    history
  };
}

async function initialAutoClipPanelState(): Promise<AutoClipPanelState> {
  await recoverAutoClipQueue();
  const stored = await chrome.storage.local.get(AUTO_CLIP_TASK_KEY);
  const task = stored[AUTO_CLIP_TASK_KEY] as AutoClipTask | undefined;
  if (task?.running) return autoClipPanelState(task);
  if (task) await chrome.storage.local.remove(AUTO_CLIP_TASK_KEY);
  return autoClipPanelState();
}

async function notifyAutoClip(task: AutoClipTask): Promise<void> {
  const state = await autoClipPanelState(task);
  const message: AutoClipStatusMessage = {
    target: "content",
    type: "AUTO_CLIP_STATUS",
    state
  };
  if (task.originTabId) {
    await chrome.tabs.sendMessage(task.originTabId, message).catch(() => undefined);
  }
  await chrome.runtime.sendMessage(message).catch(() => undefined);
}

async function saveAutoClipTask(task: AutoClipTask): Promise<void> {
  await chrome.storage.local.set({ [AUTO_CLIP_TASK_KEY]: task });
  await notifyAutoClip(task);
}

function updateQueueItem(
  task: AutoClipTask,
  index: number,
  patch: Partial<AutoClipQueueItem>
): AutoClipTask {
  const queue = task.queue.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
  return { ...task, queue };
}

function continueAutoClipQueue(taskId: string): void {
  queueMicrotask(() => void processAutoClipQueue(taskId));
}

async function waitForTabComplete(tabId: number, timeoutMs = 30_000): Promise<void> {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("AUTO_CLIP_PAGE_TIMEOUT"));
    }, timeoutMs);
    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function extractNoteFromTab(tabId: number): Promise<Note> {
  let lastError = "AUTO_CLIP_CAPTURE_FAILED";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: extractXiaohongshuPage
    });
    const response = injection[0]?.result as ExtractionResponse | undefined;
    if (response?.ok && response.data) return normalizeExtractedNote(response.data);
    lastError = response?.error || lastError;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(lastError);
}

async function writeAutoClipToObsidian(
  filename: string,
  markdown: string,
  noteId: string,
  duplicatePolicy: AutoClipDuplicatePolicy
): Promise<{ filename: string; skipped: boolean }> {
  const settings = await getStoredObsidianSettings();
  const headers = { Authorization: `Bearer ${settings.apiKey}` };
  const endpointFor = (targetFilename: string) => {
    const path = createObsidianNotePath(AUTO_CLIP_OBSIDIAN_FOLDER, targetFilename);
    return `${settings.apiBaseUrl}/vault/${encodeObsidianVaultPath(path)}`;
  };
  const findExisting = async (targetFilename: string) => {
    const response = await fetchLocalObsidian(endpointFor(targetFilename), {
      method: "GET",
      headers: { ...headers, Accept: "text/markdown" }
    });
    if (response.status === 401 || response.status === 403) throw new Error("OBSIDIAN_UNAUTHORIZED");
    if (response.status !== 404 && !response.ok) throw new Error(`OBSIDIAN_HTTP_ERROR:${response.status}`);
    return response;
  };

  const existing = await findExisting(filename);
  const existingNoteId = existing.ok ? readMarkdownNoteId(await existing.text()) : undefined;
  if (existing.ok && duplicatePolicy === "skip" && existingNoteId === noteId) {
    return { filename, skipped: true };
  }
  if (existing.ok && duplicatePolicy === "overwrite" && existingNoteId !== noteId) {
    throw new Error("OBSIDIAN_NOTE_ID_MISMATCH");
  }

  let targetFilename = filename;
  if (existing.ok && (duplicatePolicy === "new-version" || existingNoteId !== noteId)) {
    const now = new Date();
    for (let collisionIndex = 1; collisionIndex <= 100; collisionIndex += 1) {
      const candidate = createVersionedMarkdownFilename(filename, now, collisionIndex);
      if ((await findExisting(candidate)).status === 404) {
        targetFilename = candidate;
        break;
      }
    }
    if (targetFilename === filename) throw new Error("OBSIDIAN_VERSION_CONFLICT");
  }

  const endpoint = endpointFor(targetFilename);
  const written = await fetchLocalObsidian(endpoint, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8" },
    body: markdown
  });
  assertObsidianResponse(written);
  return { filename: targetFilename, skipped: false };
}

async function exportAutoClip(
  task: AutoClipTask,
  note: Note,
  markdown: string,
  filename: string
): Promise<{ filename: string; skipped: boolean }> {
  if (task.output === "obsidian") {
    return writeAutoClipToObsidian(filename, markdown, note.id, task.duplicatePolicy);
  }
  await chrome.downloads.download({
    url: `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`,
    filename,
    conflictAction: "uniquify",
    saveAs: false
  });
  return { filename, skipped: false };
}

async function recordAutoClipSuccess(
  task: AutoClipTask,
  note: Note,
  markdown: string,
  index: number
): Promise<AutoClipTask> {
  const filename = createMarkdownFilename(note.title, note.authorName, note.publishedAt);
  const exported = await exportAutoClip(task, note, markdown, filename);
  if (exported.skipped) {
    return updateQueueItem(task, index, {
      status: "skipped",
      filename: exported.filename,
      error: "AUTO_CLIP_DUPLICATE"
    });
  }
  const history = await getAutoClipHistory();
  const entry: AutoClipHistoryEntry = {
    noteId: note.id,
    title: note.title,
    url: note.url,
    filename: exported.filename,
    output: task.output,
    completedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({
    [AUTO_CLIP_HISTORY_KEY]: [
      entry,
      ...history.filter((item) => item.noteId !== note.id || item.output !== task.output)
    ].slice(0, 200)
  });
  return updateQueueItem(task, index, {
    status: "completed",
    filename: exported.filename,
    error: undefined
  });
}

async function finishAutoClipQueue(task: AutoClipTask): Promise<void> {
  const finished = { ...task, running: false, progress: 100, articleTabId: undefined, jobId: undefined, note: undefined };
  await saveAutoClipTask(finished);
}

async function recoverAutoClipQueue(): Promise<void> {
  const stored = await chrome.storage.local.get(AUTO_CLIP_TASK_KEY);
  let task = stored[AUTO_CLIP_TASK_KEY] as AutoClipTask | undefined;
  if (!task?.running) return;
  if (activeAutoClipTasks.has(task.taskId)) return;

  if (task.jobId) {
    const job = await getJob();
    if (job?.id === task.jobId && ["completed", "error", "canceled"].includes(job.status)) {
      await finishAutoClip(job);
      return;
    }
    if (job?.id === task.jobId && await hasActiveOcrJob(task.jobId)) return;
    task = updateQueueItem(task, task.currentIndex, {
      status: "error",
      error: "AUTO_CLIP_OCR_INTERRUPTED"
    });
    if (task.articleTabId) await chrome.tabs.remove(task.articleTabId).catch(() => undefined);
    task = { ...task, articleTabId: undefined, jobId: undefined, note: undefined, progress: 0 };
    await saveAutoClipTask(task);
  } else {
    const interruptedIndex = task.queue.findIndex((item) =>
      ["opening", "extracting", "exporting"].includes(item.status)
    );
    if (interruptedIndex >= 0) {
      if (task.articleTabId) await chrome.tabs.remove(task.articleTabId).catch(() => undefined);
      task = updateQueueItem(task, interruptedIndex, { status: "queued", error: undefined });
      task = { ...task, articleTabId: undefined, note: undefined, progress: 0 };
      await saveAutoClipTask(task);
    }
  }
  void processAutoClipQueue(task.taskId);
}

async function processAutoClipQueue(taskId: string): Promise<void> {
  if (activeAutoClipTasks.has(taskId)) return;
  activeAutoClipTasks.add(taskId);
  try {
  const stored = await chrome.storage.local.get(AUTO_CLIP_TASK_KEY);
  let task = stored[AUTO_CLIP_TASK_KEY] as AutoClipTask | undefined;
  if (!task || task.taskId !== taskId || !task.running || task.jobId) return;
  const nextIndex = task.queue.findIndex((item) => item.status === "queued");
  if (nextIndex < 0) {
    await finishAutoClipQueue(task);
    return;
  }
  const candidate = task.queue[nextIndex];
  if (!candidate || !isXiaohongshuNoteUrl(candidate.url)) {
    task = updateQueueItem(task, nextIndex, { status: "error", error: "AUTO_CLIP_URL_INVALID" });
    await saveAutoClipTask(task);
    continueAutoClipQueue(taskId);
    return;
  }
  const candidateId = noteIdFromXiaohongshuUrl(candidate.url);
  task = updateQueueItem({ ...task, currentIndex: nextIndex, progress: 2 }, nextIndex, { status: "opening" });
  await saveAutoClipTask(task);
  let articleTabId: number | undefined;
  try {
    const articleTab = await chrome.tabs.create({ url: candidate.url, active: false });
    articleTabId = articleTab.id;
    if (!articleTabId) throw new Error("AUTO_CLIP_TAB_FAILED");
    task = { ...task, articleTabId, progress: 8 };
    await saveAutoClipTask(task);
    await waitForTabComplete(articleTabId);
    task = updateQueueItem({ ...task, progress: 15 }, nextIndex, { status: "extracting" });
    await saveAutoClipTask(task);
    const note = await extractNoteFromTab(articleTabId);
    if (note.id !== candidateId) {
      throw new Error("AUTO_CLIP_TITLE_MISMATCH");
    }
    if (note.images.length === 0) throw new Error("AUTO_CLIP_NO_IMAGES");
    if (!task.ocrEnabled) {
      task = updateQueueItem({ ...task, progress: 92 }, nextIndex, { status: "exporting", noteId: note.id });
      await saveAutoClipTask(task);
      task = await recordAutoClipSuccess(
        task,
        note,
        renderMarkdown(note, { language: "zh-CN", includeOcr: false }),
        nextIndex
      );
      await chrome.tabs.remove(articleTabId).catch(() => undefined);
      await saveAutoClipTask({ ...task, articleTabId: undefined, progress: 0 });
      continueAutoClipQueue(taskId);
      return;
    }
    const selection = resolveOcrImageIndexes(task.ocrMode, task.ocrRange, note.images.length);
    if (!selection.ok) throw new Error(`AUTO_CLIP_OCR_SELECTION:${selection.error}`);
    const job = await startOcr(note, selection.imageIndexes);
    task = updateQueueItem({ ...task, jobId: job.id, note, progress: job.progress }, nextIndex, {
      status: "ocr",
      noteId: note.id
    });
    await saveAutoClipTask(task);
  } catch (error) {
    if (articleTabId) await chrome.tabs.remove(articleTabId).catch(() => undefined);
    task = updateQueueItem(task, nextIndex, {
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    });
    await saveAutoClipTask({ ...task, articleTabId: undefined, jobId: undefined, note: undefined, progress: 0 });
    continueAutoClipQueue(taskId);
  }
  } finally {
    activeAutoClipTasks.delete(taskId);
  }
}

async function startAutoClipBatch(
  request: Extract<BackgroundRequest, { type: "AUTO_CLIP_BATCH" }>,
  originTabId?: number
): Promise<AutoClipPanelState> {
  if (autoClipStarting) throw new Error("AUTO_CLIP_BUSY");
  const stored = await chrome.storage.local.get(AUTO_CLIP_TASK_KEY);
  const existing = stored[AUTO_CLIP_TASK_KEY] as AutoClipTask | undefined;
  if (existing?.running) {
    const ageMs = Date.now() - Date.parse(existing.startedAt || "");
    if (!Number.isFinite(ageMs) || ageMs < 30 * 60_000) throw new Error("AUTO_CLIP_BUSY");
    if (existing.articleTabId) await chrome.tabs.remove(existing.articleTabId).catch(() => undefined);
    await chrome.storage.local.remove(AUTO_CLIP_TASK_KEY);
  }
  if (request.items.length > AUTO_CLIP_BATCH_LIMIT) throw new Error("AUTO_CLIP_BATCH_LIMIT");
  const unique = [...new Map(request.items.map((item) => [noteIdFromXiaohongshuUrl(item.url), item])).values()];
  if (unique.length === 0 || unique.some((item) => !isXiaohongshuNoteUrl(item.url))) {
    throw new Error("AUTO_CLIP_SELECTION_EMPTY");
  }
  if (request.output === "obsidian") await getStoredObsidianSettings();
  autoClipStarting = true;
  try {
    const task: AutoClipTask = {
      taskId: crypto.randomUUID(),
      running: true,
      output: request.output,
      duplicatePolicy: request.duplicatePolicy,
      ocrEnabled: request.ocrEnabled,
      ocrMode: request.ocrMode,
      ocrRange: request.ocrRange,
      currentIndex: 0,
      progress: 0,
      queue: unique.map((item) => ({ ...item, status: "queued" })),
      originTabId,
      startedAt: new Date().toISOString()
    };
    await saveAutoClipTask(task);
    void processAutoClipQueue(task.taskId);
    return autoClipPanelState(task);
  } finally {
    autoClipStarting = false;
  }
}

async function updateAutoClipProgress(job: OcrJob): Promise<void> {
  const stored = await chrome.storage.local.get(AUTO_CLIP_TASK_KEY);
  const task = stored[AUTO_CLIP_TASK_KEY] as AutoClipTask | undefined;
  if (!task || task.jobId !== job.id) return;
  await saveAutoClipTask({ ...task, progress: job.progress });
}

async function finishAutoClip(job: OcrJob): Promise<void> {
  const stored = await chrome.storage.local.get(AUTO_CLIP_TASK_KEY);
  let task = stored[AUTO_CLIP_TASK_KEY] as AutoClipTask | undefined;
  if (!task || task.jobId !== job.id || !task.note) return;
  const index = task.currentIndex;
  const sourceNote = task.note;
  try {
    if (job.status !== "completed") throw new Error(job.error || "AUTO_CLIP_OCR_FAILED");
    task = updateQueueItem({ ...task, progress: 98 }, index, { status: "exporting" });
    await saveAutoClipTask(task);
    const note = applyOcrResults(sourceNote, job.results);
    const markdown = renderMarkdown(note, { language: "zh-CN", includeOcr: true });
    task = await recordAutoClipSuccess(task, note, markdown, index);
  } catch (error) {
    task = updateQueueItem(task, index, {
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    if (task.articleTabId) await chrome.tabs.remove(task.articleTabId).catch(() => undefined);
    task = { ...task, articleTabId: undefined, jobId: undefined, note: undefined, progress: 0 };
    await saveAutoClipTask(task);
    void processAutoClipQueue(task.taskId);
  }
}

async function saveJob(job: OcrJob): Promise<void> {
  await chrome.storage.local.set({ [OCR_JOB_KEY]: job });
}

async function getJob(): Promise<OcrJob | undefined> {
  const value = await chrome.storage.local.get(OCR_JOB_KEY);
  return value[OCR_JOB_KEY] as OcrJob | undefined;
}

async function fetchLocalObsidian(
  url: string,
  init: RequestInit,
  timeoutMs = OBSIDIAN_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OBSIDIAN_CONNECTION_TIMEOUT");
    }
    throw new Error("OBSIDIAN_CONNECTION_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}

function assertObsidianResponse(response: Response): void {
  if (response.status === 401 || response.status === 403) {
    throw new Error("OBSIDIAN_UNAUTHORIZED");
  }
  if (!response.ok) throw new Error(`OBSIDIAN_HTTP_ERROR:${response.status}`);
}

async function getStoredObsidianSettings() {
  const [synced, local] = await Promise.all([
    chrome.storage.sync.get(OBSIDIAN_SETTINGS_KEY),
    chrome.storage.local.get(OBSIDIAN_API_KEY_KEY)
  ]);
  const stored = synced[OBSIDIAN_SETTINGS_KEY] as Partial<ObsidianSettings> | undefined;
  const settings = normalizeObsidianSettings({
    noteFolder: stored?.noteFolder || DEFAULT_OBSIDIAN_SETTINGS.noteFolder,
    apiBaseUrl: stored?.apiBaseUrl || DEFAULT_OBSIDIAN_SETTINGS.apiBaseUrl,
    apiKey: String(local[OBSIDIAN_API_KEY_KEY] || "")
  });
  if (validateObsidianSettings(settings)) throw new Error("OBSIDIAN_NOT_CONFIGURED");
  return settings;
}

async function testObsidianConnection(
  request: Extract<BackgroundRequest, { type: "TEST_OBSIDIAN_CONNECTION" }>
): Promise<{ ok: true; service?: string }> {
  const settings = normalizeObsidianSettings({
    noteFolder: DEFAULT_OBSIDIAN_SETTINGS.noteFolder,
    apiBaseUrl: request.apiBaseUrl,
    apiKey: request.apiKey
  });
  const validationError = validateObsidianSettings(settings);
  if (validationError) throw new Error(`OBSIDIAN_SETTINGS:${validationError}`);

  try {
    const response = await fetchLocalObsidian(`${settings.apiBaseUrl}/`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      }
    });
    assertObsidianResponse(response);

    const payload = (await response.json().catch(() => ({}))) as {
      authenticated?: boolean;
      service?: string;
      name?: string;
    };
    if (payload.authenticated === false) throw new Error("OBSIDIAN_UNAUTHORIZED");
    return { ok: true, service: payload.service || payload.name };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("OBSIDIAN_")) throw error;
    throw new Error("OBSIDIAN_CONNECTION_FAILED");
  }
}

async function writeObsidianNote(
  request: Extract<BackgroundRequest, { type: "WRITE_OBSIDIAN_NOTE" }>
): Promise<{ ok: boolean; conflict?: true; path: string }> {
  if (!request.markdown.trim()) throw new Error("OBSIDIAN_CONTENT_EMPTY");
  const settings = await getStoredObsidianSettings();
  const path = createObsidianNotePath(settings.noteFolder, request.filename);
  const endpoint = `${settings.apiBaseUrl}/vault/${encodeObsidianVaultPath(path)}`;
  const headers = {
    Authorization: `Bearer ${settings.apiKey}`
  };

  const existing = await fetchLocalObsidian(endpoint, {
    method: "GET",
    headers: { ...headers, Accept: "text/markdown" }
  });
  if (existing.status === 401 || existing.status === 403) {
    throw new Error("OBSIDIAN_UNAUTHORIZED");
  }
  if (existing.status !== 404 && !existing.ok) {
    throw new Error(`OBSIDIAN_HTTP_ERROR:${existing.status}`);
  }
  if (existing.ok && !request.overwrite) return { ok: false, conflict: true, path };

  const written = await fetchLocalObsidian(endpoint, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8" },
    body: request.markdown
  });
  assertObsidianResponse(written);
  return { ok: true, path };
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

async function notifyPopupProgress(message: PopupJobProgressPatch): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // The popup may be closed. The next persisted OCR result restores durable progress.
  }
}

function selectedOcrImages(
  note: Note,
  requestedIndexes: number[]
): Array<{ imageIndex: number; url: string }> {
  const imageIndexes = [...new Set(requestedIndexes)].sort((a, b) => a - b);
  if (
    imageIndexes.length === 0 ||
    imageIndexes.some(
      (index) => !Number.isInteger(index) || index < 0 || !note.images[index]?.url
    )
  ) {
    throw new Error("OCR_IMAGE_SELECTION_INVALID");
  }
  return imageIndexes.map((imageIndex) => ({
    imageIndex,
    url: note.images[imageIndex]?.url || ""
  }));
}

async function startOcr(note: Note, requestedIndexes: number[]): Promise<OcrJob> {
  const selectedImages = selectedOcrImages(note, requestedIndexes);
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
    pipelineVersion: OCR_PIPELINE_VERSION,
    noteId: note.id,
    imageIndexes: selectedImages.map((image) => image.imageIndex),
    imageUrls: selectedImages.map((image) => image.url),
    status: "running",
    current: 0,
    total: selectedImages.length,
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
    images: selectedImages
  };
  await withTimeout(
    chrome.runtime.sendMessage(request),
    OFFSCREEN_TIMEOUT_MS,
    "Starting the OCR task timed out."
  );
  return job;
}

async function restoreOcr(note: Note): Promise<OcrJob | null> {
  const stored = await getJob();
  if (stored) {
    const workerActive = stored.status === "completed"
      ? false
      : await hasActiveOcrJob(stored.id);
    if (shouldReuseOcrJob(stored, note, workerActive)) return stored;
  }
  return null;
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
    currentSourceImage: message.currentSourceImage,
    currentImageStartedAt: message.currentImageStartedAt,
    stageDurations: { ...job.stageDurations, ...message.stageDurations },
    updatedAt: new Date().toISOString()
  };
  if (message.stage === "recognizing-images" && job.stage === "recognizing-images") {
    await notifyPopupProgress({
      target: "popup",
      type: "OCR_JOB_PROGRESS",
      jobId: job.id,
      patch: {
        stage: updated.stage,
        progress: updated.progress,
        stageStartedAt: updated.stageStartedAt,
        currentImage: updated.currentImage,
        currentSourceImage: updated.currentSourceImage,
        currentImageStartedAt: updated.currentImageStartedAt,
        stageDurations: updated.stageDurations,
        updatedAt: updated.updatedAt
      }
    });
    await updateAutoClipProgress(updated);
    return updated;
  }
  await saveJob(updated);
  await notifyPopup(updated);
  await updateAutoClipProgress(updated);
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
  await updateAutoClipProgress(updated);
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
  await updateAutoClipProgress(updated);
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
  await finishAutoClip(updated);
  return updated;
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const request = message as Partial<BackgroundRequest>;
  if (request.target !== "background") return false;

  let operation: Promise<unknown>;
  switch (request.type) {
    case "OPEN_OPTIONS_PAGE":
      operation = chrome.runtime.openOptionsPage().then(() => ({ ok: true }));
      break;
    case "AUTO_CLIP_BATCH":
      operation = startAutoClipBatch(
        request as Extract<BackgroundRequest, { type: "AUTO_CLIP_BATCH" }>,
        sender.tab?.id
      );
      break;
    case "GET_AUTO_CLIP_STATE":
      operation = initialAutoClipPanelState();
      break;
    case "WRITE_OBSIDIAN_NOTE":
      operation = writeObsidianNote(
        request as Extract<BackgroundRequest, { type: "WRITE_OBSIDIAN_NOTE" }>
      );
      break;
    case "TEST_OBSIDIAN_CONNECTION":
      operation = testObsidianConnection(
        request as Extract<BackgroundRequest, { type: "TEST_OBSIDIAN_CONNECTION" }>
      );
      break;
    case "RUN_OCR":
      operation = (() => {
        const run = request as Extract<BackgroundRequest, { type: "RUN_OCR" }>;
        return startOcr(run.note, run.imageIndexes);
      })();
      break;
    case "RESTORE_OCR":
      operation = restoreOcr(
        (request as Extract<BackgroundRequest, { type: "RESTORE_OCR" }>).note
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
