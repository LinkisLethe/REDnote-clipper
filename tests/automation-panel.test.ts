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
  });
});
