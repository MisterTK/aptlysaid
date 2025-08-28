import adapter from "@sveltejs/adapter-vercel"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      runtime: "nodejs20.x",
    }),
    inlineStyleThreshold: 150000,
    typescript: {
      config: (config) => ({
        ...config,
        compilerOptions: {
          ...config.compilerOptions,
          skipLibCheck: true,
          checkJs: false,
        },
      }),
    },
  },
  preprocess: vitePreprocess({
    typescript: {
      compilerOptions: {
        skipLibCheck: true,
        checkJs: false,
      },
    },
  }),
  compilerOptions: {
    enableSourcemap: true,
  },
}

export default config
