import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release metadata", () => {
  it("keeps package and extension versions aligned", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      version: string;
    };
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
      version: string;
    };
    expect(packageJson.version).toBe("0.4.0");
    expect(manifest.version).toBe(packageJson.version);
  });

  it("documents the current Obsidian feature and privacy behavior", () => {
    const english = readFileSync("README.md", "utf8");
    const chinese = readFileSync("README.zh-CN.md", "utf8");
    const privacy = readFileSync("docs/PRIVACY.md", "utf8");
    const permissions = readFileSync("docs/PERMISSIONS.md", "utf8");

    expect(english).toContain("Write to Obsidian");
    expect(chinese).toContain("写入 Obsidian");
    expect(chinese).not.toContain("暂不支持评论");
    expect(privacy).toContain("loopback address");
    expect(permissions).toContain("`offscreen`");
  });
});
