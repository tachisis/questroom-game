import { defineConfig } from 'vite';

// base: './' keeps every URL relative, so the built `dist/` works from any folder
// (GitHub Pages, a sub-path on a hosting, or just opened through a local server).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0
  }
});
