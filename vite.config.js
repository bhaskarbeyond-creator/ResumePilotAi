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

function discoveryProxyPlugin() {
    return {
        name: 'dynamic-discovery-proxy',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const url = req.url?.split('?')[0];
                if (url === '/sitemap.xml' || url === '/llms.txt' || url === '/llms-full.txt') {
                    try {
                        const backendUrl = (process.env.VITE_DEV_BACKEND_URL || 'http://localhost:8080') + req.url;
                        const backendRes = await fetch(backendUrl);
                        res.statusCode = backendRes.status;
                        backendRes.headers.forEach((val, key) => {
                            res.setHeader(key, val);
                        });
                        const body = await backendRes.arrayBuffer();
                        res.end(Buffer.from(body));
                        return;
                    } catch (_) {
                        next();
                    }
                } else {
                    next();
                }
            });
        },
    };
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [tailwindcss(), react(), buildIdentityPlugin(), firebaseAuthOnlyBundlePlugin(), discoveryProxyPlugin()],
    build: {
        // Gzip-size reporting adds a post-build pass over the multi-entry bundle;
        // omit that diagnostic work without changing emitted production assets.
        reportCompressedSize: false,
        rollupOptions: {
            // DIR-047 (build budget): the production bundle is a SINGLE entry.
            //
            // `template-lab/index.html` used to be a second Rollup input, so every
            // production build bundled the Template Forensic Lab as a public page.
            // That was never needed in production, and it cost real build time:
            // dropping it measurably reduced the bundling work.
            //
            // DO NOT READ THIS AS "THE 4000ms BAR IS MET". It is not, and an earlier
            // revision of this comment said it was, which is exactly the kind of claim
            // that gets a failing invariant certified by mistake. The authoritative
            // measurement is the wall clock of the REAL `npm run build`, taken by
            // scripts/dir047-build-budget.mjs, because that is what the [SWOT-S]
            // "production build under 4.0s" invariant actually governs. Its latest run
            // (.bridge/evidence/dir047-build-budget.json) records median 4688ms with
            // all 7 cold-cache runs over budget (min 4139ms) and verdict FAIL.
            //
            // The 3803ms figure an earlier comment cited here is a `vite build`-only
            // number. scripts/dir047-build-variants.mjs carries an explicit caveat that
            // such numbers "must never be quoted as the budget", because they exclude
            // the npm/node process-spawn layer.
            //
            // WHERE THE REMAINING OVERAGE ACTUALLY SITS: the bundling work is already
            // inside budget (~3.4-3.8s vite-reported). The overage is Windows process
            // startup and module resolution, measured at 691ms for a direct vite-bin
            // launch and 955ms for `npm run build`
            // (.bridge/evidence/dir047-build-attribution.json). The launcher A/B in
            // .bridge/evidence/dir047-build-launcher-ab.json confirms removing the
            // cmd.exe layer and the vite.cmd bin shim saves ~835ms but still lands at a
            // 4381ms median, so it records treatmentUnderBudget: false. Closing the last
            // ~381ms needs a further reduction in bundle/transform work, not a
            // favourable re-run of the harness.
            //
            // It is also a security improvement, not merely a speed one. The lab is a
            // developer harness that renders internal fixtures, a cross-app audit
            // view and the interview-coach surface with no application chrome; as a
            // second build entry it was emitted into dist/ and therefore published to
            // the production webroot by scripts/deploy-ime365-live.mjs, which tars
            // the whole of dist. Keeping it out of production keeps those internal
            // fixtures out of the shipped artifact.
            //
            // NOTHING IS LOST FOR TESTING: every template-lab consumer
            // (template-lab/gate.mjs, visual-regression.mjs, audit.mjs, and the
            // browser suites in tests/) drives a Vite DEV server and requests
            // `/template-lab/*.html` from it. The dev server serves those pages from
            // the project root regardless of `build.rollupOptions.input`, so the
            // lab remains fully reachable for its intended use. Only the copy that
            // was being published to production is gone.
            input: {
                main: 'index.html',
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
        // Live-stack Playwright suites (e.g. playwright.dir013.config.js) write
        // their artifacts and reporter output INSIDE the project root. The dev
        // watcher treated every one of those writes as a source change and issued
        // a full `page reload`, which reset the running app mid-test (DIR-013
        // proved it: the interview mode silently reverted to its default, so the
        // canvas never mounted and the session assertion could not be reached).
        // These directories hold test output only and are never part of the
        // application module graph, so excluding them from the watcher is
        // behaviour-preserving for the app and removes the flake for every
        // live-stack suite.
        watch: {
            ignored: [
                '**/.bridge/**',
                '**/test-results/**',
                '**/crawl-artifacts/**',
                '**/artifacts/**',
                '**/playwright-report/**',
                '**/backups/**',
            ],
        },
        proxy: {
            '/api': {
                target: process.env.VITE_DEV_BACKEND_URL || 'http://localhost:8080',
                changeOrigin: false,
            },
            // These discovery resources are backend-owned and MariaDB-backed;
            // keeping the browser URL same-origin lets live Playwright/preview
            // traffic exercise the same endpoints without localhost calls.
            '/llms.txt': {
                target: process.env.VITE_DEV_BACKEND_URL || 'http://localhost:8080',
                changeOrigin: false,
            },
            '/llms-full.txt': {
                target: process.env.VITE_DEV_BACKEND_URL || 'http://localhost:8080',
                changeOrigin: false,
            },
            '/sitemap.xml': {
                target: process.env.VITE_DEV_BACKEND_URL || 'http://localhost:8080',
                changeOrigin: false,
            },
        },
    },
});
