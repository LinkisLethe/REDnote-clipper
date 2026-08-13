import type {
  AutoClipCandidate,
  AutoClipPanelState,
  AutoClipOutput,
  AutoClipStatusMessage
} from "./core/types";

function noteIdFromXiaohongshuUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!/(^|\.)xiaohongshu\.com$/i.test(url.hostname)) return "";
    return url.pathname.match(
      /\/(?:explore|discovery\/item|user\/profile\/[^/]+)\/([a-zA-Z0-9]+)/
    )?.[1] || url.searchParams.get("note_id") || "";
  } catch {
    return "";
  }
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function matchesAllKeywords(title: string, query: string): boolean {
  const normalizedTitle = normalizeSearchText(title);
  const terms = query.trim().split(/\s+/).map(normalizeSearchText).filter(Boolean);
  return terms.length > 0 && terms.every((term) => normalizedTitle.includes(term));
}

const BUTTON_MARKER = "data-xhs-clipper-auto-button";
const PANEL_ID = "xhs-clipper-auto-panel";
const TOAST_ID = "xhs-clipper-auto-toast";
const NOTE_LINK = /\/user\/profile\/[^/]+\/[a-zA-Z0-9]+/;
const candidates = new Map<string, AutoClipCandidate>();
let decorateTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let lastCompletionToastTaskId = "";
const pendingDecorationRoots = new Set<ParentNode>();
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
  AUTO_CLIP_URL_INVALID: "文章链接无效",
  AUTO_CLIP_PAGE_TIMEOUT: "文章页面加载超时",
  AUTO_CLIP_CAPTURE_FAILED: "文章内容提取失败",
  AUTO_CLIP_TITLE_MISMATCH: "打开的文章与标题不一致",
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

function displayError(value?: string): string {
  if (!value) return "";
  if (errorLabels[value]) return errorLabels[value];
  if (value.startsWith("OBSIDIAN_HTTP_ERROR:")) return `Obsidian 返回 HTTP ${value.split(":")[1] || "错误"}`;
  return value;
}

function showToast(
  text: string,
  state: "working" | "success" | "error" = "working"
): void {
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    Object.assign(toast.style, {
      position: "fixed",
      right: "24px",
      bottom: "24px",
      zIndex: "2147483647",
      maxWidth: "380px",
      padding: "12px 16px",
      borderRadius: "10px",
      color: "#fff",
      font: "14px/1.5 system-ui, sans-serif",
      boxShadow: "0 8px 28px rgba(0,0,0,.22)",
      cursor: state === "error" ? "pointer" : "default"
    });
    document.documentElement.append(toast);
  }
  toast.style.background = state === "error" ? "#b42318" : state === "success" ? "#16794b" : "#303030";
  toast.textContent = text;
  toast.onclick = state === "error" ? () => toast?.remove() : null;
  if (state !== "error") {
    toastTimer = setTimeout(() => toast?.remove(), state === "success" ? 6_000 : 4_000);
  }
}

function noteTitle(link: HTMLAnchorElement): string {
  return (link.innerText || link.textContent || "").replace(/\s+/g, " ").trim();
}

function collectCandidates(): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (!NOTE_LINK.test(link.pathname)) continue;
    const title = noteTitle(link);
    if (!title || title.length > 120 || /^一只大鹅来喽$/u.test(title)) continue;
    candidates.set(link.href, { url: link.href, title });
  }
}

function historyNoteIds(): Set<string> {
  return new Set(panelState.history.map((entry) => entry.noteId));
}

