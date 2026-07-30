import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release metadata", () => {
  it("keeps package and extension versions aligned", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      version: string;
      license: string;
      author: string;
    };
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
      version: string;
      default_locale: string;
    };
    expect(packageJson.version).toBe("0.4.0");
    expect(manifest.version).toBe(packageJson.version);
    expect(manifest.default_locale).toBe("en");
    expect(packageJson.license).toBe("Apache-2.0");
    expect(packageJson.author).toBe("Hongjia LIN");
  });

  it("documents the current Obsidian feature and privacy behavior", () => {
    const english = readFileSync("README.md", "utf8");
    const chinese = readFileSync("README.zh-CN.md", "utf8");
    const privacy = readFileSync("docs/PRIVACY.md", "utf8");
    const permissions = readFileSync("docs/PERMISSIONS.md", "utf8");

    expect(english).toContain("Write to Obsidian");
    expect(english).toContain("Traditional Chinese");
    expect(chinese).toContain("写入 Obsidian");
    expect(chinese).toContain("繁体中文");
    expect(chinese).not.toContain("暂不支持评论");
    expect(privacy).toContain("loopback address");
    expect(permissions).toContain("`offscreen`");
  });

  it("includes public repository licensing and responsible-use notices", () => {
    const license = readFileSync("LICENSE", "utf8");
    const notice = readFileSync("NOTICE", "utf8");
    const thirdParty = readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
    const english = readFileSync("README.md", "utf8");
    const chinese = readFileSync("README.zh-CN.md", "utf8");

    expect(license).toContain("Apache License");
    expect(notice).toContain("Hongjia LIN");
    expect(thirdParty).toContain("onnxruntime-web` 1.24.3");
    expect(thirdParty).toContain("PP-OCRv6_tiny_det_onnx_infer.tar");
    expect(english).toContain("independent, unofficial project");
    expect(chinese).toContain("独立开发的非官方项目");
  });
});
