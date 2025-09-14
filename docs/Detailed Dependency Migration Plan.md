## 📋 Detailed Dependency Migration Plan

### 1\. **Vite: 6.3.5 → 7.1.5** 🚀

**Breaking Changes:**

- **Node.js Support**: Requires Node.js 20.19+ or 22.12+ (Node 18 no longer supported)
- **Browser Target**: Default changed from `'modules'` to `'baseline-widely-available'`
- **Removed Features**: Sass legacy API support and `splitVendorChunkPlugin` removed

**Migration Steps:**

// vite.config.js

export default {

build: {

    // If you need specific browser targeting:

    target: 'baseline-widely-available' // New default

},

css: {

    preprocessorOptions: {

      // If using Sass, ensure modern API:

      sass: {

        api: 'modern' // 'legacy' removed in v7

      }

    }

}

}

### 2\. **@sveltejs/vite-plugin-svelte: 5.1.0 → 6.2.0** 🎯

**Breaking Changes:**

- Requires Node 18+ (compatible with Vite 7's Node 20+ requirement)
- Default export change in the package structure
- Removed experimental "advanced raw queries" feature

**Migration Steps:**

// vite.config.js

import { sveltekit } from '@sveltejs/kit/vite'; // Ensure latest import

import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// svelte.config.js

import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {

preprocess: vitePreprocess({

    script: true // Enable script preprocessing if needed

})

};

### 3\. **Vercel AI SDK: 4.3.16 → 5.0.44** 🤖

**Major Breaking Changes:**

- Complete protocol redesign
- Message format changes: `content` → `text`
- Tool call state management updated
- New streaming architecture

**Migration Steps:**

// Before (v4)

const { messages } \= useChat();

// message.content

// After (v5)

const { messages } \= useChat();

// message.text (not content\!)

// Tool calls now have state-based structure:

{

type: "tool-readFile",

toolCallId: "toolu\_...",

state: "output-available", // New state field

input: { path: "file.ts" },

output: { status: "success", data: "..." }

}

// Update imports

import { streamText } from 'ai'; // Core functionality

import { createGoogleGenerativeAI } from '@ai-sdk/google';

**Codemods Available:**

npx @vercel/ai-codemod@latest v5-migration

### 4\. **@ai-sdk/google-vertex: 2.2.24 → 3.0.26** 🔄

**Breaking Changes:**

- Aligned with AI SDK v5 protocol changes
- Model specification version requirements

**Migration Steps:**

// Update model initialization to v5 format

import { createGoogleGenerativeAI } from '@ai-sdk/google-vertex';

const vertex \= createGoogleGenerativeAI({

projectId: process.env.GOOGLE_PROJECT_ID,

location: 'us-central1'

});

// Use with AI SDK v5 patterns

const result \= await streamText({

model: vertex('gemini-pro'),

messages: \[{ role: 'user', content: 'Hello' }\]

});

### 5\. **jsdom: 26.1.0 → 27.0.0** 🌐

**Breaking Changes:**

- Improved Window object specification conformance
- Data properties changed to accessor properties

**Migration Steps:**

// If using with Jest, ensure jest-environment-jsdom is installed

npm install \--save-dev jest-environment-jsdom

// jest.config.js

export default {

testEnvironment: 'jsdom', // Explicitly set

testEnvironmentOptions: {

    url: 'http://localhost' // If you used testURL before

}

};

### 6\. **resend: 4.5.2 → 6.0.3** 📧

**Breaking Changes:**

- React email rendering requires `@react-email/render` package
- API changes in attachment handling

**Migration Steps:**

\# Install required peer dependency if using React emails

npm install @react-email/render

// Update attachment contentId references

// Before: inlineContentId

// After: contentId

attachments: \[{

filename: 'image.png',

content: buffer,

contentId: 'unique-id' // Changed from inlineContentId

}\]

### 7\. **dotenv: 16.6.1 → 17.2.2** 🔐

**Breaking Changes:**

- Comments handling changed (\# in values now requires quotes)
- New configuration options

**Migration Steps:**

// .env file \- wrap values with \# in quotes

\# Before

API_KEY=abc\#123

\# After

API_KEY="abc\#123"

// Use new quiet option to suppress tips

require('dotenv').config({ quiet: true });

// Or via environment variable

DOTENV_CONFIG_QUIET=true node app.js

### 8\. **@types/glob: 8.1.0 → 9.0.0** 📝

**Breaking Changes:**

- This is now a stub package as glob provides its own types

**Migration Steps:**

\# You might be able to remove this dependency

npm uninstall @types/glob

\# glob v10+ includes its own TypeScript definitions

## 🎯 Recommended Migration Order

1. **Update Node.js** to v20.19+ or v22.12+ (required for Vite 7\)
2. **Update build tools** (Vite, @sveltejs/vite-plugin-svelte)
3. **Update AI SDKs** (use codemods for Vercel AI SDK)
4. **Update utilities** (dotenv, jsdom, resend)
5. **Clean up types** (@types/glob)

## 🛠️ Testing Checklist

After each dependency update:

- [ ] Run `npm install` to resolve dependencies
- [ ] Check for TypeScript errors: `npm run check`
- [ ] Run development server: `npm run dev`
- [ ] Build production: `npm run build`
- [ ] Run tests: `npm test`
- [ ] Test AI features (streaming, tool calls)
- [ ] Test email sending with Resend
- [ ] Verify environment variables load correctly

## 💡 Pro Tips

1. **Create a new branch** for the migration
2. **Update dependencies incrementally** and test after each major update
3. **Use the AI SDK v5 codemod** to automate most changes
4. **Review all .env files** for values containing `#` symbols
5. **Update your CI/CD** to use Node.js 20+
6. **Check Supabase client** compatibility with new AI SDK versions

Would you like me to help you implement any specific part of this migration plan or create migration scripts for your codebase?
