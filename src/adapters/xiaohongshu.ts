import type { Note, NoteImage, NoteMetrics } from "../core/types";

export interface ExtractedXhsData {
  id: string;
  url: string;
  title: string;
  body: string;
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
  imageUrls: string[];
  tags: string[];
  publishedAt?: string | number;
  metrics: NoteMetrics;
  source: "initial-state" | "dom";
}

export interface ExtractionResponse {
  ok: boolean;
  data?: ExtractedXhsData;
  error?: "unsupported" | "not-found";
}

function normalizeXiaohongshuTag(value: string): string {
  return value
    .trim()
    .replace(/^#+/, "")
    .replace(/\[话题\]#*$/u, "")
    .replace(/#+$/, "")
    .trim();
}

export function extractXiaohongshuPage(): ExtractionResponse {
  type UnknownRecord = Record<string, unknown>;

  const asRecord = (value: unknown): UnknownRecord | undefined =>
    value && typeof value === "object" ? (value as UnknownRecord) : undefined;
  const asText = (value: unknown): string =>
    typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const firstText = (...values: unknown[]): string => {
    for (const value of values) {
      const text = asText(value);
      if (text) return text;
    }
    return "";
  };
  const getMeta = (name: string): string =>
    document.querySelector<HTMLMetaElement>(`meta[property="${name}"], meta[name="${name}"]`)
      ?.content?.trim() || "";
  const queryTextFrom = (root: ParentNode, selectors: string[]): string => {
    for (const selector of selectors) {
      const element = root.querySelector<HTMLElement>(selector);
      const text = (element?.innerText || element?.textContent || "").trim();
      if (text) return text;
    }
    return "";
  };
  const cleanImageUrl = (value: unknown): string => {
    const text = asText(value);
    if (!text) return "";
    if (text.startsWith("//")) return `https:${text}`;
    if (/^http:\/\/[^/]*xhscdn\.com\//i.test(text)) return text.replace(/^http:/i, "https:");
    return text;
  };
  const noteIdFromUrl = (): string => {
    const match = location.pathname.match(
      /\/(?:explore|search_result|discovery\/item|user\/profile\/[^/]+)\/([a-zA-Z0-9]+)/
    );
    return match?.[1] || new URL(location.href).searchParams.get("note_id") || "";
  };
  const getImageFromItem = (itemValue: unknown): string => {
    const item = asRecord(itemValue);
    if (!item) return "";
    const infoList = Array.isArray(item.infoList) ? item.infoList : [];
    const original = infoList
      .map(asRecord)
      .find((info) => asText(info?.imageScene).toLowerCase().includes("wb_dft"));
    const firstInfo = asRecord(infoList[0]);
    return cleanImageUrl(
      firstText(
        item.urlDefault,
        item.urlPre,
        item.url,
        original?.url,
        firstInfo?.url
      )
    );
  };
  // Chrome serializes this function before injecting it into the page.
  // Keep helpers used below inside the function so the injected copy has no module dependencies.
  const cleanTag = (value: string): string =>
    value
      .trim()
      .replace(/^#+/, "")
      .replace(/\[话题\]#*$/u, "")
      .replace(/#+$/, "")
      .trim();
  const dedupe = (values: string[]): string[] => [
    ...new Set(values.map(cleanTag).filter(Boolean))
  ];
  const normalizeTags = (tagList: unknown, body: string): string[] => {
    const structured = Array.isArray(tagList)
      ? tagList.map((tag) => firstText(asRecord(tag)?.name, asRecord(tag)?.title))
      : [];
    const inline = [...body.matchAll(/#([^#\s]+)/g)].map((match) => match[1] || "");
    return dedupe([...structured, ...inline]);
  };
  const normalizeMetrics = (interactValue: unknown): NoteMetrics => {
    const interact = asRecord(interactValue) || {};
    return {
      likedCount: firstText(interact.likedCount, interact.liked_count),
      collectedCount: firstText(interact.collectedCount, interact.collected_count),
      commentCount: firstText(interact.commentCount, interact.comment_count),
      sharedCount: firstText(interact.shareCount, interact.sharedCount, interact.share_count)
    };
  };

  if (!/(^|\.)xiaohongshu\.com$/i.test(location.hostname)) {
    return { ok: false, error: "unsupported" };
  }

  const idFromUrl = noteIdFromUrl();
  if (!idFromUrl) return { ok: false, error: "unsupported" };
  const pageWindow = window as typeof window & { __INITIAL_STATE__?: UnknownRecord };
  const state = asRecord(pageWindow.__INITIAL_STATE__);
  const noteState = asRecord(state?.note);
  const detailMapValue = noteState?.noteDetailMap;
  const detailMapRecord = asRecord(detailMapValue);
  const detailMap =
    asRecord(detailMapRecord?.value) ||
    asRecord(detailMapRecord?._value) ||
    detailMapRecord;
  let structuredNote: UnknownRecord | undefined;

  if (detailMap) {
    const preferred = idFromUrl ? asRecord(detailMap[idFromUrl]) : undefined;
    const candidates = [preferred, ...Object.values(detailMap).map(asRecord)].filter(Boolean);
    for (const candidate of candidates) {
      const inner = asRecord(candidate?.note) || asRecord(asRecord(candidate?.data)?.note) || candidate;
      if (!inner) continue;
      const candidateId = firstText(inner.noteId, inner.note_id, inner.id);
      if (!structuredNote || !idFromUrl || candidateId === idFromUrl) structuredNote = inner;
      if (candidateId === idFromUrl) break;
    }
  }

  if (structuredNote) {
    const user = asRecord(structuredNote.user) || {};
    const body = firstText(structuredNote.desc, structuredNote.description, structuredNote.content);
    const imageList = Array.isArray(structuredNote.imageList)
      ? structuredNote.imageList
      : Array.isArray(structuredNote.images)
        ? structuredNote.images
        : [];
    const imageUrls = dedupe(imageList.map(getImageFromItem));
    const id = firstText(structuredNote.noteId, structuredNote.note_id, structuredNote.id, idFromUrl);
    if (id) {
      return {
        ok: true,
        data: {
          id,
          url: location.href,
          title: firstText(structuredNote.title, getMeta("og:title"), document.title),
          body,
          authorId: firstText(user.userId, user.user_id, user.id),
          authorName: firstText(user.nickname, user.nickName, user.name),
          authorAvatar: cleanImageUrl(firstText(user.avatar, user.image, user.avatarUrl)),
          imageUrls,
          tags: normalizeTags(structuredNote.tagList, body),
          publishedAt: firstText(
            structuredNote.time,
            structuredNote.publishTime,
            structuredNote.publishedAt,
            structuredNote.lastUpdateTime
          ),
          metrics: normalizeMetrics(structuredNote.interactInfo),
          source: "initial-state"
        }
      };
    }
  }

  const detailRoot =
    document.querySelector(".note-detail-mask") ||
    document.querySelector("#noteContainer") ||
    document;
  const contentRoot =
    detailRoot.querySelector(".note-content") ||
    detailRoot.querySelector(".note-scroller") ||
    detailRoot;
  const carouselImages = detailRoot.querySelectorAll<HTMLImageElement>(
    ".swiper-slide:not(.swiper-slide-duplicate) img"
  );
  const imageElements = carouselImages.length > 0
    ? carouselImages
    : detailRoot.querySelectorAll<HTMLImageElement>(".note-slider img, .carousel img");
  const imageUrls = dedupe(
    [...imageElements]
      .filter((image) => !image.closest(".author-wrapper, .avatar, header, nav"))
      .map((image) => cleanImageUrl(image.dataset.src || image.currentSrc || image.src))
      .filter((url) => /xhscdn\.com|xiaohongshu\.com/i.test(url))
  );
  const body = queryTextFrom(contentRoot, ["#detail-desc", ".note-text", ".desc", ".content"])
    || getMeta("description")
    || getMeta("og:description");
  const rawTitle = queryTextFrom(contentRoot, ["#detail-title", ".note-content .title", ".title"])
    || getMeta("og:title")
    || document.title;
  const id = idFromUrl;
  if (!id || (!rawTitle && !body)) return { ok: false, error: "not-found" };
  const authorName = queryTextFrom(detailRoot, [
    ".author-wrapper .name",
    ".author .name",
    ".username",
    "a[href*='/user/profile/']"
  ]);
  const authorLink = detailRoot.querySelector<HTMLAnchorElement>(
    ".author-wrapper a[href*='/user/profile/'], a.author[href*='/user/profile/'], .info a.name[href*='/user/profile/']"
  );
  const authorId = authorLink?.pathname.match(/\/user\/profile\/([^/?#]+)/)?.[1] || "";
  const avatar = detailRoot.querySelector<HTMLImageElement>(
    ".author-wrapper img, .author img, img.avatar"
  );
  const visibleTags = [...detailRoot.querySelectorAll<HTMLElement>("a.tag, .tag-list a, #detail-desc a")]
    .map((element) => (element.innerText || element.textContent || "").replace(/^#/, "").trim());
  const metrics: NoteMetrics = {
    likedCount: queryTextFrom(detailRoot, [
      ".interact-container .like-wrapper .count",
      ".engage-bar-style .like-wrapper .count",
      ".like-wrapper .count"
    ]),
    collectedCount: queryTextFrom(detailRoot, [
      ".interact-container .collect-wrapper .count",
      ".engage-bar-style .collect-wrapper .count",
      ".collect-wrapper .count"
    ]),
    commentCount: queryTextFrom(detailRoot, [
      ".interact-container .chat-wrapper .count",
      ".engage-bar-style .chat-wrapper .count",
      ".chat-wrapper .count"
    ]),
    sharedCount: queryTextFrom(detailRoot, [
      ".interact-container .share-wrapper .count",
      ".engage-bar-style .share-wrapper .count",
      ".share-wrapper .count"
    ])
  };
  return {
    ok: true,
    data: {
      id,
      url: location.href,
      title: rawTitle.replace(/\s*[-_–—|]\s*小红书.*$/i, "").trim(),
      body,
      authorId,
      authorName,
      authorAvatar: cleanImageUrl(avatar?.currentSrc || avatar?.src),
      imageUrls,
      tags: dedupe([...visibleTags, ...normalizeTags([], body)]),
      publishedAt: queryTextFrom(contentRoot, [".date", ".publish-time", ".bottom-container .date"]),
      metrics,
      source: "dom"
    }
  };
}

function toIsoDate(value?: string | number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && /^\d{1,2}[-/.]\d{1,2}$/.test(value.trim())) {
    return value.trim();
  }
  if (typeof value === "number" || /^\d{10,13}$/.test(String(value))) {
    const number = Number(value);
    const milliseconds = number < 10_000_000_000 ? number * 1000 : number;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export function normalizeExtractedNote(data: ExtractedXhsData, now = new Date()): Note {
  const images: NoteImage[] = data.imageUrls.map((url, index) => ({ index, url }));
  return {
    id: data.id,
    url: data.url,
    platform: "xiaohongshu",
    title: data.title || "Untitled Xiaohongshu note",
    body: data.body,
    authorId: data.authorId,
    authorName: data.authorName || "Unknown author",
    authorAvatar: data.authorAvatar,
    cover: images[0]?.url,
    images,
    tags: [...new Set(data.tags.map(normalizeXiaohongshuTag).filter(Boolean))],
    publishedAt: toIsoDate(data.publishedAt),
    capturedAt: now.toISOString(),
    metrics: data.metrics,
    extractionSource: data.source
  };
}
