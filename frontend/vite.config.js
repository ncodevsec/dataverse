import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    // Same-origin in development too: the browser talks to :5173 and Vite forwards /api to Express.
    proxy: { '/api': { target: process.env.VITE_DEV_API || 'http://localhost:4310', changeOrigin: false } },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
