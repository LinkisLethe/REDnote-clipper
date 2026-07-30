import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const requiredFiles = [
  "manifest.json",
  "popup.html",
  "options.html",
  "offscreen.html",
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_NOTICES.md",
  "LICENSES/onnxruntime-MIT.txt",
  "assets/background.js",
  "models/PP-OCRv6_tiny_det_onnx_infer.tar",
  "models/PP-OCRv6_tiny_rec_onnx_infer.tar",
  "_locales/zh_CN/messages.json",
  "_locales/zh_TW/messages.json",
  "_locales/en/messages.json"
];

for (const file of requiredFiles) {
  await access(resolve(dist, file));
}

for (const file of [
  "models/PP-OCRv6_small_det_onnx_infer.tar",
  "models/PP-OCRv6_small_rec_onnx_infer.tar"
]) {
  try {
    await access(resolve(dist, file));
    throw new Error(`Unused OCR model must not be included: ${file}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unused OCR model")) throw error;
  }
}

const manifest = JSON.parse(await readFile(resolve(dist, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("manifest_version must be 3");
if (manifest.default_locale !== "en") throw new Error("default_locale must be en");
if (manifest.background?.service_worker !== "assets/background.js") {
  throw new Error("Background service worker path does not match the build output");
}
if (manifest.options_page !== "options.html") {
  throw new Error("Obsidian settings page is missing from the manifest");
}
if (!manifest.permissions?.includes("offscreen") || !manifest.permissions?.includes("downloads")) {
  throw new Error("Required Chrome permissions are missing");
}
if (manifest.cross_origin_embedder_policy?.value !== "require-corp") {
  throw new Error("The extension must enable cross-origin embedding isolation");
}
if (manifest.cross_origin_opener_policy?.value !== "same-origin") {
  throw new Error("The extension must enable cross-origin opener isolation");
}
if (manifest.content_security_policy?.extension_pages?.includes("'unsafe-eval'")) {
  throw new Error("Privileged extension pages must not allow unsafe-eval");
}
if (manifest.host_permissions?.some((entry) => entry.includes("paddle-model-ecology"))) {
  throw new Error("Bundled OCR must not require the remote Paddle model host");
}
for (const permission of ["http://127.0.0.1/*", "http://localhost/*"]) {
  if (!manifest.host_permissions?.includes(permission)) {
    throw new Error(`Missing local Obsidian permission: ${permission}`);
  }
}
if (manifest.host_permissions?.some((entry) => ["http://*/*", "https://*/*"].includes(entry))) {
  throw new Error("Obsidian access must not grant a broad web host permission");
}

const locales = ["zh_CN", "zh_TW", "en"];
const localeFiles = locales.map((locale) =>
  resolve(dist, "_locales", locale, "messages.json")
);
const localeMessages = await Promise.all(
  localeFiles.map(async (file) => JSON.parse(await readFile(file, "utf8")))
);
const localeKeys = localeMessages.map((messages) => Object.keys(messages).sort());
for (const keys of localeKeys.slice(1)) {
  if (JSON.stringify(localeKeys[0]) !== JSON.stringify(keys)) {
    throw new Error("Locale message keys do not match");
  }
}

const assetNames = await readdir(resolve(dist, "assets"));
const workerName = assetNames.find((name) => name.startsWith("worker-entry-") && name.endsWith(".js"));
if (workerName) throw new Error("Unused PaddleOCR worker must not be included");
if (assetNames.some((name) => /^opencv-.+\.js$/.test(name))) {
  throw new Error("OpenCV must not be included in the lightweight OCR build");
}
const runtimeAssets = assetNames.filter((name) =>
  /^ort-wasm-simd-threaded-.+\.(?:mjs|wasm)$/.test(name)
);
if (!runtimeAssets.some((name) => name.endsWith(".mjs"))) {
  throw new Error("Local ONNX Runtime module was not emitted");
}
if (!runtimeAssets.some((name) => name.endsWith(".wasm"))) {
  throw new Error("Local ONNX Runtime WASM binary was not emitted");
}

const popupHtml = await readFile(resolve(dist, "popup.html"), "utf8");
const optionsHtml = await readFile(resolve(dist, "options.html"), "utf8");
const offscreenHtml = await readFile(resolve(dist, "offscreen.html"), "utf8");
if (/\<script[^>]+src=["']https?:/i.test(`${popupHtml}\n${optionsHtml}\n${offscreenHtml}`)) {
  throw new Error("Extension pages must not load remote scripts");
}

const totalBytes = (
  await Promise.all(runtimeAssets.map(async (file) => (await stat(resolve(dist, "assets", file))).size))
).reduce((sum, size) => sum + size, 0);
const modelFiles = [
  "PP-OCRv6_tiny_det_onnx_infer.tar",
  "PP-OCRv6_tiny_rec_onnx_infer.tar"
];
const modelBytes = (
  await Promise.all(modelFiles.map(async (file) => (await stat(resolve(dist, "models", file))).size))
).reduce((sum, size) => sum + size, 0);
if (modelBytes < 6_000_000) throw new Error("Bundled OCR model files are incomplete");

console.log(
  `Verified MV3 build, ${localeKeys[0].length} messages across ${locales.length} locales, ${runtimeAssets.length} OCR runtime assets, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB local ORT runtime, ${(modelBytes / 1024 / 1024).toFixed(1)} MiB bundled OCR models.`
);
