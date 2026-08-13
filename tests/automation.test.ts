import { describe, expect, it } from "vitest";
import {
  isXiaohongshuNoteUrl,
  isXiaohongshuUrl,
  matchesAllKeywords,
  normalizeSearchText,
  noteIdFromXiaohongshuUrl
} from "../src/core/automation";

describe("Xiaohongshu automation URLs", () => {
  it("recognizes profile note links used on creator pages", () => {
    const url = "https://www.xiaohongshu.com/user/profile/author/6a4def78000000002103e295?xsec_token=token";
    expect(isXiaohongshuUrl(url)).toBe(true);
    expect(isXiaohongshuNoteUrl(url)).toBe(true);
    expect(noteIdFromXiaohongshuUrl(url)).toBe("6a4def78000000002103e295");
  });

  it("keeps supporting explore and discovery links", () => {
    expect(noteIdFromXiaohongshuUrl("https://www.xiaohongshu.com/explore/abc123")).toBe("abc123");
    expect(noteIdFromXiaohongshuUrl("https://www.xiaohongshu.com/discovery/item/xyz789")).toBe("xyz789");
  });

  it("rejects unrelated and malformed URLs", () => {
    expect(isXiaohongshuNoteUrl("https://example.com/explore/abc123")).toBe(false);
    expect(isXiaohongshuUrl("not a url")).toBe(false);
  });

  it("matches normalized keyword groups without requiring an exact title", () => {
    expect(normalizeSearchText("新二 CS 专业大盘点-其他泛 CS 篇")).toBe("新二cs专业大盘点其他泛cs篇");
    expect(matchesAllKeywords("新二cs专业大盘点-其他泛cs篇", "新二 cs")).toBe(true);
    expect(matchesAllKeywords("港前五cs专业大盘点-网络安全篇", "新二 cs")).toBe(false);
  });
});
