import { describe, expect, it } from "vitest";
import {
  cleanOcrImages,
  repairInlineSpacing
} from "../src/core/ocr-postprocess";
import type { OcrImageResult, OcrLine } from "../src/core/types";

function line(text: string, top: number, left = 0): OcrLine {
  return {
    text,
    score: 0.99,
    poly: [
      [left, top],
      [left + 400, top],
      [left + 400, top + 20],
      [left, top + 20]
    ]
  };
}

function result(imageIndex: number, lines: OcrLine[]): OcrImageResult {
  return {
    imageIndex,
    text: lines.map((value) => value.text).join("\n"),
    lines,
    status: "success"
  };
}

describe("repairInlineSpacing", () => {
  it("repairs missing English and Chinese-English spacing conservatively", () => {
    expect(repairInlineSpacing("contribution?Am I ready")).toBe(
      "contribution? Am I ready"
    );
    expect(repairInlineSpacing("他非常关注AI，也申请Harvard项目")).toBe(
      "他非常关注 AI，也申请 Harvard 项目"
    );
  });
});

describe("cleanOcrImages", () => {
  it("joins wrapped lines and restores paragraphs from OCR coordinates", () => {
    const cleaned = cleanOcrImages([
      result(0, [
        line("Please consider this letter a formal", 0),
        line("endorsement of your talent.", 24),
        line("New paragraph starts here.", 70)
      ])
    ]);

    expect(cleaned[0]?.text).toBe(
      "Please consider this letter a formal endorsement of your talent.\n\nNew paragraph starts here."
    );
  });

  it("keeps numbered list items separate", () => {
    const cleaned = cleanOcrImages([
      result(0, [line("1. First item", 0), line("2. Second item", 24)])
    ]);

    expect(cleaned[0]?.text).toBe("1. First item\n\n2. Second item");
  });

  it("joins obvious Chinese continuations even when the visual gap is large", () => {
    const cleaned = cleanOcrImages([
      result(0, [
        line("MIT Sloan 金融硕士：高性价比", 0),
        line("的顶级入场券", 50),
        line("你会发现 MIT 的入门难度更容易够到。 普林", 100),
        line("斯顿 MFin 对研究要求更高。", 150)
      ])
    ]);

    expect(cleaned[0]?.text).toContain("MIT Sloan 金融硕士：高性价比的顶级入场券");
    expect(cleaned[0]?.text).toContain(
      "你会发现 MIT 的入门难度更容易够到。 普林斯顿 MFin 对研究要求更高。"
    );
  });

  it("keeps headings and completed paragraphs separate across large gaps", () => {
    const cleaned = cleanOcrImages([
      result(0, [
        line("申请结果", 0),
        line("这是一段新的正文。", 55),
        line("第一段已经结束。", 105),
        line("第二段从这里开始。", 155)
      ])
    ]);

    expect(cleaned[0]?.text).toBe(
      "申请结果\n\n这是一段新的正文。\n\n第一段已经结束。\n\n第二段从这里开始。"
    );
  });

  it("does not join text blocks separated by an unusually large gap", () => {
    const cleaned = cleanOcrImages([
      result(0, [line("普林", 0), line("斯顿项目", 90)])
    ]);

    expect(cleaned[0]?.text).toBe("普林\n\n斯顿项目");
  });

  it("removes long exact duplicates across images but keeps unique text", () => {
    const repeated = "This repeated footer belongs to the original post";
    const cleaned = cleanOcrImages([
      result(0, [line(repeated, 0), line("First unique paragraph is here", 24)]),
      result(1, [line(repeated, 0), line("Second unique paragraph is here", 24)])
    ]);

    expect(cleaned).toHaveLength(2);
    expect(cleaned[0]?.text).toContain(repeated);
    expect(cleaned[1]?.text).not.toContain(repeated);
    expect(cleaned[1]?.text).toContain("Second unique paragraph is here");
  });

  it("preserves existing line breaks when coordinates are unavailable", () => {
    const cleaned = cleanOcrImages([
      {
        imageIndex: 0,
        text: "第一张图\nHello",
        lines: [],
        status: "success"
      }
    ]);

    expect(cleaned[0]?.text).toBe("第一张图\nHello");
  });
});
