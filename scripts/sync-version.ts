import { readFileSync, writeFileSync } from "node:fs";

// Syncs the Chrome extension version in manifest.json from the first CLI arg.
// Its only job: write `version` (the next semantic version) back to manifest.json.
// Build and packaging run separately in the release workflow.

const nextVersion = process.argv[2];
if (!nextVersion) {
  console.error("Usage: node scripts/sync-version.ts <version>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = nextVersion;
writeFileSync("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest.json version: ${nextVersion}`);
