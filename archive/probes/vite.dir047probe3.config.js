// @ts-check
/**
 * DIR-047 build-budget probe (TEMPORARY, measured then deleted).
 * Variant G: minify disabled. Isolates the render/minify pass.
 */
import base from './vite.config.js';

export default {
    ...base,
    build: { ...base.build, minify: false },
};
