import { defineConfig } from "vite";
import { resolve } from "node:path";

const crossOriginHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp"
};

export default defineConfig({
  server: { headers: crossOriginHeaders },
  preview: { headers: crossOriginHeaders },
  build: {
    outDir: ".benchmark-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        benchmark: resolve(import.meta.dirname, "benchmark.html")
      }
    }
  }
});
