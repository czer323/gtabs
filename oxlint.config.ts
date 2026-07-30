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
      files: ["*.test.ts", "*.spec.ts"],
      plugins: ["vitest"],
      rules: {
        "vitest/no-focused-tests": "error",
        "vitest/no-identical-title": "error",
        "vitest/prefer-to-be-falsy": "warn",
      },
    },
  ],
  options: {
    typeAware: true,
  },
});
