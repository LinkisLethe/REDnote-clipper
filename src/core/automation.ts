const XHS_HOST = /(^|\.)xiaohongshu\.com$/i;

export function isXiaohongshuUrl(value: string): boolean {
  try {
    return XHS_HOST.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function noteIdFromXiaohongshuUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!XHS_HOST.test(url.hostname)) return "";
    const match = url.pathname.match(
      /\/(?:explore|discovery\/item|user\/profile\/[^/]+)\/([a-zA-Z0-9]+)/
    );
    return match?.[1] || url.searchParams.get("note_id") || "";
  } catch {
    return "";
  }
}

export function isXiaohongshuNoteUrl(value: string): boolean {
  return Boolean(noteIdFromXiaohongshuUrl(value));
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function matchesAllKeywords(title: string, query: string): boolean {
  const normalizedTitle = normalizeSearchText(title);
  const terms = query
    .trim()
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean);
  return terms.length > 0 && terms.every((term) => normalizedTitle.includes(term));
}
