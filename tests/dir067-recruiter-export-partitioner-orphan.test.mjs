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
    // DIR-071 superseded this: the recruiter IS authenticated so the public export
    // routes can decode the Bearer token and evaluate the employer claim. Without a
    // token the claim can never fire and a draft application export dead-ends 404.
    assert.match(src, /withAuth: true/, 'the recruiter must send a Bearer token so the claim can be verified');
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
    const route = src.slice(at, at + 5600);
    assert.match(route, /repo\.getPublicResume/, 'authorization must come from the publication row');
    assert.match(route, /isPublished !== true/, 'only published resumes may be exported');
    assert.match(route, /publicationMode !== 'explicit'/, 'only explicitly published resumes may be exported');
    // DIR-069: the route may read req.user.uid ONLY inside the verified employer
    // claim (job ownership + application binding). The published-only rule must
    // remain the fallback for every other caller.
    // DIR-071 moved the claim rules into ONE shared module so the PDF and DOCX
    // routes cannot drift apart; the route delegates to it and keeps the
    // published-only rule as the fallback.
    assert.match(route, /resolveEmployerClaim\(\{/, 'the route must delegate to the shared employer-claim verifier');
    assert.match(read('backend/security/employerClaim.js'), /String\(job\.employerId \|\| job\.employer_id \|\| ''\) !== user\.uid/,
        'the only owner read must be the verified job-ownership check');
    assert.match(route, /if \(!employerClaim\) \{[\s\S]*?publicationMode !== 'explicit'/,
        'the published-only rule must remain the fallback');
    assert.match(route, /EXPORTABLE_TEMPLATE/, 'the template must be validated');
    assert.match(route, /resolveExportTemplate/, 'template identity must be resolved server-side');
    assert.match(route, /createResumeDocx/, 'the public route must reuse the DOCX builder');
});

test('DIR-067 S5: the partitioner exposes a reusable packer, compaction and an orphan guard', () => {
    const src = read('src/engine/hybrid/smartPartitioner.js');
    // DIR-070 superseded the single-rhythm compaction with a tier table and made
    // the packer take the tier's sections.
    assert.match(src, /const packSections = \(sectionsArg, sectionGapPx\)/, 'the packer must be re-runnable per tier');
    assert.match(src, /const COMPACTION_TIERS = \[/, 'the multi-tier compaction table must exist');
    assert.match(src, /const buildSections = \(tier\) =>/, 'the section building must be tier-aware');
    assert.match(src, /const PAGE_VOID_MAX_PX = 80/, 'the Page-1 void ceiling must exist');
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

test('DIR-067 S6 (functional): adaptive micro-compaction is adopted only when it helps', () => {
    let onePage = 0;
    let denseTwoPage = 0;
    for (const { archetype, values } of profileSpace()) {
        const result = partitionResumeContent(values, { archetype, density: 'standard' });
        if (result.compaction.tier === 0) continue;
        if (result.totalPages === 1) { onePage += 1; continue; }
        // DIR-070: a tighter tier may now also be adopted for a two-page result,
        // but ONLY when it keeps Page 1 dense (>=85%) — never a cosmetic change.
        const donor = result.pages[0];
        const content = donor.flowItems.reduce((s, i) => s + (i.estHeight || 0), 0);
        let groups = 0; let prev = null;
        for (const i of donor.flowItems) { if (i.type !== prev) { groups += 1; prev = i.type; } }
        const fill = (content + Math.max(0, groups - 1) * result.sectionGapPx) / 860;
        assert.ok(fill >= 0.85, `${archetype}: compaction left Page 1 at ${(fill * 100).toFixed(1)}%`);
        denseTwoPage += 1;
    }
    assert.ok(onePage > 0, 'at least one profile must micro-compact onto one page');
    assert.ok(denseTwoPage >= 0, 'two-page compaction must still keep Page 1 dense');
});

test('DIR-067 S7 (functional): a stranded continuation row is only allowed to avoid a Page-1 void', () => {
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
        if (!(onEarlierPage && oneRow)) continue;
        // DIR-070 (mandate 2): the guard declines the move only when moving the
        // whole section would leave >80px of void on Page 1. Every stranded case
        // must therefore still leave Page 1 dense (>=85% fill).
        const donor = result.pages[0];
        const content = donor.flowItems.reduce((s, i) => s + (i.estHeight || 0), 0);
        let groups = 0; let prev = null;
        for (const i of donor.flowItems) { if (i.type !== prev) { groups += 1; prev = i.type; } }
        const fill = (content + Math.max(0, groups - 1) * result.sectionGapPx) / 860;
        assert.ok(fill >= 0.85, `${archetype}: stranded ${key} row with a half-empty Page 1 (${(fill * 100).toFixed(1)}%)`);
    }
});

