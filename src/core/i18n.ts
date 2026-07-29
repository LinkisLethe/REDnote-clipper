import type { UiLanguage } from "./types";

const fallbackMessages: Record<UiLanguage, Record<string, string>> = {
  "zh-CN": {
    extensionName: "红薯 Markdown 采集器",
    extensionDescription: "将当前小红书笔记导出为纯文本 Markdown，可选本地 OCR。",
    appSubtitle: "当前笔记转纯文本 Markdown",
    refresh: "重新采集",
    ocrLabel: "识别图片文字",
    ocrHint: "OCR 模型已内置，图片只在本机处理。",
    previewTitle: "Markdown 预览",
    copy: "复制",
    download: "下载 .md",
    loadingPage: "正在读取当前页面…",
    ready: "已采集，可预览或下载。",
    unsupportedPage: "请先打开一篇小红书笔记。",
    captureFailed: "采集失败，请刷新页面后重试。",
    noImages: "这篇笔记没有可识别的图片。",
    ocrStarting: "正在初始化本地 OCR…",
    ocrProgress: "已处理 $1/$2 张图片…",
    ocrStageChecking: "正在检查本地模型缓存",
    ocrStageDownloading: "正在下载 OCR 模型",
    ocrStageInitializing: "正在初始化 OCR 引擎",
    ocrStageRuntime: "正在加载 OCR 运行库",
    ocrStageOpenCv: "正在启动 OpenCV 图像引擎",
    ocrStageWebGpu: "正在检查浏览器 GPU",
    ocrStageModels: "正在读取内置 OCR 模型",
    ocrStageSessions: "正在创建 ONNX 推理会话",
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
    ocrTimeRuntime: "运行库 $1",
    ocrTimeOpenCv: "OpenCV $1",
    ocrTimeWebGpu: "GPU $1",
    ocrTimeModels: "模型 $1",
    ocrTimeSessions: "会话 $1",
    ocrTimeRecognize: "识别 $1",
    ocrTimeFinalize: "汇总 $1",
    durationSeconds: "$1 秒",
    durationMinutes: "$1 分 $2 秒",
    ocrCompleted: "OCR 完成，已写入预览。",
    ocrCanceled: "OCR 已取消。",
    ocrFailed: "OCR 失败：$1",
    ocrErrorRuntimeTimeout: "OCR 运行库加载超过 20 秒",
    ocrErrorOpenCvTimeout: "OpenCV 启动超过 20 秒",
    ocrErrorWebGpuTimeout: "浏览器 GPU 检查超过 2 秒",
    ocrErrorModelTimeout: "内置模型读取超过 5 秒",
    ocrErrorSessionTimeout: "ONNX 会话创建超时",
    ocrErrorSandboxLoadTimeout: "OCR 隔离页加载超时",
    ocrErrorSandboxTimeout: "OCR 隔离引擎响应超时",
    ocrErrorPredictionTimeout: "单张图片识别超过 60 秒",
    ocrErrorOpenCvInvalid: "OpenCV 运行库无效",
    ocrErrorModelRead: "无法读取内置 OCR 模型",
    ocrErrorUnknown: "未知错误",
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
    ocrHint: "OCR models are included. Images stay on this device.",
    previewTitle: "Markdown preview",
    copy: "Copy",
    download: "Download .md",
    loadingPage: "Reading the current page…",
    ready: "Captured. Preview or download the file.",
    unsupportedPage: "Open a Xiaohongshu note first.",
    captureFailed: "Capture failed. Refresh the page and try again.",
    noImages: "This note has no images to recognize.",
    ocrStarting: "Initializing local OCR…",
    ocrProgress: "Processed $1 of $2 images…",
    ocrStageChecking: "Checking the local model cache",
    ocrStageDownloading: "Downloading OCR models",
    ocrStageInitializing: "Initializing the OCR engine",
    ocrStageRuntime: "Loading the OCR runtime",
    ocrStageOpenCv: "Starting the OpenCV image engine",
    ocrStageWebGpu: "Checking browser GPU support",
    ocrStageModels: "Reading bundled OCR models",
    ocrStageSessions: "Creating ONNX inference sessions",
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
    ocrTimeRuntime: "Runtime $1",
    ocrTimeOpenCv: "OpenCV $1",
    ocrTimeWebGpu: "GPU $1",
    ocrTimeModels: "Models $1",
    ocrTimeSessions: "Sessions $1",
    ocrTimeRecognize: "OCR $1",
    ocrTimeFinalize: "Combine $1",
    durationSeconds: "$1 sec",
    durationMinutes: "$1 min $2 sec",
    ocrCompleted: "OCR complete and added to the preview.",
    ocrCanceled: "OCR canceled.",
    ocrFailed: "OCR failed: $1",
    ocrErrorRuntimeTimeout: "The OCR runtime took longer than 20 seconds to load",
    ocrErrorOpenCvTimeout: "OpenCV took longer than 20 seconds to start",
    ocrErrorWebGpuTimeout: "The browser GPU check took longer than 2 seconds",
    ocrErrorModelTimeout: "Bundled model reading took longer than 5 seconds",
    ocrErrorSessionTimeout: "ONNX session creation timed out",
    ocrErrorSandboxLoadTimeout: "The isolated OCR page took too long to load",
    ocrErrorSandboxTimeout: "The isolated OCR engine timed out",
    ocrErrorPredictionTimeout: "Image recognition took longer than 60 seconds",
    ocrErrorOpenCvInvalid: "The OpenCV runtime is invalid",
    ocrErrorModelRead: "The bundled OCR models could not be read",
    ocrErrorUnknown: "Unknown error",
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
