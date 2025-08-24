import js from "@eslint/js"
import ts from "typescript-eslint"
import svelte from "eslint-plugin-svelte"
import prettier from "eslint-config-prettier"
import globals from "globals"

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs["flat/recommended"],
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2017,
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "off", // TypeScript handles this
      "svelte/require-each-key": "warn", // Downgrade to warning
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    // Apply to all test files. Proper type checking in tests with mocks can be tedious and counterproductive.
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    ignores: [
      ".DS_Store",
      "node_modules/",
      "build/",
      ".svelte-kit/",
      ".vercel/",
      "package/",
      ".env",
      ".env.*",
      "!.env.example",
      "pnpm-lock.yaml",
      "package-lock.json",
      "yarn.lock",
    ],
  },
]
