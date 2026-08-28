import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execFileSync } from 'node:child_process';

function sourceBuildSha() {
    const configured = String(process.env.VITE_BUILD_SHA || process.env.COMMIT_SHA || '').trim();
    if (/^[0-9a-f]{40}$/i.test(configured)) return configured;
    try {
        const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        return /^[0-9a-f]{40}$/i.test(sha) ? sha : 'unknown';
    } catch (_) {
        return 'unknown';
    }
}

// Put the tested source SHA in HTML metadata, not executable inline JavaScript.
// The live identity runner can therefore detect a stale CDN bundle without
// weakening the application's CSP.
function buildIdentityPlugin() {
    return {
        name: 'resumepilot-build-identity',
        transformIndexHtml(html) {
            const sha = sourceBuildSha();
            return html.replace('</head>', `    <meta name="build-sha" data-build-sha="${sha}" content="${sha}" />\n  </head>`);
        },
    };
}

// Build-time architecture guard: Firebase Auth and app-core modules are
// retained, but importing any Firebase data-product implementation aborts the
// production build. App core carries registry-name strings for optional
// products, so module provenance—not incidental string constants—is decisive.
function firebaseAuthOnlyBundlePlugin() {
    const forbiddenModule = /(?:^|[\\/])@firebase[\\/](?:firestore|database|storage|functions|analytics|messaging|remote-config|data-connect|app-check)(?:[\\/]|$)|[\\/]firebase[\\/](?:firestore|database|storage|functions|analytics|messaging)(?:[.\\/]|$)/i;
    return {
        name: 'resumepilot-firebase-auth-only',
        generateBundle(_options, bundle) {
            const offenders = new Set();
            for (const output of Object.values(bundle)) {
                if (output.type !== 'chunk') continue;
                for (const moduleId of Object.keys(output.modules || {})) {
                    if (forbiddenModule.test(moduleId)) offenders.add(moduleId);
                }
            }
            if (offenders.size) {
                this.error(`Firebase application-data modules are forbidden:\n${[...offenders].join('\n')}`);
            }
        },
    };
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [tailwindcss(), react(), buildIdentityPlugin(), firebaseAuthOnlyBundlePlugin()],
    build: {
        rollupOptions: {
            input: {
                main: 'index.html',
                lab: 'template-lab/index.html',
            },
            output: {
                entryFileNames: 'assets/index-[hash].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
            },
        },
    },
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
        host: true,
        allowedHosts: true, // Arena/live-preview hosts are dynamic; this affects the development server only.
        port: 3000,
        strictPort: false,   // Allow fallback to other ports if 5173 is busy
        historyApiFallback: true,
        proxy: {
            '/api': {
                target: process.env.VITE_DEV_BACKEND_URL || 'http://localhost:8080',
                changeOrigin: false,
            },
        },
    },
});
