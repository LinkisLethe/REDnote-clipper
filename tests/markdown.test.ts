import { describe, expect, it } from "vitest";
import { createMarkdownFilename, createVersionedMarkdownFilename } from "../src/core/filename";
import { readMarkdownNoteId, renderMarkdown } from "../src/core/markdown";
import type { Note } from "../src/core/types";

const note: Note = {
  id: "abc123",
  url: "https://www.xiaohongshu.com/explore/abc123",
  platform: "xiaohongshu",
  title: '周末散步：路线 "A"',
  body: "第一段\n\n第二段",
  authorId: "user-1",
  authorName: "小林",
  images: [
    {
      index: 0,
      url: "https://example.com/1.jpg",
      ocr: {
        imageIndex: 0,
        text: "第一张图\nHello",
        lines: [],
        status: "success"
      }
    },
    {
      index: 1,
      url: "https://example.com/2.jpg",
      ocr: { imageIndex: 1, text: "", lines: [], status: "empty" }
    }
  ],
  tags: ["杭州", "散步"],
  publishedAt: "2026-07-26T08:30:00.000Z",
  capturedAt: "2026-07-28T10:00:00.000Z",
  metrics: { likedCount: "128", collectedCount: "54", commentCount: "12" },
  extractionSource: "initial-state"
};

describe("renderMarkdown", () => {
  it("renders stable YAML and Chinese OCR sections", () => {
    const output = renderMarkdown(note, { language: "zh-CN", includeOcr: true });
    expect(output).toContain('title: "周末散步：路线 \\"A\\""');
    expect(output).toContain("tags: [\"杭州\", \"散步\"]");
    expect(output).toContain("ocr: true");
    expect(output).toContain("ocr_image_count: 1");
    expect(output).toContain("## 正文\n\n第一段\n\n第二段");
    expect(output).toContain("## 图片文字\n\n### 图片 1\n\n第一张图\nHello");
    expect(output).not.toContain("### 图片 2");
  });

  it("omits OCR text when the option is off", () => {
    const output = renderMarkdown(note, { language: "en", includeOcr: false });
    expect(output).toContain("ocr: false");
    expect(output).toContain("## Content");
    expect(output).not.toContain("Text from images");
  });

  it("reads note identity safely before an Obsidian overwrite", () => {
    expect(readMarkdownNoteId(renderMarkdown(note, { language: "zh-CN", includeOcr: false })))
      .toBe("abc123");
    expect(readMarkdownNoteId("---\ntitle: \"旧笔记\"\n---\n")).toBeUndefined();
    expect(readMarkdownNoteId("note_id: not-json")).toBeUndefined();
  });
});

describe("createMarkdownFilename", () => {
  it("removes Windows-reserved characters", () => {
    const filename = createMarkdownFilename("A/B:C*D?", "作者<>|", note.publishedAt);
    expect(filename).toBe("A B C D_作者_2026-07-26.md");
  });

  it("creates readable timestamped filenames for Obsidian versions", () => {
    const createdAt = new Date(2026, 7, 23, 14, 5, 9);
    expect(createVersionedMarkdownFilename("文章_作者_2026-08-23.md", createdAt)).toBe(
      "文章_作者_2026-08-23_更新-20260823-140509.md"
    );
    expect(createVersionedMarkdownFilename("文章.md", createdAt, 2)).toBe(
      "文章_更新-20260823-140509-2.md"
    );
  });
});
