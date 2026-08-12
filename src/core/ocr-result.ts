import { cleanOcrImages } from "./ocr-postprocess";
import type { OcrImageResult } from "./types";

export function compactOcrResult(result: OcrImageResult): OcrImageResult {
  if (result.lines.length === 0) return result;
  const cleanedText = cleanOcrImages([result])[0]?.text || result.text;
  return {
    ...result,
    text: cleanedText,
    lines: []
  };
}
