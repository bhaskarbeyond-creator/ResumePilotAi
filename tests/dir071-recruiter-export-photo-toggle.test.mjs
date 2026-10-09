/**
 * DIR-071 — recruiter ATS pipeline Word/PDF export + global candidate photo
 * visibility toggle enforcement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);

const { resolveEmployerClaim } = require(path.join(ROOT, 'backend/security/employerClaim.js'));
const { normalizeResumeData } = await import(new URL('../src/utils/resumeData.js', import.meta.url).href);
const { normalizeTemplateData } = await import(new URL('../src/cv-templates/templateUtils.js', import.meta.url).href);

test('DIR-071 S1: optionalAuth decodes a Bearer token but never rejects', () => {
    const auth = read('backend/security/auth.js');
    assert.match(auth, /function bearerTokenFrom\(req\)/, 'the Bearer extraction must be shared');
    assert.match(auth, /async function resolveUser\(decoded\)/, 'the req.user shape must be shared');
    assert.match(auth, /async function optionalAuth\(req, res, next\)/, 'optionalAuth must exist');
    assert.match(auth, /optionalAuth,/, 'optionalAuth must be exported');
    const optional = auth.slice(auth.indexOf('async function optionalAuth'));
    assert.ok(!/unauthorized\(res/.test(optional.slice(0, 900)),
        'optionalAuth must never 401 — a public route stays public');
    // requireAuth and optionalAuth must build the SAME identity shape.
    assert.match(auth, /req\.user = await resolveUser\(await verifyToken\(token\)\)/,
        'both paths must go through the one resolveUser helper');
});

test('DIR-071 S2: the public API branch runs optionalAuth', () => {
    const index = read('backend/index.js');
    assert.match(index, /const \{ requireAuth, optionalAuth,/, 'index must import optionalAuth');
    assert.match(index, /if \(isPublicApiPath\(req\.path\)\) return optionalAuth\(req, res, next\);/,
        'public paths must populate req.user when a token is present');
});

test('DIR-071 S3: ONE employer-claim helper is called by BOTH export routes', () => {
    const index = read('backend/index.js');
    assert.match(index, /const \{ resolveEmployerClaim \} = require\('\.\/security\/employerClaim'\)/,
        'the shared claim module must be required');
    const calls = index.match(/await resolveEmployerClaim\(\{/g) || [];
    assert.equal(calls.length, 2, `both the PDF and DOCX route must call the claim helper (found ${calls.length})`);
    // The PDF route must have a claim branch it never had before.
    const pdfRoute = index.slice(index.indexOf("app.post(['/api/export', '/api/public-export']"));
    assert.match(pdfRoute.slice(0, 6000), /const claim = await resolveEmployerClaim\(\{/,
        'the PDF public route must verify the employer claim');
    // The strict published-only fallback must survive on both routes.
    assert.match(index, /publicationMode !== 'explicit'/g, 'the published-only rule must remain');
});

test('DIR-071 S4: the recruiter drawer authenticates and passes robust identifiers', () => {
    const src = read('src/components/EmployerPortal/EmployerApplicantPipeline.jsx');
    assert.match(src, /withAuth: true/, 'the recruiter IS authenticated — the claim cannot be evaluated otherwise');
    assert.doesNotMatch(src, /withAuth: false/, 'the anonymous export path must be gone');
    assert.match(src, /jobId: resumeTarget\?\.jobId \?\? resumeTarget\?\.job_id \?\? null/,
        'jobId must accept both row shapes');
    assert.match(src, /applicationId: resumeTarget\?\.applicationId \?\? resumeTarget\?\.application_id \?\? resumeTarget\?\.id \?\? null/,
        'applicationId must accept both row shapes');
});

test('DIR-071 S5: photo visibility is enforced at all four boundaries', () => {
    for (const rel of [
        'src/cv-templates/templateUtils.js',
        'src/utils/resumeData.js',
        'backend/repositories/MySQLRepository.js',
    ]) {
        const src = read(rel);
        assert.match(src, /DIR-071/, `${rel} must carry the DIR-071 suppression`);
        assert.match(src, /hidePhoto === true/, `${rel} must honour hidePhoto`);
        assert.match(src, /includePhoto === false/, `${rel} must honour includePhoto`);
    }
    const repo = read('backend/repositories/MySQLRepository.js');
    assert.match(repo, /if \(!snapshot\.showPhoto\) snapshot\.photo = null;/,
        'the publication snapshot must null a hidden photo');
    const builder = read('src/components/BuildResume/BuildResume.jsx');
    assert.match(builder, /persistLatest,/, 'the builder must let the export client persist the current state');
    const client = read('src/utils/exportDownloader.js');
    assert.match(client, /if \(typeof persistLatest === 'function'\)/, 'the export client must honour persistLatest');
});

// ── Functional proofs ────────────────────────────────────────────────────────

const PHOTO = 'data:image/png;base64,AAAA';
const BASE = { firstname: 'Babu', lastname: 'M', photo: PHOTO };

test('DIR-071 F1: a hidden photo is null at every boundary, a visible one is not', () => {
    const cases = [
        ['default', {}, false],
        ['showPhoto:true', { showPhoto: true }, false],
        ['showPhoto:false', { showPhoto: false }, true],
        ['hidePhoto:true', { hidePhoto: true }, true],
        ['includePhoto:false', { includePhoto: false }, true],
        ['hidePhoto:false', { hidePhoto: false }, false],
    ];
    for (const [label, extra, shouldHide] of cases) {
        const resume = normalizeResumeData({ ...BASE, ...extra });
        const template = normalizeTemplateData({ ...BASE, ...extra });
        if (shouldHide) {
            assert.equal(resume.photo, null, `normalizeResumeData must null the photo (${label})`);
            assert.equal(template.photo, null, `normalizeTemplateData must null the photo (${label})`);
            assert.equal(resume.showPhoto, false, `showPhoto must be false (${label})`);
            assert.equal(template.showPhoto, false, `template showPhoto must be false (${label})`);
        } else {
            assert.equal(resume.photo, PHOTO, `normalizeResumeData must keep the photo (${label})`);
            assert.equal(template.photo, PHOTO, `normalizeTemplateData must keep the photo (${label})`);
        }
    }
});

/** A repository double where only the caller's own job/application exist. */
function makeRepo({ employerId = 'emp-1', applicationJobId = 'job-1', applicationResumeId = 'resume-1', applicantId = 'cand-1', stored = { firstname: 'Babu' } } = {}) {
    return {
        getJob: async (id) => (id === 'job-1' ? { id, employerId } : null),
        getApplication: async (id) => (id === 'app-1'
            ? { id, jobId: applicationJobId, resumeId: applicationResumeId, applicantId }
            : null),
        getResume: async (uid, id) => (uid === applicantId && id === 'resume-1' ? stored : null),
    };
}

