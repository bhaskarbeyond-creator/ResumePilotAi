import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * DIR-088 — Resume Builder tokenisation scorer.
 *
 * The directive asks to lift the builder from 4.3/10 to >= 9.0/10 and to eradicate the
 * legacy hardcoded colour utilities. A rating nobody can reproduce is worthless, so this
 * module MEASURES the module using the same derived formula DIR-087 used for the suite, and
 * is imported by tests/dir088-resume-builder-mastery.test.mjs so the target is enforced
 * rather than asserted.
 *
 * Run directly to print the current report:
 *     node .bridge/evidence/dir088-builder-score.mjs
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILDER_DIR = path.join(ROOT, 'src/components/BuildResume');

/** Legacy Tailwind colour families. A superset of the DIR-082 counter, same as DIR-087. */
export const LEGACY_COLOUR =
    /\b(?:bg|text|border|from|to|via|ring|divide|placeholder|shadow|outline|fill|stroke|decoration|accent|caret)-(?:slate|gray|grey|zinc|neutral|stone|blue|indigo|rose|purple|violet|fuchsia|pink|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky)(?:-\d{2,3})?\b/g;

export const CUBA_CLASS = /\bcuba-[a-z0-9-]+\b/g;
const BREAKPOINT = /\b(?:sm|md|lg|xl|2xl):/g;

export const listBuilderFiles = (dir = BUILDER_DIR) => {
    const out = [];
    const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const abs = path.join(d, entry.name);
            if (entry.isDirectory()) walk(abs);
            else if (/\.(jsx?|css)$/.test(entry.name)) out.push(abs);
        }
    };
    walk(dir);
    return out.sort();
};

const count = (source, re) => (source.match(re) || []).length;

/** Per-file measurement. */
export const measureBuilder = (dir = BUILDER_DIR) =>
    listBuilderFiles(dir).map((abs) => {
        const source = fs.readFileSync(abs, 'utf8');
        const breakpoints = new Set((source.match(BREAKPOINT) || []).map((b) => b.slice(0, -1)));
        return {
            file: path.relative(ROOT, abs).replace(/\\/g, '/'),
            lines: source.split('\n').length,
            legacyColours: count(source, LEGACY_COLOUR),
            cubaClasses: count(source, CUBA_CLASS),
            breakpoints: breakpoints.size,
            hasLoadingUi: /CubaSkeleton|animate-pulse|animate-spin/.test(source),
            hasEmptyUi: /CubaEmptyState|length\s*===\s*0|\bisEmpty\b/.test(source),
            hasErrorUi: /CubaErrorState|role="alert"|role='alert'/.test(source),
        };
    });

/**
 * Module-level score, derived exactly like DIR-087:
 *   score = 10 * (0.50*tokenAdoption + 0.25*responsive + 0.25*guards)
 * Module-wide, so a single huge legacy file cannot hide behind many clean ones.
 */
export const scoreBuilder = (rows = measureBuilder()) => {
    const legacyColours = rows.reduce((n, r) => n + r.legacyColours, 0);
    const cubaClasses = rows.reduce((n, r) => n + r.cubaClasses, 0);

    const tokenTotal = cubaClasses + legacyColours;
    const tokenAdoption = tokenTotal === 0 ? 0 : cubaClasses / tokenTotal;

    const withBreakpoints = rows.filter((r) => r.breakpoints >= 3).length;
    const responsive = rows.length === 0 ? 0 : withBreakpoints / rows.length;

    const guardSlots = rows.length * 3;
    const guards = guardSlots === 0
        ? 0
        : rows.reduce((n, r) => n + (r.hasLoadingUi ? 1 : 0) + (r.hasEmptyUi ? 1 : 0) + (r.hasErrorUi ? 1 : 0), 0) / guardSlots;

    const value = 10 * (0.5 * tokenAdoption + 0.25 * responsive + 0.25 * guards);
    return {
        score: Math.round(value * 10) / 10,
        legacyColours,
        cubaClasses,
        tokenAdoption: Math.round(tokenAdoption * 1000) / 1000,
        responsive: Math.round(responsive * 1000) / 1000,
        guards: Math.round(guards * 1000) / 1000,
        files: rows.length,
    };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const rows = measureBuilder();
    const summary = scoreBuilder(rows);
    const worst = [...rows].sort((a, b) => b.legacyColours - a.legacyColours).filter((r) => r.legacyColours > 0);
    console.log(JSON.stringify({ ...summary, worst }, null, 2));
}
