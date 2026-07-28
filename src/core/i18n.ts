import type { UiLanguage } from "./types";

const fallbackMessages: Record<UiLanguage, Record<string, string>> = {
  "zh-CN": {
    directModelDownload: "直接下载模型",
    directModelDownloadStarting: "正在跳过缓存并直接下载 OCR 模型…",
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
    ocrStageChecking: "正在检查本地模型缓存",
    ocrStageDownloading: "正在下载 OCR 模型",
    ocrStageInitializing: "正在初始化 OCR 引擎",
    ocrStageRecognizing: "正在识别第 $1/$2 张图片",
    ocrStageFinalizing: "正在汇总 OCR 文字",
    ocrPausing: "当前图片结束后暂停",
    ocrPaused: "OCR 已暂停",
    ocrResumeToContinue: "继续后重新估算时间",
    pauseOcr: "暂停",
    resumeOcr: "继续",
    stopOcr: "跳过 OCR",
    ocrElapsed: "已用时 $1",
    ocrRemaining: "预计还需 $1",
    ocrFinishedIn: "总计 $1",
    ocrEstimating: "正在估算剩余时间",
    ocrDownloadedBytes: "模型已下载 $1/$2 MB",
    ocrAverageImage: "当前单张平均 $1",
    ocrFirstImageEstimate: "首张通常需要 5 至 15 秒，长图会更久",
    ocrTimeCache: "缓存 $1",
    ocrTimeDownload: "下载 $1",
    ocrTimeInitialize: "初始化 $1",
    ocrTimeRecognize: "识别 $1",
    ocrTimeFinalize: "汇总 $1",
    durationSeconds: "$1 秒",
    durationMinutes: "$1 分 $2 秒",
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
    directModelDownload: "Download model directly",
    directModelDownloadStarting: "Bypassing the cache and downloading OCR models…",
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
    ocrStageChecking: "Checking the local model cache",
    ocrStageDownloading: "Downloading OCR models",
    ocrStageInitializing: "Initializing the OCR engine",
    ocrStageRecognizing: "Recognizing image $1 of $2",
    ocrStageFinalizing: "Combining OCR text",
    ocrPausing: "Pausing after the current image",
    ocrPaused: "OCR paused",
    ocrResumeToContinue: "Resume to recalculate the estimate",
    pauseOcr: "Pause",
    resumeOcr: "Resume",
    stopOcr: "Skip OCR",
    ocrElapsed: "Elapsed $1",
    ocrRemaining: "About $1 remaining",
    ocrFinishedIn: "$1 total",
    ocrEstimating: "Estimating time remaining",
    ocrDownloadedBytes: "Downloaded $1/$2 MB of models",
    ocrAverageImage: "Current average per image: $1",
    ocrFirstImageEstimate: "The first image usually takes 5 to 15 seconds; long images take longer",
    ocrTimeCache: "Cache $1",
    ocrTimeDownload: "Download $1",
    ocrTimeInitialize: "Init $1",
    ocrTimeRecognize: "OCR $1",
    ocrTimeFinalize: "Combine $1",
    durationSeconds: "$1 sec",
    durationMinutes: "$1 min $2 sec",
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
