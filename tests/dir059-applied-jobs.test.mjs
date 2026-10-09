import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-059 — Job Applications real data pipeline, Kanban sync & withdrawal.
 *
 * PROVEN DEFECTS this suite pins:
 *   1. `getUserJobApplications` was literally `return getTrackedJobs(userId)`, so
 *      /dashboard/applied-jobs rendered KANBAN rows instead of applications.
 *   2. The `applications` row has no jobTitle/company/location/salary, so every
 *      row rendered blank without enrichment.
 *   3. The table defaults status to `PENDING` while the UI counted `'pending'`,
 *      so the Pending tile could never match.
 *   4. No withdrawal and no Kanban promotion existed.
 */

const CLIENT_API = 'src/services/api/platform.js';
const APPLIED_JOBS = 'src/components/AppliedJobs/AppliedJobs.jsx';
const BACKEND = 'backend/routes/jobsData.js';

const read = (file) => fs.readFile(file, 'utf8');

/** Strip comments so assertions test CODE, not prose that names the defect. */
const stripComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/* ── S1: the client reads the REAL applications endpoint ───────────────────── */

test('DIR-059: getUserJobApplications reads /api/jobs-data/applications/list', async () => {
  const src = await read(CLIENT_API);
  const start = src.indexOf('export async function getUserJobApplications');
  assert.ok(start > -1, 'getUserJobApplications must exist');
  const body = src.slice(start, start + 420);
  assert.match(body, /apiJson\('\/api\/jobs-data\/applications\/list'\)/, 'must call the applications list endpoint');
  assert.doesNotMatch(body, /getTrackedJobs\(/, 'must NOT return the Kanban tracker rows');
});

test('DIR-059: withdrawal calls DELETE /api/jobs-data/applications/:id', async () => {
  const src = await read(CLIENT_API);
  const start = src.indexOf('export async function withdrawJobApplication');
  assert.ok(start > -1, 'withdrawJobApplication must exist');
  const body = src.slice(start, start + 420);
  assert.match(body, /method: 'DELETE'/, 'withdrawal must be a DELETE');
  assert.match(body, /\/api\/jobs-data\/applications\/\$\{encodeURIComponent\(applicationId\)\}/, 'must target the owner-scoped application route');
});

/* ── S2: enrichment + the status vocabulary fix ────────────────────────────── */

test('DIR-059: AppliedJobs enriches each row from the jobs table', async () => {
  const src = await read(APPLIED_JOBS);
  assert.match(src, /getJobById\(jobId\)/, 'rows must be enriched via getJobById');
  assert.match(src, /normaliseApplication\(row, job\)/, 'the view model must come from the normaliser');
  assert.match(src, /row\?\.job_id \|\| row\?\.jobId/, 'the job id is read from the application row');
});

test('DIR-059: the PENDING -> canonical status map fixes the vocabulary mismatch', async () => {
  const src = await read(APPLIED_JOBS);
  assert.match(src, /pending: 'applied'/, 'the stored PENDING status must map to the canonical applied');
  assert.match(src, /canonicalApplicationStatus/, 'a single canonicaliser must be used');
  assert.match(src, /getStatusCount\('applied'\)/, 'the tile must count the canonical applied status');
  assert.doesNotMatch(src, /getStatusCount\('pending'\)/, 'the never-matching pending count must be gone');
});

/* ── S3: withdrawal uses the shared dialog, with rollback ──────────────────── */

test('DIR-059: withdrawal is confirm-gated (no native dialog) and rolls back on failure', async () => {
  const src = await read(APPLIED_JOBS);
  const code = stripComments(src);
  assert.match(src, /useConfirmDialog/, 'must use the shared Cuba confirm dialog');
  assert.match(code, /await confirm\(\{/, 'withdrawal must await a confirmation');
  assert.doesNotMatch(code, /window\.confirm/, 'native confirm is forbidden');
  assert.match(code, /setAppliedJobs\(snapshot\)/, 'a failed withdrawal must roll back');
  assert.match(code, /\{confirmationDialog\}/, 'the dialog must be mounted');
});

/* ── S4: 1-click Kanban promotion, idempotent ──────────────────────────────── */

test('DIR-059: Track in Kanban uses createTrackedJob with status applied and is idempotent', async () => {
  const src = await read(APPLIED_JOBS);
  assert.match(src, /createTrackedJob\(user\?\.uid, \{/, 'must create a tracker row');
  assert.match(src, /status: 'applied'/, 'the promoted row must use the canonical applied status');
  assert.match(src, /trackedJobIds\.has\(job\.id\)/, 'the action must detect an already-tracked application');
  assert.match(src, /data-testid="track-in-kanban"/, 'the action must be addressable in a DOM crawl');
  assert.match(src, /data-testid="withdraw-application"/, 'the withdrawal must be addressable in a DOM crawl');
});

/* ── Regression: the backend ownership guards must remain ──────────────────── */

test('DIR-059: the backend application routes stay owner-scoped', async () => {
  const src = await read(BACKEND);
  const del = src.slice(src.indexOf("router.delete('/applications/:id'"), src.indexOf("router.delete('/applications/:id'") + 900);
  assert.match(del, /!== req\.user\.uid/, 'delete must compare the owner');
  assert.match(del, /403/, 'a non-owner must be refused');
  assert.match(del, /404/, 'a missing application must be a 404');
  const list = src.slice(src.indexOf("router.get('/applications/list'"), src.indexOf("router.get('/applications/list'") + 500);
  assert.match(list, /applicantId: req\.user\.uid/, 'list must be scoped to the caller');
});
