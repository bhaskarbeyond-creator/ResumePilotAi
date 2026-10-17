// @ts-check
/**
 * DIR-047 build-budget probe (TEMPORARY, measured then deleted).
 * Variant H: alias the 16 locale JSON imports to tiny stand-ins so the 1.88 MB
 * of locale payloads never enter the module graph. Isolates the JSON->JS
 * transform + minify cost of shipping all 16 locales as real JS chunks.
 */
import path from 'node:path';
import base from './vite.config.js';

const STUB = path.resolve('scripts/dir047-locale-stub.js');

export default {
    ...base,
    resolve: {
        ...base.resolve,
        alias: [
            { find: /[\\/]src[\\/]locales[\\/][a-z-]+[\\/][a-z-]+\.json$/, replacement: STUB },
        ],
    },
};
