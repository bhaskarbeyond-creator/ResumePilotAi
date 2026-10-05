// @ts-check
/**
 * DIR-047 build-budget variant probe (TEMPORARY -- measured, then deleted).
 * Variant NO_CSS_MINIFY: isolates stylesheet minification cost.
 */
import base from './vite.config.js';
export default { ...base, build: { ...base.build, cssMinify: false } };