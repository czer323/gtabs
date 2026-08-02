import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["vitest.setup.ts"],
    environment: "jsdom",
    // Positive scope: unit tests live co-located with code, named *.test.{ts,mjs}.
    include: ["src/**/*.test.{ts,mjs}", "scripts/**/*.test.{ts,mjs}"],
    // Safety net: e2e specs are Playwright's, never vitest's.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
