import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "eslint", "import"],
  categories: {
    correctness: "error",
    suspicious: "warn",
  },
  rules: {
    "eslint/no-underscore-dangle": "off",
    "typescript/no-unnecessary-type-conversion": "off",
  },
  env: {
    builtin: true,
    browser: true,
  },
  overrides: [
    {
      files: ["**/*.test.*", "**/*.spec.*"],
      plugins: ["vitest"],
      rules: {
        "vitest/no-focused-tests": "error",
        "vitest/no-identical-title": "error",
        "vitest/prefer-to-be-falsy": "warn",
      },
    },
    {
      // Org decision (issue #51, Path B): the no-unsafe-type-assertion warnings
      // in test files are intentional mock-boundary casts at the test-double
      // boundary. They are declared NOT VALUABLE; the rule's value lives in
      // production code, so test files are exempted instead of churned.
      files: ["**/*.test.*", "**/*.spec.*", "vitest.setup.ts"],
      rules: {
        "typescript/no-unsafe-type-assertion": "off",
      },
    },
    {
      // Extension code runs in Chrome's MV3 runtime (service worker / pages) —
      // no Node globals exist there. Tripwire: usage fails lint so agents and
      // humans get steered away before esbuild catches it at bundle time.
      files: ["src/**/*.ts"],
      excludeFiles: ["src/**/*.test.ts"],
      rules: {
        "eslint/no-restricted-globals": [
          "error",
          { name: "process" },
          { name: "Buffer" },
          { name: "require" },
          { name: "module" },
          { name: "exports" },
          { name: "__dirname" },
          { name: "__filename" },
          { name: "global" },
        ],
      },
    },
  ],
  options: {
    typeAware: true,
  },
});
