import { defineConfig } from "vite";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";

const unusedModelFiles = [
  "PP-OCRv6_small_det_onnx_infer.tar",
  "PP-OCRv6_small_rec_onnx_infer.tar"
];
const crossOriginHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp"
};

export default defineConfig({
  server: {
    headers: crossOriginHeaders
  },
  preview: {
    headers: crossOriginHeaders
  },
  plugins: [
    {
      name: "drop-unused-ocr-models",
      async closeBundle() {
        await Promise.all(
          unusedModelFiles.map((file) =>
            rm(resolve(import.meta.dirname, "dist", "models", file), { force: true })
          )
        );
      }
    }
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, "popup.html"),
        offscreen: resolve(import.meta.dirname, "offscreen.html"),
        background: resolve(import.meta.dirname, "src/background.ts")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
