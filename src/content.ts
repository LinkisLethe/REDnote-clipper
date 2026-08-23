import type {
  AutoClipCandidate,
  AutoClipPanelState,
  AutoClipOutput,
  AutoClipStatusMessage
} from "./core/types";

const ROOT_ID = "xhs-clipper-auto-root";
const PANEL_ID = "xhs-clipper-auto-panel";
const AUTO_CLIP_BATCH_LIMIT = 20;
const candidates = new Map<string, AutoClipCandidate>();
const selectedNoteIds = new Set<string>();
let root: ShadowRoot;
let routeTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let lastCompletionToastTaskId = "";
let currentPageKey = "";
let panelState: AutoClipPanelState = {
  running: false,
  currentIndex: 0,
  total: 0,
  progress: 0,
  queue: [],
  history: []
};

const stageLabels: Record<string, string> = {
  "loading-runtime": "加载 OCR 运行库",
  "loading-models": "加载本地模型",
  "creating-sessions": "创建 OCR 会话",
  "recognizing-images": "识别图片文字",
  finalizing: "整理识别结果"
};

const statusLabels: Record<string, string> = {
  queued: "等待处理",
  opening: "打开文章",
  extracting: "提取正文和图片",
  ocr: "本地 OCR",
  exporting: "导出 Markdown",
  completed: "已完成",
  skipped: "已跳过重复文章",
  error: "失败"
};

const errorLabels: Record<string, string> = {
  AUTO_CLIP_BUSY: "已有任务正在运行",
  AUTO_CLIP_BATCH_LIMIT: `单批最多处理 ${AUTO_CLIP_BATCH_LIMIT} 篇文章`,
  AUTO_CLIP_URL_INVALID: "文章链接无效",
  AUTO_CLIP_PAGE_TIMEOUT: "文章页面加载超时",
  AUTO_CLIP_CAPTURE_FAILED: "文章内容提取失败",
  AUTO_CLIP_TITLE_MISMATCH: "打开的文章与所选文章不一致",
  AUTO_CLIP_NO_IMAGES: "文章没有可识别的图片",
  AUTO_CLIP_DUPLICATE: "已处理过",
  AUTO_CLIP_OCR_FAILED: "OCR 失败",
  "AUTO_CLIP_OCR_SELECTION:range-required": "请填写 OCR 图片页码",
  "AUTO_CLIP_OCR_SELECTION:range-invalid": "OCR 页码格式无效，请使用 1,3-5",
  "AUTO_CLIP_OCR_SELECTION:range-out-of-bounds": "OCR 页码超出当前文章的图片数量",
  "AUTO_CLIP_OCR_SELECTION:no-images": "当前文章没有可 OCR 的图片",
  OBSIDIAN_NOT_CONFIGURED: "Obsidian 尚未配置",
  OBSIDIAN_CONNECTION_TIMEOUT: "Obsidian 连接超时",
  OBSIDIAN_CONNECTION_FAILED: "无法连接 Obsidian",
  OBSIDIAN_UNAUTHORIZED: "Obsidian API Key 无效",
  OBSIDIAN_NOTE_EXISTS: "Obsidian 中已存在同名笔记",
  AUTO_CLIP_OCR_INTERRUPTED: "OCR 进程意外中断，可重新运行该文章"
};

function noteIdFromXiaohongshuUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!/(^|\.)xiaohongshu\.com$/i.test(url.hostname)) return "";
    return url.pathname.match(
      /\/(?:explore|search_result|discovery\/item|user\/profile\/[^/]+)\/([a-zA-Z0-9]+)/
    )?.[1] || url.searchParams.get("note_id") || "";
  } catch {
    return "";
  }
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function matchesAllKeywords(title: string, query: string): boolean {
  const terms = query.trim().split(/\s+/).map(normalizeSearchText).filter(Boolean);
  if (terms.length === 0) return true;
  const normalizedTitle = normalizeSearchText(title);
  return terms.every((term) => normalizedTitle.includes(term));
}

function displayError(value?: string): string {
  if (!value) return "";
  if (errorLabels[value]) return errorLabels[value];
  if (value.startsWith("OBSIDIAN_HTTP_ERROR:")) {
    return `Obsidian 返回 HTTP ${value.split(":")[1] || "错误"}`;
  }
  return value;
}

