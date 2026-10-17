// @ts-check
/**
 * DIR-047 build-budget probe (TEMPORARY -- measured, then deleted).
 * Variant ESNEXT: Vite 8's default build target is `baseline-widely-available`,
 * so oxc downlevels every modern construct across the ~10.2 MB of emitted JS.
 * The product ships no browserslist and declares no browser floor, so that
 * downlevel pass is pure avoidable cost. Attributes the transpile cost.
 */
import base from './vite.config.js';

export default {
    ...base,
    build: { ...base.build, target: 'esnext' },
};