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
          console.warn("Building search index...")
          await buildAndCacheSearchIndex()
        },
      },
    },
  ],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    globals: true,
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "UNUSED_EXTERNAL_IMPORT") return
        if (warning.code === "CIRCULAR_DEPENDENCY") return
        warn(warning)
      },
      output: {
        manualChunks: (id) => {
          // Group node_modules into vendor chunk
          if (id.includes("node_modules")) {
            return "vendor"
          }
          // Return undefined for other files to use default chunking
          return undefined
        },
      },
    },
  },
  esbuild: {
    target: "esnext",
    tsconfigRaw: {
      compilerOptions: {
        useDefineForClassFields: false,
      },
    },
  },
})
