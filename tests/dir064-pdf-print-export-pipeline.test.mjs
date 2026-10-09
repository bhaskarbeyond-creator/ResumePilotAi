/**
 * DIR-064 — PDF blank-page/skip-link bleed, footer overlap (certification card
 * geometry), and the centralized cross-platform export pipeline.
 *
 * These are fast, hermetic static contracts over the source. They pin the exact
 * defect fixes so a future refactor cannot silently reintroduce:
 *   1. the accessibility skip-link printing as a banner on PDF page 1,
 *   2. certification cards clipping into the page footer, or
 *   3. a second, divergent PDF/DOCX download path.
 *
 * The heavy browser matrix (real Chromium PDF crawl) is executed separately and
 * its evidence is archived under .bridge/evidence/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

test('DIR-064 S1: index.html suppresses the skip-link in print without losing the screen rule', () => {
    const html = read('index.html');
    assert.match(html, /@media print\s*\{[\s\S]*?\.skip-link\s*\{[\s\S]*?display:\s*none\s*!important/,
        'index.html must hide .skip-link under @media print');
    // The pre-paint off-screen rule must survive (fouc-prevention + p1-gap contracts).
    assert.match(html, /\.skip-link[\s\S]*?top:\s*-100px/, 'the off-screen screen rule must remain');
});

test('DIR-064 S2: the shared print contract hides .skip-link on paper', () => {
    const css = read('src/styles/cuba-print.css');
    assert.match(css, /@media print/, 'cuba-print.css must define a print block');
    assert.match(css, /\.skip-link/, 'cuba-print.css must neutralise .skip-link on paper');
});

test('DIR-064 S3: the export surface removes the skip-link from its own DOM', () => {
    const src = read('src/components/Exporter/Exporter.jsx');
    assert.match(src, /querySelectorAll\(['"]\.skip-link['"]\)/, 'Exporter must locate the skip-link');
    assert.match(src, /setAttribute\(['"]hidden['"]/, 'Exporter must hide the skip-link for the export surface');
});

test('DIR-064 S4: the backend strips the skip-link BEFORE page.pdf()', () => {
    const src = read('backend/index.js');
    const idxEval = src.indexOf("querySelectorAll('.skip-link')");
    const idxPdf = src.indexOf('const pdfBuffer = await page.pdf(');
    assert.ok(idxEval > 0, 'backend must remove .skip-link before printing');
    assert.ok(idxPdf > 0 && idxEval < idxPdf, 'the skip-link removal must run BEFORE page.pdf()');
    assert.match(src, /data-print-export/, 'the print pass must stamp an export marker');
});

test('DIR-064 S5: the certification estimator is recalibrated to real card geometry', () => {
    const src = read('src/engine/hybrid/smartPartitioner.js');
    assert.doesNotMatch(src, /isNewRow \? 52 : 0/, 'the 52px under-estimate must be gone');
    assert.match(src, /CERT_ROW_MIN_PX = 76/, 'the estimator floor must match the measured 74-85px card');
    assert.match(src, /CERT_ROW_MAX_PX = 88/, 'the estimator must clamp long titles');
    assert.match(src, /certRowHeightFor\(cert\)/, 'cert rows must use the calibrated estimator');
    assert.match(src, /FOOTER_SAFETY_CLEARANCE = 22/, 'the packer must reserve a footer clearance');
});

test('DIR-064 S6: smartEngine.css buffers the page body and keeps cards atomic', () => {
    const css = read('src/engine/hybrid/smartEngine.css');
    assert.match(css, /\.smart-page-body\s*\{[\s\S]*?padding-bottom:\s*14px/, '.smart-page-body needs a bottom buffer');
    assert.match(css, /\.smart-cert-item\s*\{[\s\S]*?break-inside:\s*avoid/, '.smart-cert-item must never split across pages');
});

test('DIR-064 S7: the centralized cross-platform downloader exists and validates both formats', () => {
    assert.ok(exists('src/utils/exportDownloader.js'), 'src/utils/exportDownloader.js must exist');
    const src = read('src/utils/exportDownloader.js');
    assert.match(src, /export function downloadResumePdf/, 'must export downloadResumePdf');
    assert.match(src, /export function downloadResumeDocx/, 'must export downloadResumeDocx');
    assert.match(src, /toValidatedPdfBlob/, 'PDF path must reuse the %PDF- magic-byte validator');
    assert.match(src, /toValidatedDocxBlob/, 'DOCX path must reuse the PK zip validator');
    assert.match(src, /Bearer \$\{token\}/, 'must attach a Bearer token');
    assert.match(src, /sanitizeExportFileName/, 'filenames must be sanitized against path traversal');
    assert.doesNotMatch(src, /console\.\w+\([^)]*token/i, 'the Bearer token must never be logged');
    assert.doesNotMatch(src, /child_process|execSync|execFileSync|spawnSync/, 'the downloader must be pure JS with no OS process spawning (no Windows-only tooling)');
});

test('DIR-064 S8: every portal consumes the ONE centralized downloader', () => {
    const consumers = [
        'src/components/BuildResume/BuildResume.jsx',
        'src/components/Boards/board-step-filling/BoardFilling.jsx',
        'src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx',
        'src/components/PublicResume/PublicResume.jsx',
        'src/components/Dashboard/EmployerDashboard/JobApplicationsModal.jsx',
        'src/enterprise/components/EnterpriseResumePdfModal.jsx',
    ];
    for (const file of consumers) {
        const src = read(file);
        assert.match(src, /from ['"][^'"]*utils\/exportDownloader['"]/, `${file} must import from exportDownloader`);
        assert.doesNotMatch(src, /from ['"][^'"]*utils\/pdfDownload['"]/, `${file} must not import pdfDownload directly`);
        assert.doesNotMatch(src, /from ['"][^'"]*utils\/docxDownload['"]/, `${file} must not import docxDownload directly`);
    }
});

test('DIR-064 S8: the downloader is the single declaration site for the export endpoints', () => {
    const src = read('src/utils/exportDownloader.js');
    assert.match(src, /'\/api\/export'/, 'PDF endpoint must be declared once here');
    assert.match(src, /'\/api\/export-docx'/, 'DOCX endpoint must be declared once here');
});

test('DIR-064 S9: the export pipeline is Linux-compatible (pure Node + headless Chromium)', () => {
    const src = read('backend/index.js');
    assert.match(src, /headless:\s*true/, 'Chromium must run headless');
    assert.match(src, /--no-sandbox/, 'the sandbox flag must be present');
    assert.match(src, /--disable-dev-shm-usage/, 'the /dev/shm flag must be present for Linux containers');
    assert.doesNotMatch(src, /spawn\([^)]*detached:\s*true/, 'no detached background server may be spawned');
});

// ── Functional assertions (real module output, not just source text) ─────────

test('DIR-064 S5 (functional): certification rows reserve the measured card height', async () => {
    const { partitionResumeContent } = await import(
        new URL('../src/engine/hybrid/smartPartitioner.js', import.meta.url).href
    );
    const result = partitionResumeContent(
        {
            firstname: 'Babu', lastname: 'M',
            certifications: [
                { title: 'CCRN', issuer: 'AACN', date: '2021' },
                { title: 'Advanced Cardiac Life Support', issuer: 'AHA', date: '2022' },
                { title: 'Basic Life Support', issuer: 'AHA', date: '2020' },
            ],
        },
        { archetype: 'minimal-ats', density: 'standard' }
    );
    const certItems = result.pages.flatMap((p) => p.flowItems).filter((i) => i.type === 'certification');
    assert.ok(certItems.length >= 3, 'all certifications must be partitioned into the main flow');
    // Certifications render in a 2-column grid: each ROW (a pair of cards) must
    // reserve at least the measured 76px card height. The old 52px estimate is
    // what let the tail of the section clip into the page footer.
    const rows = Math.ceil(certItems.length / 2);
    const total = certItems.reduce((sum, item) => sum + item.estHeight, 0);
    assert.ok(total >= 76 * rows,
        `cert rows must reserve >=76px each, got ${total} for ${rows} row(s)`);
    // Every row-starting card must itself carry a full card height.
    for (const item of certItems.filter((i) => i.index % 2 === 0)) {
        assert.ok(item.estHeight >= 76, `cert row start must reserve >=76px, got ${item.estHeight}`);
    }
});

test('DIR-064 S7 (functional): the %PDF- validator rejects a JSON error body', async () => {
    const { isPdfBuffer, readExportErrorMessage } = await import(
        new URL('../src/utils/pdfDownload.js', import.meta.url).href
    );
    const encoder = new TextEncoder();
    assert.equal(isPdfBuffer(encoder.encode('%PDF-1.7').buffer), true, 'a real PDF header must pass');
    assert.equal(isPdfBuffer(encoder.encode('{"error":"nope"}').buffer), false, 'a JSON error body must be rejected');
    assert.match(readExportErrorMessage(encoder.encode('{"error":{"message":"Subscription required"}}').buffer),
        /Subscription required/, 'the server reason must be surfaced');
});


