import { describe, expect, it } from "vitest";
import { createMarkdownFilename } from "../src/core/filename";
import { renderMarkdown } from "../src/core/markdown";
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
});

describe("createMarkdownFilename", () => {
  it("removes Windows-reserved characters", () => {
    const filename = createMarkdownFilename("A/B:C*D?", "作者<>|", note.publishedAt);
    expect(filename).toBe("A B C D_作者_2026-07-26.md");
  });
});
