import adapter from "@sveltejs/adapter-vercel"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      runtime: "nodejs20.x",
      split: true,
      images: {
        sizes: [640, 828, 1200, 1920, 3840],
        formats: ['image/avif', 'image/webp'],
        minimumCacheTTL: 300,
      },
      isr: {
        expiration: 60,
      },
    }),
    inlineStyleThreshold: 150000,
    csp: {
      mode: "auto",
      directives: {
        "script-src": ["self", "strict-dynamic"],
        "style-src": ["self", "unsafe-inline"],
        "img-src": ["self", "data:", "https:"],
        "font-src": ["self", "https:"],
        "connect-src": ["self", "https:"],
      },
    },
    csrf: {
      checkOrigin: true,
    },
  },
  preprocess: vitePreprocess(),
  compilerOptions: {
    enableSourcemap: false,
  },
}

export default config
