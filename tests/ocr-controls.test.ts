import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OCR controls", () => {
  it("keeps pause and stop controls in the popup", () => {
    const html = readFileSync("popup.html", "utf8");
    expect(html).toContain('id="pauseOcrButton"');
    expect(html).toContain('id="stopOcrButton"');
  });

  it("includes explicit OCR range selection and a start button", () => {
    const html = readFileSync("popup.html", "utf8");
    expect(html).toContain('id="ocrSelectionPanel"');
    expect(html).toContain('value="skip-cover"');
    expect(html).toContain('id="ocrRangeInput"');
    expect(html).toContain('id="startOcrButton"');
  });

  it("keeps the action footer inside the Chrome popup viewport", () => {
    const css = readFileSync("src/popup.css", "utf8");
    expect(css).toMatch(/body\s*\{[^}]*height:\s*600px;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.app-shell\s*\{[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.preview-card\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;/s);
    expect(css).toMatch(/\.app-footer\s*\{[^}]*flex:\s*0 0 auto;/s);
  });

  it("localizes the controls in Chinese and English", () => {
    for (const locale of ["zh_CN", "en"]) {
      const messages = JSON.parse(
        readFileSync(`public/_locales/${locale}/messages.json`, "utf8")
      ) as Record<string, { message: string }>;
      expect(messages.pauseOcr?.message).toBeTruthy();
      expect(messages.resumeOcr?.message).toBeTruthy();
      expect(messages.stopOcr?.message).toBeTruthy();
      expect(messages.ocrSelectionTitle?.message).toBeTruthy();
      expect(messages.ocrSelectionAll?.message).toBeTruthy();
      expect(messages.ocrSelectionSkipCover?.message).toBeTruthy();
      expect(messages.ocrSelectionCustom?.message).toBeTruthy();
      expect(messages.startOcr?.message).toBeTruthy();
      expect(messages.noteMetaOcr?.message).toBeTruthy();
    }
  });
});
