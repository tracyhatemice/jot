import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // sqlite-wasm loads its .wasm relative to its own module, so it must not be pre-bundled.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
  },
});
