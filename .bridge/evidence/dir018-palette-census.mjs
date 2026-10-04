/**
 * DIR-018 / AC-1 colour-carrying utility enumerator.
 *
 * AC-1 (per Lead ruling) is scoped to PURGING LEGACY *PALETTE* REFERENCES, not to
 * banning every utility. The certified codebase convention (see
 * src/components/Dashboard/EmployerDashboard/JobApplicationsModal.jsx:322) is:
 *
 *     className="cuba-btn-primary px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1"
 *   ^ semantic token class        ^ neutral layout utilities, deliberately retained
 *
 * So this enumerator separates the two, and the residue metric in dir018-audit
 * must key on PALETTE classes + hex only.
 */
import fs from 'node:fs';
import path from 'node:path';

const FILES = [
    'src/components/Billing/Plans/Plans.jsx',
    'src/components/Billing/Plans/Checkout.jsx',
    'src/components/Billing/Plans/PlansTable.jsx',
    'src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx',
];

/** Tailwind's default palette families. A class is COLOUR iff it matches one. */
const PALETTE = new Set([
    'slate', 'gray', 'grey', 'zinc', 'neutral', 'stone',
    'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
    'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
    'fuchsia', 'pink', 'rose', 'white', 'black',
]);

/** Utility prefixes that accept a colour value. */
const COLOR_PREFIX = '(?:bg|text|border|ring|fill|stroke|divide|placeholder|decoration|outline|accent|caret|from|via|to|shadow)';

const COLOR_RE = new RegExp(`\\b${COLOR_PREFIX}-(${[...PALETTE].join('|')})(?:-\\d{2,3})?(?:/\\d{1,3})?\\b`, 'g');
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
/** Already-tokenised classes must not be double-counted. */
const CUBA_RE = /\b(?:bg|text|border|ring|fill|stroke|divide|from|via|to|shadow)-cuba-[a-z-]+/g;

const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const tally = (arr) => arr.reduce((a, t) => (a[t] = (a[t] || 0) + 1, a), {});

const allColour = {};
const allHex = {};
let totalColour = 0;
let totalHex = 0;
const perFile = [];

for (const rel of FILES) {
    const abs = path.join(process.cwd(), rel);
    if (!fs.existsSync(abs)) { perFile.push({ file: rel, missing: true }); continue; }
    const code = stripComments(fs.readFileSync(abs, 'utf8'));

    // Remove already-migrated cuba utilities before scanning, so a class such as
    // `text-cuba-ink` can never be mis-read as palette `text-slate-*`.
    const scrubbed = code.replace(CUBA_RE, (m) => ' '.repeat(m.length));

    const colour = scrubbed.match(COLOR_RE) || [];
    const hex = (scrubbed.match(HEX_RE) || []).filter((h) => h.length >= 4);

    // NOTE: do not chain `.forEach` off `tally(...)` -- it returns a plain object,
    // so a `.forEach` guard would short-circuit and silently drop every key.
    for (const [k, v] of Object.entries(tally(colour))) allColour[k] = (allColour[k] || 0) + v;
    hex.forEach((h) => { allHex[h] = (allHex[h] || 0) + 1; });
    totalColour += colour.length;
    totalHex += hex.length;

    perFile.push({
        file: rel,
        colourHits: colour.length,
        colourUnique: new Set(colour).size,
        hexHits: hex.length,
        cubaUtilities: (code.match(CUBA_RE) || []).length,
    });
}

const sortObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));

console.log('PER FILE:', JSON.stringify(perFile, null, 2));
console.log('\nTOTAL colour-bearing legacy utilities:', totalColour);
console.log('TOTAL hardcoded hex:', totalHex);
console.log('\nDISTINCT COLOUR CLASSES:', Object.keys(allColour).length);
console.log(JSON.stringify(sortObj(allColour), null, 1));
console.log('\nDISTINCT HEX:', Object.keys(allHex).length);
console.log(JSON.stringify(sortObj(allHex), null, 1));

fs.writeFileSync(
    path.join(process.cwd(), '.bridge/evidence/dir018-palette-census.json'),
    JSON.stringify({ totalColour, totalHex, colour: sortObj(allColour), hex: sortObj(allHex), perFile }, null, 2)
);