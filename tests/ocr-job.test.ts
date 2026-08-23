import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("temporary OCR job lifecycle", () => {
  const background = readFileSync("src/background.ts", "utf8");
  const types = readFileSync("src/core/types.ts", "utf8");

  it("does not expose stored-job restoration or result reuse", () => {
    expect(background).not.toContain("restoreOcr");
    expect(types).not.toContain("RESTORE_OCR");
    expect(background).not.toContain("shouldReuseOcrJob");
  });

  it("removes terminal, canceled, failed, and stale job state", () => {
    expect(background).toContain("chrome.storage.local.remove(OCR_JOB_KEY)");
    expect(background).toContain("await clearJob(failed.id)");
    expect(background.match(/await clearJob\(updated\.id\)/g)).toHaveLength(1);
    expect(background).toContain("void clearStaleJobState().catch(() => undefined)");
  });
});
