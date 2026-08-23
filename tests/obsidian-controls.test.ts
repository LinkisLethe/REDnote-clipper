import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Obsidian settings controls", () => {
  it("exposes the options page from the floating workspace", () => {
    const content = readFileSync("src/content.ts", "utf8");
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
      options_page?: string;
    };
    expect(content).toContain('data-action="obsidian-settings"');
    expect(content).toContain('type: "OPEN_OPTIONS_PAGE"');
    expect(content).toContain("配置 Obsidian 权限和导出路径");
    expect(manifest.options_page).toBe("options.html");
  });

  it("contains the configuration and connection controls", () => {
    const html = readFileSync("options.html", "utf8");
    expect(html).toContain('id="noteFolder"');
    expect(html).toContain('id="apiBaseUrl"');
    expect(html).toContain('id="apiKey"');
    expect(html).toContain('id="saveButton"');
    expect(html).toContain('id="testButton"');
  });

  it("limits the added host permissions to loopback addresses", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
      host_permissions?: string[];
    };
    const permissions = manifest.host_permissions || [];
    expect(permissions).toContain("http://127.0.0.1/*");
    expect(permissions).toContain("http://localhost/*");
    expect(permissions).not.toContain("http://*/*");
    expect(permissions).not.toContain("https://*/*");
  });

  it("localizes the settings interface in every supported locale", () => {
    for (const locale of ["zh_CN", "zh_TW", "en"]) {
      const messages = JSON.parse(
        readFileSync(`public/_locales/${locale}/messages.json`, "utf8")
      ) as Record<string, { message: string }>;
      expect(messages.settingsTitle?.message).toBeTruthy();
      expect(messages.noteFolderLabel?.message).toBeTruthy();
      expect(messages.saveSettings?.message).toBeTruthy();
      expect(messages.testConnection?.message).toBeTruthy();
      expect(messages.obsidianConnected?.message).toBeTruthy();
      expect(messages.actionTitle?.message).toBeTruthy();
      expect(messages.noteFolderHint?.message).toBeTruthy();
      expect(messages.obsidianHttpError?.message).toBeTruthy();
    }
  });

  it("checks for an existing note before a workspace export", () => {
    const background = readFileSync("src/background.ts", "utf8");
    expect(background).toContain("async function writeAutoClipToObsidian");
    expect(background).toContain('method: "GET"');
    expect(background).toContain('method: "PUT"');
    expect(background).toContain("existing.ok && duplicatePolicy === \"skip\"");
  });

  it("uses the configured note folder for workspace clipping", () => {
    const background = readFileSync("src/background.ts", "utf8");
    const options = readFileSync("options.html", "utf8");
    expect(background.match(/createObsidianNotePath\(settings\.noteFolder/g)).toHaveLength(1);
    expect(background).not.toContain("AUTO_CLIP_OBSIDIAN_FOLDER");
    expect(background).toContain("noteFolder: DEFAULT_OBSIDIAN_SETTINGS.noteFolder");
    expect(background).not.toContain("stored?.noteFolder ||");
    expect(options).toContain("悬浮工作台固定导出到 Clippings/XHS");
  });
});
