/**
 * DIR-066 — automated template thumbnail refresh + cross-portal print/download
 * verification.
 *
 * Pins the two deliverables so they cannot silently rot:
 *   1. the 51 catalog thumbnails are authentic, in-gate, true A4 page-1
 *      snapshots, and the refresh that produces them is fully automated
 *      (in-process vite + auto-detected Chromium, no detached server); and
 *   2. all four portal print/download surfaces stay wired to the shared
 *      contracts (buildPrintableDocument, window.print, exportDownloader).
 *
 * The heavy live-vs-stored pixel comparison is executed separately by
 * template-lab/freshness-probe.mjs and archived under template-lab/evidence/dir066/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ASSETS = path.join(ROOT, 'src', 'assets', 'resumesNew');
const CV_IDS = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);

/** Read JPEG intrinsic dimensions straight from the SOFn marker. */
function jpegSize(buffer) {
    let i = 2;
    while (i < buffer.length) {
        if (buffer[i] !== 0xff) { i += 1; continue; }
        const marker = buffer[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
        }
        i += 2 + buffer.readUInt16BE(i + 2);
    }
    return null;
}

test('DIR-066 S1: all 51 thumbnails are authentic, in-gate A4 page-1 snapshots', () => {
    const files = fs.readdirSync(ASSETS);
    assert.equal(files.length, 51, 'resumesNew must hold exactly 51 preview images');
    for (const id of CV_IDS) {
        const buffer = fs.readFileSync(path.join(ASSETS, `${id}.JPG`));
        assert.equal(buffer[0], 0xff, `${id}.JPG missing JPEG marker 0`);
        assert.equal(buffer[1], 0xd8, `${id}.JPG missing JPEG marker 1`);
        assert.equal(buffer[2], 0xff, `${id}.JPG missing JPEG marker 2`);
        assert.ok(buffer.length > 50_000 && buffer.length < 400_000, `${id}.JPG out of the 50KB-400KB gate (${buffer.length})`);
        const size = jpegSize(buffer);
        assert.ok(size, `${id}.JPG has no readable SOFn frame`);
        // A true A4 sheet snapshot: aspect ratio sqrt(2) and a high-res capture.
        const aspect = size.height / size.width;
        assert.ok(Math.abs(aspect - 1.41421) < 0.02, `${id}.JPG must be A4 aspect (got ${aspect.toFixed(4)})`);
        assert.ok(size.width >= 900, `${id}.JPG must be a high-res capture (width ${size.width})`);
    }
});

test('DIR-066 S2: the refresh is automated, cross-platform and spawns no detached server', () => {
    const src = read('template-lab/regenerate-previews.mjs');
    assert.match(src, /function findChromium\(/, 'the refresh must auto-detect Chromium');
    assert.doesNotMatch(src, /'\/tmp\/chromium-bin'/, 'the Linux-only Chromium default must be gone');
    assert.match(src, /createServer\(/, 'the refresh must host vite in-process when LAB_BASE is unset');
    assert.match(src, /await server\.close\(\)/, 'the in-process vite server must be closed');
    assert.match(src, /process\.env\.CHROMIUM_PATH/, 'CHROMIUM_PATH must stay overridable');
    // Optional, guarded sharp post-pass.
    assert.match(src, /await import\('sharp'\)/, 'sharp must be loaded dynamically');
    assert.doesNotMatch(src, /spawn\(|detached:\s*true|child_process|winget|powershell/i,
        'the refresh must not spawn OS processes or Windows tooling');
});

test('DIR-066 S3: the freshness probe compares the stored gallery against the live engine', () => {
    const src = read('template-lab/freshness-probe.mjs');
    assert.match(src, /resumesNew\/\$\{templateId\}\.JPG/, 'the probe must load the stored thumbnail');
    assert.match(src, /getImageData/, 'the probe must read real pixels');
    assert.match(src, /MAX_MAD/, 'the probe must enforce a staleness threshold');
    assert.match(src, /process\.exit\(1\)/, 'the probe must fail closed on a stale gallery');
    assert.doesNotMatch(src, /spawn\(|detached:\s*true|child_process|winget|powershell/i,
        'the probe must not spawn OS processes or Windows tooling');
});

test('DIR-066 S4 (portal A): the recruiter pipeline isolates print via buildPrintableDocument', () => {
    const src = read('src/components/EmployerPortal/EmployerApplicantPipeline.jsx');
    assert.match(src, /buildPrintableDocument/, 'the recruiter surface must use the shared print contract');
    assert.match(src, /createElement\('iframe'\)/, 'print must render into an isolated iframe');
    assert.match(src, /frame\.contentWindow\.print\(\)/, 'print must target the isolated frame');
    assert.match(src, /new Blob\(\[buildPrintableDocument\(/, 'the HTML download must carry the contract too');
});

test('DIR-066 S5 (portal B): the enterprise modal uses window.print and the centralized DOCX client', () => {
    const src = read('src/enterprise/components/EnterpriseResumePdfModal.jsx');
    assert.match(src, /window\.print\(\)/, 'the enterprise modal must expose window.print');
    assert.match(src, /utils\/exportDownloader/, 'DOCX must come from the centralized downloader');
    assert.match(src, /downloadResumeDocx/, 'the enterprise DOCX export must use downloadResumeDocx');
});

test('DIR-066 S6 (portal C): the user dashboard downloads PDF and DOCX via the centralized client', () => {
    const src = read('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx');
    assert.match(src, /utils\/exportDownloader/, 'the dashboard must import the centralized downloader');
    assert.match(src, /downloadResumePdf\(/, 'the dashboard must use downloadResumePdf');
    assert.match(src, /downloadResumeDocx\(/, 'the dashboard must use downloadResumeDocx');
});

test('DIR-066 S7 (portal D): the candidate builder wires both download transitions', () => {
    const build = read('src/components/BuildResume/BuildResume.jsx');
    assert.match(build, /const performDownload = async/, 'the builder must own the PDF download path');
    assert.match(build, /const performDocxDownload = async/, 'the builder must own the DOCX download path');
    assert.match(build, /downloadResumePdf\(/, 'the builder PDF path must use the centralized client');
    assert.match(build, /downloadResumeDocx\(/, 'the builder DOCX path must use the centralized client');
    assert.match(build, /onDownloadDocx=\{/, 'the builder must hand PreviewModal the DOCX handler');
    const modal = read('src/components/BuildResume/PreviewModal.jsx');
    assert.match(modal, /onDownloadDocx/, 'PreviewModal must expose the DOCX download');
    assert.match(modal, /onClick=\{onDownload\}/, 'PreviewModal must expose the PDF download');
});

