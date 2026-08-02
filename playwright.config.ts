import { defineConfig } from "@playwright/test";
import path from "node:path";

// Absolute dist path — Chromium ignores relative --load-extension paths.
const DIST = path.resolve(process.cwd(), "dist");

export default defineConfig({
  testDir: "./e2e",
  workers: 1, // single shared extension context; do not parallelize
  use: {
    headless: true,
    channel: "chromium", // default headless-shell cannot load extensions
    launchOptions: {
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, "--no-sandbox"],
    },
  },
});
