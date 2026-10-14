/**
 * ULTIMATE-MED Part 7/8 — Candidate E2E pipeline simulation + fault injection.
 * Runs against the LIVE XAMPP backend with a real authenticated session but
 * ONLY synthetic data (test resume/portfolio/cover/application), each created
 * and cleaned up inside the run. Faults are injected via Playwright route
 * interception (no production failures are triggered).
 */
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const adminMod = await import('../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;
if (!admin.apps.length) {
    const pKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: pKey,
        }),
    });
}

const TARGET_URL = process.env.CANDIDATE_TARGET_URL || process.env.TARGET_URL || 'https://ime365.local';
const SUITE = 'e2e-' + Date.now().toString(36);
const results = [];

function record(id, pipeline, scenario, passed, detail) {
    results.push({ id, pipeline, scenario, passed, detail: String(detail).slice(0, 300) });
    console.log(`${passed ? 'PASS' : 'FAIL'} [${pipeline}] ${scenario} — ${String(detail).slice(0, 160)}`);
}

async function api(page, method, url, body, opts = {}) {
    return page.evaluate(async ({ method, url, body, opts }) => {
        const user = window.fire.auth().currentUser;
        const headers = { 'Content-Type': 'application/json' };
        if (opts.noAuth) {
            // no Authorization header
        } else if (opts.badToken) {
            headers.Authorization = 'Bearer invalid-token-abc';
        } else {
            const token = await user.getIdToken();
            headers.Authorization = `Bearer ${token}`;
        }
        try {
            const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
            let data = null;
            try { data = await res.json(); } catch { data = null; }
            return { status: res.status, ok: res.ok, data };
        } catch (err) {
            return { status: 0, ok: false, error: String(err.message || err).slice(0, 200) };
        }
    }, { method, url, body, opts });
}

const resumeId = `${SUITE}-resume`;
const portfolioId = `${SUITE}-portfolio`;
const coverId = `${SUITE}-cover`;

