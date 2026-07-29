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

  const normalized = customRange
    .trim()
    .replace(/[，、]/g, ",")
    .replace(/[–—~～至]/g, "-")
    .replace(/\s+/g, "");
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
