import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OCR controls", () => {
  it("keeps pause and stop controls in the popup", () => {
    const html = readFileSync("popup.html", "utf8");
    expect(html).toContain('id="pauseOcrButton"');
    expect(html).toContain('id="stopOcrButton"');
  });

  it("localizes the controls in Chinese and English", () => {
    for (const locale of ["zh_CN", "en"]) {
      const messages = JSON.parse(
        readFileSync(`public/_locales/${locale}/messages.json`, "utf8")
      ) as Record<string, { message: string }>;
      expect(messages.pauseOcr?.message).toBeTruthy();
      expect(messages.resumeOcr?.message).toBeTruthy();
      expect(messages.stopOcr?.message).toBeTruthy();
    }
  });
});
