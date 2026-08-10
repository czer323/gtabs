import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Syncs the Chrome extension version in manifest.json from the first CLI arg.
// Its only job: write `version` (the next semantic version) back to manifest.json.
// Build and packaging run separately in the release workflow.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(repoRoot, "manifest.json");

const nextVersion = process.argv[2];
if (!nextVersion) {
  console.error("Usage: node scripts/sync-version.mjs <version>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.version = nextVersion;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest.json version → ${nextVersion}`);