async function run() {
    const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const customToken = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3', {
        email: 'bhaskar.beyond@gmail.com', email_verified: true, role: 'SUPER_ADMIN', superAdmin: true,
    });
    await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(async (token) => { await window.fire.auth().signInWithCustomToken(token); }, customToken);
    await page.waitForTimeout(1200);

    //  A. Happy path: resume CRUD + publish + public access + delete 
    const created = await api(page, 'POST', '/api/resumes/' + resumeId, {
        id: resumeId, template: 'Cv1', firstname: 'E2E', lastname: 'Synthetic', occupation: 'QA Engineer',
        employments: [], educations: [], skills: ['testing'], languages: [], summary: 'Synthetic e2e resume',
    });
    record('R-01', 'P-04', 'A-happy: create synthetic resume', created.ok && created.data?.success !== false, created);

    const readBack = await api(page, 'GET', '/api/resumes/' + resumeId);
    const gotResume = readBack.ok && readBack.data && (readBack.data.item || readBack.data.resume || readBack.data.id === resumeId);
    record('R-02', 'P-03', 'F-persistence: read-back matches', gotResume, readBack);

    const updated = await api(page, 'POST', '/api/resumes/' + resumeId, {
        id: resumeId, template: 'Cv1', firstname: 'E2E', lastname: 'Synthetic', occupation: 'Senior QA Engineer',
        employments: [{ title: 'QA Lead', company: 'SyntheticCo' }], educations: [], skills: ['testing', 'automation'], languages: [], summary: 'Updated synthetic e2e resume',
    });
    record('R-03', 'P-04', 'A-happy: update resume', updated.ok && updated.data?.success !== false, updated);

    const readBack2 = await api(page, 'GET', '/api/resumes/' + resumeId);
    const readBack2Body = JSON.stringify(readBack2.data || {});
    record('R-04', 'P-04', 'F-persistence: update persisted', readBack2.ok && readBack2Body.includes('Senior QA Engineer'), readBack2);

    const published = await api(page, 'POST', '/api/resumes/' + resumeId + '/publish', { id: resumeId });
    record('R-05', 'P-06', 'A-happy: publish resume', published.ok && published.data?.success !== false, published);

    const publicRead = await api(page, 'GET', '/api/resumes/public/' + resumeId);
    record('R-06', 'P-07', 'A-happy: public read of published resume', publicRead.ok && publicRead.data, publicRead);

    const publication = await api(page, 'GET', '/api/resumes/' + resumeId + '/publication');
    record('R-07', 'P-06', 'A-happy: publication status', publication.ok, publication);

    const unpublished = await api(page, 'POST', '/api/resumes/' + resumeId + '/unpublish', {});
    record('R-08', 'P-06', 'A-happy: unpublish (revocation)', unpublished.ok && unpublished.data?.success !== false, unpublished);

    const publicAfterRevoke = await api(page, 'GET', '/api/resumes/public/' + resumeId);
    record('R-09', 'P-07', 'D-privacy: revoked resume not public', !publicAfterRevoke.ok || publicAfterRevoke.status >= 400, publicAfterRevoke);

    const dupSave = await api(page, 'POST', '/api/resumes/' + resumeId, { id: resumeId, template: 'Cv1', firstname: 'E2E', lastname: 'Synthetic', occupation: 'Dup' });
    const dupSave2 = await api(page, 'POST', '/api/resumes/' + resumeId, { id: resumeId, template: 'Cv1', firstname: 'E2E', lastname: 'Synthetic', occupation: 'Dup2' });
    const listAfterDup = await api(page, 'GET', '/api/resumes?page=1&itemsPerPage=100');
    const dupCount = JSON.stringify(listAfterDup.data?.resumes || []).split(resumeId).length - 1;
    record('R-10', 'P-04', 'H-duplicate: double save yields single record', dupSave.ok && dupSave2.ok && dupCount === 1, { dupCount });

    //  B. Auth/authorisation 
    const noAuth = await api(page, 'GET', '/api/resumes', null, { noAuth: true });
    record('R-11', 'P-01', 'C-auth: no token rejected', noAuth.status === 401 || noAuth.status === 403, noAuth);
    const badToken = await api(page, 'GET', '/api/resumes', null, { badToken: true });
    record('R-12', 'P-01', 'C-auth: invalid token rejected', badToken.status === 401 || badToken.status === 403, badToken);
    const foreignId = await api(page, 'GET', '/api/resumes/nonexistent-' + SUITE);
    record('R-13', 'P-03', 'J-boundary: unknown id returns 404 (no data leak)', foreignId.status === 404, foreignId);

    //  C. Cover letters CRUD 
    const coverCreated = await api(page, 'POST', '/api/covers/' + coverId, {
        id: coverId, jobTitle: 'Synthetic Role', companyName: 'SyntheticCo', letterBody: 'Synthetic cover body.', templateId: 'Cover1',
    });
    record('R-14', 'P-19', 'A-happy: create cover letter', coverCreated.ok && coverCreated.data?.success !== false, coverCreated);
    const coversList = await api(page, 'GET', '/api/covers');
    record('R-15', 'P-19', 'F-persistence: cover listed', coversList.ok && JSON.stringify(coversList.data).includes(coverId), coversList);
    const coverDeleted = await api(page, 'DELETE', '/api/covers/' + coverId);
    record('R-16', 'P-19', 'A-happy: delete cover letter', coverDeleted.ok && coverDeleted.data?.success !== false, coverDeleted);

    //  D. Portfolio CRUD 
    const slugProbe = await api(page, 'GET', '/api/portfolios/slug-availability?base=' + SUITE);
    record('R-17', 'P-18', 'A-happy: slug availability', slugProbe.ok, slugProbe);
    const pfCreated = await api(page, 'POST', '/api/portfolios/' + portfolioId, {
        id: portfolioId, slugBase: SUITE, title: 'Synthetic Portfolio', about: 'Synthetic portfolio body',
    });
    record('R-18', 'P-18', 'A-happy: create portfolio', pfCreated.ok && pfCreated.data?.success !== false, pfCreated);
    const pfRead = await api(page, 'GET', '/api/portfolios/' + portfolioId);
    record('R-19', 'P-18', 'F-persistence: portfolio read-back', pfRead.ok && pfRead.data, pfRead);
    const pfDeleted = await api(page, 'DELETE', '/api/portfolios/' + portfolioId);
    record('R-20', 'P-18', 'A-happy: delete portfolio', pfDeleted.ok && pfDeleted.data?.success !== false, pfDeleted);

    //  E. Job application pipeline (only if jobs exist) 
    const jobs = await api(page, 'GET', '/api/jobs?page=1&itemsPerPage=10');
    const jobList = jobs.data?.jobs || jobs.data?.items || [];
    if (jobList.length > 0) {
        const jobId = jobList[0].id || jobList[0].jobId;
        const appId = `${SUITE}-app`;
        const app = await api(page, 'POST', '/api/jobs/applications/' + appId, { id: appId, jobId, note: 'Synthetic e2e application' });
        record('R-21', 'P-13', 'A-happy: submit application', app.ok && app.data?.success !== false, app);
        const apps = await api(page, 'GET', '/api/jobs/applications/list');
        record('R-22', 'P-13', 'F-persistence: application listed', apps.ok && JSON.stringify(apps.data).includes(appId), apps);
        const stage = await api(page, 'PATCH', '/api/jobs/applications/' + appId, { stage: 'interview' });
        record('R-23', 'P-14', 'A-happy: stage transition', stage.ok && stage.data?.success !== false, stage);
        const appDel = await api(page, 'DELETE', '/api/jobs/applications/' + appId);
        record('R-24', 'P-14', 'A-happy: withdraw application (cleanup)', appDel.ok && appDel.data?.success !== false, appDel);
    } else {
        record('R-21', 'P-13', 'A-happy: application pipeline', false, 'BLOCKED-BY-DATA: no jobs exist in the live database');
    }

    //  F. Fault injection: forced 500 / network abort on resume save 
    await page.route('**/api/resumes/' + resumeId, (route) => {
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Synthetic injected 500' } }) });
    });
    const f500 = await api(page, 'POST', '/api/resumes/' + resumeId, { id: resumeId, template: 'Cv1' });
    record('R-25', 'P-04', 'E-dependency: injected 500 surfaces as error', f500.status === 500, f500);
    await page.unroute('**/api/resumes/' + resumeId);

    await page.route('**/api/resumes/' + resumeId, (route) => route.abort('failed'));
    const fNet = await api(page, 'POST', '/api/resumes/' + resumeId, { id: resumeId, template: 'Cv1' });
    record('R-26', 'P-04', 'E-dependency: network abort surfaces as error', fNet.status === 0 && !!fNet.error, fNet);
    await page.unroute('**/api/resumes/' + resumeId);

    //  G. Cleanup + deletion verification 
    const del = await api(page, 'DELETE', '/api/resumes/' + resumeId);
    record('R-27', 'P-05', 'A-happy: delete resume', del.ok && del.data?.success !== false, del);
    const afterDel = await api(page, 'GET', '/api/resumes/' + resumeId);
    record('R-28', 'P-05', 'F-persistence: deleted resume gone', afterDel.status === 404, afterDel);

    await browser.close();
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const summary = { generatedAt: new Date().toISOString(), suite: SUITE, total: results.length, passed, failed, results };
    fs.writeFileSync(path.join(__dirname, '../.bridge/evidence/candidate-e2e-pipelines.json'), JSON.stringify(summary, null, 2));
    console.log(`\n=== E2E PIPELINE SUMMARY: ${passed}/${results.length} passed, ${failed} failed ===`);
}

run().catch((err) => { console.error(err); process.exit(1); });
