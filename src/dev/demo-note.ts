import type { Note } from "../core/types";

export function createDemoNote(): Note {
  return {
    id: "demo-note",
    url: "https://www.xiaohongshu.com/explore/demo-note",
    platform: "xiaohongshu",
    title: "周末在杭州散步：三条安静路线",
    body: "避开热门景点，从北山街走到茅家埠。沿路树荫很多，下午四点以后光线最好。\n\n#杭州旅行 #城市散步",
    authorName: "山野记录员",
    images: [
      { index: 0, url: "https://example.com/1.jpg" },
      { index: 1, url: "https://example.com/2.jpg" },
      { index: 2, url: "https://example.com/3.jpg" }
    ],
    tags: ["杭州旅行", "城市散步"],
    publishedAt: "2026-07-26T08:30:00.000Z",
    capturedAt: new Date().toISOString(),
    metrics: { likedCount: "128", collectedCount: "54", commentCount: "12" },
    extractionSource: "initial-state"
  };
}
