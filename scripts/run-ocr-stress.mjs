import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";

const executablePath =
  process.env.CHROME_PATH ||
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "/usr/bin/google-chrome");
export async function runOcrStress(target) {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--enable-precise-memory-info"]
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(target, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Run benchmark" }).click();
    await page.locator("#benchmarkStatus").waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const status = document.querySelector("#benchmarkStatus")?.textContent;
      return status === "completed" || status === "failed";
    }, undefined, { timeout: 10 * 60_000 });
    const status = await page.locator("#benchmarkStatus").textContent();
    const output = await page.locator("#benchmarkResult").textContent();
    if (status !== "completed") throw new Error(output || "Benchmark failed.");
    return `${output}\n`;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target =
    process.argv[2] || "http://127.0.0.1:4173/benchmark.html?iterations=30&warmup=2";
  process.stdout.write(await runOcrStress(target));
}
