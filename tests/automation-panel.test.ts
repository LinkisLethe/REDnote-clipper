import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("automation panel entry points and design guardrails", () => {
  const content = readFileSync("src/content.ts", "utf8");
  const background = readFileSync("src/background.ts", "utf8");
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
    content_scripts?: Array<{ matches?: string[]; js?: string[] }>;
  };

  it("injects the floating workspace across Xiaohongshu pages", () => {
    expect(manifest.content_scripts?.[0]?.matches).toContain("https://www.xiaohongshu.com/*");
    expect(manifest.content_scripts?.[0]?.js).toContain("assets/content.js");
    expect(content).toContain('return "搜索结果"');
    expect(content).toContain('return "博主主页"');
    expect(content).toContain('return "首页推荐"');
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
    expect(content).toContain("setInterval(() => syncPageScope(), 1_000)");
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

  it("links every scanned title and open icon to its Xiaohongshu article", () => {
    expect(content).toContain('const title = document.createElement("a")');
    expect(content).toContain("title.href = item.url");
    expect(content).toContain('title.target = "_self"');
    expect(content).toContain('open.className = "match-open"');
    expect(content).toContain("open.href = item.url");
    expect(content).toContain('open.setAttribute("aria-label", `打开文章：${item.title}`)');
    expect(content).toContain('closest("a,input")');
    expect(content).toContain("checkbox.click()");
  });
});
