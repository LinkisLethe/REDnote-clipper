import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Obsidian settings controls", () => {
  it("exposes the options page from the popup", () => {
    const popup = readFileSync("popup.html", "utf8");
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
      options_page?: string;
    };
    expect(popup).toContain('id="settingsButton"');
    expect(popup).toContain('id="obsidianButton"');
    expect(popup).toContain('id="obsidianFeedback"');
    expect(popup).toContain('id="obsidianFeedbackIcon"');
    expect(popup).toContain('id="obsidianFeedbackDetail"');
    expect(popup).not.toContain('id="versionText"');
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
      expect(messages.writeToObsidian?.message).toBeTruthy();
      expect(messages.obsidianOverwriteConfirm?.message).toBeTruthy();
      expect(messages.obsidianWritten?.message).toBeTruthy();
      expect(messages.obsidianWrittenShort?.message).toBeTruthy();
    }
  });

  it("checks for an existing note before writing it", () => {
    const background = readFileSync("src/background.ts", "utf8");
    expect(background).toContain('type: "WRITE_OBSIDIAN_NOTE"');
    expect(background).toContain('method: "GET"');
    expect(background).toContain('method: "PUT"');
    expect(background).toContain("existing.ok && !request.overwrite");
  });

  it("keeps Obsidian results visible beside the action", () => {
    const popupSource = readFileSync("src/popup.ts", "utf8");
    expect(popupSource).toContain("setObsidianFeedback");
    expect(popupSource).not.toContain("setTimeout(clearObsidianFeedback");
    expect(popupSource).toContain('message("obsidianWrittenShort")');
  });

  it("uses the full footer width for two equal action columns", () => {
    const css = readFileSync("src/popup.css", "utf8");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toMatch(/\.footer-controls\s*\{[^}]*width:\s*100%;/s);
    expect(css).toMatch(/\.obsidian-feedback\s*\{[^}]*width:\s*100%;/s);
  });
});
