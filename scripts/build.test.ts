import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const BUILD_SCRIPT = join(import.meta.dirname, "build.ts");
const DIST = join(ROOT, "dist");

const EXPECTED_OUTPUTS = [
  "manifest.json",
  "popup.html",
  "options.html",
  "background.js",
  "popup.js",
  "options.js",
  "background.js.map",
  "popup.js.map",
  "options.js.map",
];

describe("build", () => {
  it("compiles the extension into dist/ with the expected outputs", () => {
    const res = spawnSync(process.execPath, [BUILD_SCRIPT], { cwd: ROOT, encoding: "utf8" });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Build complete");

    // Where the build puts files: everything under dist/
    expect(existsSync(DIST)).toBe(true);
    for (const file of EXPECTED_OUTPUTS) {
      expect(existsSync(join(DIST, file)), `missing dist/${file}`).toBe(true);
    }

    // Bundles are real output, not empty stubs
    for (const js of ["background.js", "popup.js", "options.js"]) {
      expect(statSync(join(DIST, js)).size, `dist/${js} is empty`).toBeGreaterThan(0);
    }

    // manifest.json is copied verbatim
    const sourceManifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
    const builtManifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8"));
    expect(builtManifest).toEqual(sourceManifest);

    // icons are copied recursively
    const iconDir = join(DIST, "icons");
    expect(existsSync(iconDir)).toBe(true);
    const icons = readdirSync(iconDir);
    for (const icon of ["icon16.png", "icon48.png", "icon128.png"]) {
      expect(icons).toContain(icon);
    }
  });
});
