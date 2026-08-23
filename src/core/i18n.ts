import type { UiLanguage } from "./types";

const fallbackMessages: Record<UiLanguage, Record<string, string>> = {
  "zh-CN": {
    extensionName: "XHS Clipper",
    extensionDescription: "将小红书笔记批量剪藏为 Markdown，可选本地 OCR 和 Obsidian 导出。",
    actionTitle: "打开或收起 XHS Clipper 工作台",
    actionUnsupported: "请先打开小红书页面，再使用 XHS Clipper",
    actionFailed: "工作台打开失败，请刷新小红书页面后重试",
    settingsTitle: "Obsidian 写入设置",
    settingsSubtitle: "配置一次后，就能从悬浮工作台直接写入本地仓库。",
    obsidianGuideTitle: "首次配置",
    obsidianGuideStep1: "在 Obsidian 安装并启用 Local REST API with MCP 插件。",
    obsidianGuideStep2: "在插件设置中启用非加密 HTTP 服务。",
    obsidianGuideStep3: "复制 API Key，填到下方后测试连接。",
    noteFolderLabel: "笔记目录",
    noteFolderPlaceholder: "Clippings/XHS",
    noteFolderHint: "悬浮工作台固定导出到 Clippings/XHS，不需要填仓库名。",
    noteFolderRequired: "请填写笔记目录。",
    noteFolderInvalid: "笔记目录包含无效字符或路径。",
    obsidianApiUrlLabel: "Local REST API 地址",
    obsidianApiUrlHint: "默认为 http://127.0.0.1:27123，只允许本机地址。",
    obsidianApiUrlRequired: "请填写 Local REST API 地址。",
    obsidianApiUrlInvalid: "API 地址格式不对，请填完整的本机地址和端口。",
    obsidianApiUrlNotLocal: "为了安全，API 地址只能使用 127.0.0.1 或 localhost。",
    obsidianApiKeyLabel: "Local REST API Key",
    obsidianApiKeyHint: "Key 只保存在这台电脑的 Chrome 插件存储中。",
    obsidianApiKeyRequired: "请填写 Local REST API Key。",
    saveSettings: "保存设置",
    testConnection: "测试连接",
    settingsSaving: "正在保存…",
    settingsSaved: "设置已保存。",
    settingsSavedWithoutKey: "设置已保存；填写 API Key 后才能测试连接。",
    settingsSaveFailed: "设置保存失败，请重试。",
    settingsLoadFailed: "设置读取失败，请重新打开此页。",
    obsidianTesting: "正在连接本机 Obsidian…",
    obsidianConnected: "连接成功，Obsidian Local REST API 可用。",
    obsidianConnectionTimeout: "连接超时。请确认 Obsidian 已打开，且 HTTP 服务已启用。",
    obsidianConnectionFailed: "无法连接 Obsidian。请检查地址、端口和 HTTP 服务。",
    obsidianUnauthorized: "API Key 不正确，请从 Obsidian 插件设置里重新复制。",
    obsidianHttpError: "Obsidian API 返回 HTTP $1，请检查插件设置。"
  },
  "zh-TW": {
    extensionName: "XHS Clipper",
    extensionDescription: "將小紅書筆記批次剪藏為 Markdown，可選擇本機 OCR 和 Obsidian 匯出。",
    actionTitle: "開啟或收起 XHS Clipper 工作台",
    actionUnsupported: "請先開啟小紅書頁面，再使用 XHS Clipper",
    actionFailed: "工作台開啟失敗，請重新整理小紅書頁面後再試",
    settingsTitle: "Obsidian 寫入設定",
    settingsSubtitle: "設定一次後，即可從懸浮工作台直接寫入本機儲存庫。",
    obsidianGuideTitle: "首次設定",
    obsidianGuideStep1: "在 Obsidian 安裝並啟用 Local REST API with MCP 外掛。",
    obsidianGuideStep2: "在外掛設定中啟用非加密 HTTP 服務。",
    obsidianGuideStep3: "複製 API Key，填到下方後測試連線。",
    noteFolderLabel: "筆記資料夾",
    noteFolderPlaceholder: "Clippings/XHS",
    noteFolderHint: "懸浮工作台固定匯出到 Clippings/XHS，不需要填寫儲存庫名稱。",
    noteFolderRequired: "請填寫筆記資料夾。",
    noteFolderInvalid: "筆記資料夾包含無效字元或路徑。",
    obsidianApiUrlLabel: "Local REST API 位址",
    obsidianApiUrlHint: "預設為 http://127.0.0.1:27123，僅允許本機位址。",
    obsidianApiUrlRequired: "請填寫 Local REST API 位址。",
    obsidianApiUrlInvalid: "API 位址格式不正確，請填寫完整的本機位址與連接埠。",
    obsidianApiUrlNotLocal: "為了安全，API 位址只能使用 127.0.0.1 或 localhost。",
    obsidianApiKeyLabel: "Local REST API Key",
    obsidianApiKeyHint: "Key 只會儲存在這台電腦的 Chrome 擴充功能儲存空間中。",
    obsidianApiKeyRequired: "請填寫 Local REST API Key。",
    saveSettings: "儲存設定",
    testConnection: "測試連線",
    settingsSaving: "正在儲存…",
    settingsSaved: "設定已儲存。",
    settingsSavedWithoutKey: "設定已儲存；填寫 API Key 後才能測試連線。",
    settingsSaveFailed: "設定儲存失敗，請重試。",
    settingsLoadFailed: "設定讀取失敗，請重新開啟此頁面。",
    obsidianTesting: "正在連線本機 Obsidian…",
    obsidianConnected: "連線成功，Obsidian Local REST API 可用。",
    obsidianConnectionTimeout: "連線超時。請確認 Obsidian 已開啟，且 HTTP 服務已啟用。",
    obsidianConnectionFailed: "無法連線 Obsidian。請檢查位址、連接埠與 HTTP 服務。",
    obsidianUnauthorized: "API Key 不正確，請從 Obsidian 外掛設定裡重新複製。",
    obsidianHttpError: "Obsidian API 回傳 HTTP $1，請檢查外掛設定。"
  },
  en: {
    extensionName: "XHS Clipper",
    extensionDescription: "Clip Xiaohongshu posts as Markdown with optional local OCR and Obsidian export.",
    actionTitle: "Open or collapse the XHS Clipper workspace",
    actionUnsupported: "Open a Xiaohongshu page before using XHS Clipper",
    actionFailed: "Could not open the workspace. Reload the Xiaohongshu page and try again.",
    settingsTitle: "Obsidian export settings",
    settingsSubtitle: "Configure once, then write notes from the floating workspace to your local vault.",
    obsidianGuideTitle: "First-time setup",
    obsidianGuideStep1: "Install and enable Local REST API with MCP in Obsidian.",
    obsidianGuideStep2: "Enable the non-encrypted HTTP server in the plugin settings.",
    obsidianGuideStep3: "Copy the API key, enter it below, then test the connection.",
    noteFolderLabel: "Note folder",
    noteFolderPlaceholder: "Clippings/XHS",
    noteFolderHint: "The floating workspace exports to Clippings/XHS. Do not include the vault name.",
    noteFolderRequired: "Enter a note folder.",
    noteFolderInvalid: "The note folder contains an invalid character or path.",
    obsidianApiUrlLabel: "Local REST API address",
    obsidianApiUrlHint: "Default: http://127.0.0.1:27123. Only local addresses are allowed.",
    obsidianApiUrlRequired: "Enter the Local REST API address.",
    obsidianApiUrlInvalid: "Enter a complete local API address with a port.",
    obsidianApiUrlNotLocal: "For safety, the API address must use 127.0.0.1 or localhost.",
    obsidianApiKeyLabel: "Local REST API key",
    obsidianApiKeyHint: "The key is stored only in this Chrome profile's extension storage.",
    obsidianApiKeyRequired: "Enter the Local REST API key.",
    saveSettings: "Save settings",
    testConnection: "Test connection",
    settingsSaving: "Saving…",
    settingsSaved: "Settings saved.",
    settingsSavedWithoutKey: "Settings saved. Add an API key before testing the connection.",
    settingsSaveFailed: "Could not save the settings. Try again.",
    settingsLoadFailed: "Could not load the settings. Reopen this page.",
    obsidianTesting: "Connecting to Obsidian on this device…",
    obsidianConnected: "Connected. The Obsidian Local REST API is available.",
    obsidianConnectionTimeout: "Connection timed out. Check that Obsidian is open and the HTTP server is enabled.",
    obsidianConnectionFailed: "Could not connect to Obsidian. Check the address, port, and HTTP server.",
    obsidianUnauthorized: "The API key is incorrect. Copy it again from the Obsidian plugin settings.",
    obsidianHttpError: "The Obsidian API returned HTTP $1. Check the plugin settings."
  }
};

