import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("automation panel entry points and design guardrails", () => {
  const content = readFileSync("src/content.ts", "utf8");
  const background = readFileSync("src/background.ts", "utf8");
  const types = readFileSync("src/core/types.ts", "utf8");
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
    content_scripts?: Array<{ matches?: string[]; js?: string[] }>;
    action?: { default_popup?: string; default_title?: string };
    permissions?: string[];
  };

  it("injects the floating workspace across Xiaohongshu pages", () => {
    expect(manifest.content_scripts?.[0]?.matches).toContain("https://www.xiaohongshu.com/*");
    expect(manifest.content_scripts?.[0]?.js).toContain("assets/content.js");
    expect(content).toContain('return "搜索结果"');
    expect(content).toContain('return "博主主页"');
    expect(content).toContain('return "首页推荐"');
  });

  it("uses the extension button to toggle the floating workspace", () => {
    expect(manifest.action?.default_popup).toBeUndefined();
    expect(manifest.action?.default_title).toBe("__MSG_actionTitle__");
    expect(manifest.permissions).not.toContain("clipboardWrite");
    expect(background).toContain("chrome.action.onClicked.addListener");
    expect(background).toContain("async function toggleWorkspace");
    expect(background).toContain('type: "TOGGLE_AUTO_CLIP_PANEL"');
    expect(background).toContain('files: ["assets/content.js"]');
    expect(background).toContain("工作台打开失败，请刷新小红书页面后重试");
    expect(content).toContain('update.type === "TOGGLE_AUTO_CLIP_PANEL"');
    expect(content).toContain("minimize.click()");
    expect(content).toContain("syncPageScope(true)");
    expect(content).toContain("panel.tabIndex = -1");
    expect(types).toContain('type: "TOGGLE_AUTO_CLIP_PANEL"');
  });

  it("isolates the panel from host-page styles and uses design tokens", () => {
    expect(content).toContain("attachShadow({ mode: \"open\" })");
    expect(content).toContain("--xhs-red:#ff2442");
    expect(content).toContain("--radius-lg:18px");
    expect(content).not.toContain("insertAdjacentElement(\"afterend\"");
  });

  it("does not select a broad page batch without an explicit action", () => {
    expect(content).toContain("checkbox.checked = selectedNoteIds.has(noteId)");
    expect(content).toContain("selectedNoteIds.clear()");
    expect(content).toContain("AUTO_CLIP_BATCH_LIMIT = 20");
    expect(background).toContain("request.items.length > AUTO_CLIP_BATCH_LIMIT");
    expect(content).toContain("atLimit && !checkbox.checked");
    expect(content).toContain("checkbox.disabled = panelState.running || limitDisabled");
  });

  it("uses accessible window icons and keeps the panel width while collapsed", () => {
    expect(content).toContain('aria-label="宽屏模式"');
    expect(content).toContain("WINDOW_ICONS.expand");
    expect(content).toContain(".panel.is-minimized{height:58px!important");
    expect(content).not.toContain(".panel.is-minimized{width:");
  });

  it("avoids full-page mutation work and batches task rendering", () => {
    expect(content).not.toContain("new MutationObserver");
    expect(content).not.toContain("backdrop-filter");
    expect(content).toContain("requestAnimationFrame");
    expect(content).toContain("nextQueueRenderKey !== lastQueueRenderKey");
    expect(content).toContain("contain:layout paint style");
  });

  it("prepares the current article after Xiaohongshu SPA navigation", () => {
    expect(content).toContain("currentArticleCandidate(retainedCandidate)");
    expect(content).toContain("selectedNoteIds.add(noteId)");
    expect(content).toContain('textContent = "当前文章 · 已准备"');
    expect(content).toContain("if (panelState.running) scheduleTaskStateRender()");
    expect(content).toContain("}, 1_000)");
    expect(content).toContain("${location.pathname}${location.search}${location.hash}");
  });

  it("offers explicit Obsidian duplicate choices and natural completion copy", () => {
    expect(content).toContain('data-duplicate-policy="skip"');
    expect(content).toContain('data-duplicate-policy="new-version"');
    expect(content).toContain('data-duplicate-policy="overwrite"');
    expect(content).not.toContain("window.confirm");
    expect(content).toContain("剪藏结束，成功 ${completed} 篇");
    expect(content).toContain("<strong>另存为新版本</strong>");
    expect(background).toContain('duplicatePolicy === "new-version"');
    expect(background).toContain("createVersionedMarkdownFilename");
    expect(background).toContain("readMarkdownNoteId(await existing.text())");
    expect(background).toContain('duplicatePolicy === "overwrite" && existingNoteId !== noteId');
    expect(background).not.toContain("history.some((entry) => entry.noteId === candidateId)");
  });

  it("guards duplicate starts and makes the conflict dialog keyboard accessible", () => {
    expect(content).toContain("startingBatch || panelState.running");
    expect(content).toContain("start.disabled = startingBatch || panelState.running");
    expect(content).toContain("panelBody.inert = true");
    expect(content).toContain('event.key === "Escape"');
    expect(content).toContain('aria-describedby="xhs-duplicate-copy"');
  });

  it("uses a right-anchored desktop wide mode and full screen only on small screens", () => {
    expect(content).toContain('panel.classList.contains("is-wide")');
    expect(content).toContain("restoreNormalPanelSize()");
    expect(content).toContain("normalPanelSize = { width: rect.width, height: rect.height }");
    expect(content).toContain('window.innerWidth - rect.right');
    expect(content).toContain("PANEL_WIDE_MAX_WIDTH = 800");
    expect(content).toContain('panel.style.setProperty("--panel-wide-height", `${rect.height}px`)');
    expect(content).toContain('panel.style.removeProperty("width")');
    expect(content).toContain('panel.style.removeProperty("height")');
    expect(content).toContain('right:var(--panel-anchor-right,16px)');
    expect(content).toContain('@media(max-width:720px)');
    expect(content).not.toContain("is-maximized");
    expect(content).not.toContain("width:92vw");
    expect(content.indexOf('panel.style.removeProperty("width")'))
      .toBeLessThan(content.indexOf('panel.classList.add("is-wide")'));
  });

  it("remembers panel choices and collapsed sections in extension storage", () => {
    expect(content).toContain('PANEL_PREFERENCES_KEY = "autoClipPanelPreferences"');
    expect(content).toContain("chrome.storage.local.get(PANEL_PREFERENCES_KEY)");
    expect(content).toContain("[PANEL_PREFERENCES_KEY]: currentPanelPreferences()");
    expect(content).toContain("ocrEnabled: panelElement<HTMLInputElement>");
    expect(content).toContain("ocrMode,");
    expect(content).toContain("ocrRange: panelElement<HTMLInputElement>");
    expect(content).toContain("output,");
    expect(content).toContain("contentSettingsOpen:");
    expect(content).toContain("outputSettingsOpen:");
    expect(content).toContain("panelMinimized:");
    expect(content).toContain('data-role="content-settings"');
    expect(content).toContain('data-role="output-settings"');
    expect(content).toContain('addEventListener("toggle", queuePanelPreferencesSave)');
    expect(content).toContain('panel.classList.toggle("is-minimized", Boolean(preferences.panelMinimized))');
    expect(content).toContain("panelPreferencesReady = true");
  });

  it("removes completed rows and clears the transient result without losing history", () => {
    expect(content).toContain("COMPLETION_DISPLAY_MS = 5_000");
    expect(content).toContain('state === "success" ? COMPLETION_DISPLAY_MS : 3_000');
    expect(content).toContain('panelState.queue.filter((item) => item.status !== "completed")');
    expect(content).toContain("scheduleCompletedTaskReset(panelState.taskId)");
    expect(content).toContain("}, COMPLETION_DISPLAY_MS)");
    expect(content).toContain("...panelState,");
    expect(content).toContain("taskId: undefined,");
    expect(content).toContain("queue: []");
    expect(content).not.toContain("history: []\n    };");
  });

  it("uses one accessible article link for both the title and open icon", () => {
    expect(content).toContain('const link = document.createElement("a")');
    expect(content).toContain("link.href = item.url");
    expect(content).toContain('link.target = "_self"');
    expect(content).toContain('link.setAttribute("aria-label", `打开文章：${item.title}`)');
    expect(content).toContain('const open = document.createElement("span")');
    expect(content).not.toContain('const open = document.createElement("a")');
    expect(content).toContain('closest("a,input")');
    expect(content).toContain("checkbox.click()");
  });

  it("shows a keyboard accessible start summary before creating a task", () => {
    expect(content).toContain("function confirmBatchStart");
    expect(content).toContain('data-role="confirm-count"');
    expect(content).toContain('data-role="confirm-ocr"');
    expect(content).toContain('data-role="confirm-output"');
    expect(content).toContain('data-action="confirm-start"');
    expect(content).toContain("if (!await confirmBatchStart(items.length, output)) return");
    expect(content.indexOf("confirmBatchStart(items.length, output)"))
      .toBeLessThan(content.indexOf("await startBatch(items, output)"));
  });

  it("keeps OCR choices on one line and enriches rows only in wide mode", () => {
    expect(content).toContain("grid-template-columns:max-content max-content max-content");
    expect(content).toContain(".ocr-options label{white-space:nowrap}");
    expect(content).toContain("thumbnailUrl?: string");
    expect(content).toContain("authorName?: string");
    expect(content).toContain("const workspaceMode =");
    expect(content).toContain("workspaceMode ? candidatePreview(link, previewCache) : {}");
    expect(content).toContain("candidatePreview(link, previewCache)");
    expect(content).toContain(".match-thumbnail{display:none}");
    expect(content).toContain(".panel.is-wide .match-thumbnail{display:block");
    expect(content).toContain(".panel.is-wide .match-author{display:inline}");
  });

  it("only shows custom OCR page controls when that mode is selected", () => {
    expect(content).toContain('data-role="ocr-range" data-task-control type="text" placeholder="例如 1,3-5" hidden disabled');
    expect(content).toContain('data-role="ocr-estimate" hidden');
    expect(content).toContain("range.hidden = !custom");
    expect(content).toContain("estimate.hidden = !custom");
    expect(content).toContain("estimateOcrPageCount(range.value)");
    expect(content).toContain("每篇预计识别 ${pageCount} 张，以文章实际图片为准");
    expect(content).toContain("填写后显示预计识别数量");
    expect(content).toContain(".ocr-range[hidden],.ocr-estimate[hidden]{display:none}");
  });

  it("uses a clear Obsidian configuration label", () => {
    expect(content).toContain("配置 Obsidian 权限和导出路径");
    expect(content).not.toContain("配置实验版 Obsidian");
  });

  it("can stop safely after the current article and reports elapsed time", () => {
    expect(types).toContain('type: "STOP_AUTO_CLIP_TASK"');
    expect(types).toContain('stopRequested?: boolean');
    expect(types).toContain('| "canceled"');
    expect(background).toContain("async function requestAutoClipStop");
    expect(background).toContain("stopRequestedAutoClipTasks.add(taskId)");
    expect(background).toContain('item.status === "queued" ? { ...item, status: "canceled" as const }');
    expect(background).toContain("if (task.stopRequested)");
    expect(content).toContain('data-action="stop-task"');
    expect(content).toContain("处理完当前篇后停止");
    expect(content).toContain("预计剩余 ${formatDuration");
  });

  it("temporarily docks the normal panel while the page scrolls", () => {
    expect(content).toContain(".panel.is-reading:not(.is-wide):not(.is-minimized):not(.is-task-running)");
    expect(content).toContain('window.addEventListener("scroll"');
    expect(content).toContain('panel.classList.add("is-reading")');
    expect(content).toContain('host.addEventListener("pointerenter", revealPanel)');
    expect(content).toContain("readingModeTimer = setTimeout(revealPanel, 1_800)");
  });

  it("keeps the existing all-keywords matching behavior", () => {
    expect(content).toContain("return terms.every((term) => normalizedTitle.includes(term))");
  });
});