function panelElement<T extends HTMLElement>(selector: string): T {
  const element = root.querySelector<T>(`#${PANEL_ID} ${selector}`);
  if (!element) throw new Error(`Missing panel element: ${selector}`);
  return element;
}

function scopeLabel(): string {
  if (location.pathname.startsWith("/search_result")) return "搜索结果";
  if (location.pathname.startsWith("/user/profile/")) return "博主主页";
  if (location.pathname.startsWith("/explore")) return "首页推荐";
  return "当前页面";
}

function pageKey(): string {
  return `${location.pathname}${location.search}`;
}

function showToast(text: string, state: "working" | "success" | "error" = "working"): void {
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  let toast = root.querySelector<HTMLElement>("[data-role='toast']");
  if (!toast) {
    toast = document.createElement("div");
    toast.dataset.role = "toast";
    toast.className = "toast";
    root.append(toast);
  }
  toast.className = `toast is-${state}`;
  toast.textContent = text;
  toast.hidden = false;
  toast.onclick = state === "error" ? () => { if (toast) toast.hidden = true; } : null;
  if (state !== "error") {
    toastTimer = setTimeout(() => { if (toast) toast.hidden = true; }, state === "success" ? 5_000 : 3_000);
  }
}

function noteTitle(link: HTMLAnchorElement): string {
  return (link.textContent || "").replace(/\s+/g, " ").trim();
}

function collectCandidates(): void {
  const next = new Map<string, AutoClipCandidate>();
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const noteId = noteIdFromXiaohongshuUrl(link.href);
    if (!noteId) continue;
    const title = noteTitle(link);
    if (!title || title.length > 180) continue;
    const existing = next.get(noteId);
    if (!existing || title.length > existing.title.length) {
      next.set(noteId, { url: link.href, title });
    }
  }
  candidates.clear();
  for (const [noteId, item] of next) candidates.set(noteId, item);
  for (const noteId of [...selectedNoteIds]) {
    if (!candidates.has(noteId)) selectedNoteIds.delete(noteId);
  }
}

function historyNoteIds(): Set<string> {
  return new Set(panelState.history.map((entry) => entry.noteId));
}

function selectedOutput(): AutoClipOutput {
  return panelElement<HTMLInputElement>('input[name="xhs-auto-output"]:checked').value as AutoClipOutput;
}

async function startBatch(items: AutoClipCandidate[], output: AutoClipOutput): Promise<void> {
  if (panelState.running) {
    showToast("已有任务正在运行，请等待当前队列完成", "error");
    return;
  }
  if (items.length > AUTO_CLIP_BATCH_LIMIT) throw new Error("AUTO_CLIP_BATCH_LIMIT");
  const completedIds = historyNoteIds();
  const duplicates = items.filter((item) => completedIds.has(noteIdFromXiaohongshuUrl(item.url)));
  let duplicatePolicy: "skip" | "rerun" = "skip";
  if (duplicates.length > 0) {
    duplicatePolicy = window.confirm(
      `${duplicates.length} 篇文章已经处理过。\n\n确定后重新处理，取消则跳过重复文章。`
    ) ? "rerun" : "skip";
  }
  const response = await chrome.runtime.sendMessage({
    target: "background",
    type: "AUTO_CLIP_BATCH",
    items,
    output,
    duplicatePolicy,
    ocrEnabled: panelElement<HTMLInputElement>("[data-role='ocr-enabled']").checked,
    ocrMode: panelElement<HTMLInputElement>('input[name="xhs-auto-ocr-mode"]:checked').value as "all" | "skip-cover" | "custom",
    ocrRange: panelElement<HTMLInputElement>("[data-role='ocr-range']").value
  }) as AutoClipPanelState | { error?: string };
  if ("error" in response && response.error) throw new Error(response.error);
  panelState = response as AutoClipPanelState;
  renderTaskState();
}

