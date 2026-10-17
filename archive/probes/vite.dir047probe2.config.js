// @ts-check
/**
 * DIR-047 build-budget probe (TEMPORARY -- measured, then deleted).
 * Variant SINGLE_ENTRY: asserts the current single-entry `input` in
 * vite.config.js is genuinely what keeps the Template Forensic Lab out of the
 * production bundle. Attribution-only control for the change already applied.
 */
import base from './vite.config.js';

export default {
    ...base,
    build: {
        ...base.build,
        rollupOptions: {
            ...base.build.rollupOptions,
            input: { main: 'index.html' },
        },
    },
};