function normalizeLanguageTag(language: string): string {
  return language.replaceAll("_", "-").toLowerCase();
}

export function resolveUiLanguage(browserLanguage: string): UiLanguage {
  const language = normalizeLanguageTag(browserLanguage);
  if (language === "zh-tw" || language.startsWith("zh-tw-")) return "zh-TW";
  if (language === "zh-cn" || language.startsWith("zh-cn-")) return "zh-CN";
  return "en";
}

function getBrowserUiLanguage(): string {
  return (
    globalThis.chrome?.i18n?.getUILanguage?.() ||
    (typeof navigator !== "undefined" ? navigator.language : "en")
  );
}

export function getUiLanguage(): UiLanguage {
  if (!globalThis.chrome?.runtime?.id && typeof location !== "undefined") {
    const previewLanguage = new URL(location.href).searchParams.get("lang");
    if (
      previewLanguage === "en" ||
      previewLanguage === "zh-CN" ||
      previewLanguage === "zh-TW"
    ) {
      return previewLanguage;
    }
  }
  return resolveUiLanguage(getBrowserUiLanguage());
}

export function createMessageGetter(language = getUiLanguage()) {
  return (key: string, substitutions?: string | string[]): string => {
    const chromeMessage = globalThis.chrome?.i18n?.getMessage?.(key, substitutions);
    if (chromeMessage) return chromeMessage;
    const source = fallbackMessages[language][key] || key;
    const values = Array.isArray(substitutions) ? substitutions : [substitutions || ""];
    return values.reduce(
      (text, value, index) => text.replaceAll(`$${index + 1}`, value),
      source
    );
  };
}

export function localizeDocument(message: ReturnType<typeof createMessageGetter>): void {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = message(key);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((element) => {
    const key = element.dataset.i18nTitle;
    if (key) element.title = message(key);
  });
  document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if (key) element.placeholder = message(key);
  });
}
