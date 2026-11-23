import { defineConfig } from 'vite';

// base './' lets the same build run on GitHub Pages, itch.io and inside an Android app.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
