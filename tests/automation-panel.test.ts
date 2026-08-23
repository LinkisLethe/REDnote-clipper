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
    expect(content).toContain('aria-label="放大窗口"');
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
    expect(content).toContain("剪藏好了，成功 ${completed} 篇");
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

  it("keeps maximize and collapse states mutually consistent", () => {
    expect(content).toContain('panel.classList.contains("is-maximized")');
    expect(content).toContain("restoreNormalPanelSize()");
    expect(content).toContain("normalPanelSize = { width: rect.width, height: rect.height }");
  });
});
