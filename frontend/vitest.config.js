import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', environmentOptions: { jsdom: { url: 'http://localhost:4310/' } }, testTimeout: 20000, include: ['tests/**/*.test.jsx'] },
});
