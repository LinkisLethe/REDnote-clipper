// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  extractXiaohongshuPage,
  normalizeExtractedNote
} from "../src/adapters/xiaohongshu";

declare global {
  interface Window {
    __INITIAL_STATE__?: Record<string, unknown>;
  }
}

beforeEach(() => {
  history.replaceState(null, "", "/explore/abc123");
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete window.__INITIAL_STATE__;
});

describe("extractXiaohongshuPage", () => {
  it("prefers structured state and preserves image order", () => {
    window.__INITIAL_STATE__ = {
      note: {
        noteDetailMap: {
          abc123: {
            note: {
              noteId: "abc123",
              title: "测试笔记",
              desc: "正文 #旅行",
              time: 1_753_516_200_000,
              user: { userId: "u1", nickname: "作者" },
              interactInfo: { likedCount: "10", collectedCount: "3" },
              tagList: [{ name: "杭州" }],
              imageList: [
                { urlDefault: "https://sns-webpic-qc.xhscdn.com/1.jpg" },
                { urlDefault: "https://sns-webpic-qc.xhscdn.com/2.jpg" }
              ]
            }
          }
        }
      }
    };
    const result = extractXiaohongshuPage();
    expect(result.ok).toBe(true);
    expect(result.data?.source).toBe("initial-state");
    expect(result.data?.imageUrls).toEqual([
      "https://sns-webpic-qc.xhscdn.com/1.jpg",
      "https://sns-webpic-qc.xhscdn.com/2.jpg"
    ]);
    expect(result.data?.tags).toEqual(["杭州", "旅行"]);
    expect(result.data?.metrics.likedCount).toBe("10");
  });

  it("falls back to visible DOM content", () => {
    document.body.innerHTML = `
      <main class="note-content">
        <h1 class="title">DOM 标题</h1>
        <div id="detail-desc">DOM 正文 #城市</div>
        <div class="author-wrapper"><span class="name">DOM 作者</span></div>
        <div class="swiper-slide"><img src="https://sns-webpic-qc.xhscdn.com/dom.jpg"></div>
      </main>
    `;
    const result = extractXiaohongshuPage();
    expect(result.ok).toBe(true);
    expect(result.data?.source).toBe("dom");
    expect(result.data?.title).toBe("DOM 标题");
    expect(result.data?.authorName).toBe("DOM 作者");
    expect(result.data?.imageUrls).toEqual([
      "https://sns-webpic-qc.xhscdn.com/dom.jpg"
    ]);
  });
});

describe("normalizeExtractedNote", () => {
  it("normalizes timestamps and deduplicates tags", () => {
    const normalized = normalizeExtractedNote(
      {
        id: "1",
        url: "https://www.xiaohongshu.com/explore/1",
        title: "标题",
        body: "正文",
        authorName: "作者",
        imageUrls: ["https://example.com/a.jpg"],
        tags: ["旅行", "旅行"],
        publishedAt: 1_753_516_200,
        metrics: {},
        source: "initial-state"
      },
      new Date("2026-07-28T10:00:00.000Z")
    );
    expect(normalized.tags).toEqual(["旅行"]);
    expect(normalized.publishedAt).toBe("2025-07-26T07:50:00.000Z");
    expect(normalized.capturedAt).toBe("2026-07-28T10:00:00.000Z");
    expect(normalized.cover).toBe("https://example.com/a.jpg");
  });
});
