import { readFileSync, statSync } from "node:fs";
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
      name: string;
      description: string;
      version_name?: string;
    };
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.version).toBe(packageJson.version);
    expect(manifest.default_locale).toBe("en");
    expect(manifest.name).toBe("__MSG_extensionName__");
    expect(manifest.description).toBe("__MSG_extensionDescription__");
    expect(manifest.version_name).toBeUndefined();
    expect(packageJson.license).toBe("Apache-2.0");
    expect(packageJson.author).toBe("Hongjia LIN");

    const english = readFileSync("README.md", "utf8");
    const chinese = readFileSync("README.zh-CN.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const releaseNotes = readFileSync(`docs/releases/v${packageJson.version}.md`, "utf8");
    const archiveName = `xhs-clipper-v${packageJson.version}.zip`;
    expect(english).toContain(`version-${packageJson.version}`);
    expect(english).toContain(archiveName);
    expect(chinese).toContain(`version-${packageJson.version}`);
    expect(chinese).toContain(archiveName);
    expect(changelog).toContain(`## ${packageJson.version} -`);
    expect(releaseNotes).toContain(archiveName);
  });

  it("documents the current Obsidian feature and privacy behavior", () => {
    const english = readFileSync("README.md", "utf8");
    const chinese = readFileSync("README.zh-CN.md", "utf8");
    const privacy = readFileSync("docs/PRIVACY.md", "utf8");
    const permissions = readFileSync("docs/PERMISSIONS.md", "utf8");
    const options = readFileSync("options.html", "utf8");
    const content = readFileSync("src/content.ts", "utf8");
    const popup = readFileSync("popup.html", "utf8");

    expect(english).toContain("Write to Obsidian");
    expect(english).toContain("Traditional Chinese");
    expect(chinese).toContain("写入 Obsidian");
    expect(chinese).toContain("繁体中文");
    expect(chinese).not.toContain("暂不支持评论");
    expect(privacy).toContain("loopback address");
    expect(privacy).toContain("floating workspace");
    expect(privacy).toContain("up to 200 completed clipping records");
    expect(permissions).toContain("`offscreen`");
    expect(permissions).toContain("each batch is limited to 20 selected posts");
    expect(options).not.toContain("实验版");
    expect(content).not.toContain("实验版扩展");
    expect(popup).toContain("<title>XHS Clipper</title>");
    expect(popup).not.toContain("Rednote Markdown Collector");
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

  it("uses current v1 interface screenshots in both READMEs", () => {
    const english = readFileSync("README.md", "utf8");
    const chinese = readFileSync("README.zh-CN.md", "utf8");
    const screenshots = [
      "batch-workspace-v1.png",
      "popup-overview-v1.png",
      "obsidian-settings-v1.png"
    ];
    for (const screenshot of screenshots) {
      expect(english).toContain(`docs/images/${screenshot}`);
      expect(chinese).toContain(`docs/images/${screenshot}`);
      expect(statSync(`docs/images/${screenshot}`).size).toBeGreaterThan(30_000);
    }
    for (const oldScreenshot of [
      "workflow-redacted.png",
      "popup-overview.png",
      "obsidian-settings.png"
    ]) {
      expect(english).not.toContain(`docs/images/${oldScreenshot}`);
      expect(chinese).not.toContain(`docs/images/${oldScreenshot}`);
    }
  });
});
