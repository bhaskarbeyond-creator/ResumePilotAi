import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
  build: {
    sourcemap: true,
  },
});
