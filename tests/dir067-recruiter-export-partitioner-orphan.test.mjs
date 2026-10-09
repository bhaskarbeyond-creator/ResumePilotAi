/**
 * DIR-067 — recruiter export repair, adaptive partitioner orphan prevention,
 * and recruiter drawer layout polish.
 *
 * Pins the three mandates:
 *   1. the recruiter drawer exports REAL PDF/DOCX through the centralized client
 *      (the dead-end `.html` blob download is gone), backed by a published-only
 *      public DOCX route;
 *   2. the partitioner micro-compacts a minor overflow onto one page and never
 *      strands a single isolated row on the last page; and
 *   3. the cover letter is a distinct tabbed card, not a footer glued to the A4
 *      canvas.
 *
 * The heavy browser verification is executed by the template-lab probes and
 * archived under template-lab/evidence/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PIPELINE = 'src/components/EmployerPortal/EmployerApplicantPipeline.jsx';

const { partitionResumeContent } = await import(
    new URL('../src/engine/hybrid/smartPartitioner.js', import.meta.url).href
);

test('DIR-067 S1: the recruiter drawer exports real PDF/DOCX, never a raw .html file', () => {
    const src = read(PIPELINE);
    assert.match(src, /from '\.\.\/\.\.\/utils\/exportDownloader'/, 'must import the centralized client');
    assert.match(src, /downloadResumePdf\(/, 'must export a real PDF');
    assert.match(src, /downloadResumeDocx\(/, 'must export a real DOCX');
    assert.match(src, /endpoint: '\/api\/public-export'/, 'PDF must use the public export route');
    assert.match(src, /endpoint: '\/api\/public-export-docx'/, 'DOCX must use the public DOCX route');
    assert.match(src, /withAuth: false/, 'a recruiter has no owner session for a candidate resume');
    // The hand-rolled HTML artefact must be gone.
    assert.doesNotMatch(src, /resume\.html/, 'the raw .html download must be gone');
    assert.doesNotMatch(src, /URL\.createObjectURL/, 'no hand-rolled blob download may remain');
});

test('DIR-067 S2: the drawer exposes distinct PDF and Word buttons with loading + error states', () => {
    const src = read(PIPELINE);
    assert.match(src, /onClick=\{handleDownloadPdf\}/, 'a PDF button must exist');
    assert.match(src, /onClick=\{handleDownloadDocx\}/, 'a Word button must exist');
    assert.match(src, /aria-label="Download candidate resume as PDF"/, 'the PDF button needs an aria-label');
    assert.match(src, /aria-label="Download candidate resume as Word DOCX"/, 'the Word button needs an aria-label');
    assert.match(src, /exportBusy === 'pdf' \? 'Preparing…'/, 'the PDF button needs a loading label');
    assert.match(src, /exportBusy === 'docx' \? 'Preparing…'/, 'the Word button needs a loading label');
    assert.match(src, /role="alert"/, 'an export failure must be surfaced');
});

test('DIR-067 S3: the cover letter is a tabbed card, decoupled from the A4 canvas', () => {
    const src = read(PIPELINE);
    assert.match(src, /role="tablist"/, 'a tablist must exist');
    assert.match(src, /role="tab"/, 'tabs must exist');
    assert.match(src, /aria-selected=\{drawerTab === tab\.id\}/, 'tabs must expose selection');
    assert.match(src, /aria-controls=\{`recruiter-panel-\$\{tab\.id\}`\}/, 'tabs must point at their panels');
    assert.match(src, /id="recruiter-panel-cover"/, 'the cover letter must be its own panel');
    // Keyboard operability.
    assert.match(src, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/, 'tabs must be keyboard navigable');
    // The glued footer is gone; the cover letter lives in a distinct card.
    assert.doesNotMatch(src, /<footer className="max-h-40 overflow-y-auto border-t/, 'the glued cover-letter footer must be gone');
    assert.match(src, /rounded-xl border border-slate-200 bg-white p-6 shadow-sm/, 'the cover letter needs its own card container');
});

test('DIR-067 S4: the backend public DOCX route is published-only and rate-limited', () => {
    const src = read('backend/index.js');
    assert.match(src, /app\.post\('\/api\/public-export-docx'/, 'the public DOCX route must exist');
    assert.match(src, /'\/api\/public-export-docx'\]/, 'the public DOCX route must be rate-limited');
    const at = src.indexOf("app.post('/api/public-export-docx'");
    const route = src.slice(at, at + 3400);
    assert.match(route, /repo\.getPublicResume/, 'authorization must come from the publication row');
    assert.match(route, /isPublished !== true/, 'only published resumes may be exported');
    assert.match(route, /publicationMode !== 'explicit'/, 'only explicitly published resumes may be exported');
    // No owner session is trusted on this route.
    assert.doesNotMatch(route, /req\.user\.uid/, 'the public route must not trust an owner session');
    assert.match(route, /EXPORTABLE_TEMPLATE/, 'the template must be validated');
    assert.match(route, /resolveExportTemplate/, 'template identity must be resolved server-side');
    assert.match(route, /createResumeDocx/, 'the public route must reuse the DOCX builder');
});

test('DIR-067 S5: the partitioner exposes a reusable packer, compaction and an orphan guard', () => {
    const src = read('src/engine/hybrid/smartPartitioner.js');
    assert.match(src, /const packSections = \(sectionGapPx\)/, 'the packer must be re-runnable');
    assert.match(src, /COMPACT_SECTION_GAP_PX = 11/, 'the compact rhythm must be 11px');
    assert.match(src, /MINOR_OVERFLOW_PX = 60/, 'a minor overflow must be <=60px');
    assert.match(src, /const applyOrphanGuard = /, 'an orphan guard must exist');
    assert.match(src, /sectionGapPx: activeSectionGapPx/, 'the chosen rhythm must be returned');
    const composer = read('src/engine/hybrid/SmartResumeComposer.jsx');
    assert.match(composer, /'--smart-section-gap': `\$\{sectionGapPx\}px`/, 'the renderer must pin the packed rhythm');
});

// ── Functional sweeps over a deterministic profile space ─────────────────────

const SHORT_EMP = 'Delivered critical care to patients and coordinated multidisciplinary teams across a busy unit, mentoring new staff.';
const SHORT_PROJ = 'Built and shipped a standardised care bundle used across the unit.';

function* profileSpace() {
    for (const archetype of ['minimal-ats', 'modern-split']) {
        for (let nEmp = 0; nEmp <= 6; nEmp += 1) {
            for (let nProj = 0; nProj <= 8; nProj += 1) {
                for (let nCert = 0; nCert <= 10; nCert += 1) {
                    yield {
                        archetype,
                        values: {
                            firstname: 'Babu', lastname: 'M',
                            summary: 'Senior critical-care nurse with a decade of ICU experience.',
                            employments: Array.from({ length: nEmp }, (_, i) => ({
                                jobTitle: `Nurse ${i + 1}`, employer: `City Hospital ${i + 1}`, description: SHORT_EMP,
                            })),
                            projects: Array.from({ length: nProj }, (_, i) => ({
                                title: `Initiative ${i + 1}`, description: SHORT_PROJ, url: `https://github.com/babu/q${i + 1}`,
                            })),
                            certifications: Array.from({ length: nCert }, (_, k) => ({
                                title: ['CCRN', 'ACLS', 'BLS', 'PALS', 'TNCC'][k % 5], issuer: 'AACN', date: String(2005 + k),
                            })),
                        },
                    };
                }
            }
        }
    }
}

test('DIR-067 S6 (functional): adaptive micro-compaction collapses a minor overflow onto one page', () => {
    let compacted = 0;
    for (const { archetype, values } of profileSpace()) {
        const result = partitionResumeContent(values, { archetype, density: 'standard' });
        if (result.sectionGapPx === 11) {
            compacted += 1;
            // Adopted ONLY when the whole resume fits one page.
            assert.equal(result.totalPages, 1, 'compaction must only be adopted when it fits one page');
        }
    }
    assert.ok(compacted > 0, 'at least one minor-overflow profile must micro-compact onto one page');
});

test('DIR-067 S7 (functional): no page strands a single isolated continuation row', () => {
    const keyOf = (item) => (item.sectionId ? `${item.type}:${item.sectionId}` : item.type);
    for (const { archetype, values } of profileSpace()) {
        const result = partitionResumeContent(values, { archetype, density: 'standard' });
        if (result.totalPages < 2) continue;
        const last = result.pages[result.pages.length - 1].flowItems;
        if (!last.length) continue;
        const keys = new Set(last.map(keyOf));
        if (keys.size !== 1) continue;
        const key = [...keys][0];
        const onEarlierPage = result.pages
            .slice(0, -1)
            .some((page) => page.flowItems.some((item) => keyOf(item) === key));
        const isGrid = key.startsWith('certification') || key.startsWith('project');
        const oneRow = isGrid ? last.length <= 2 : last.length <= 1;
        assert.equal(
            onEarlierPage && oneRow,
            false,
            `${archetype}: the last page stranded a single ${key} row while the same section continued from an earlier page`,
        );
    }
});

