// @ts-check
/**
 * DIR-047 build-budget probe (TEMPORARY -- measured, then removed).
 * Variant TAILWIND_SCOPED_SOURCES: Tailwind v4 has no tailwind.config.js, so it
 * AUTO-DETECTS sources by walking the whole project. The CPU profile attributes
 * 1526ms (35% of the entire build) to @tailwindcss/vite, and the repo holds
 * ~20k non-src files (backend 9305, dashboardTemplate 10867, .bridge 859,
 * crawl-artifacts 819) that can never contribute a class to the production
 * bundle, because build.rollupOptions.input is the single index.html entry and
 * its whole graph lives under src/.
 *
 * `source(none)` disables auto-detection, and the two @source directives
 * re-register exactly what the production graph can reach: src/ and the root
 * index.html. Nothing that is currently shipped can lose a utility; only
 * utilities that were being generated for never-published files disappear.
 */
import base from './vite.config.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// On Windows `path.resolve()` yields `D:\...`; Vite's alias resolver only accepts a
// POSIX-absolute (`/D:/...`) or file-URL form. Without the leading slash it treats
// the drive letter as RELATIVE, silently emits a non-fatal warning and then aborts
// the build with "rewrote ./tailwind.css ... but was not an absolute path".
const PROBE_CSS = fileURLToPath(new URL('./src/tailwind.dir047probe.css', import.meta.url)).replace(/\\/g, '/');

export default {
    ...base,
    resolve: {
        ...base.resolve,
        alias: [
            ...(Array.isArray(base.resolve?.alias) ? base.resolve.alias : []),
            {
                // Anchor on the FULL specifier. An unanchored /(tailwind\.css)$/ also
                // matches the tail of `./tailwind.css`, so the alias replaced only
                // `/tailwind.css` and left the leading `.` glued onto the drive letter,
                // producing the invalid path `.D:/...` (os error 123). Anchoring with
                // `^\.\/` rewrites the entire specifier.
                find: /^\.\/tailwind\.css$/,
                replacement: PROBE_CSS,
            },
        ],
    },
};
