// @ts-check
/**
 * DIR-007 — Recruiter ATS Pipeline + in-modal candidate resume review.
 *
 * ENVIRONMENT MANDATE (Directive DIR-007):
 *   Drives the live Vite dev server on http://localhost:3000, whose /api/* is
 *   proxied by vite.config.js to the live backend on http://localhost:8080,
 *   which persists to the authoritative MariaDB. This spec starts no server of
 *   its own and never intercepts or fulfills an /api/* route: every response the
 *   browser sees is the real one.
 *
 * ANTI-EMPTY-STATE MANDATE:
 *   A test that passes on zero applicant rows is prohibited. beforeAll seeds a
 *   REAL application — a genuine employer requisition, a genuine candidate
 *   account, and a genuine resume document, all written through the live public
 *   API contract and re-read from the API. The suite then FAILS LOUDLY if that
 *   seeded application is not actually present and resume-bearing, so it can
 *   never silently degrade into a green empty-state test.
 *
 * ZERO FABRICATION:
 *   Nothing is stubbed or invented. Both identities are minted through
 *   firebase-admin for real Firebase Auth users; the resume, the application,
 *   and the stage transition all round-trip through the live API.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR007_WEB_ORIGIN || 'http://localhost:3000';
const API_ORIGIN = process.env.DIR007_API_ORIGIN || 'http://localhost:8080';

/**
 * The candidate must be a DIFFERENT real account from the employer, otherwise the
 * RBAC assertion in Stage 3 would be meaningless (the owner would always pass).
 * When no candidate is configured, one is provisioned as a genuine Firebase Auth
 * user through the admin SDK — a real account in the live project, never a stub.
 */
async function ensureCandidateSession() {
    const configured = process.env.DIR007_CANDIDATE_EMAIL;
    if (configured) {
        const session = await mintFirebaseSession({ email: configured });
        if (session) return session;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || '';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
    const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) return null;
    if (getApps().length === 0) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });

    const email = `dir007.candidate.${Date.now()}@ime365.test`;
    try {
        await getAuth().createUser({ email, emailVerified: true, displayName: 'DIR-007 Candidate' });
    } catch (error) {
        // Already exists is fine; anything else means we cannot provision an identity.
        if (!/already exists/i.test(String(error?.message || ''))) return null;
    }
    return mintFirebaseSession({ email });
}

/**
 * The employer is the account that owns the requisitions. Resolve it from the
 * explicit DIR-007 override first, then from the established platform identity
 * variables, so the suite does not depend on a single ambient variable being
 * inherited by the Playwright worker process.
 */
async function ensureEmployerSession() {
    const candidates = [
        process.env.DIR007_EMPLOYER_EMAIL,
        process.env.DIR006_EMAIL,
        process.env.ADMIN_EMAIL,
    ].filter(Boolean);
    for (const email of candidates) {
        const session = await mintFirebaseSession({ email });
        if (session) return session;
    }
    return null;
}

/** The recruiter/employer identity that owns the requisitions under test. */
const EMPLOYER = await ensureEmployerSession();
/** A distinct real candidate identity that owns the seeded resume. */
const CANDIDATE = await ensureCandidateSession();

const EVIDENCE_DIR = path.join(process.cwd(), '.bridge', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function record(line) {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    fs.appendFileSync(path.join(EVIDENCE_DIR, 'dir007-pipeline.log'), `${stamped}\n`);
    console.log(stamped);
}

/** Seeds the browser session exactly the way the app's own Firebase SDK expects. */
async function bootSession(page, session) {
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        const authUser = {
            uid,
            email,
            emailVerified: true,
            displayName: email.split('@')[0],
            isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
            createdAt: String(Date.now()),
            lastLoginAt: String(Date.now()),
            apiKey,
            appName: '[DEFAULT]',
        };
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(authUser));
        localStorage.setItem('user', uid);
        localStorage.setItem('preferredLanguage', 'en');
        localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
        localStorage.setItem('ime365_privacy_consent_v1', 'denied');
    }, {
        uid: session.uid,
        email: session.email,
        token: session.idToken,
        refreshToken: session.refreshToken,
        apiKey: session.apiKey,
    });
}

function watchForDefects(page) {
    const consoleErrors = [];
    const pageErrors = [];
    const failedApi = [];
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (/favicon|Content Security Policy/i.test(text)) return;
        consoleErrors.push(text);
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('response', (response) => {
        const { pathname } = new URL(response.url());
        if (pathname.startsWith('/api/') && response.status() >= 400) {
            failedApi.push(`${response.status()} ${pathname}`);
        }
    });
    return { consoleErrors, pageErrors, failedApi };
}

