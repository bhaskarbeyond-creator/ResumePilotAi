/**
 * DIR-018 / AC-1 legacy-styling auditor.
 *
 * Counts Tailwind-style utility references and hardcoded hex colours in the
 * four in-scope billing surfaces so "purge all legacy styling" is a measured
 * number rather than an assertion.
 *
 * Usage: node .bridge/evidence/dir018-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILES = [
    'src/components/Billing/Plans/Plans.jsx',
    'src/components/Billing/Plans/Checkout.jsx',
    'src/components/Billing/Plans/PlansTable.jsx',
    'src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx',
];

/** Tailwind utility prefixes that constitute "legacy styling". */
const TW_PREFIX = '(?:bg|text|border|shadow|rounded|p[trblxy]?|m[trblxy]?|flex|grid|gap|gap-[xy]|w|h|space-[xy]|from|to|via|ring|inset|top|bottom|left|right|z|font|leading|tracking|opacity|backdrop|divide|placeholder)';
const TW_RE = new RegExp(`\\b${TW_PREFIX}-[a-z0-9/\\[\\]().:%-]+`, 'g');
/** Hex colours outside comments. */
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const uniqueCount = (arr) => new Set(arr).size;

const report = [];
let totalTailwind = 0;
let totalHex = 0;

for (const rel of FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
        report.push({ file: rel, missing: true });
        continue;
    }
    const raw = fs.readFileSync(abs, 'utf8');
    const code = stripComments(raw);
    const tw = code.match(TW_RE) || [];
    const hex = (code.match(HEX_RE) || []).filter((h) => h.length >= 4);
    totalTailwind += tw.length;
    totalHex += hex.length;
    report.push({
        file: rel,
        kb: +(raw.length / 1024).toFixed(1),
        lines: raw.split('\n').length,
        tailwindHits: tw.length,
        tailwindUnique: uniqueCount(tw),
        hexHits: hex.length,
        topTailwind: Object.entries(
            tw.reduce((a, t) => (a[t] = (a[t] || 0) + 1, a), {})
        ).sort((a, b) => b[1] - a[1]).slice(0, 12),
        hasCurrencyFormatImport: /currencyFormat/.test(raw),
        hasGstUtilsImport: /gstUtils|calculateGSTBreakdown/.test(raw),
        cubaTokenRefs: (code.match(/--cuba-[a-z-]+/g) || []).length,
        cubaBtnPrimary: (code.match(/cuba-btn-primary/g) || []).length,
        cubaBtnOutline: (code.match(/cuba-btn-outline/g) || []).length,
    });
}

const out = { generatedAt: new Date().toISOString(), totalTailwind, totalHex, report };
fs.writeFileSync(path.join(ROOT, '.bridge/evidence/dir018-audit.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));