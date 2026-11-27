import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  // 'vite preview' serves the production build; the same proxy lets it talk to the local API (used for Lighthouse runs).
  preview: { port: 4173, proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } } },
  // Scan every lazily loaded page up front so the dev server never re-optimises dependencies (and reloads the page) mid-test.
  optimizeDeps: { entries: ['index.html', 'src/pages/**/*.tsx'] },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
  },
});