const authHeaders = session => ({ Authorization: `Bearer ${session.idToken}`, Accept: 'application/json' });

async function liveJson(session, method, apiPath, body) {
    const response = await fetch(`${API_ORIGIN}${apiPath}`, {
        method,
        headers: { ...authHeaders(session), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* non-JSON bodies are surfaced verbatim by callers */ }
    return { status: response.status, body: parsed, text };
}

/** Seeded fixtures, populated in beforeAll and asserted non-empty by the suite. */
const SEEDED = {
    jobId: '',
    jobTitle: '',
    applicationId: '',
    applicantName: '',
    resumeId: '',
    candidateFirstName: '',
    candidateLastName: '',
};

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
    record(`DIR-007 pipeline run starting. WEB=${WEB_ORIGIN} API=${API_ORIGIN}`);
    record(`employer identity: ${EMPLOYER ? `uid=${EMPLOYER.uid} email=${EMPLOYER.email}` : 'NONE'}`);
    record(`candidate identity: ${CANDIDATE ? `uid=${CANDIDATE.uid} email=${CANDIDATE.email}` : 'NONE'}`);

    // Without both real identities the authenticated pipeline cannot be exercised.
    expect(EMPLOYER, 'No live employer identity (set DIR007_EMPLOYER_EMAIL)').toBeTruthy();
    expect(CANDIDATE, 'No live candidate identity (set DIR007_CANDIDATE_EMAIL)').toBeTruthy();

    const health = await liveJson(EMPLOYER, 'GET', '/api/health');
    expect(health.status).toBe(200);
    expect(health.body?.authoritativeDatabase).toBe('MARIADB');
    record(`live backend health status=${health.status} authority=${health.body?.authoritativeDatabase}`);

    // 1. A real, active requisition owned by the employer identity.
    const jobs = await liveJson(EMPLOYER, 'GET', '/api/employer/jobs');
    expect(jobs.status).toBe(200);
    const activeJobs = (jobs.body?.jobs || []).filter(job => String(job.status || '').toLowerCase() === 'active');
    expect(activeJobs.length, 'employer must own at least one active requisition').toBeGreaterThan(0);
    SEEDED.jobId = activeJobs[0].id;
    SEEDED.jobTitle = activeJobs[0].title;
    record(`seeded against active requisition jobId=${SEEDED.jobId} title="${SEEDED.jobTitle}"`);

    // 2. A real candidate resume document, written through the live resume contract.
    const resumeId = `dir007_resume_${Date.now()}`;
    const SEED_RESUME = {
        firstname: 'Anika',
        lastname: 'Raghavan',
        email: CANDIDATE.email,
        phone: '+919812340001',
        occupation: 'Senior Data Platform Engineer',
        targetRole: 'Senior Data Platform Engineer',
        country: 'India',
        city: 'Bengaluru',
        summary: 'Senior data platform engineer with nine years building streaming ingestion and evaluation infrastructure for machine learning teams.',
        skills: ['Python', 'Apache Spark', 'Kafka', 'Airflow', 'SQL'],
        // The canonical resume contract names these `employments` / `educations`;
        // unknown keys are dropped by the schema, so they must match exactly.
        employments: [{
            jobTitle: 'Senior Data Engineer',
            employer: 'Helios Analytics',
            startDate: '2021-04-01',
            endDate: 'Present',
            description: 'Owned the streaming ingestion platform serving 400 internal analytics workloads and cut pipeline latency by 62 percent.',
        }],
        educations: [{
            degree: 'B.Tech, Computer Science',
            school: 'National Institute of Technology',
            startDate: '2015-08-01',
            endDate: '2019-06-01',
        }],
    };
    const created = await liveJson(CANDIDATE, 'POST', `/api/resumes/${resumeId}`, { ...SEED_RESUME, template: 'Cv1', language: 'en' });
    expect([200, 201], `seeding the candidate resume failed: ${created.text}`).toContain(created.status);
    SEEDED.resumeId = resumeId;
    SEEDED.candidateFirstName = SEED_RESUME.firstname;
    SEEDED.candidateLastName = SEED_RESUME.lastname;
    record(`seeded real candidate resume resumeId=${resumeId} owner=${CANDIDATE.uid}`);

    // 3. A real application by that candidate, carrying that resume, to that requisition.
    SEEDED.applicantName = `${SEED_RESUME.firstname} ${SEED_RESUME.lastname}`;
    const applied = await liveJson(CANDIDATE, 'POST', `/api/jobs/${SEEDED.jobId}/applications`, {
        fullName: SEEDED.applicantName,
        email: CANDIDATE.email,
        phone: SEED_RESUME.phone,
        coverLetter: 'I am applying for this platform engineering role because my nine years of streaming ingestion and evaluation infrastructure work maps directly onto the responsibilities you described. I would welcome the chance to discuss how I can contribute to your data platform roadmap.',
        linkedinUrl: '',
        githubUrl: '',
        resumeId,
    });
    expect([200, 201, 409], `seeding the application failed: ${applied.text}`).toContain(applied.status);
    SEEDED.applicationId = `${CANDIDATE.uid}_${SEEDED.jobId}`;
    record(`seeded real application applicationId=${SEEDED.applicationId} status=${applied.status}`);

    // 4. Anti-empty-state guard: the seeded row MUST exist and MUST carry a resume,
    //    or the suite fails here instead of passing on a zero-row pipeline.
    const pipeline = await liveJson(EMPLOYER, 'GET', `/api/jobs/${SEEDED.jobId}/applications`);
    expect(pipeline.status).toBe(200);
    const rows = pipeline.body?.applications || [];
    const seeded = rows.find(app => app.id === SEEDED.applicationId);
    expect(seeded, 'the seeded application must be visible to the employer pipeline').toBeTruthy();
    expect(seeded.resume_id || seeded.resumeId, 'the seeded application must carry a resume reference').toBeTruthy();
    record(`anti-empty-state guard passed: pipeline rows=${rows.length}, seeded row carries a resume reference`);
});
test('Stage 1 — the recruiter pipeline lists the real applicant with a View Resume control', async ({ page }) => {
    const defects = watchForDefects(page);
    await bootSession(page, EMPLOYER);
    await page.goto(`${WEB_ORIGIN}/employer/applicants`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Applicant ATS Pipeline' }).first())
        .toBeVisible({ timeout: 60_000 });

    // The table must NOT be the empty state — that is the prohibited outcome.
    await expect(page.getByText('No applicants yet')).toHaveCount(0);

    // Real candidate identity read back from the live API, not a hardcoded string.
    await expect(page.getByText(SEEDED.applicantName).first()).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(SEEDED.jobTitle).first()).toBeVisible();

    // The Resume column header and the per-row control must exist.
    await expect(page.getByRole('columnheader', { name: 'Resume' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View Resume' }).first()).toBeVisible();
    record('stage1 pipeline rendered the real applicant with a View Resume control');
    record(`stage1 defects: console=${defects.consoleErrors.length} pageErrors=${defects.pageErrors.length} failedApi=${defects.failedApi.length}`);
    expect(defects.consoleErrors).toEqual([]);
    expect(defects.pageErrors).toEqual([]);
    expect(defects.failedApi).toEqual([]);
});

test('Stage 2 — View Resume opens an in-modal TemplateRenderer with the real candidate document', async ({ page }) => {
    const defects = watchForDefects(page);
    await bootSession(page, EMPLOYER);
    await page.goto(`${WEB_ORIGIN}/employer/applicants`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Applicant ATS Pipeline' }).first())
        .toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: 'View Resume' }).first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 40_000 });

    // Zoom, print and download affordances must all be present in the modal header.
    await expect(dialog.getByRole('button', { name: 'Zoom in resume preview' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Zoom out resume preview' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Print' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Download' })).toBeVisible();
    record('stage2 in-modal viewer exposed zoom/print/download affordances');

    // The rendered canvas must contain the candidate's ACTUAL resume content.
    const canvas = page.getByTestId('employer-resume-canvas');
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    await expect(canvas.getByText(SEEDED.candidateFirstName).first()).toBeVisible({ timeout: 60_000 });
    await expect(canvas.getByText(SEEDED.candidateLastName).first()).toBeVisible();
    await expect(canvas.getByText('Helios Analytics').first()).toBeVisible({ timeout: 40_000 });
    await expect(canvas.getByText('National Institute of Technology').first()).toBeVisible({ timeout: 40_000 });
    record('stage2 TemplateRenderer displayed the candidate real personal info, experience and education');

    // Zoom must actually enlarge the rendered page.
    const resumePage = dialog.getByTestId('employer-resume-page');
    // Guard against a percentage/scale mix-up: at 100% the A4 page must render at a
    // realistic print width. A bare `zoom: 100` would scale the page 100x.
    const widthBefore = await resumePage.evaluate(node => node.getBoundingClientRect().width);
    expect(widthBefore, 'the resume page must render at a realistic print width at 100% zoom')
        .toBeGreaterThan(600);
    expect(widthBefore).toBeLessThan(900);

    await dialog.getByRole('button', { name: 'Zoom in resume preview' }).click();
    const widthAfter = await resumePage.evaluate(node => node.getBoundingClientRect().width);
    expect(widthAfter).toBeGreaterThan(widthBefore);
    record(`stage2 zoom control enlarged the rendered page ${Math.round(widthBefore)}px -> ${Math.round(widthAfter)}px`);

    record(`stage2 defects: console=${defects.consoleErrors.length} pageErrors=${defects.pageErrors.length} failedApi=${defects.failedApi.length}`);
    expect(defects.consoleErrors).toEqual([]);
    expect(defects.pageErrors).toEqual([]);
    expect(defects.failedApi).toEqual([]);

    await dialog.getByRole('button', { name: 'Close resume preview' }).click();
    await expect(dialog).toHaveCount(0);
});
test('Stage 3 — the resume endpoint enforces owner RBAC and returns the real document', async () => {
    // Authorized owner: 200 with the real resume.
    const owner = await liveJson(EMPLOYER, 'GET', `/api/employer/jobs/${SEEDED.jobId}/applications/${SEEDED.applicationId}/resume`);
    expect(owner.status).toBe(200);
    expect(owner.body?.success).toBe(true);
    expect(owner.body?.resume?.id).toBe(SEEDED.resumeId);
    expect(owner.body?.resume?.firstname).toBe(SEEDED.candidateFirstName);
    expect(Array.isArray(owner.body?.resume?.employments) && owner.body.resume.employments.length > 0).toBe(true);
    expect(Array.isArray(owner.body?.resume?.educations) && owner.body.resume.educations.length > 0).toBe(true);
    record('stage3 owner read returned the real candidate resume with experience and education');

    // Unauthorized candidate (not the job owner): must be refused, never leak.
    const denied = await liveJson(CANDIDATE, 'GET', `/api/employer/jobs/${SEEDED.jobId}/applications/${SEEDED.applicationId}/resume`);
    expect(denied.status).toBe(403);
    expect(denied.body?.resume).toBeUndefined();
    record(`stage3 non-owner read refused with ${denied.status} and leaked no resume payload`);
});

test('Stage 4 — a stage transition persists through the live API', async ({ page }) => {
    const defects = watchForDefects(page);
    await bootSession(page, EMPLOYER);
    await page.goto(`${WEB_ORIGIN}/employer/applicants`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Applicant ATS Pipeline' }).first())
        .toBeVisible({ timeout: 60_000 });

    const row = page.locator('tr', { hasText: SEEDED.applicantName }).first();
    await expect(row).toBeVisible({ timeout: 40_000 });

    const stageSelect = row.locator('select');
    await expect(stageSelect).toBeVisible();
    const target = await stageSelect.locator('option').nth(1).getAttribute('value');
    expect(target, 'the stage control must offer at least one transition').toBeTruthy();

    await stageSelect.selectOption(target);

    // The row must reflect the new stage once the authoritative write lands.
    await expect(row.getByText(target, { exact: true })).toBeVisible({ timeout: 30_000 });
    record(`stage4 pipeline row now reports stage="${target}"`);

    // Verify the write reached the API surface, not just local component state.
    const verify = await liveJson(EMPLOYER, 'GET', `/api/jobs/${SEEDED.jobId}/applications`);
    const persisted = (verify.body?.applications || []).find(app => app.id === SEEDED.applicationId);
    expect(persisted, 'the transitioned application must still exist in the pipeline').toBeTruthy();
    expect(String(persisted.status || '').toLowerCase()).toBe(target);
    record(`stage4 API confirms persisted status="${persisted.status}" revision=${persisted.revision}`);

    record(`stage4 defects: console=${defects.consoleErrors.length} pageErrors=${defects.pageErrors.length} failedApi=${defects.failedApi.length}`);
    expect(defects.consoleErrors).toEqual([]);
    expect(defects.pageErrors).toEqual([]);
    expect(defects.failedApi).toEqual([]);
});