import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the app from /hotshoe/. BASE_PATH lets another host or a custom domain use
// its own path, so moving hosts is a config change.
const base = process.env.BASE_PATH ?? '/hotshoe/';

// GitHub Pages cannot send response headers, so the policy ships as a meta tag.
// Directives are added as features need them (map tiles, workers).
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
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
  plugins: [react(), tailwindcss(), contentSecurityPolicyMeta()],
  test: {
    restoreMocks: true,
    projects: [
      {
        // Logic and database tests. Node's Blob survives IndexedDB's structured clone.
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        // Component tests.
        extends: true,
        test: {
          name: 'dom',
          include: ['src/**/*.test.tsx'],
          environment: 'happy-dom',
          setupFiles: ['src/test/setup-dom.ts'],
        },
      },
    ],
  },
});
