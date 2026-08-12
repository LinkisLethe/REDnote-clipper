import { resolve } from "node:path";
import { build, preview } from "vite";
import { runOcrStress } from "./run-ocr-stress.mjs";

const configFile = resolve("vite.benchmark.config.ts");
const iterations = Number.parseInt(process.env.OCR_BENCHMARK_ITERATIONS || "12", 10);
const warmup = Number.parseInt(process.env.OCR_BENCHMARK_WARMUP || "1", 10);

await build({ configFile });
const server = await preview({
  configFile,
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true
  }
});

try {
  const target = `http://127.0.0.1:4173/benchmark.html?iterations=${iterations}&warmup=${warmup}`;
  process.stdout.write(await runOcrStress(target));
} finally {
  await server.close();
}
