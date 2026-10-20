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
    port: 4000,
    strictPort: false,
    // Host/origin allowlist is a Vite guard for *other* people's websites
    // pointing DNS at a developer's machine. Sandbox live-preview hosts are
    // dynamic (https://{port}-{sandboxId}.e2b.app) and are proxied by the
    // platform, so the dev server must accept them or the preview iframe is
    // rejected with 403. This affects the dev server only — never a build.
    host: true,
    allowedHosts: true,
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
