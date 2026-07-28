import type { UiLanguage } from "./types";

const fallbackMessages: Record<UiLanguage, Record<string, string>> = {
  "zh-CN": {
    extensionName: "红薯 Markdown 采集器",
    extensionDescription: "将当前小红书笔记导出为纯文本 Markdown，可选本地 OCR。",
    appSubtitle: "当前笔记转纯文本 Markdown",
    refresh: "重新采集",
    ocrLabel: "识别图片文字",
    ocrHint: "图片只在本机处理，首次使用会下载 OCR 模型。",
    previewTitle: "Markdown 预览",
    copy: "复制",
    download: "下载 .md",
    loadingPage: "正在读取当前页面…",
    ready: "已采集，可预览或下载。",
    unsupportedPage: "请先打开一篇小红书笔记。",
    captureFailed: "采集失败，请刷新页面后重试。",
    noImages: "这篇笔记没有可识别的图片。",
    ocrStarting: "正在准备本地 OCR，首次使用需要下载模型…",
    ocrProgress: "已处理 $1/$2 张图片…",
    ocrCompleted: "OCR 完成，已写入预览。",
    ocrCanceled: "OCR 已取消。",
    ocrFailed: "OCR 失败：$1",
    copied: "已复制 Markdown。",
    copyFailed: "复制失败，请在预览框中手动复制。",
    downloaded: "Markdown 已下载。",
    downloadFailed: "下载失败：$1",
    sourceState: "结构化数据",
    sourceDom: "页面内容",
    extractedBy: "采集来源：$1",
    noteMeta: "$1 · $2 张图片",
    editHint: "可以直接修改预览内容，再下载。",
    languageHint: "界面语言跟随 Chrome",
    canceling: "当前图片完成后取消…"
  },
  en: {
    extensionName: "Rednote Markdown Collector",
    extensionDescription: "Export the current Xiaohongshu note as plain-text Markdown with optional local OCR.",
    appSubtitle: "Current note to plain-text Markdown",
    refresh: "Capture again",
    ocrLabel: "Recognize text in images",
    ocrHint: "Images stay on this device. The OCR model is downloaded on first use.",
    previewTitle: "Markdown preview",
    copy: "Copy",
    download: "Download .md",
    loadingPage: "Reading the current page…",
    ready: "Captured. Preview or download the file.",
    unsupportedPage: "Open a Xiaohongshu note first.",
    captureFailed: "Capture failed. Refresh the page and try again.",
    noImages: "This note has no images to recognize.",
    ocrStarting: "Preparing local OCR. The model downloads on first use…",
    ocrProgress: "Processed $1 of $2 images…",
    ocrCompleted: "OCR complete and added to the preview.",
    ocrCanceled: "OCR canceled.",
    ocrFailed: "OCR failed: $1",
    copied: "Markdown copied.",
    copyFailed: "Copy failed. Copy the preview manually.",
    downloaded: "Markdown downloaded.",
    downloadFailed: "Download failed: $1",
    sourceState: "structured data",
    sourceDom: "page content",
    extractedBy: "Captured from: $1",
    noteMeta: "$1 · $2 images",
    editHint: "You can edit the preview before downloading.",
    languageHint: "Interface language follows Chrome",
    canceling: "Canceling after the current image…"
  }
};

export function getUiLanguage(): UiLanguage {
  if (!globalThis.chrome?.runtime?.id && typeof location !== "undefined") {
    const previewLanguage = new URL(location.href).searchParams.get("lang");
    if (previewLanguage === "en" || previewLanguage === "zh-CN") return previewLanguage;
  }
  const browserLanguage = globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language;
  return browserLanguage.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
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
}
