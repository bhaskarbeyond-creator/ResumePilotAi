import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  envDir: '..',
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': import.meta.dirname + '/src',
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app'],
    port: 4000,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_BACKEND_URL || 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
  preview: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        engineHarness: resolve(import.meta.dirname, 'tests/harness/engine.html'),
      },
    },
  },
});

