import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * STANDALONE=1 builds everything into a single HTML file with no service
 * worker — see scripts/build-standalone.mjs. The normal build is the PWA.
 */
const standalone = process.env.STANDALONE === '1';

export default defineConfig({
  plugins: [
    react(),
    ...(standalone
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
            manifest: {
              name: 'Styrketræning',
              short_name: 'Styrke',
              description: 'Log styrketræning og kropsudvikling. Alt data ligger lokalt.',
              lang: 'da',
              theme_color: '#0b0f14',
              background_color: '#0b0f14',
              display: 'standalone',
              orientation: 'portrait',
              start_url: '/',
              scope: '/',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              // The app makes no network calls of its own; only the shell is cached.
              navigateFallback: 'index.html',
            },
          }),
        ]),
  ],
  resolve: standalone
    ? {
        alias: {
          'virtual:pwa-register/react': fileURLToPath(
            new URL('./src/pwa-stub.ts', import.meta.url),
          ),
        },
      }
    : undefined,
  build: standalone
    ? {
        outDir: 'dist-standalone',
        cssCodeSplit: false,
        // One chunk, so the whole app can be inlined into one <script>.
        rollupOptions: { output: { inlineDynamicImports: true } },
      }
    : undefined,
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