async function startBatch(items: AutoClipCandidate[], output: AutoClipOutput): Promise<void> {
  if (panelState.running) {
    showToast("已有任务正在运行，请等待当前队列完成", "error");
    return;
  }
  const completedIds = historyNoteIds();
  const duplicates = items.filter((item) => completedIds.has(noteIdFromXiaohongshuUrl(item.url)));
  let duplicatePolicy: "skip" | "rerun" = "skip";
  if (duplicates.length > 0) {
    const rerun = window.confirm(
      `${duplicates.length} 篇文章已经处理过。\n\n确定后重新处理，取消则跳过重复文章。`
    );
    duplicatePolicy = rerun ? "rerun" : "skip";
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

function panelElement<T extends HTMLElement>(selector: string): T {
  return document.querySelector<T>(`#${PANEL_ID} ${selector}`)!;
}

function selectedOutput(): AutoClipOutput {
  return panelElement<HTMLInputElement>('input[name="xhs-auto-output"]:checked').value as AutoClipOutput;
}

function renderTaskState(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const progress = panelElement<HTMLElement>("[data-role='progress']");
  const summary = panelElement<HTMLElement>("[data-role='summary']");
  const queue = panelElement<HTMLElement>("[data-role='queue']");
  const current = panelState.queue[panelState.currentIndex];
  progress.style.width = `${Math.max(0, Math.min(100, panelState.progress))}%`;
  panelElement<HTMLElement>("[data-role='progress-label']").textContent = panelState.running
    ? `任务进度 ${panelState.progress}%`
    : "任务进度";
  summary.textContent = panelState.running
    ? `${panelState.currentIndex + 1}/${panelState.total} · ${current?.title || "准备任务"} · ${stageLabels[panelState.stage || ""] || statusLabels[current?.status || ""] || "处理中"} · ${panelState.progress}%`
    : panelState.queue.length > 0
      ? `队列已结束，完成 ${panelState.queue.filter((item) => item.status === "completed").length}，跳过 ${panelState.queue.filter((item) => item.status === "skipped").length}，失败 ${panelState.queue.filter((item) => item.status === "error").length}`
      : "当前没有运行中的任务";
  queue.replaceChildren(...panelState.queue.map((item) => {
    const row = document.createElement("div");
    row.style.padding = "5px 0";
    row.style.borderBottom = "1px solid #eee";
    const label = statusLabels[item.status] || item.status;
    row.textContent = `${label} · ${item.title}${item.error ? ` · ${displayError(item.error)}` : ""}`;
    return row;
  }));
  for (const control of panel.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button[data-action='start']")) {
    control.disabled = panelState.running;
  }
  if (!panelState.running && panelState.taskId && panelState.queue.length > 0
      && lastCompletionToastTaskId !== panelState.taskId) {
    lastCompletionToastTaskId = panelState.taskId;
    showToast("自动剪藏队列已结束", "success");
  }
}

function renderMatches(query: string): void {
  collectCandidates();
  const list = panelElement<HTMLElement>("[data-role='matches']");
  const matches = [...candidates.values()].filter((item) => matchesAllKeywords(item.title, query));
  list.replaceChildren(...matches.map((item, index) => {
    const label = document.createElement("label");
    Object.assign(label.style, {
      display: "flex",
      gap: "8px",
      padding: "6px 0",
      alignItems: "flex-start",
      borderBottom: "1px solid #eee"
    });
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.url = item.url;
    checkbox.dataset.title = item.title;
    checkbox.id = `xhs-auto-match-${index}`;
    const text = document.createElement("span");
    const duplicate = historyNoteIds().has(noteIdFromXiaohongshuUrl(item.url));
    text.textContent = `${item.title}${duplicate ? "（已处理）" : ""}`;
    label.append(checkbox, text);
    return label;
  }));
  panelElement<HTMLElement>("[data-role='match-count']").textContent = `匹配 ${matches.length} 篇`;
  updateSelectedCount();
}

function updateSelectedCount(): void {
  const boxes = [...document.querySelectorAll<HTMLInputElement>(`#${PANEL_ID} [data-role='matches'] input[type='checkbox']`)];
  panelElement<HTMLElement>("[data-role='selected-count']").textContent = `已选 ${boxes.filter((box) => box.checked).length} 篇`;
}

function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  handle.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    dragging = true;
    offsetX = event.clientX - panel.getBoundingClientRect().left;
    offsetY = event.clientY - panel.getBoundingClientRect().top;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    panel.style.left = `${Math.max(0, event.clientX - offsetX)}px`;
    panel.style.top = `${Math.max(0, event.clientY - offsetY)}px`;
    panel.style.right = "auto";
  });
  handle.addEventListener("pointerup", () => { dragging = false; });
}

