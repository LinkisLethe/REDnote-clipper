import { defineConfig } from "vite";
import { resolve } from "node:path";
import { copyFile, mkdir } from "node:fs/promises";

const licenseFiles = [
  ["LICENSE", "LICENSE"],
  ["NOTICE", "NOTICE"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
  ["LICENSES/onnxruntime-MIT.txt", "LICENSES/onnxruntime-MIT.txt"]
] as const;
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
      name: "copy-license-notices",
      async closeBundle() {
        const dist = resolve(import.meta.dirname, "dist");
        await mkdir(resolve(dist, "LICENSES"), { recursive: true });
        await Promise.all(
          licenseFiles.map(([source, target]) =>
            copyFile(resolve(import.meta.dirname, source), resolve(dist, target))
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
        options: resolve(import.meta.dirname, "options.html"),
        offscreen: resolve(import.meta.dirname, "offscreen.html"),
        content: resolve(import.meta.dirname, "src/content.ts"),
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
