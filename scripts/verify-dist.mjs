import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const requiredFiles = [
  "manifest.json",
  "popup.html",
  "offscreen.html",
  "assets/background.js",
  "_locales/zh_CN/messages.json",
  "_locales/en/messages.json"
];

for (const file of requiredFiles) {
  await access(resolve(dist, file));
}

const manifest = JSON.parse(await readFile(resolve(dist, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("manifest_version must be 3");
if (manifest.default_locale !== "zh_CN") throw new Error("default_locale must be zh_CN");
if (manifest.background?.service_worker !== "assets/background.js") {
  throw new Error("Background service worker path does not match the build output");
}
if (!manifest.permissions?.includes("offscreen") || !manifest.permissions?.includes("downloads")) {
  throw new Error("Required Chrome permissions are missing");
}

const localeFiles = ["zh_CN", "en"].map((locale) =>
  resolve(dist, "_locales", locale, "messages.json")
);
const [zhMessages, enMessages] = await Promise.all(
  localeFiles.map(async (file) => JSON.parse(await readFile(file, "utf8")))
);
const zhKeys = Object.keys(zhMessages).sort();
const enKeys = Object.keys(enMessages).sort();
if (JSON.stringify(zhKeys) !== JSON.stringify(enKeys)) {
  throw new Error("Chinese and English locale keys do not match");
}

const assetNames = await readdir(resolve(dist, "assets"));
const workerName = assetNames.find((name) => name.startsWith("worker-entry-") && name.endsWith(".js"));
if (!workerName) throw new Error("PaddleOCR worker was not emitted");
const runtimeAssets = assetNames.filter((name) =>
  /^ort-wasm-simd-threaded\.jsep-.+\.(?:mjs|wasm)$/.test(name)
);
if (!runtimeAssets.some((name) => name.endsWith(".mjs"))) {
  throw new Error("Local ONNX Runtime module was not emitted");
}
if (!runtimeAssets.some((name) => name.endsWith(".wasm"))) {
  throw new Error("Local ONNX Runtime WASM binary was not emitted");
}

const popupHtml = await readFile(resolve(dist, "popup.html"), "utf8");
const offscreenHtml = await readFile(resolve(dist, "offscreen.html"), "utf8");
if (/\<script[^>]+src=["']https?:/i.test(`${popupHtml}\n${offscreenHtml}`)) {
  throw new Error("Extension pages must not load remote scripts");
}

const totalBytes = (
  await Promise.all(runtimeAssets.map(async (file) => (await stat(resolve(dist, "assets", file))).size))
).reduce((sum, size) => sum + size, 0);

console.log(
  `Verified MV3 build, ${zhKeys.length} bilingual messages, ${runtimeAssets.length} OCR runtime assets, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB local ORT runtime.`
);
