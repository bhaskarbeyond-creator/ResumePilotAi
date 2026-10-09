// @ts-check
/**
 * DIR-070 probe build.
 *
 * Builds a static harness that mounts the REAL SmartResumeComposer so the Page-1
 * void / footer-overlap invariants can be measured in a real Chromium DOM. The
 * output is served by XAMPP (Apache) — the probe never spawns a server.
 */
import path from 'node:path';
import base from './vite.config.js';

export default {
    ...base,
    // Relative asset URLs so the build works from any Apache sub-path.
    base: './',
    build: {
        ...base.build,
        outDir: 'template-lab/dir070-dist',
        emptyOutDir: true,
        rollupOptions: {
            ...(base.build?.rollupOptions || {}),
            input: path.resolve(process.cwd(), 'template-lab/dir070-harness.html'),
        },
    },
};
