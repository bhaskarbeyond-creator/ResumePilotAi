// @ts-check
/**
 * DIR-047 build-budget remediation probe (TEMPORARY -- measured, then removed).
 * Variant ESNEXT_PLUS_LIGHTNING: the two candidate levers together, so the
 * sweep can tell whether their effects compose or overlap.
 */
import base from './vite.config.js';

export default {
    ...base,
    build: { ...base.build, cssMinify: 'lightningcss', target: 'esnext' },
};