import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * DIR-089 — Settings & 2FA tokenisation scorer.
 *
 * Measures the Settings hub with the same derived formula DIR-087 and DIR-088 used, so the
 * directive's 3.7 to 9.0 target is MEASURED rather than asserted. Imported by
 * tests/dir089-settings-security-mastery.test.mjs.
 *
 * Run: node .bridge/evidence/dir089-settings-score.mjs
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = 'src/components/Dashboard/DashboardSettings/DashboardSettings.jsx';

/** Same superset counter as DIR-087/088 so the figures are comparable across directives. */
export const LEGACY_COLOUR =
    /\b(?:bg|text|border|from|to|via|ring|divide|placeholder|shadow|outline|fill|stroke|decoration|accent|caret)-(?:slate|gray|grey|zinc|neutral|stone|blue|indigo|sky|cyan|purple|violet|fuchsia|green|emerald|lime|teal|amber|yellow|orange|red|rose|pink)(?:-\d{2,3})?\b/g;

export const CUBA_CLASS = /\bcuba-[a-z0-9-]+\b/g;
const BREAKPOINT = /\b(?:sm|md|lg|xl|2xl):/g;

export const readSettings = () => fs.readFileSync(path.join(ROOT, FILE), 'utf8');

export const measureSettings = () => {
    const source = readSettings();
    return {
        file: FILE,
        lines: source.split('\n').length,
        legacyColours: (source.match(LEGACY_COLOUR) || []).length,
        cubaClasses: (source.match(CUBA_CLASS) || []).length,
        breakpoints: new Set((source.match(BREAKPOINT) || []).map((b) => b.slice(0, -1))).size,
        hasLoadingUi: /CubaSkeleton|animate-pulse|animate-spin/.test(source),
        hasEmptyUi: /CubaEmptyState|length\s*===\s*0|\bisEmpty\b/.test(source),
        hasErrorUi: /CubaErrorState|role="alert"|role='alert'/.test(source),
        hasDensityProvider: /CubaDensityProvider/.test(source),
        hasTotp: /totpStatus|totpSetupStep/.test(source),
        hasBackupCodes: /backupCode/.test(source),
    };
};

/** score = 10 * (0.50*tokenAdoption + 0.25*responsive + 0.25*guards) — identical to DIR-087/088. */
export const scoreSettings = (row = measureSettings()) => {
    const tokenTotal = row.cubaClasses + row.legacyColours;
    const tokenAdoption = tokenTotal === 0 ? 0 : row.cubaClasses / tokenTotal;
    const responsive = Math.min(row.breakpoints, 5) / 5;
    const guards = ((row.hasLoadingUi ? 1 : 0) + (row.hasEmptyUi ? 1 : 0) + (row.hasErrorUi ? 1 : 0)) / 3;
    const value = 10 * (0.5 * tokenAdoption + 0.25 * responsive + 0.25 * guards);
    return {
        score: Math.round(value * 10) / 10,
        legacyColours: row.legacyColours,
        cubaClasses: row.cubaClasses,
        tokenAdoption: Math.round(tokenAdoption * 1000) / 1000,
        responsive: Math.round(responsive * 1000) / 1000,
        guards: Math.round(guards * 1000) / 1000,
    };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    console.log(JSON.stringify({ ...scoreSettings(), ...measureSettings() }, null, 2));
}
