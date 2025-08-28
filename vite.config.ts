import { sveltekit } from "@sveltejs/kit/vite"
import { defineConfig } from "vitest/config"
import { buildAndCacheSearchIndex } from "./src/lib/build_index"

export default defineConfig({
  plugins: [
    sveltekit(),
    {
      name: "vite-build-search-index",
      writeBundle: {
        order: "post",
        sequential: false,
        handler: async () => {
          console.log("Building search index...")
          await buildAndCacheSearchIndex()
        },
      },
    },
  ],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    globals: true, /// allows to skip import of test functions like `describe`, `it`, `expect`, etc.
  },
  build: {
    // Disable TypeScript type checking during build
    // This prevents the build from failing due to type errors
    rollupOptions: {
      onwarn(warning, warn) {
        // Ignore TypeScript-related warnings
        if (warning.code === "UNUSED_EXTERNAL_IMPORT") return
        if (warning.code === "CIRCULAR_DEPENDENCY") return
        warn(warning)
      },
    },
  },
  // Disable esbuild's TypeScript transform type checking
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
      },
    },
  },
})
