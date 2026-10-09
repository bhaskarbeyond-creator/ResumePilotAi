/**
 * DIR-068 — final production release seal.
 *
 * Generates `.bridge/CERTIFIED_FREEZE_MANIFEST.json` from the authority: the
 * `.bridge/directives/DIR-*.json` records. Every APPROVED_FROZEN directive is
 * listed with its freezeHash, evidence hash and certification provenance, the
 * sealed source artifacts are hashed, and the router census is embedded.
 *
 * WHY THE COUNTS ARE STATED HONESTLY
 *   The directive asks for a manifest "documenting all 68 certified baselines",
 *   but the on-disk record set is the only authority. This writes the REAL
 *   counts (records on disk / frozen / with a freezeHash) alongside the
 *   directive's asserted number instead of fabricating 68 entries.
 *
 * Pure Node — no child_process, no detached server, no Windows tooling.
 *
 * Usage: node scripts/generate-certified-freeze-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIRECTIVES = path.join(ROOT, '.bridge', 'directives');
const MANIFEST = path.join(ROOT, '.bridge', 'CERTIFIED_FREEZE_MANIFEST.json');
const CENSUS = path.join(ROOT, '.bridge', 'evidence', 'dir047-route-census.json');

const sha256 = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
};

// The source artifacts sealed by this release (the deliverables of DIR-064..067
// plus the frozen-baseline entry points).
const SEALED_ARTIFACTS = [
    'index.html',
    'src/main.jsx',
    'src/styles/cuba-print.css',
    'src/components/Exporter/Exporter.jsx',
    'src/utils/exportDownloader.js',
    'src/engine/hybrid/smartPartitioner.js',
    'src/engine/hybrid/smartEngine.css',
    'src/engine/hybrid/SmartResumeComposer.jsx',
    'src/components/EmployerPortal/EmployerApplicantPipeline.jsx',
    'src/components/Dashboard/EmployerDashboard/JobApplicationsModal.jsx',
    'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx',
    'src/components/BuildResume/BuildResume.jsx',
    'backend/index.js',
    'backend/services/docxExport.js',
    'template-lab/regenerate-previews.mjs',
    'template-lab/freshness-probe.mjs',
    'template-lab/census-probe.mjs',
];

const records = fs.readdirSync(DIRECTIVES)
    .filter((f) => /^DIR-\d{3}\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIRECTIVES, f), 'utf8')));

const frozen = records.filter((r) => r.status === 'APPROVED_FROZEN');
const baselines = frozen.map((r) => ({
    id: r.id,
    title: r.title,
    priority: r.priority,
    certifiedAt: r.freeze?.certifiedAt || null,
    freezeHash: r.freeze?.freezeHash || null,
    evidenceHash: r.freeze?.evidenceHash || r.evidence?.manifestHash || null,
    certificationKind: r.freeze?.certificationKind || 'unknown',
    automated: r.freeze?.automated === true,
})).sort((a, b) => a.id.localeCompare(b.id));

let routeCensus = null;
if (fs.existsSync(CENSUS)) {
    try { routeCensus = JSON.parse(fs.readFileSync(CENSUS, 'utf8')); } catch { routeCensus = null; }
}

// The caller passes the frozen-baseline cleanliness so this script never shells out.
// DIR-071 re-scopes the frozen artifact: the freeze covers the 55 TEMPLATE MODULES
// (cv1..cv51, cover1..cover4), which is what "src/cv-templates frozen" has always
// meant in practice. `templateUtils.js` is a SHARED UTILITY that a directive may
// legitimately change (DIR-071 enforces photo-visibility suppression there), so its
// diff is recorded separately and does NOT define template cleanliness.
const cvDiffLines = process.env.CV_TEMPLATE_DIRS_DIFF_LINES
    ?? process.env.CV_TEMPLATES_DIFF_LINES;
const templateUtilsDiffLines = process.env.CV_TEMPLATE_UTILS_DIFF_LINES;

const existing = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const manifest = {
    ...existing,
    version: '4.0.0',
    status: 'FROZEN_AND_CERTIFIED',
    certifiedAt: new Date().toISOString(),
    releaseSeal: {
        generatedBy: 'scripts/generate-certified-freeze-manifest.mjs',
        directiveId: 'DIR-068',
        directiveCounts: {
            recordsOnDisk: records.length,
            approvedFrozen: frozen.length,
            withFreezeHash: frozen.filter((r) => r.freeze?.freezeHash).length,
            directiveAssertedBaselines: 68,
            note: 'The directive asserts 68 certified baselines; the on-disk directive records are the authority.',
        },
        routeCensus,
        frozenBaseline: {
            path: 'src/cv-templates',
            scope: 'the 55 template modules (cv1..cv51, cover1..cover4)',
            gitDiffLines: cvDiffLines === undefined ? null : Number(cvDiffLines),
            clean: cvDiffLines === undefined ? null : Number(cvDiffLines) === 0,
            // DIR-071: the shared utility is tracked explicitly rather than silently
            // widening the freeze. It may carry a directive's change and must be
            // reported, never hidden.
            sharedUtility: {
                path: 'src/cv-templates/templateUtils.js',
                gitDiffLines: templateUtilsDiffLines === undefined ? null : Number(templateUtilsDiffLines),
                changedByDirective: templateUtilsDiffLines === undefined ? null : Number(templateUtilsDiffLines) > 0,
            },
        },
        sealedArtifacts: SEALED_ARTIFACTS.map((rel) => ({ file: rel, exists: fs.existsSync(path.join(ROOT, rel)), sha256: sha256(rel) })),
    },
    certifiedBaselines: baselines,
};

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`[release-seal] wrote ${path.relative(ROOT, MANIFEST)}`);
console.log(`[release-seal] records=${records.length} frozen=${frozen.length} withFreezeHash=${frozen.filter((r) => r.freeze?.freezeHash).length}`);
console.log(`[release-seal] sealedArtifacts=${SEALED_ARTIFACTS.length} routeCensus=${routeCensus ? 'embedded' : 'missing'} cvTemplatesClean=${manifest.releaseSeal.frozenBaseline.clean}`);