function createControlPanel(): void {
  if (document.getElementById(PANEL_ID)) return;
  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.setAttribute("aria-label", "XHS Clipper 自动剪藏控制栏");
  panel.innerHTML = `
    <header data-role="header"><strong>XHS Clipper Automation Lab</strong><span><button data-action="resize" title="放大或还原">□</button><button data-action="minimize" title="最小化">－</button></span></header>
    <main data-role="body">
      <section class="xhs-column xhs-column-main">
        <label class="xhs-query">关键词<input data-role="query" type="text" placeholder="例如 新二 cs"></label>
        <div class="xhs-toolbar"><button data-action="search" class="xhs-search">查找相关文章</button><span class="xhs-badge" data-role="match-count">匹配 0 篇</span><span class="xhs-badge" data-role="selected-count">已选 0 篇</span><span class="xhs-toolbar-spacer"></span><button type="button" data-action="select-all">全选</button><button type="button" data-action="select-none">取消全选</button></div>
        <div data-role="matches" class="xhs-scroll xhs-matches"></div>
      </section>
      <section class="xhs-column xhs-column-settings">
        <fieldset><legend>内容识别</legend><label class="xhs-switch-row"><input type="checkbox" data-role="ocr-enabled" checked><span><strong>启用本地 OCR</strong><small>关闭后只保存网页正文与原图</small></span></label><div data-role="ocr-options" class="xhs-ocr-options"><label><input type="radio" name="xhs-auto-ocr-mode" value="all" checked> 全部图片</label><label><input type="radio" name="xhs-auto-ocr-mode" value="skip-cover"> 跳过封面</label><label><input type="radio" name="xhs-auto-ocr-mode" value="custom"> 自定义页码</label><input data-role="ocr-range" type="text" placeholder="例如 1,3-5" disabled></div></fieldset>
        <fieldset><legend>导出位置</legend><label><input type="radio" name="xhs-auto-output" value="download" checked> Chrome 默认下载路径</label><label><input type="radio" name="xhs-auto-output" value="obsidian"> Obsidian · Clippings/XHS</label><button type="button" data-action="obsidian-settings" class="xhs-settings-button">配置实验版 Obsidian</button></fieldset>
        <button data-action="start" class="xhs-primary">剪藏已勾选文章</button>
        <div class="xhs-progress-head"><span data-role="progress-label">任务进度</span></div>
        <div class="xhs-progress"><i data-role="progress"></i></div>
        <p data-role="summary">当前没有运行中的任务</p>
        <div data-role="queue" class="xhs-scroll xhs-queue"></div>
      </section>
    </main>`;
  Object.assign(panel.style, {
    position: "fixed", right: "20px", top: "76px", zIndex: "2147483647",
    width: "380px", minWidth: "320px", maxWidth: "760px", height: "560px",
    minHeight: "260px", maxHeight: "85vh", resize: "both", overflow: "hidden",
    border: "1px solid #ddd", borderRadius: "14px", background: "rgba(255,255,255,.98)",
    boxShadow: "0 10px 36px rgba(0,0,0,.20)", color: "#222", font: "13px/1.45 system-ui,sans-serif"
  });
  const style = document.createElement("style");
  style.textContent = `#${PANEL_ID} *{box-sizing:border-box}#${PANEL_ID} header{height:46px;padding:11px 14px;display:flex;justify-content:space-between;align-items:center;background:#faf6f5;cursor:move;border-bottom:1px solid #eee7e3}#${PANEL_ID} header button{border:0;background:transparent;font-size:18px;cursor:pointer}#${PANEL_ID} main{height:calc(100% - 46px);padding:14px 14px 28px;overflow:auto;overscroll-behavior:contain}#${PANEL_ID} .xhs-query{display:grid;gap:6px}#${PANEL_ID} input[type=text]{width:100%;min-height:38px;padding:8px 10px;border:1px solid #d7d1ce;border-radius:9px;background:#fff;color:#222}#${PANEL_ID} input[type=checkbox],#${PANEL_ID} input[type=radio]{appearance:auto!important;-webkit-appearance:auto!important;display:inline-block!important;flex:0 0 16px!important;width:16px!important;height:16px!important;margin:2px 0!important;padding:0!important;opacity:1!important;visibility:visible!important;accent-color:#d8473e;clip:auto!important;position:static!important}#${PANEL_ID} button{padding:7px 11px;border:1px solid #d8473e;border-radius:9px;background:#fff;color:#c93e36;cursor:pointer;white-space:nowrap}#${PANEL_ID} button:hover{background:#fff5f4}#${PANEL_ID} button:disabled{opacity:.48;cursor:not-allowed}#${PANEL_ID} .xhs-toolbar{display:flex;align-items:center;gap:8px;margin:10px 0;flex-wrap:wrap}#${PANEL_ID} .xhs-toolbar-spacer{flex:1}#${PANEL_ID} .xhs-toolbar button:not(.xhs-search){padding:4px 9px;font-size:12px}#${PANEL_ID} .xhs-badge{padding:3px 8px;border-radius:999px;background:#f5f2f0;color:#625b57;font-size:12px}#${PANEL_ID} .xhs-scroll{overflow:auto;scrollbar-width:thin}#${PANEL_ID} .xhs-matches{max-height:170px;border-top:1px solid #eee}#${PANEL_ID} fieldset{display:grid;gap:9px;margin:14px 0;padding:11px 13px 13px;border:1px solid #ded9d6;border-radius:12px;min-width:0;background:#fff}#${PANEL_ID} fieldset legend{padding:0 5px;font-weight:650;color:#4d4642}#${PANEL_ID} fieldset label{display:flex;align-items:flex-start;gap:8px}#${PANEL_ID} .xhs-switch-row span{display:grid;gap:2px}#${PANEL_ID} .xhs-switch-row small{color:#817873;font-size:11px}#${PANEL_ID} .xhs-ocr-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px 10px;padding:9px 0 0 24px;border-top:1px dashed #ded8d4}#${PANEL_ID} .xhs-ocr-options input[type=text]{grid-column:1/-1;min-height:34px}#${PANEL_ID} .xhs-settings-button{width:100%;margin-top:2px}#${PANEL_ID} .xhs-primary{width:100%;min-height:40px;margin:3px 0 12px;background:#d8473e;color:#fff;font-weight:650}#${PANEL_ID} .xhs-primary:hover{background:#c83e36}#${PANEL_ID} .xhs-progress-head{display:flex;justify-content:space-between;margin-bottom:6px;color:#706864;font-size:12px}#${PANEL_ID} .xhs-progress{height:10px;margin:0 0 12px;border:1px dashed #d8473e;border-radius:999px;background:transparent;overflow:hidden}#${PANEL_ID} .xhs-progress i{display:block;height:100%;width:0;background:repeating-linear-gradient(135deg,#d8473e 0 7px,#ef9a94 7px 12px);transition:width .2s}#${PANEL_ID} [data-role=summary]{margin:0 0 10px;line-height:1.6}#${PANEL_ID} .xhs-queue{max-height:190px;padding-bottom:12px}#${PANEL_ID}.is-minimized{width:260px!important;height:46px!important;min-height:46px!important;resize:none}#${PANEL_ID}.is-minimized main{display:none}#${PANEL_ID}.is-maximized{left:4vw!important;top:4vh!important;right:auto!important;width:92vw!important;height:92vh!important;max-width:none!important;max-height:none!important;resize:none;font-size:16px!important}#${PANEL_ID}.is-maximized header{height:58px;padding:15px 20px;font-size:19px}#${PANEL_ID}.is-maximized main{height:calc(100% - 58px);display:grid;grid-template-columns:minmax(0,1.65fr) minmax(360px,1fr);gap:24px;padding:22px 26px}#${PANEL_ID}.is-maximized .xhs-column{min-width:0}#${PANEL_ID}.is-maximized .xhs-matches{max-height:calc(92vh - 200px);font-size:16px}#${PANEL_ID}.is-maximized .xhs-matches label{padding:10px 4px!important}#${PANEL_ID}.is-maximized .xhs-queue{max-height:calc(92vh - 520px)}#${PANEL_ID}.is-maximized button{font-size:14px}`;
  document.documentElement.append(style, panel);
  const header = panel.querySelector<HTMLElement>("header")!;
  makeDraggable(panel, header);
  panelElement<HTMLButtonElement>("[data-action='minimize']").onclick = () => panel.classList.toggle("is-minimized");
  panelElement<HTMLButtonElement>("[data-action='resize']").onclick = () => panel.classList.toggle("is-maximized");
  panelElement<HTMLButtonElement>("[data-action='search']").onclick = () => renderMatches(panelElement<HTMLInputElement>("[data-role='query']").value);
  panelElement<HTMLButtonElement>("[data-action='select-all']").onclick = () => {
    for (const input of panel.querySelectorAll<HTMLInputElement>("[data-role='matches'] input[type='checkbox']")) input.checked = true;
    updateSelectedCount();
  };
  panelElement<HTMLButtonElement>("[data-action='select-none']").onclick = () => {
    for (const input of panel.querySelectorAll<HTMLInputElement>("[data-role='matches'] input[type='checkbox']")) input.checked = false;
    updateSelectedCount();
  };
  panelElement<HTMLElement>("[data-role='matches']").addEventListener("change", updateSelectedCount);
  const updateOcrControls = () => {
    const enabled = panelElement<HTMLInputElement>("[data-role='ocr-enabled']").checked;
    const custom = panelElement<HTMLInputElement>('input[name="xhs-auto-ocr-mode"]:checked').value === "custom";
    for (const input of panel.querySelectorAll<HTMLInputElement>('[data-role="ocr-options"] input')) {
      input.disabled = !enabled || (input.dataset.role === "ocr-range" && !custom);
    }
    panelElement<HTMLElement>("[data-role='ocr-options']").style.opacity = enabled ? "1" : ".5";
  };
  panelElement<HTMLInputElement>("[data-role='ocr-enabled']").addEventListener("change", updateOcrControls);
  for (const input of panel.querySelectorAll<HTMLInputElement>('input[name="xhs-auto-ocr-mode"]')) {
    input.addEventListener("change", updateOcrControls);
  }
  updateOcrControls();
  panelElement<HTMLButtonElement>("[data-action='obsidian-settings']").onclick = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ target: "background", type: "OPEN_OPTIONS_PAGE" }) as { error?: string };
      if (response?.error) throw new Error(response.error);
    } catch (error) {
      showToast(`无法打开设置页：${displayError(error instanceof Error ? error.message : String(error))}`, "error");
    }
  };
  panelElement<HTMLInputElement>("[data-role='query']").addEventListener("keydown", (event) => {
    if (event.key === "Enter") renderMatches((event.currentTarget as HTMLInputElement).value);
  });
  panelElement<HTMLButtonElement>("[data-action='start']").onclick = async () => {
    const items = [...panel.querySelectorAll<HTMLInputElement>("[data-role='matches'] input:checked")].map((input) => ({
      url: input.dataset.url || "",
      title: input.dataset.title || ""
    })).filter((item) => item.url && item.title);
    if (items.length === 0) return showToast("请先查找并勾选文章", "error");
    try {
      await startBatch(items, selectedOutput());
    } catch (error) {
      showToast(`启动失败：${displayError(error instanceof Error ? error.message : String(error))}`, "error");
    }
  };
}

