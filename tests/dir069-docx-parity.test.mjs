/**
 * DIR-069 — true DOCX/PDF parity: multi-page full-width reflow, photo embedding,
 * archetype 2-column certifications, skill pills, free-tier watermark and the
 * recruiter draft-export gate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);
const DOCX = 'backend/services/docxExport.js';

const { createResumeDocx } = require(path.join(ROOT, DOCX));
const JSZip = require(path.join(ROOT, 'backend', 'node_modules', 'jszip'));

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function unzip(resume) {
    const buffer = await createResumeDocx(resume);
    const archive = await JSZip.loadAsync(buffer);
    const xml = await archive.file('word/document.xml').async('string');
    return { buffer, archive, xml };
}

test('DIR-069 S1: multi-page 2-column templates reflow their overflow full-width', () => {
    const src = read(DOCX);
    assert.match(src, /const PAGE_ONE_HERO_BUDGET_TWIPS = /, 'a conservative page-1 budget must exist');
    assert.match(src, /function splitHeroForPageOne/, 'the hero splitter must exist');
    assert.match(src, /function twoColumnWithReflow/, 'the reflow wrapper must exist');
    assert.match(src, /type: SectionType\.NEXT_PAGE/, 'the continuation must be a next-page section');
    assert.match(src, /\.\.\.\(continuation\.length/, 'the continuation section must be conditional');
    // The three 2-column archetypes route through the reflow wrapper.
    const wrapperUses = (src.match(/twoColumnWithReflow\(/g) || []).length;
    assert.ok(wrapperUses >= 4, `expected the 3 builders plus the definition, found ${wrapperUses}`);
    assert.doesNotMatch(src, /children = buildExecutiveBannerDocument\(resume, style\);/,
        'the banner builder must return a continuation now');
});

test('DIR-069 S2: executive-banner and tech-grid certifications are 2-column', () => {
    const src = read(DOCX);
    for (const fn of ['buildExecutiveBannerDocument', 'buildTechGridDocument']) {
        const start = src.indexOf(`function ${fn}`);
        const body = src.slice(start, src.indexOf('\nfunction ', start + 10));
        assert.doesNotMatch(body, /buildCertificationsBlock\([\s\S]*?columns: 1/,
            `${fn} must not use a single-column certifications block`);
    }
});

test('DIR-069 S3: the DOCX embeds a candidate photo through an allowlisted resolver', () => {
    const src = read(DOCX);
    assert.match(src, /^\s*ImageRun,\s*$/m, 'ImageRun must be imported');
    assert.match(src, /function decodeDataUrlPhoto/, 'data URLs must be decoded');
    assert.match(src, /function fetchRemotePhoto/, 'remote photos must be fetched');
    assert.match(src, /PHOTO_HOST_ALLOWLIST/, 'remote photos must be allowlisted (SSRF guard)');
    assert.match(src, /PHOTO_MAX_BYTES/, 'remote photos must be size-capped');
    assert.match(src, /function buildPhotoParagraph/, 'a headshot paragraph builder must exist');
    assert.match(src, /const photo = buildPhotoParagraph\(resume, options\);/, 'the identity header must render the photo');
    assert.match(src, /async function resolveResumePhoto/, 'the photo must be resolved before the build');
});

test('DIR-069 S4: non-inline skills render as shaded pills, not raw bullets', () => {
    const src = read(DOCX);
    const start = src.indexOf('function buildSkillsBlock');
    const body = src.slice(start, src.indexOf('\nfunction ', start + 10));
    assert.match(body, /shading: \{ fill: 'F1F5F9' \}/, 'skills must be shaded pills');
    assert.match(body, /pillChildren/, 'skills must render as pill runs');
    // The linear (default) path must no longer emit bullets. Only the legacy
    // multi-column branch may still reference the bullet numbering.
    const bulletUses = (body.match(/numbering: \{ reference: BULLET_REF/g) || []).length;
    assert.equal(bulletUses, 1, `only the legacy columns branch may use bullets, found ${bulletUses}`);
});

test('DIR-069 S5: the free-tier watermark is stamped into the DOCX footer', () => {
    const src = read(DOCX);
    assert.match(src, /resume\._watermark && resume\._watermark\.enableFreeWatermark/, 'the footer must honour the watermark flag');
    assert.match(src, /Created with IME365 \(Free Plan\)/, 'the branded tag must be present');
    const backend = read('backend/index.js');
    const stamps = (backend.match(/_watermark: \(!isPaidOwner/g) || []).length;
    assert.equal(stamps, 2, 'both DOCX routes must compute the watermark flag');
});

test('DIR-069 S6: the recruiter draft gate re-verifies the employer claim', () => {
    const backend = read('backend/index.js');
    const at = backend.indexOf("app.post('/api/public-export-docx'");
    const route = backend.slice(at, at + 5200);
    assert.match(route, /let employerClaim = false/, 'an employer-claim branch must exist');
    assert.match(route, /repo\.getJob\(claimJobId\)/, 'the job must be loaded');
    assert.match(route, /String\(job\.employerId \|\| job\.employer_id \|\| ''\) === req\.user\.uid/, 'job ownership must be verified');
    assert.match(route, /repo\.getApplication\(claimApplicationId\)/, 'the application must be loaded');
    assert.match(route, /applicationResumeId === String\(resumeId\)/, 'the application must reference exactly this resume');
    assert.match(route, /repo\.getResume\(applicantId, String\(resumeId\)\)/, 'the draft resume is fetched only after the claim holds');
    // The published-only rule must remain the fallback.
    assert.match(route, /if \(!employerClaim\) \{[\s\S]*?publicationMode !== 'explicit'/, 'the published-only rule must remain the fallback');
});

test('DIR-069 S7: the recruiter drawer forwards the employer claim to the DOCX route', () => {
    const src = read('src/components/EmployerPortal/EmployerApplicantPipeline.jsx');
    assert.match(src, /jobId: resumeTarget\?\.jobId/, 'the drawer must forward the job id');
    assert.match(src, /applicationId: resumeTarget\?\.id/, 'the drawer must forward the application id');
    const downloader = read('src/utils/exportDownloader.js');
    assert.match(downloader, /if \(jobId && applicationId\)/, 'the claim must require BOTH identifiers');
    assert.match(downloader, /payload\.jobId = String\(jobId\)/, 'the downloader must forward the claim');
});

// ── Functional assertions ────────────────────────────────────────────────────

test('DIR-069 F1: a candidate photo is embedded, and omitted gracefully when absent', async () => {
    const withPhoto = await unzip({ firstname: 'Babu', lastname: 'M', template: 'Cv1', photo: PNG_1PX });
    const media = Object.keys(withPhoto.archive.files).filter((f) => f.startsWith('word/media/'));
    assert.ok(media.length >= 1, 'the photo must be written into word/media');
    assert.match(withPhoto.xml, /<w:drawing/, 'the photo must render as a drawing');

    const withoutPhoto = await unzip({ firstname: 'Babu', lastname: 'M', template: 'Cv1' });
    const noMedia = Object.keys(withoutPhoto.archive.files).filter((f) => f.startsWith('word/media/'));
    assert.equal(noMedia.length, 0, 'no photo must mean no media part');
    assert.doesNotMatch(withoutPhoto.xml, /<w:drawing/, 'no photo must mean no drawing');
});

test('DIR-069 F2: a rejected photo value never breaks the export', async () => {
    // A loopback host must be refused by the allowlist, and the export must still succeed.
    const result = await unzip({ firstname: 'Babu', lastname: 'M', template: 'Cv1', photo: 'https://127.0.0.1/secret.png' });
    assert.doesNotMatch(result.xml, /<w:drawing/, 'a non-allowlisted host must not be fetched');
    assert.ok(result.buffer.length > 0, 'the export must still produce a document');
});

test('DIR-069 F3: the free-tier watermark reaches the DOCX footer', async () => {
    const result = await unzip({
        firstname: 'Babu', lastname: 'M', template: 'Cv1',
        _watermark: { enableFreeWatermark: true, watermarkText: 'Created with IME365 (Free Plan)' },
    });
    const footerKey = Object.keys(result.archive.files).find((f) => /^word\/footer\d*\.xml$/.test(f));
    assert.ok(footerKey, 'the document must carry a footer');
    const footerXml = await result.archive.file(footerKey).async('string');
    assert.match(footerXml, /Created with IME365 \(Free Plan\)/, 'the branded watermark tag must be in the footer');

    const paid = await unzip({ firstname: 'Babu', lastname: 'M', template: 'Cv1' });
    const paidFooterKey = Object.keys(paid.archive.files).find((f) => /^word\/footer\d*\.xml$/.test(f));
    const paidFooter = paidFooterKey ? await paid.archive.file(paidFooterKey).async('string') : '';
    assert.doesNotMatch(paidFooter, /Created with IME365/, 'a paid export must carry no watermark tag');
});

test('DIR-069 F4: skills render as shaded pills', async () => {
    const result = await unzip({
        firstname: 'Babu', lastname: 'M', template: 'Cv1',
        skills: [{ name: 'Critical Care' }, { name: 'ACLS' }],
    });
    assert.match(result.xml, /w:fill="F1F5F9"/, 'skill pills must be shaded #F1F5F9');
});

test('DIR-069 F5: a heavy 2-column resume emits a full-width continuation section', async () => {
    const heavy = {
        firstname: 'Babu', lastname: 'M', template: 'Cv1',
        summary: 'Senior critical-care nurse with a decade of ICU experience. '.repeat(6),
        employments: Array.from({ length: 24 }, (_, i) => ({
            jobTitle: `Registered Nurse ${i + 1}`,
            employer: `City Hospital ${i + 1}`,
            begin: '2010', end: '2020',
            description: 'Delivered critical care to patients and coordinated multidisciplinary teams across a busy unit, mentoring new staff.',
        })),
    };
    const heavyResult = await unzip(heavy);
    assert.match(heavyResult.xml, /w:type w:val="nextPage"|nextPage/,
        'the continuation must start a new, full-width section');

    const light = await unzip({
        firstname: 'Babu', lastname: 'M', template: 'Cv1',
        summary: 'Short summary.', employments: [{ jobTitle: 'Nurse', employer: 'City Hospital' }],
    });
    assert.doesNotMatch(light.xml, /nextPage/, 'a one-page resume must stay a single section');
});

test('DIR-069 F6: executive-banner and tech-grid certifications render a 2-column card table', async () => {
    for (const template of ['Cv2', 'Cv5']) {
        const result = await unzip({
            firstname: 'Babu', lastname: 'M', template,
            certifications: [
                { title: 'CCRN', issuer: 'AACN', date: '2018' },
                { title: 'ACLS', issuer: 'AHA', date: '2019' },
                { title: 'BLS', issuer: 'AHA', date: '2020' },
                { title: 'PALS', issuer: 'AHA', date: '2021' },
            ],
        });
        const grids = [...result.xml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)]
            .map((m) => [...m[1].matchAll(/w:w="(\d+)"/g)].map((c) => Number(c[1])));
        assert.ok(grids.some((cols) => cols.length === 2 && cols[0] === cols[1]),
            `${template} must emit an equal-width 2-column certification card table`);
    }
});

