import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["benchmarks/**/*.stress.ts"],
    disableConsoleIntercept: true,
    testTimeout: 30_000
  }
});
