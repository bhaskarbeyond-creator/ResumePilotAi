// @ts-check
/**
 * DIR-047 build-budget variant probe (TEMPORARY -- measured, then deleted).
 * Variant NO_TAILWIND: drops the Tailwind plugin to isolate its scan+generate cost.
 */
import base from './vite.config.js';
export default { ...base, plugins: base.plugins.filter((p) => p.name !== 'tailwindcss') };