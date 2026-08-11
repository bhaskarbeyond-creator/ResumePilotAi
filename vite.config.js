import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [tailwindcss(), react()],
    css: {
        preprocessorOptions: {
            scss: {
                // Ensure SASS files are processed correctly
                api: 'modern-compiler',
            },
        },
    },
    resolve: {
        // Add common extensions for better compatibility
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.scss', '.css'],
    },
    server: {
        host: true,  // Allow all hostnames including ai-resume-builder.local and localhost
        port: 3000,
        strictPort: false,   // Allow fallback to other ports if 5173 is busy
        historyApiFallback: true,
        proxy: {
            '/api/nvidia': {
                target: 'https://integrate.api.nvidia.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/nvidia/, ''),
            },
        },
    },
});
