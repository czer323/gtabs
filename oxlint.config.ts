import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "eslint", "import"],
  jsPlugins: ["eslint-plugin-playwright"],
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
      // eslint-plugin-playwright's `flat/recommended` rule set (the ✅ rules in
      // its README table), scoped to Playwright tests. The `e2e/**` glob also
      // matches the existing `**/*.spec.*` vitest override below, so keep the
      // vitest rules and playwright rules non-conflicting here: each enables a
      // disjoint namespace. Severities mirror the plugin's recommended defaults.
      files: ["e2e/**"],
      rules: {
        "playwright/consistent-spacing-between-blocks": "warn",
        "playwright/expect-expect": "warn",
        "playwright/max-nested-describe": "warn",
        "playwright/missing-playwright-await": "error",
        "playwright/no-conditional-expect": "warn",
        "playwright/no-conditional-in-test": "warn",
        "playwright/no-duplicate-hooks": "warn",
        "playwright/no-duplicate-slow": "warn",
        "playwright/no-element-handle": "warn",
        "playwright/no-eval": "warn",
        "playwright/no-focused-test": "error",
        "playwright/no-force-option": "warn",
        "playwright/no-nested-step": "warn",
        "playwright/no-networkidle": "error",
        "playwright/no-page-pause": "warn",
        "playwright/no-skipped-test": "warn",
        "playwright/no-standalone-expect": "error",
        "playwright/no-unnecessary-assertions": "error",
        "playwright/no-unsafe-references": "error",
        "playwright/no-unused-locators": "error",
        "playwright/no-useless-await": "warn",
        "playwright/no-useless-not": "warn",
        "playwright/no-wait-for-navigation": "error",
        "playwright/no-wait-for-selector": "warn",
        "playwright/no-wait-for-timeout": "warn",
        "playwright/prefer-hooks-in-order": "warn",
        "playwright/prefer-hooks-on-top": "warn",
        "playwright/prefer-locator": "warn",
        "playwright/prefer-to-have-count": "warn",
        "playwright/prefer-to-have-length": "warn",
        "playwright/prefer-web-first-assertions": "error",
        "playwright/valid-describe-callback": "error",
        "playwright/valid-expect": "error",
        "playwright/valid-expect-in-promise": "error",
        "playwright/valid-test-tags": "error",
        "playwright/valid-title": "error",
      },
    },
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
