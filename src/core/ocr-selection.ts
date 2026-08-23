export type OcrSelectionMode = "all" | "skip-cover" | "custom";

export type OcrSelectionError =
  | "no-images"
  | "range-required"
  | "range-invalid"
  | "range-out-of-bounds";

export type OcrSelectionResult =
  | { ok: true; imageIndexes: number[] }
  | { ok: false; error: OcrSelectionError };

function allImageIndexes(totalImages: number): number[] {
  return Array.from({ length: totalImages }, (_value, index) => index);
}

function normalizeOcrRange(customRange: string): string {
  return customRange
    .trim()
    .replace(/[，、]/g, ",")
    .replace(/[–—~～至]/g, "-")
    .replace(/\s+/g, "");
}

export function estimateOcrPageCount(customRange: string): number | undefined {
  const normalized = normalizeOcrRange(customRange);
  if (!normalized || !/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(normalized)) return undefined;
  const ranges = normalized.split(",").map((token) => {
    const [rawStart, rawEnd] = token.split("-");
    const start = Number(rawStart);
    const end = rawEnd === undefined ? start : Number(rawEnd);
    return { start, end };
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  if (ranges.some(({ start, end }) =>
    !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start
  )) return undefined;

  let count = 0;
  let currentStart = ranges[0]?.start;
  let currentEnd = ranges[0]?.end;
  if (currentStart === undefined || currentEnd === undefined) return undefined;
  for (const range of ranges.slice(1)) {
    if (range.start > currentEnd + 1) {
      count += currentEnd - currentStart + 1;
      currentStart = range.start;
      currentEnd = range.end;
    } else {
      currentEnd = Math.max(currentEnd, range.end);
    }
  }
  count += currentEnd - currentStart + 1;
  return Number.isSafeInteger(count) ? count : undefined;
}

export function formatOcrPageList(imageIndexes: number[]): string {
  if (imageIndexes.length === 0) return "";
  const pages = [...new Set(imageIndexes)].sort((a, b) => a - b).map((index) => index + 1);
  const ranges: string[] = [];
  let start = pages[0] ?? 0;
  let end = start;

  for (let index = 1; index <= pages.length; index += 1) {
    const page = pages[index];
    if (page === end + 1) {
      end = page;
      continue;
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    if (page !== undefined) {
      start = page;
      end = page;
    }
  }

  return ranges.join(",");
}

export function resolveOcrImageIndexes(
  mode: OcrSelectionMode,
  customRange: string,
  totalImages: number
): OcrSelectionResult {
  if (!Number.isInteger(totalImages) || totalImages <= 0) {
    return { ok: false, error: "no-images" };
  }
  if (mode === "all") {
    return { ok: true, imageIndexes: allImageIndexes(totalImages) };
  }
  if (mode === "skip-cover") {
    if (totalImages <= 1) return { ok: false, error: "no-images" };
    return { ok: true, imageIndexes: allImageIndexes(totalImages).slice(1) };
  }

  const normalized = normalizeOcrRange(customRange);
  if (!normalized) return { ok: false, error: "range-required" };
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(normalized)) {
    return { ok: false, error: "range-invalid" };
  }

  const pages = new Set<number>();
  for (const token of normalized.split(",")) {
    const [rawStart, rawEnd] = token.split("-");
    const start = Number(rawStart);
    const end = rawEnd === undefined ? start : Number(rawEnd);
    if (start < 1 || end < start || end > totalImages) {
      return { ok: false, error: "range-out-of-bounds" };
    }
    for (let page = start; page <= end; page += 1) pages.add(page);
  }

  return {
    ok: true,
    imageIndexes: [...pages].sort((a, b) => a - b).map((page) => page - 1)
  };
}
