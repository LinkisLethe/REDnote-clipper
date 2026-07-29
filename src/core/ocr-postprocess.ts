import type { OcrImageResult, OcrLine } from "./types";

export interface CleanedOcrImage {
  imageIndex: number;
  text: string;
}

interface LineBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  height: number;
}

const LIST_ITEM = /^\s*(?:[-•●▪]|(?:\d+|[A-Za-z])[.)、])\s+/;
const LATIN = /[A-Za-z]/;
const HAN = /\p{Script=Han}/u;
const HARD_SENTENCE_END = /[。！？!?；;][”’"')）】]*$/u;
const CONTINUATION_START = /^[的得地了着过和与及或但而也就都不没更最则却并]/u;
const CONTINUATION_END = /[，,、：:（(\[【]$/u;
const DUPLICATE_KEY_MIN_LENGTH = 12;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return current;
  return ((sorted[middle - 1] ?? current) + current) / 2;
}

function getBounds(line: OcrLine): LineBounds | null {
  if (!line.poly || line.poly.length < 4) return null;
  const xs = line.poly.map(([x]) => x);
  const ys = line.poly.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left,
    top,
    right,
    bottom,
    height: Math.max(1, bottom - top)
  };
}

export function repairInlineSpacing(value: string): string {
  return value
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/\s+([,.;:!?%）)\]}])/g, "$1")
    .replace(/([（([{])\s+/g, "$1")
    .replace(/([A-Za-z0-9][,;:!?])(?=[A-Za-z])/g, "$1 ")
    .replace(/([A-Za-z0-9]\.)(?=[A-Z])/g, "$1 ")
    .replace(/(\p{Script=Han})([A-Za-z])/gu, "$1 $2")
    .replace(/([A-Za-z])(\p{Script=Han})/gu, "$1 $2")
    .trim();
}

function duplicateKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function shouldDeduplicate(value: string, seen: Set<string>): boolean {
  const key = duplicateKey(value);
  if (key.length < DUPLICATE_KEY_MIN_LENGTH) return false;
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

function needsJoinSpace(left: string, right: string): boolean {
  const leftCharacter = left.at(-1) || "";
  const rightCharacter = right.at(0) || "";
  if (!leftCharacter || !rightCharacter) return false;
  if (LATIN.test(leftCharacter) && (LATIN.test(rightCharacter) || /\d/.test(rightCharacter))) {
    return true;
  }
  if (/\d/.test(leftCharacter) && LATIN.test(rightCharacter)) return true;
  if (HAN.test(leftCharacter) && LATIN.test(rightCharacter)) return true;
  if (LATIN.test(leftCharacter) && HAN.test(rightCharacter)) return true;
  if (/[.!?,;:]/.test(leftCharacter) && LATIN.test(rightCharacter)) return true;
  return false;
}

function joinWrappedLine(left: string, right: string): string {
  if (/-$/.test(left) && /^[a-z]/.test(right)) {
    return repairInlineSpacing(`${left.slice(0, -1)}${right}`);
  }
  const separator = needsJoinSpace(left, right) ? " " : "";
  return repairInlineSpacing(`${left}${separator}${right}`);
}

function shouldJoinAcrossLargeGap(
  previousText: string,
  currentText: string,
  previousBounds: LineBounds,
  currentBounds: LineBounds,
  typicalHeight: number,
  verticalGap: number
): boolean {
  if (!previousText || !currentText || HARD_SENTENCE_END.test(previousText)) return false;
  if (LIST_ITEM.test(currentText) || verticalGap > typicalHeight * 2.5) return false;

  const heightRatio =
    Math.max(previousBounds.height, currentBounds.height) /
    Math.max(1, Math.min(previousBounds.height, currentBounds.height));
  if (heightRatio > 1.35) return false;
  if (Math.abs(currentBounds.left - previousBounds.left) > typicalHeight * 2) return false;

  if (CONTINUATION_END.test(previousText) || CONTINUATION_START.test(currentText)) {
    return true;
  }
  if (/^[a-z]/.test(currentText)) return true;

  const trailingFragment =
    previousText.split(/[。！？!?；;]/u).at(-1)?.replace(/\s+/g, "") || "";
  const previousCharacter = trailingFragment.at(-1) || "";
  const currentCharacter = currentText.at(0) || "";
  return (
    trailingFragment.length > 0 &&
    trailingFragment.length <= 3 &&
    [...trailingFragment].every((character) => HAN.test(character)) &&
    HAN.test(previousCharacter) &&
    HAN.test(currentCharacter)
  );
}

function formatGeometricLines(lines: OcrLine[]): string {
  const entries = lines
    .map((line) => ({ line, bounds: getBounds(line) }))
    .filter(
      (entry): entry is { line: OcrLine; bounds: LineBounds } =>
        entry.bounds !== null
    );
  if (entries.length !== lines.length || entries.length === 0) {
    return lines.map((line) => repairInlineSpacing(line.text)).filter(Boolean).join("\n");
  }

  const typicalHeight = median(entries.map(({ bounds }) => bounds.height));
  const typicalLeft = median(entries.map(({ bounds }) => bounds.left));
  const paragraphs: string[] = [];
  let paragraph = repairInlineSpacing(entries[0]?.line.text || "");

  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    if (!previous || !current) continue;
    const currentText = repairInlineSpacing(current.line.text);
    if (!currentText) continue;

    const verticalGap = current.bounds.top - previous.bounds.bottom;
    const hasLargeGap = verticalGap > typicalHeight * 0.72;
    const startsListItem = LIST_ITEM.test(currentText);
    const isIndentedParagraph =
      current.bounds.left - typicalLeft > typicalHeight * 1.15 &&
      /[。！？.!?]$/.test(paragraph);
    const joinsAcrossLargeGap =
      hasLargeGap &&
      shouldJoinAcrossLargeGap(
        paragraph,
        currentText,
        previous.bounds,
        current.bounds,
        typicalHeight,
        verticalGap
      );

    if ((hasLargeGap && !joinsAcrossLargeGap) || startsListItem || isIndentedParagraph) {
      if (paragraph) paragraphs.push(paragraph);
      paragraph = currentText;
    } else {
      paragraph = joinWrappedLine(paragraph, currentText);
    }
  }

  if (paragraph) paragraphs.push(paragraph);
  return paragraphs.join("\n\n");
}

function cleanFallbackText(value: string, seen: Set<string>): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => repairInlineSpacing(line))
    .filter((line) => !line || !shouldDeduplicate(line, seen))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanOcrImages(results: OcrImageResult[]): CleanedOcrImage[] {
  const seen = new Set<string>();
  const output: CleanedOcrImage[] = [];

  for (const result of results) {
    let text = "";
    if (result.lines.length > 0) {
      const lines = result.lines.filter((line) => {
        const repaired = repairInlineSpacing(line.text);
        return repaired && !shouldDeduplicate(repaired, seen);
      });
      text = formatGeometricLines(lines);
    } else {
      text = cleanFallbackText(result.text, seen);
    }
    if (text) output.push({ imageIndex: result.imageIndex, text });
  }

  return output;
}
