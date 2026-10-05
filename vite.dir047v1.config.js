// @ts-check
/**
 * DIR-047 build-budget probe (TEMPORARY -- measured, then deleted).
 * Variant LIGHTNING_CSS: routes stylesheet minification through the lightningcss
 * binary that already ships as a Vite dependency, instead of letting Vite fall
 * back to its JS minifier for CSS. Attributes the stylesheet-minify cost.
 */
import base from './vite.config.js';

export default {
    ...base,
    build: { ...base.build, cssMinify: 'lightningcss' },
};