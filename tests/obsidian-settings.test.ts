import { describe, expect, it } from "vitest";
import {
  DEFAULT_OBSIDIAN_SETTINGS,
  createObsidianNotePath,
  encodeObsidianVaultPath,
  normalizeObsidianSettings,
  validateObsidianSettings
} from "../src/core/obsidian";

describe("Obsidian settings", () => {
  it("uses the shared XHS folder by default", () => {
    expect(DEFAULT_OBSIDIAN_SETTINGS.noteFolder).toBe("Clippings/XHS");
  });

  it("normalizes the folder, URL, and copied Bearer prefix", () => {
    expect(
      normalizeObsidianSettings({
        noteFolder: " /Clippings\\Xiaohongshu/ ",
        apiBaseUrl: " http://127.0.0.1:27123/ ",
        apiKey: " Bearer secret-key "
      })
    ).toEqual({
      noteFolder: "Clippings/Xiaohongshu",
      apiBaseUrl: "http://127.0.0.1:27123",
      apiKey: "secret-key"
    });
  });

  it("accepts only explicit loopback API addresses", () => {
    for (const apiBaseUrl of [
      "http://127.0.0.1:27123",
      "https://localhost:27124"
    ]) {
      expect(
        validateObsidianSettings({
          noteFolder: "Clippings/Xiaohongshu",
          apiBaseUrl,
          apiKey: "secret"
        })
      ).toBeNull();
    }
  });

  it("rejects remote, path-based, and portless API addresses", () => {
    expect(
      validateObsidianSettings({
        noteFolder: "Clippings",
        apiBaseUrl: "https://example.com:27123",
        apiKey: "secret"
      })
    ).toBe("api-url-not-local");
    expect(
      validateObsidianSettings({
        noteFolder: "Clippings",
        apiBaseUrl: "http://127.0.0.1:27123/api",
        apiKey: "secret"
      })
    ).toBe("api-url-invalid");
    expect(
      validateObsidianSettings({
        noteFolder: "Clippings",
        apiBaseUrl: "http://127.0.0.1",
        apiKey: "secret"
      })
    ).toBe("api-url-invalid");
  });

  it("rejects path traversal, invalid folder characters, and missing keys", () => {
    expect(
      validateObsidianSettings({
        noteFolder: "../Private",
        apiBaseUrl: "http://127.0.0.1:27123",
        apiKey: "secret"
      })
    ).toBe("note-folder-invalid");
    expect(
      validateObsidianSettings({
        noteFolder: "Clippings:Private",
        apiBaseUrl: "http://127.0.0.1:27123",
        apiKey: "secret"
      })
    ).toBe("note-folder-invalid");
    expect(
      validateObsidianSettings({
        noteFolder: "Clippings",
        apiBaseUrl: "http://127.0.0.1:27123",
        apiKey: ""
      })
    ).toBe("api-key-required");
  });

  it("builds and safely encodes a nested vault path", () => {
    const path = createObsidianNotePath(
      "Clippings/Xiaohongshu",
      "留学 申请_作者_2026-07-29.md"
    );
    expect(path).toBe("Clippings/Xiaohongshu/留学 申请_作者_2026-07-29.md");
    expect(encodeObsidianVaultPath(path)).toBe(
      "Clippings/Xiaohongshu/%E7%95%99%E5%AD%A6%20%E7%94%B3%E8%AF%B7_%E4%BD%9C%E8%80%85_2026-07-29.md"
    );
  });

  it("rejects filenames that could escape the configured folder", () => {
    expect(() => createObsidianNotePath("Clippings", "../note.md")).toThrow(
      "OBSIDIAN_FILENAME_INVALID"
    );
    expect(() => createObsidianNotePath("Clippings", "note.txt")).toThrow(
      "OBSIDIAN_FILENAME_INVALID"
    );
  });
});