function renderTaskState(): void {
  const progress = panelElement<HTMLElement>("[data-role='progress']");
  const summary = panelElement<HTMLElement>("[data-role='summary']");
  const queue = panelElement<HTMLElement>("[data-role='queue']");
  const current = panelState.queue[panelState.currentIndex];
  const completed = panelState.queue.filter((item) => item.status === "completed").length;
  const skipped = panelState.queue.filter((item) => item.status === "skipped").length;
  const failed = panelState.queue.filter((item) => item.status === "error").length;
  progress.style.width = `${Math.max(0, Math.min(100, panelState.progress))}%`;
  panelElement<HTMLElement>("[data-role='progress-label']").textContent = panelState.running
    ? `正在处理 ${panelState.currentIndex + 1}/${panelState.total}`
    : "任务状态";
  panelElement<HTMLElement>("[data-role='progress-value']").textContent = `${panelState.progress}%`;
  summary.textContent = panelState.running
    ? `${current?.title || "准备任务"} · ${stageLabels[panelState.stage || ""] || statusLabels[current?.status || ""] || "处理中"}`
    : panelState.queue.length > 0
      ? `已结束 · 完成 ${completed} · 跳过 ${skipped} · 失败 ${failed}`
      : "还没有运行任务";
  queue.replaceChildren(...panelState.queue.map((item) => {
    const row = document.createElement("div");
    row.className = `queue-row is-${item.status}`;
    const status = document.createElement("span");
    status.className = "queue-status";
    status.textContent = statusLabels[item.status] || item.status;
    const detail = document.createElement("span");
    detail.className = "queue-title";
    detail.textContent = `${item.title}${item.error ? ` · ${displayError(item.error)}` : ""}`;
    row.append(status, detail);
    return row;
  }));
  for (const control of root.querySelectorAll<HTMLInputElement | HTMLButtonElement>("[data-task-control]")) {
    control.disabled = panelState.running;
  }
  updateOcrControls();
  if (!panelState.running && panelState.taskId && panelState.queue.length > 0
      && lastCompletionToastTaskId !== panelState.taskId) {
    lastCompletionToastTaskId = panelState.taskId;
    showToast("自动剪藏队列已结束", "success");
  }
}

function updateSelectedCount(): void {
  const count = selectedNoteIds.size;
  panelElement<HTMLElement>("[data-role='selected-count']").textContent = `已选 ${count}`;
  const start = panelElement<HTMLButtonElement>("[data-action='start']");
  start.textContent = count > 0 ? `开始剪藏 · ${count} 篇` : "开始剪藏";
  start.disabled = panelState.running || count === 0;
}

function renderMatches(query: string): void {
  collectCandidates();
  const list = panelElement<HTMLElement>("[data-role='matches']");
  const matches = [...candidates.entries()].filter(([, item]) => matchesAllKeywords(item.title, query));
  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>当前页面没有匹配项</strong><span>可以清空关键词后重新扫描，或继续向下滚动加载更多笔记。</span>";
    list.replaceChildren(empty);
  } else {
    list.replaceChildren(...matches.map(([noteId, item]) => {
      const label = document.createElement("label");
      label.className = "match-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedNoteIds.has(noteId);
      checkbox.dataset.noteId = noteId;
      checkbox.dataset.taskControl = "true";
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedNoteIds.add(noteId);
        else selectedNoteIds.delete(noteId);
        updateSelectedCount();
      });
      const copy = document.createElement("span");
      copy.className = "match-copy";
      const title = document.createElement("span");
      title.className = "match-title";
      title.textContent = item.title;
      const meta = document.createElement("span");
      meta.className = "match-meta";
      meta.textContent = historyNoteIds().has(noteId) ? "已处理 · 可选择重新处理" : `笔记 ${noteId.slice(-6)}`;
      copy.append(title, meta);
      label.append(checkbox, copy);
      return label;
    }));
  }
  panelElement<HTMLElement>("[data-role='match-count']").textContent = `找到 ${matches.length}`;
  panelElement<HTMLElement>("[data-role='source-count']").textContent = `当前页已加载 ${candidates.size}`;
  updateSelectedCount();
}

function updateOcrControls(): void {
  const enabled = panelElement<HTMLInputElement>("[data-role='ocr-enabled']").checked;
  const custom = panelElement<HTMLInputElement>('input[name="xhs-auto-ocr-mode"]:checked').value === "custom";
  for (const input of root.querySelectorAll<HTMLInputElement>('[data-role="ocr-options"] input')) {
    input.disabled = panelState.running || !enabled || (input.dataset.role === "ocr-range" && !custom);
  }
  panelElement<HTMLElement>("[data-role='ocr-options']").classList.toggle("is-disabled", !enabled);
}