const CALLER = { uid: 'emp-1' };
const CLAIM = { jobId: 'job-1', applicationId: 'app-1', resumeId: 'resume-1' };

test('DIR-071 F2: a verified claim returns the candidate ACTUAL applied resume', async () => {
    const stored = { firstname: 'Babu', lastname: 'M' };
    const claim = await resolveEmployerClaim({ repo: makeRepo({ stored }), user: CALLER, ...CLAIM });
    assert.ok(claim, 'the owner of the job must be able to export the applicant resume');
    assert.deepEqual(claim.stored, stored);
    assert.equal(claim.ownerUid, 'cand-1', 'the owner must be the applicant, never the caller');
});

test('DIR-071 F3: a FOREIGN employer can never claim another tenant applicant (zero IDOR)', async () => {
    const claim = await resolveEmployerClaim({ repo: makeRepo(), user: { uid: 'emp-OTHER' }, ...CLAIM });
    assert.equal(claim, null, 'a job owned by someone else must be rejected');
});

test('DIR-071 F4: a mismatched resumeId is rejected', async () => {
    const claim = await resolveEmployerClaim({ repo: makeRepo(), user: CALLER, ...CLAIM, resumeId: 'resume-OTHER' });
    assert.equal(claim, null, 'the application must reference exactly this resume');
});

test('DIR-071 F5: an application belonging to another job is rejected', async () => {
    const claim = await resolveEmployerClaim({
        repo: makeRepo({ applicationJobId: 'job-OTHER' }), user: CALLER, ...CLAIM,
    });
    assert.equal(claim, null, 'the application must belong to the claimed job');
});

test('DIR-071 F6: anonymous callers, missing ids and malformed resumes are all rejected', async () => {
    assert.equal(await resolveEmployerClaim({ repo: makeRepo(), user: undefined, ...CLAIM }), null, 'anonymous must be rejected');
    assert.equal(await resolveEmployerClaim({ repo: makeRepo(), user: {}, ...CLAIM }), null, 'a user without a uid must be rejected');
    assert.equal(await resolveEmployerClaim({ repo: makeRepo(), user: CALLER, ...CLAIM, jobId: '' }), null, 'a missing jobId must be rejected');
    assert.equal(await resolveEmployerClaim({ repo: makeRepo(), user: CALLER, ...CLAIM, applicationId: '' }), null, 'a missing applicationId must be rejected');
    assert.equal(await resolveEmployerClaim({ repo: makeRepo(), user: CALLER, ...CLAIM, jobId: 'bad id!' }), null, 'a malformed jobId must be rejected');
    assert.equal(await resolveEmployerClaim({
        repo: makeRepo({ stored: ['not', 'an', 'object'] }), user: CALLER, ...CLAIM,
    }), null, 'an array resume must be rejected');
    assert.equal(await resolveEmployerClaim({
        repo: makeRepo({ applicantId: '' }), user: CALLER, ...CLAIM,
    }), null, 'a missing applicant id must be rejected');
});

test('DIR-071 F7: a repository without the required readers degrades safely', async () => {
    assert.equal(await resolveEmployerClaim({ repo: {}, user: CALLER, ...CLAIM }), null);
    assert.equal(await resolveEmployerClaim({ repo: null, user: CALLER, ...CLAIM }), null);
    // A throwing reader must not propagate — the route falls back to published-only.
    const throwing = {
        getJob: async () => { throw new Error('db down'); },
        getApplication: async () => { throw new Error('db down'); },
        getResume: async () => { throw new Error('db down'); },
    };
    assert.equal(await resolveEmployerClaim({ repo: throwing, user: CALLER, ...CLAIM }), null);
});

