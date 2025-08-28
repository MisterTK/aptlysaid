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
    globals: true,
    environment: "jsdom",
  },
  build: {
    minify: "esbuild",
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-svelte') || id.includes('daisyui')) {
              return 'ui';
            }
            if (id.includes('fuse.js') || id.includes('html-to-text')) {
              return 'utils';
            }
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
  esbuild: {
    target: "es2022",
    legalComments: "none",
  },
  server: {
    fs: {
      strict: true,
    },
  },
})
