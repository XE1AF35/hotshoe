import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the app from /hotshoe/. BASE_PATH lets another host or a custom domain use
// its own path, so moving hosts is a config change.
const base = process.env.BASE_PATH ?? '/hotshoe/';

// The dark background, also used for the status bar and splash screen when installed.
const dark = '#0c0a09';

// GitHub Pages cannot send response headers, so the policy ships as a meta tag.
// Directives are added as features need them (map tiles, workers).
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // WebKit sets an inline style attribute on <select> when its value changes, and reports a
  // violation without this. Style attributes cannot run script or select elements, and any url()
  // in one is still limited by img-src; <style> elements stay blocked by style-src above.
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Build only: the dev server relies on inline scripts for hot reload.
function contentSecurityPolicyMeta(): Plugin {
  return {
    name: 'hotshoe:csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until the person chooses to reload (src/app/UpdatePrompt.tsx).
      registerType: 'prompt',
      // Registered from app code through the React hook, so there is no inline script.
      injectRegister: false,
      // Escape hatch: a build with PWA_SELF_DESTROY=true ships a worker that removes itself,
      // should a broken one ever be published.
      selfDestroying: process.env.PWA_SELF_DESTROY === 'true',
      manifest: {
        id: base,
        name: 'Hotshoe',
        short_name: 'Hotshoe',
        description: 'Log where you took a photo, offline, for geotagging later.',
        lang: 'en-NZ',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: dark,
        background_color: dark,
        // Made from public/favicon.svg (see pwa-assets.config.js).
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Prefixes every cache name, so caches never clash with other apps on the same origin.
        cacheId: 'hotshoe',
        // Everything is precached so the whole app works offline after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        cleanupOutdatedCaches: true,
      },
    }),
    contentSecurityPolicyMeta(),
  ],
  test: {
    restoreMocks: true,
    projects: [
      {
        // Logic and database tests. Node's Blob survives IndexedDB's structured clone.
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['src/test/setup-indexeddb.ts'],
        },
      },
      {
        // Component tests.
        extends: true,
        test: {
          name: 'dom',
          include: ['src/**/*.test.tsx'],
          environment: 'happy-dom',
          setupFiles: ['src/test/setup-indexeddb.ts', 'src/test/setup-dom.ts'],
        },
      },
    ],
  },
});
