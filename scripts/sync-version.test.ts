import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dirname, "sync-version.ts");

function makeTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "gtsync-"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ manifest_version: 3, name: "gTabs", version: "0.5.1" }, null, 2),
  );
  return dir;
}

describe("sync-version", () => {
  it("writes the given version into manifest.json", () => {
    const dir = makeTempRepo();
    try {
      const res = spawnSync(process.execPath, [SCRIPT, "0.6.0"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(res.status).toBe(0);
      expect(res.stderr).toBe("");
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      expect(manifest.version).toBe("0.6.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("errors when no version is passed", () => {
    const dir = makeTempRepo();
    try {
      const res = spawnSync(process.execPath, [SCRIPT], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Usage");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
