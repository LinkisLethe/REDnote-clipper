import { describe, expect, it } from "vitest";
import { createMessageGetter, resolveUiLanguage } from "../src/core/i18n";

describe("UI language selection", () => {
  it("uses Simplified Chinese for Chrome's zh-CN locale", () => {
    expect(resolveUiLanguage("zh-CN")).toBe("zh-CN");
  });

  it("uses Traditional Chinese for Chrome's zh-TW locale", () => {
    expect(resolveUiLanguage("zh-TW")).toBe("zh-TW");
  });

  it("uses English for Hong Kong and other locales", () => {
    expect(resolveUiLanguage("zh-HK")).toBe("en");
    expect(resolveUiLanguage("zh-Hant-HK")).toBe("en");
    expect(resolveUiLanguage("zh-SG")).toBe("en");
    expect(resolveUiLanguage("en-US")).toBe("en");
    expect(resolveUiLanguage("ja-JP")).toBe("en");
    expect(resolveUiLanguage("fr-FR")).toBe("en");
  });

  it("provides Traditional Chinese fallback messages", () => {
    const message = createMessageGetter("zh-TW");
    expect(message("ocrSelectionCustom")).toBe("自訂");
    expect(message("ocrSelectionSummary", ["3", "6", "2-4"])).toBe(
      "3/6 張 · 頁碼 2-4"
    );
  });
});
