import "./options.css";
import { createMessageGetter, getUiLanguage, localizeDocument } from "./core/i18n";
import {
  DEFAULT_OBSIDIAN_SETTINGS,
  OBSIDIAN_API_KEY_KEY,
  OBSIDIAN_SETTINGS_KEY,
  normalizeObsidianSettings,
  validateObsidianSettings,
  type ObsidianSettings,
  type ObsidianSettingsError
} from "./core/obsidian";
import type { BackgroundRequest } from "./core/types";

const message = createMessageGetter(getUiLanguage());
const form = document.querySelector<HTMLFormElement>("#settingsForm")!;
const noteFolderInput = document.querySelector<HTMLInputElement>("#noteFolder")!;
const apiBaseUrlInput = document.querySelector<HTMLInputElement>("#apiBaseUrl")!;
const apiKeyInput = document.querySelector<HTMLInputElement>("#apiKey")!;
const saveButton = document.querySelector<HTMLButtonElement>("#saveButton")!;
const testButton = document.querySelector<HTMLButtonElement>("#testButton")!;
const status = document.querySelector<HTMLElement>("#settingsStatus")!;

function settingsErrorMessage(error: ObsidianSettingsError): string {
  const keys: Record<ObsidianSettingsError, string> = {
    "note-folder-required": "noteFolderRequired",
    "note-folder-invalid": "noteFolderInvalid",
    "api-url-required": "obsidianApiUrlRequired",
    "api-url-invalid": "obsidianApiUrlInvalid",
    "api-url-not-local": "obsidianApiUrlNotLocal",
    "api-key-required": "obsidianApiKeyRequired"
  };
  return message(keys[error]);
}

function connectionErrorMessage(error: string): string {
  if (error === "OBSIDIAN_CONNECTION_TIMEOUT") return message("obsidianConnectionTimeout");
  if (error === "OBSIDIAN_CONNECTION_FAILED") return message("obsidianConnectionFailed");
  if (error === "OBSIDIAN_UNAUTHORIZED") return message("obsidianUnauthorized");
  if (error.startsWith("OBSIDIAN_HTTP_ERROR:")) {
    return message("obsidianHttpError", error.split(":")[1] || "?");
  }
  if (error.startsWith("OBSIDIAN_SETTINGS:")) {
    return settingsErrorMessage(error.slice("OBSIDIAN_SETTINGS:".length) as ObsidianSettingsError);
  }
  return message("obsidianConnectionFailed");
}

function showStatus(text: string, kind: "working" | "success" | "error"): void {
  status.hidden = false;
  status.textContent = text;
  status.className = `settings-status${kind === "working" ? "" : ` is-${kind}`}`;
}

function readDraft() {
  return normalizeObsidianSettings({
    noteFolder: noteFolderInput.value,
    apiBaseUrl: apiBaseUrlInput.value,
    apiKey: apiKeyInput.value
  });
}

async function loadSettings(): Promise<void> {
  const [synced, local] = await Promise.all([
    chrome.storage.sync.get(OBSIDIAN_SETTINGS_KEY),
    chrome.storage.local.get(OBSIDIAN_API_KEY_KEY)
  ]);
  const stored = synced[OBSIDIAN_SETTINGS_KEY] as Partial<ObsidianSettings> | undefined;
  noteFolderInput.value = stored?.noteFolder || DEFAULT_OBSIDIAN_SETTINGS.noteFolder;
  apiBaseUrlInput.value = stored?.apiBaseUrl || DEFAULT_OBSIDIAN_SETTINGS.apiBaseUrl;
  apiKeyInput.value = String(local[OBSIDIAN_API_KEY_KEY] || "");
}

async function saveSettings(): Promise<void> {
  const draft = readDraft();
  const error = validateObsidianSettings(draft, false);
  if (error) {
    showStatus(settingsErrorMessage(error), "error");
    return;
  }
  saveButton.disabled = true;
  showStatus(message("settingsSaving"), "working");
  try {
    await Promise.all([
      chrome.storage.sync.set({
        [OBSIDIAN_SETTINGS_KEY]: {
          noteFolder: draft.noteFolder,
          apiBaseUrl: draft.apiBaseUrl
        } satisfies ObsidianSettings
      }),
      chrome.storage.local.set({ [OBSIDIAN_API_KEY_KEY]: draft.apiKey })
    ]);
    noteFolderInput.value = draft.noteFolder;
    apiBaseUrlInput.value = draft.apiBaseUrl;
    apiKeyInput.value = draft.apiKey;
    showStatus(
      message(draft.apiKey ? "settingsSaved" : "settingsSavedWithoutKey"),
      "success"
    );
  } catch {
    showStatus(message("settingsSaveFailed"), "error");
  } finally {
    saveButton.disabled = false;
  }
}

async function testConnection(): Promise<void> {
  const draft = readDraft();
  const error = validateObsidianSettings(draft);
  if (error) {
    showStatus(settingsErrorMessage(error), "error");
    return;
  }
  testButton.disabled = true;
  showStatus(message("obsidianTesting"), "working");
  try {
    const request: BackgroundRequest = {
      target: "background",
      type: "TEST_OBSIDIAN_CONNECTION",
      apiBaseUrl: draft.apiBaseUrl,
      apiKey: draft.apiKey
    };
    const response = (await chrome.runtime.sendMessage(request)) as {
      ok?: boolean;
      service?: string;
      error?: string;
    };
    if (!response?.ok) throw new Error(response?.error || "OBSIDIAN_CONNECTION_FAILED");
    showStatus(message("obsidianConnected"), "success");
  } catch (error) {
    showStatus(
      connectionErrorMessage(error instanceof Error ? error.message : String(error)),
      "error"
    );
  } finally {
    testButton.disabled = false;
  }
}

async function initialize(): Promise<void> {
  localizeDocument(message);
  document.documentElement.lang = getUiLanguage();
  document.title = message("settingsTitle");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveSettings();
  });
  testButton.addEventListener("click", () => void testConnection());
  await loadSettings();
}

void initialize().catch(() => showStatus(message("settingsLoadFailed"), "error"));
