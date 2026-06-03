import { defineConfig } from 'vite';

// Static, dependency-bundled build so the game can be hosted anywhere
// (GitHub Pages, itch.io, any static host) with no runtime CDN needs.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
