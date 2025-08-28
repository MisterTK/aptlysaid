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
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "*.mjs", "*.cjs"],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".svelte", ".html"],
      },
    },
    rules: {
      "no-undef": "off", // TypeScript handles this
      "svelte/require-each-key": "warn", // Downgrade to warning
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: [".svelte"],
      },
    },
    rules: {
      "prefer-const": "off", // Svelte props must use let
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "svelte/no-unused-props": "warn", // Warn instead of error for development
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
    // Server-side code can use console statements for logging
    files: [
      "src/routes/api/**/*.{ts,js}",
      "src/routes/**/*.server.{ts,js}",
      "src/lib/server/**/*.ts",
      "src/lib/services/**/*.ts",
      "src/lib/mailer.ts",
      "src/lib/stripe/**/*.ts",
      "src/app.html",
      "src/hooks.server.ts",
    ],
    rules: {
      "no-console": "off",
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
      "supabase/functions/**/*",
      "*.config.js",
      "postcss.config.js",
      "src/app.html",
    ],
  },
]
