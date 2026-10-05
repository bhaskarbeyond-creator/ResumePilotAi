// @ts-check
/** DIR-047 probe (TEMPORARY). Variant I: no Tailwind plugin. */
import base from './vite.config.js';
export default { ...base, plugins: base.plugins.filter((p) => p.name !== 'tailwindcss') };
