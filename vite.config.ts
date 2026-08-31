import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import manifest from './tools/manifest-plugin';
import { resolveBaseUrl, toViteBase } from './server/base-url.js';
import { resolveStartUrl } from './server/start-url.js';

// Single source of truth for the app title: the <title> in index.html (as the
// `%APP_TITLE%` placeholder) and the manifest entry's `title` both come from
// here, in dev and in the build.
const APP_TITLE = 'RestBox';
const APP_DESCRIPTION = 'Web client for building and sending HTTP requests';

// The dev server is not started by Vite directly: `server/index.js` runs Vite
// in middleware mode so the page and the /send proxy share a single port.
export default defineConfig(() => {
  return {
    // `npm run build --base-url=/tools/httpie` builds the page for that prefix.
    base: toViteBase(resolveBaseUrl()),
    // `npm run build --start-url=https://api.example.com` bakes in the URL a
    // fresh draft starts with; unset, the app falls back to its own origin.
    define: {
      __START_URL__: JSON.stringify(resolveStartUrl()),
    },
    plugins: [
      react(),
      // Substitutes `%APP_TITLE%` in index.html; runs on both serve and build.
      {
        name: 'app-title',
        enforce: 'pre',
        transformIndexHtml(html) {
          return html.replace(/%APP_TITLE%/g, APP_TITLE);
        },
      },
      // Writes dist/manifest.json describing the build: its base URL, entry
      // page and every shipped file with the URL it is served from.
      manifest({
        // `name` is omitted on purpose: it comes from package.json.
        entries: [
          {
            title: APP_TITLE,
            description: APP_DESCRIPTION,
            icons: [
              { file: 'favicon.svg', colorScheme: 'light' },
              { file: 'favicon.svg', colorScheme: 'dark' },
            ],
          },
        ],
      }),
    ],
    build: {
      // Emit the hashed JS/CSS next to index.html instead of into dist/assets/.
      assetsDir: '',
      rollupOptions: { input: { index: 'index.html' } },
    },
  };
});
