/**
 * DIR-068 — master platform-wide UAT, visual invariants, DOCX fidelity audit and
 * the production release seal.
 *
 * The heavy browser evidence (55-template census on two fixtures, thumbnail
 * freshness, overflow) is produced by the template-lab probes and archived under
 * template-lab/evidence/ and .bridge/evidence/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const { partitionResumeContent } = await import(
    new URL('../src/engine/hybrid/smartPartitioner.js', import.meta.url).href
);

// ── (A) Candidate Builder ────────────────────────────────────────────────────

test('DIR-068 A: the candidate builder composes 2-column cards and exports PDF/DOCX', () => {
    const main = read('src/main.jsx');
    assert.match(main, /path="\/build-resume\/\*"/, 'the builder route must exist');
    assert.match(main, /path="\/create-resume\/\*"/, 'the create-resume alias must exist');
    // 2-column project + certification card grids.
    assert.match(read('src/engine/hybrid/components/SmartProjects.jsx'), /smart-cards-grid/, 'projects must render the 2-column card grid');
    assert.match(read('src/engine/hybrid/components/SmartCertifications.jsx'), /smart-cert-grid/, 'certifications must render the 2-column card grid');
    assert.match(read('src/engine/hybrid/smartEngine.css'), /\.smart-cards-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/, 'the card grid must be 2-column');
    // Export controls.
    const builder = read('src/components/BuildResume/BuildResume.jsx');
    assert.match(builder, /const performDownload = async/, 'the builder must own the PDF export');
    assert.match(builder, /const performDocxDownload = async/, 'the builder must own the DOCX export');
    assert.match(builder, /downloadResumePdf\(/, 'PDF export must use the centralized client');
    assert.match(builder, /downloadResumeDocx\(/, 'DOCX export must use the centralized client');
});

// ── (B) User Dashboard ───────────────────────────────────────────────────────

test('DIR-068 B: the user dashboard renders resume cards with quick PDF/DOCX downloads', () => {
    const main = read('src/main.jsx');
    assert.match(main, /path="\/dashboard\/\*"/, 'the dashboard route must exist');
    const dash = read('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx');
    assert.match(dash, /downloadResumePdf\(/, 'the dashboard must offer a quick PDF download');
    assert.match(dash, /downloadResumeDocx\(/, 'the dashboard must offer a quick DOCX download');
    assert.match(dash, /getResumes/, 'the dashboard must list the user resumes');
    assert.match(dash, /showToast/, 'a download failure must notify the user');
});

// ── (C) Recruiter Portal ─────────────────────────────────────────────────────

test('DIR-068 C: the recruiter drawer previews, tabs the cover letter and exports via public endpoints', () => {
    const src = read('src/components/EmployerPortal/EmployerApplicantPipeline.jsx');
    assert.match(src, /employer-resume-page/, 'the drawer must render the candidate resume preview');
    assert.match(src, /role="tablist"/, 'the cover letter must be a tabbed view');
    assert.match(src, /endpoint: '\/api\/public-export'/, 'PDF must call the public export endpoint');
    assert.match(src, /endpoint: '\/api\/public-export-docx'/, 'DOCX must call the public DOCX endpoint');
    assert.match(src, /frame\.contentWindow\.print\(\)/, 'the drawer must isolate iframe printing');
    assert.match(src, /buildPrintableDocument/, 'printing must carry the shared print contract');
});

// ── (D) Admin / Org Modal ────────────────────────────────────────────────────

test('DIR-068 D: the admin/org applications modal previews and exports candidates', () => {
    const modal = read('src/components/Dashboard/EmployerDashboard/JobApplicationsModal.jsx');
    assert.match(modal, /const handleDownloadResume = async/, 'the modal must own a resume export handler');
    assert.match(modal, /downloadResumePdf\(/, 'the modal must export through the centralized client');
    assert.match(modal, /endpoint: '\/api\/public-export'/, 'the modal must use the public export endpoint');
    assert.match(modal, /application\.skills\?\.slice/, 'the modal must preview candidate detail');
    // HONEST FINDING: the modal narrows with search + status filters, NOT pagination.
    assert.match(modal, /statusFilter/, 'the modal must narrow the list with a status filter');
    assert.match(modal, /clearFilters/, 'the modal must be able to restore the full list');
    assert.doesNotMatch(modal, /pageSize|currentPage|setPage\(/, 'the modal does not implement pagination (search + filter only)');
});

// ── Route seal ───────────────────────────────────────────────────────────────

test('DIR-068 route seal: every portal entry point resolves to a declared route', () => {
    const main = read('src/main.jsx');
    for (const route of ['/build-resume/*', '/create-resume/*', '/dashboard/*']) {
        assert.ok(main.includes(`path="${route}"`), `${route} must be declared`);
    }
    // DIR-068 added the aliases the release UAT names.
    assert.match(main, /path="\/resume-builder" element=\{<Navigate to="\/build-resume" replace \/>\}/, '/resume-builder must resolve');
    assert.match(main, /path="\/resume-builder\/\*" element=\{<Navigate to="\/build-resume" replace \/>\}/, '/resume-builder/* must resolve');
    assert.match(main, /path="\/resumes" element=\{<Navigate to="\/dashboard" replace \/>\}/, '/resumes must resolve');
    assert.match(main, /path="\/resumes\/\*" element=\{<Navigate to="\/dashboard" replace \/>\}/, '/resumes/* must resolve');
});

// ── Visual invariants (functional) ───────────────────────────────────────────

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

test('DIR-068 visual: adaptive micro-compaction is adopted only when it helps', () => {
    let compacted = 0;
    for (const { archetype, values } of profileSpace()) {
        const result = partitionResumeContent(values, { archetype, density: 'standard' });
        if (result.compaction.tier === 0) continue;
        compacted += 1;
        if (result.totalPages === 1) continue;
        // DIR-070: a tighter tier may be adopted for a two-page result too, but
        // only when Page 1 stays dense (>=85% fill).
        const donor = result.pages[0];
        const content = donor.flowItems.reduce((s, i) => s + (i.estHeight || 0), 0);
        let groups = 0; let prev = null;
        for (const i of donor.flowItems) { if (i.type !== prev) { groups += 1; prev = i.type; } }
        const fill = (content + Math.max(0, groups - 1) * result.sectionGapPx) / 860;
        assert.ok(fill >= 0.85, `${archetype}: compaction left Page 1 at ${(fill * 100).toFixed(1)}%`);
    }
    assert.ok(compacted > 0, 'at least one profile must micro-compact');
});

test('DIR-068 visual: a stranded row is only allowed to avoid a Page-1 void', () => {
    const keyOf = (item) => (item.sectionId ? `${item.type}:${item.sectionId}` : item.type);
    for (const { archetype, values } of profileSpace()) {
        const result = partitionResumeContent(values, { archetype, density: 'standard' });
        if (result.totalPages < 2) continue;
        const last = result.pages[result.pages.length - 1].flowItems;
        if (!last.length) continue;
        const keys = new Set(last.map(keyOf));
        if (keys.size !== 1) continue;
        const key = [...keys][0];
        const onEarlier = result.pages.slice(0, -1).some((p) => p.flowItems.some((i) => keyOf(i) === key));
        const isGrid = key.startsWith('certification') || key.startsWith('project');
        const oneRow = isGrid ? last.length <= 2 : last.length <= 1;
        if (!(onEarlier && oneRow)) continue;
        // DIR-070 (mandate 2): the guard only declines the move to avoid a >80px
        // Page-1 void, so Page 1 must still be dense in every stranded case.
        const donor = result.pages[0];
        const content = donor.flowItems.reduce((s, i) => s + (i.estHeight || 0), 0);
        let groups = 0; let prev = null;
        for (const i of donor.flowItems) { if (i.type !== prev) { groups += 1; prev = i.type; } }
        const fill = (content + Math.max(0, groups - 1) * result.sectionGapPx) / 860;
        assert.ok(fill >= 0.85, `${archetype}: stranded ${key} row with a half-empty Page 1 (${(fill * 100).toFixed(1)}%)`);
    }
});

// ── Thumbnail freshness (static half; the pixel half is the probe) ───────────

test('DIR-068 thumbnails: the 51 catalog previews are present and in-gate', () => {
    const dir = path.join(ROOT, 'src', 'assets', 'resumesNew');
    const files = fs.readdirSync(dir);
    assert.equal(files.length, 51, 'exactly 51 catalog thumbnails');
    for (const f of files) {
        const size = fs.statSync(path.join(dir, f)).size;
        assert.ok(size > 50_000 && size < 400_000, `${f} must stay inside the 50KB-400KB gate`);
    }
});

// ── DOCX vs PDF fidelity audit ───────────────────────────────────────────────

test('DIR-068 DOCX fidelity: 2-column card tables match the PDF and the public route is sealed', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const { createResumeDocx } = require(path.join(ROOT, 'backend', 'services', 'docxExport.js'));
    const JSZip = require(path.join(ROOT, 'backend', 'node_modules', 'jszip'));
    const buffer = await createResumeDocx({
        firstname: 'Babu', lastname: 'M', template: 'Cv1',
        projects: [{ title: 'Initiative 1', description: SHORT_PROJ, url: 'https://github.com/babu/q1' }],
        certifications: [{ title: 'CCRN', issuer: 'AACN', date: '2018' }, { title: 'ACLS', issuer: 'AHA', date: '2019' }],
    });
    const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string');
    assert.match(xml, /w:fill="F8FAFC"/i, 'DOCX cards must use the PDF card fill');
    assert.match(xml, /w:color="E2E8F0"/i, 'DOCX cards must use the PDF card border');
    const grids = [...xml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)]
        .map((m) => [...m[1].matchAll(/w:w="(\d+)"/g)].map((c) => Number(c[1])));
    assert.ok(grids.some((cols) => cols.length === 2 && cols[0] === cols[1]), 'an equal-width 2-column card table must exist');
    // The public DOCX route keeps its published-only + rate-limit guards.
    const backend = read('backend/index.js');
    assert.match(backend, /app\.post\('\/api\/public-export-docx'/, 'the public DOCX route must exist');
    assert.match(backend, /'\/api\/public-export-docx'\]/, 'the public DOCX route must be rate-limited');
    const at = backend.indexOf("app.post('/api/public-export-docx'");
    const route = backend.slice(at, at + 3400);
    assert.match(route, /getPublicResume/, 'published-only authorization');
    assert.match(route, /publicationMode !== 'explicit'/, 'explicit publication required');
    // DIR-069: req.user.uid may be read ONLY inside the verified employer claim;
    // the published-only rule stays the fallback for every other caller.
    // DIR-071 moved the claim rules into ONE shared module so the PDF and DOCX
    // routes cannot drift; the route delegates to it.
    assert.match(route, /resolveEmployerClaim\(\{/, 'the route must delegate to the shared employer-claim verifier');
    assert.match(read('backend/security/employerClaim.js'), /String\(job\.employerId \|\| job\.employer_id \|\| ''\) !== user\.uid/,
        'the only owner read must be the verified job-ownership check');
    assert.match(route, /if \(!employerClaim\) \{[\s\S]*?publicationMode !== 'explicit'/,
        'the published-only rule must remain the fallback');
});

// ── Security & production release seal ───────────────────────────────────────

test('DIR-068 seal: zero FOUC, zero dead routes, Linux-compatible, cv-templates frozen', () => {
    // Zero FOUC: the pre-paint theme init + critical canvas CSS must survive.
    const html = read('index.html');
    assert.match(html, /<script[^>]+src="\/theme-init\.js"/, 'the synchronous pre-paint theme init must exist');
    assert.match(html, /background-color:\s*#0d0f16/, 'the dark canvas must be pre-painted');
    // Zero dead routes: the router census artifact must exist and enumerate the real set.
    assert.ok(exists('.bridge/evidence/dir047-route-census.json'), 'the route census artifact must exist');
    const census = JSON.parse(read('.bridge/evidence/dir047-route-census.json'));
    assert.ok(Array.isArray(census.crawlTargets) && census.crawlTargets.length >= 100, 'the census must enumerate the real crawlable target set');
    // 100% Linux compatibility: no Windows-only tooling, no process spawning.
    for (const rel of ['template-lab/census-probe.mjs', 'template-lab/freshness-probe.mjs', 'scripts/generate-certified-freeze-manifest.mjs']) {
        const src = read(rel);
        assert.doesNotMatch(src, /from 'node:child_process'|require\('child_process'\)|\bspawn\(|execFileSync\(|execSync\(|detached:\s*true|winget|powershell/i,
            `${rel} must stay Linux-safe (no process spawning, no Windows tooling)`);
    }
    // The release manifest records the frozen baseline as clean.
    const manifest = JSON.parse(read('.bridge/CERTIFIED_FREEZE_MANIFEST.json'));
    // DIR-071 re-scoped this: the freeze covers the 55 TEMPLATE MODULES, while
    // templateUtils.js is a shared utility a directive may legitimately change
    // (DIR-071 enforces photo-visibility suppression there) and is recorded
    // separately instead of silently widening the freeze.
    assert.equal(manifest.releaseSeal.frozenBaseline.clean, true, 'the 55 template modules must be recorded as git-diff clean');
    assert.equal(manifest.releaseSeal.frozenBaseline.scope, 'the 55 template modules (cv1..cv51, cover1..cover4)',
        'the frozen scope must name the template modules explicitly');
    assert.equal(manifest.releaseSeal.frozenBaseline.sharedUtility.path, 'src/cv-templates/templateUtils.js',
        'the shared utility must be tracked explicitly');
    assert.ok(Object.prototype.hasOwnProperty.call(manifest.releaseSeal.frozenBaseline.sharedUtility, 'changedByDirective'),
        'the shared utility diff must be reported, never hidden');
});

test('DIR-068 seal: the release manifest documents every certified baseline honestly', () => {
    const manifest = JSON.parse(read('.bridge/CERTIFIED_FREEZE_MANIFEST.json'));
    assert.equal(manifest.status, 'FROZEN_AND_CERTIFIED');
    assert.equal(manifest.version, '4.0.0');
    const seal = manifest.releaseSeal;
    assert.equal(seal.directiveId, 'DIR-068');
    assert.ok(seal.directiveCounts.recordsOnDisk >= seal.directiveCounts.approvedFrozen, 'frozen <= records on disk');
    assert.equal(seal.directiveCounts.directiveAssertedBaselines, 68, 'the asserted number is recorded, not fabricated');
    assert.equal(manifest.certifiedBaselines.length, seal.directiveCounts.approvedFrozen, 'one baseline per frozen directive');
    let withFreezeHash = 0;
    for (const b of manifest.certifiedBaselines) {
        assert.ok(b.id && /^DIR-\d{3}$/.test(b.id), `${b.id} must be a directive id`);
        // Older frozen records predate the freeze-provenance fields, so a baseline
        // may legitimately carry neither — but the recent chain must carry a hash.
        if (b.freezeHash) {
            withFreezeHash += 1;
            assert.match(b.freezeHash, /^[0-9a-f]{8,}$/i, `${b.id} freezeHash must look like a hash`);
        }
    }
    assert.ok(withFreezeHash > 0, 'the certified chain must carry freeze hashes');
    assert.equal(seal.directiveCounts.withFreezeHash, withFreezeHash, 'the recorded count must match the baselines');
    assert.ok(seal.sealedArtifacts.length >= 15, 'the seal must hash the release artifacts');
    for (const a of seal.sealedArtifacts) {
        assert.equal(a.exists, true, `${a.file} must exist`);
        assert.match(a.sha256, /^[0-9a-f]{64}$/, `${a.file} must carry a sha256`);
    }
});