function makeDraggable(host: HTMLElement, panel: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  handle.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest("button") || panel.classList.contains("is-maximized")) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    host.style.left = `${Math.max(8, event.clientX - offsetX)}px`;
    host.style.top = `${Math.max(8, event.clientY - offsetY)}px`;
    host.style.right = "auto";
  });
  handle.addEventListener("pointerup", () => { dragging = false; });
}

function createControlPanel(): void {
  if (document.getElementById(ROOT_ID)) return;
  const host = document.createElement("div");
  host.id = ROOT_ID;
  Object.assign(host.style, { position: "fixed", right: "16px", top: "72px", zIndex: "2147483647" });
  root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host{--xhs-red:#ff2442;--xhs-red-strong:#e91e3a;--xhs-red-soft:#fff1f3;--surface:#fff;--surface-muted:#f7f7f7;--surface-hover:#f3f3f3;--text:#222;--text-secondary:#666;--text-tertiary:#999;--border:#e8e8e8;--success:#168a5b;--danger:#c93a3a;--radius-xs:8px;--radius-sm:10px;--radius-md:14px;--radius-lg:18px;--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--shadow:0 12px 40px rgba(0,0,0,.14);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--text)}
    *{box-sizing:border-box}button,input{font:inherit}button{border:0}.panel{width:424px;height:min(760px,calc(100vh - 88px));min-width:360px;min-height:420px;overflow:hidden;resize:both;border:1px solid var(--border);border-radius:var(--radius-lg);background:rgba(255,255,255,.98);box-shadow:var(--shadow);font-size:14px;line-height:1.45;color:var(--text);backdrop-filter:blur(14px)}
    .panel-header{height:58px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid var(--border);background:var(--surface);cursor:move}.brand-dot{width:10px;height:10px;border-radius:50%;background:var(--xhs-red);box-shadow:0 0 0 4px var(--xhs-red-soft)}.brand{min-width:0;display:grid;gap:1px;flex:1}.brand strong{font-size:14px;line-height:1.2}.scope{color:var(--text-tertiary);font-size:11px}.window-actions{display:flex;gap:6px}.window-button{min-width:48px;height:30px;padding:0 9px;border-radius:var(--radius-xs);background:var(--surface-muted);color:var(--text-secondary);cursor:pointer;font-size:12px}.window-button:hover{background:var(--surface-hover);color:var(--text)}
    .panel-body{height:calc(100% - 58px);overflow:auto;padding:14px;overscroll-behavior:contain}.main-pane,.side-pane{min-width:0}.section{margin-bottom:14px}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:9px}.section-title{display:grid;gap:2px}.section-title strong{font-size:14px}.section-title span{font-size:11px;color:var(--text-tertiary)}.count-group{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.badge{padding:3px 8px;border-radius:999px;background:var(--surface-muted);color:var(--text-secondary);font-size:11px;white-space:nowrap}
    .search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.text-input{width:100%;height:40px;padding:0 12px;border:1px solid var(--border);border-radius:var(--radius-sm);outline:none;background:var(--surface);color:var(--text)}.text-input:focus{border-color:var(--xhs-red);box-shadow:0 0 0 3px var(--xhs-red-soft)}.button{height:40px;padding:0 14px;border-radius:var(--radius-sm);cursor:pointer;white-space:nowrap}.button-primary{background:var(--xhs-red);color:#fff;font-weight:650}.button-primary:hover{background:var(--xhs-red-strong)}.button-secondary{border:1px solid var(--border);background:var(--surface);color:var(--text-secondary)}.button-secondary:hover{background:var(--surface-muted);color:var(--text)}.button:disabled{cursor:not-allowed;opacity:.48}.selection-bar{display:flex;align-items:center;gap:8px;margin:9px 0}.selection-bar .button{height:30px;padding:0 10px;font-size:12px}.selection-hint{margin-left:auto;color:var(--text-tertiary);font-size:11px}
    .matches{height:212px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);scrollbar-width:thin}.match-row{display:flex;gap:10px;padding:10px 11px;border-bottom:1px solid var(--border);cursor:pointer}.match-row:last-child{border-bottom:0}.match-row:hover{background:var(--surface-muted)}input[type=checkbox],input[type=radio]{appearance:auto!important;-webkit-appearance:auto!important;display:inline-block!important;flex:0 0 16px!important;width:16px!important;height:16px!important;margin:2px 0!important;padding:0!important;opacity:1!important;visibility:visible!important;position:static!important;accent-color:var(--xhs-red)}.match-copy{min-width:0;display:grid;gap:3px}.match-title{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.45;overflow-wrap:anywhere}.match-meta{color:var(--text-tertiary);font-size:11px}.empty-state{height:100%;display:grid;place-content:center;gap:5px;padding:24px;text-align:center;color:var(--text-tertiary)}.empty-state strong{color:var(--text-secondary);font-size:13px}.empty-state span{max-width:250px;font-size:11px;line-height:1.6}
    .settings-grid{display:grid;grid-template-columns:1fr;gap:10px}.setting-card{border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface)}.setting-card summary{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;cursor:pointer;list-style:none;font-weight:650}.setting-card summary::-webkit-details-marker{display:none}.setting-card summary::after{content:"展开";color:var(--text-tertiary);font-size:11px;font-weight:400}.setting-card[open] summary::after{content:"收起"}.setting-content{display:grid;gap:9px;padding:0 12px 12px}.setting-row{display:flex;align-items:flex-start;gap:9px}.setting-copy{display:grid;gap:2px}.setting-copy small{color:var(--text-tertiary);font-size:11px}.ocr-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px 0 0 25px;border-top:1px dashed var(--border);transition:opacity .16s}.ocr-options.is-disabled{opacity:.45}.ocr-options label,.output-options label{display:flex;align-items:flex-start;gap:7px}.ocr-range{grid-column:1/-1;height:34px}.output-options{display:grid;gap:9px}.settings-button{width:100%;height:34px;margin-top:2px}
    .action-zone{position:sticky;bottom:-14px;margin:2px -14px -14px;padding:12px 14px 14px;border-top:1px solid var(--border);background:linear-gradient(to bottom,rgba(255,255,255,.94),#fff 30%)}.start-button{width:100%}.task-card{margin-top:10px;padding:11px 12px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface)}.progress-heading{display:flex;justify-content:space-between;gap:8px;color:var(--text-secondary);font-size:11px}.progress-track{height:7px;margin:8px 0;border-radius:999px;background:var(--surface-muted);overflow:hidden}.progress-track i{display:block;height:100%;width:0;border-radius:inherit;background:var(--xhs-red);transition:width .2s}.task-summary{margin:0;color:var(--text-secondary);font-size:12px;overflow-wrap:anywhere}.queue{max-height:130px;margin-top:8px;overflow:auto;scrollbar-width:thin}.queue-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;padding:7px 0;border-top:1px solid var(--border);font-size:11px}.queue-status{color:var(--text-tertiary);white-space:nowrap}.queue-row.is-completed .queue-status{color:var(--success)}.queue-row.is-error .queue-status{color:var(--danger)}.queue-title{min-width:0;overflow-wrap:anywhere;color:var(--text-secondary)}
    .toast{position:fixed;right:24px;bottom:24px;z-index:2147483647;max-width:380px;padding:11px 14px;border-radius:var(--radius-sm);color:#fff;box-shadow:var(--shadow);font-size:13px}.toast.is-working{background:#333}.toast.is-success{background:var(--success)}.toast.is-error{background:var(--danger);cursor:pointer}.panel.is-minimized{width:270px;height:58px!important;min-height:58px;resize:none}.panel.is-minimized .panel-body{display:none}.panel.is-maximized{position:fixed;inset:4vh 4vw;width:92vw;height:92vh;max-width:none;max-height:none;resize:none;font-size:15px}.panel.is-maximized .panel-header{height:64px;padding:0 20px}.panel.is-maximized .brand strong{font-size:16px}.panel.is-maximized .panel-body{height:calc(100% - 64px);display:grid;grid-template-columns:minmax(0,1.55fr) minmax(390px,.8fr);gap:24px;overflow:hidden;padding:22px}.panel.is-maximized .main-pane,.panel.is-maximized .side-pane{overflow:auto;padding-right:4px}.panel.is-maximized .matches{height:calc(92vh - 220px);min-height:420px}.panel.is-maximized .match-row{padding:13px}.panel.is-maximized .match-title{font-size:15px}.panel.is-maximized .settings-grid{gap:12px}.panel.is-maximized .action-zone{bottom:-22px;margin-left:0;margin-right:0;padding-left:0;padding-right:0}.panel.is-maximized .queue{max-height:240px}
    @media(max-width:720px){.panel{width:min(400px,calc(100vw - 16px));min-width:300px}.panel.is-maximized{inset:8px;width:calc(100vw - 16px);height:calc(100vh - 16px)}.panel.is-maximized .panel-body{display:block;overflow:auto;padding:14px}.ocr-options{grid-template-columns:1fr}.ocr-range{grid-column:1}.selection-hint{display:none}}
  `;
  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.className = "panel";
  panel.setAttribute("aria-label", "XHS Clipper 自动剪藏工作台");
  panel.innerHTML = `
    <header class="panel-header" data-role="header"><span class="brand-dot" aria-hidden="true"></span><span class="brand"><strong>XHS Clipper</strong><span class="scope" data-role="scope">${scopeLabel()} · 当前页</span></span><span class="window-actions"><button class="window-button" data-action="resize" type="button">放大</button><button class="window-button" data-action="minimize" type="button">收起</button></span></header>
    <main class="panel-body">
      <section class="main-pane"><div class="section"><div class="section-heading"><span class="section-title"><strong>筛选当前页</strong><span>扫描当前页面已经加载的笔记，不会跨页面混入旧结果</span></span><span class="count-group"><span class="badge" data-role="source-count">当前页已加载 0</span><span class="badge" data-role="match-count">找到 0</span><span class="badge" data-role="selected-count">已选 0</span></span></div><div class="search-row"><input class="text-input" data-role="query" data-task-control type="text" placeholder="可选关键词，例如 新二 cs"><button class="button button-primary" data-action="search" data-task-control type="button">扫描当前页</button></div><div class="selection-bar"><button class="button button-secondary" data-action="select-all" data-task-control type="button">选择前 20 篇</button><button class="button button-secondary" data-action="select-none" data-task-control type="button">清空选择</button><span class="selection-hint">单批最多 ${AUTO_CLIP_BATCH_LIMIT} 篇</span></div><div class="matches" data-role="matches"><div class="empty-state"><strong>先扫描当前页面</strong><span>主页、搜索页和博主主页都可以使用；继续滚动后可再次扫描。</span></div></div></div></section>
      <aside class="side-pane"><div class="settings-grid"><details class="setting-card" open><summary>内容识别</summary><div class="setting-content"><label class="setting-row"><input type="checkbox" data-role="ocr-enabled" data-task-control checked><span class="setting-copy"><strong>启用本地 OCR</strong><small>关闭后只保存网页正文与原图</small></span></label><div class="ocr-options" data-role="ocr-options"><label><input type="radio" name="xhs-auto-ocr-mode" data-task-control value="all" checked>全部图片</label><label><input type="radio" name="xhs-auto-ocr-mode" data-task-control value="skip-cover">跳过封面</label><label><input type="radio" name="xhs-auto-ocr-mode" data-task-control value="custom">自定义页码</label><input class="text-input ocr-range" data-role="ocr-range" data-task-control type="text" placeholder="例如 1,3-5" disabled></div></div></details><details class="setting-card" open><summary>导出位置</summary><div class="setting-content output-options"><label><input type="radio" name="xhs-auto-output" data-task-control value="download" checked>Chrome 默认下载路径</label><label><input type="radio" name="xhs-auto-output" data-task-control value="obsidian">Obsidian · Clippings/XHS</label><button class="button button-secondary settings-button" data-action="obsidian-settings" type="button">配置实验版 Obsidian</button></div></details></div><div class="action-zone"><button class="button button-primary start-button" data-action="start" data-task-control type="button" disabled>开始剪藏</button><div class="task-card"><div class="progress-heading"><span data-role="progress-label">任务状态</span><span data-role="progress-value">0%</span></div><div class="progress-track"><i data-role="progress"></i></div><p class="task-summary" data-role="summary">还没有运行任务</p><div class="queue" data-role="queue"></div></div></div></aside>
    </main>`;
  root.append(style, panel);
  document.documentElement.append(host);
  makeDraggable(host, panel, panelElement<HTMLElement>("[data-role='header']"));

  const minimize = panelElement<HTMLButtonElement>("[data-action='minimize']");
  minimize.onclick = () => {
    panel.classList.toggle("is-minimized");
    minimize.textContent = panel.classList.contains("is-minimized") ? "打开" : "收起";
  };
  const resize = panelElement<HTMLButtonElement>("[data-action='resize']");
  resize.onclick = () => {
    panel.classList.toggle("is-maximized");
    resize.textContent = panel.classList.contains("is-maximized") ? "还原" : "放大";
  };
  panelElement<HTMLButtonElement>("[data-action='search']").onclick = () => {
    selectedNoteIds.clear();
    renderMatches(panelElement<HTMLInputElement>("[data-role='query']").value);
  };
  panelElement<HTMLButtonElement>("[data-action='select-all']").onclick = () => {
    selectedNoteIds.clear();
    const boxes = [...root.querySelectorAll<HTMLInputElement>("[data-role='matches'] input[type='checkbox']")];
    for (const checkbox of boxes.slice(0, AUTO_CLIP_BATCH_LIMIT)) {
      checkbox.checked = true;
      if (checkbox.dataset.noteId) selectedNoteIds.add(checkbox.dataset.noteId);
    }
    if (boxes.length > AUTO_CLIP_BATCH_LIMIT) showToast(`为保护账号和页面稳定性，本次只选择前 ${AUTO_CLIP_BATCH_LIMIT} 篇`, "working");
    updateSelectedCount();
  };
  panelElement<HTMLButtonElement>("[data-action='select-none']").onclick = () => {
    selectedNoteIds.clear();
    for (const checkbox of root.querySelectorAll<HTMLInputElement>("[data-role='matches'] input[type='checkbox']")) checkbox.checked = false;
    updateSelectedCount();
  };
  panelElement<HTMLInputElement>("[data-role='ocr-enabled']").addEventListener("change", updateOcrControls);
  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="xhs-auto-ocr-mode"]')) input.addEventListener("change", updateOcrControls);
  panelElement<HTMLInputElement>("[data-role='query']").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      selectedNoteIds.clear();
      renderMatches((event.currentTarget as HTMLInputElement).value);
    }
  });
  panelElement<HTMLButtonElement>("[data-action='obsidian-settings']").onclick = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ target: "background", type: "OPEN_OPTIONS_PAGE" }) as { error?: string };
      if (response?.error) throw new Error(response.error);
    } catch (error) {
      showToast(`无法打开设置页：${displayError(error instanceof Error ? error.message : String(error))}`, "error");
    }
  };
  panelElement<HTMLButtonElement>("[data-action='start']").onclick = async () => {
    const items = [...selectedNoteIds].map((noteId) => candidates.get(noteId)).filter((item): item is AutoClipCandidate => Boolean(item));
    if (items.length === 0) return showToast("请先扫描并选择文章", "error");
    try {
      await startBatch(items, selectedOutput());
    } catch (error) {
      showToast(`启动失败：${displayError(error instanceof Error ? error.message : String(error))}`, "error");
    }
  };
  updateOcrControls();
  updateSelectedCount();
}

function syncPageScope(): void {
  const nextPageKey = pageKey();
  if (nextPageKey === currentPageKey) return;
  currentPageKey = nextPageKey;
  candidates.clear();
  selectedNoteIds.clear();
  panelElement<HTMLElement>("[data-role='scope']").textContent = `${scopeLabel()} · 当前页`;
  panelElement<HTMLElement>("[data-role='source-count']").textContent = "当前页已加载 0";
  panelElement<HTMLElement>("[data-role='match-count']").textContent = "找到 0";
  panelElement<HTMLElement>("[data-role='matches']").innerHTML = "<div class=\"empty-state\"><strong>页面已切换</strong><span>点击“扫描当前页”读取这个页面已经加载的笔记。</span></div>";
  updateSelectedCount();
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  const update = message as Partial<AutoClipStatusMessage>;
  if (update.target !== "content" || update.type !== "AUTO_CLIP_STATUS" || !update.state) return false;
  panelState = update.state;
  renderTaskState();
  return false;
});

createControlPanel();
currentPageKey = pageKey();
const observer = new MutationObserver(() => {
  if (routeTimer !== undefined) clearTimeout(routeTimer);
  routeTimer = setTimeout(syncPageScope, 350);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
void chrome.runtime.sendMessage({ target: "background", type: "GET_AUTO_CLIP_STATE" })
  .then((state: AutoClipPanelState) => {
    panelState = state;
    renderTaskState();
  })
  .catch(() => showToast("无法连接扩展后台，请重新加载实验版扩展", "error"));
