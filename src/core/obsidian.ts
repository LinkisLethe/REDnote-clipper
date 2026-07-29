export const OBSIDIAN_SETTINGS_KEY = "obsidianSettings";
export const OBSIDIAN_API_KEY_KEY = "obsidianApiKey";

export interface ObsidianSettings {
  noteFolder: string;
  apiBaseUrl: string;
}

export interface ObsidianSettingsDraft extends ObsidianSettings {
  apiKey: string;
}

export type ObsidianSettingsError =
  | "note-folder-required"
  | "note-folder-invalid"
  | "api-url-required"
  | "api-url-invalid"
  | "api-url-not-local"
  | "api-key-required";

export const DEFAULT_OBSIDIAN_SETTINGS: ObsidianSettings = {
  noteFolder: "Clippings/Xiaohongshu",
  apiBaseUrl: "http://127.0.0.1:27123"
};

export function normalizeNoteFolder(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

export function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/g, "");
}

export function normalizeApiKey(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, "");
}

export function createObsidianNotePath(noteFolder: string, filename: string): string {
  const folder = normalizeNoteFolder(noteFolder);
  const cleanFilename = filename.trim();
  if (
    !cleanFilename ||
    !cleanFilename.toLowerCase().endsWith(".md") ||
    /[\\/:*?"<>|\x00-\x1f]/.test(cleanFilename) ||
    cleanFilename === "." ||
    cleanFilename === ".."
  ) {
    throw new Error("OBSIDIAN_FILENAME_INVALID");
  }
  return `${folder}/${cleanFilename}`;
}

export function encodeObsidianVaultPath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export function normalizeObsidianSettings(
  draft: ObsidianSettingsDraft
): ObsidianSettingsDraft {
  return {
    noteFolder: normalizeNoteFolder(draft.noteFolder),
    apiBaseUrl: normalizeApiBaseUrl(draft.apiBaseUrl),
    apiKey: normalizeApiKey(draft.apiKey)
  };
}

export function validateObsidianSettings(
  draft: ObsidianSettingsDraft,
  requireApiKey = true
): ObsidianSettingsError | null {
  const settings = normalizeObsidianSettings(draft);
  if (!settings.noteFolder) return "note-folder-required";
  if (
    settings.noteFolder
      .split("/")
      .some((segment) => !segment || segment === "." || segment === ".." || /[\x00-\x1f:*?"<>|]/.test(segment))
  ) {
    return "note-folder-invalid";
  }
  if (!settings.apiBaseUrl) return "api-url-required";

  let url: URL;
  try {
    url = new URL(settings.apiBaseUrl);
  } catch {
    return "api-url-invalid";
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !url.port
  ) {
    return "api-url-invalid";
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    return "api-url-not-local";
  }
  if (requireApiKey && !settings.apiKey) return "api-key-required";
  return null;
}
