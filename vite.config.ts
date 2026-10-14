import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from https://<user>.github.io/hotshoe/ on GitHub Pages.
const base = '/hotshoe/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
});