function decorateNoteLinks(root: ParentNode = document): void {
  const links = [...root.querySelectorAll<HTMLAnchorElement>("a[href]")];
  if (root instanceof HTMLAnchorElement && root.matches("a[href]")) links.unshift(root);
  for (const link of links) {
    if (!NOTE_LINK.test(link.pathname) || link.hasAttribute(BUTTON_MARKER)) continue;
    const title = noteTitle(link);
    if (!title || title.length > 120 || /^一只大鹅来喽$/u.test(title)) continue;
    const item = { url: link.href, title };
    candidates.set(item.url, item);
    link.setAttribute(BUTTON_MARKER, "true");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "自动剪藏";
    button.setAttribute("aria-label", `自动剪藏：${item.title}`);
    Object.assign(button.style, { margin: "6px 0 10px 6px", padding: "4px 9px", border: "1px solid #d8473e", borderRadius: "999px", color: "#d8473e", background: "#fff", cursor: "pointer", font: "12px/1.4 system-ui,sans-serif" });
    button.onclick = async (event) => {
      event.preventDefault(); event.stopPropagation();
      try { await startBatch([item], selectedOutput()); }
      catch (error) { showToast(`启动失败：${error instanceof Error ? error.message : String(error)}`, "error"); }
    };
    link.insertAdjacentElement("afterend", button);
  }
}

function scheduleDecoration(root: ParentNode = document): void {
  pendingDecorationRoots.add(root);
  if (decorateTimer !== undefined) clearTimeout(decorateTimer);
  decorateTimer = setTimeout(() => {
    decorateTimer = undefined;
    const roots = [...pendingDecorationRoots];
    pendingDecorationRoots.clear();
    for (const pendingRoot of roots) decorateNoteLinks(pendingRoot);
  }, 500);
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  const update = message as Partial<AutoClipStatusMessage>;
  if (update.target !== "content" || update.type !== "AUTO_CLIP_STATUS" || !update.state) return false;
  panelState = update.state;
  renderTaskState();
  return false;
});

createControlPanel();
decorateNoteLinks();
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) scheduleDecoration(node);
    }
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
void chrome.runtime.sendMessage({ target: "background", type: "GET_AUTO_CLIP_STATE" }).then((state: AutoClipPanelState) => {
  panelState = state;
  renderTaskState();
});
