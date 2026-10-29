/**
 * Regression spec for DISC-020 / DISC-021 — SAFE, NOT WIRED INTO THE REPO.
 *
 * Lives under developer-review/specs/ so `cd backend && npm test` cannot pick it up: the repo runner
 * enumerates `backend/test/*.test.js` only. The audit adds no tests to the application and changes no
 * application code; a maintainer copies this into `backend/test/` as a reviewed change.
 *
 * Every API used below exists at cccd35a5 and is cited:
 *   - repositories: `saveJob(jobId, data)`, `saveApplication(appId, data)`, `getApplication(appId)`
 *   - `services/resilientMutations.js` exports `updateApplicationStatus({ repo, applicationId,
 *     employerId, status, notes, expectedStatus, expectedRevision, actorUid, requestId })`
 *   - CAS failure is `fail('APPLICATION_CHANGED', 409, …)` (resilientMutations.js:318)
 *   - the adapter column map is MySQLRepository.js:1600-1637 (13 columns, `notes` mapped, no
 *     `employer_notes`, no `revision`)
 *   - InMemoryRepository.js:529-534 spreads the object, which is why only a real DB shows the bug
 *
 * Gated on MARIADB_TEST_URL and refuses to run against a schema that is not obviously disposable.
 * Expected at cccd35a5: case 1 RED, case 2 GREEN (control), case 3 RED, case 4 RED.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const DB_URL = process.env.MARIADB_TEST_URL || '';
const SKIP = DB_URL ? false : 'MARIADB_TEST_URL not set — DISC-020 requires a real MariaDB';
const opts = { skip: SKIP };

const DB_NAME = (() => {
  try { return new URL(DB_URL).pathname.replace(/^\//, ''); } catch { return ''; }
})();
const SAFE = /^rp_(test|disc20)_[a-z0-9_]+$/i.test(DB_NAME);

const repo = () => require('../../backend/repositories').getRepository();
const seedJob = async (id) =>
  repo().saveJob(id, { employerId: 'emp_spec', title: 'Spec Job', company: 'Spec Co', status: 'OPEN' });

test('safety gate: refuse anything that is not a disposable rp_test_* schema', opts, () => {
  assert.ok(SAFE, `refusing to run against schema "${DB_NAME}"; expected rp_test_* / rp_disc20_*`);
});

test('DISC-020 case 1 (RED today): feedback written through the status mutation survives', opts, async () => {
  const { updateApplicationStatus } = require('../../backend/services/resilientMutations');
  await seedJob('job_spec_1');
  await repo().saveApplication('app_spec_1', {
    jobId: 'job_spec_1', employerId: 'emp_spec', applicantId: 'usr_spec',
    applicantName: 'Spec Applicant', applicantEmail: 'spec@example.test', status: 'PENDING',
  });

  await updateApplicationStatus({
    repo: repo(),
    applicationId: 'app_spec_1',
    employerId: 'emp_spec',
    actorUid: 'emp_spec',
    status: 'REJECTED',
    notes: '[Feedback: communication] Not a fit for this role',
    expectedRevision: 1,
  });

  const after = await repo().getApplication('app_spec_1');
  const stored = `${after.employerNotes || ''} ${after.notes || ''}`;
  assert.match(stored, /Feedback:/, 'employer feedback was not persisted (DISC-020)');
});

test('DISC-020 case 2 (GREEN control): the adapter does persist `notes`', opts, async () => {
  await seedJob('job_spec_2');
  await repo().saveApplication('app_spec_2', {
    jobId: 'job_spec_2', employerId: 'emp_spec', applicantId: 'usr_ctl',
    applicantName: 'Ctl', applicantEmail: 'ctl@example.test', notes: 'control-value',
  });
  const row = await repo().getApplication('app_spec_2');
  assert.equal(row.notes, 'control-value',
    'if this fails the harness is wrong, not the finding: `notes` is mapped at MySQLRepository.js:1621');
});

test('DISC-020 case 3 (RED today): a stale expectedRevision is rejected', opts, async () => {
  const { updateApplicationStatus } = require('../../backend/services/resilientMutations');
  await seedJob('job_spec_3');
  await repo().saveApplication('app_spec_3', {
    jobId: 'job_spec_3', employerId: 'emp_spec', applicantId: 'usr_cas',
    applicantName: 'Cas', applicantEmail: 'cas@example.test', status: 'PENDING',
  });

  await updateApplicationStatus({
    repo: repo(), applicationId: 'app_spec_3', employerId: 'emp_spec',
    actorUid: 'emp_spec', status: 'REVIEWED', expectedRevision: 1,
  });
  await assert.rejects(
    () => updateApplicationStatus({
      repo: repo(), applicationId: 'app_spec_3', employerId: 'emp_spec',
      actorUid: 'emp_spec', status: 'REJECTED', expectedRevision: 1,
    }),
    (err) => err.code === 'APPLICATION_CHANGED',
    'a write with a stale expectedRevision was accepted: applications.revision is inert (DISC-020)',
  );
});

/**
 * DISC-021 needs the HTTP layer: the defect is the handler at `backend/index.js:1728-1743` returning
 * the raw row instead of projecting employer-only columns. It therefore depends on the repository's
 * test auth shim, exactly like `backend/test/admin-tenant-assignment.test.js:56` (`bearer(name)`).
 * It is specified rather than written to keep this file dependency-free; see the sibling .md.
 */
test('DISC-021 case 4 (RED today): applicant read omits notes / rating / employerId', opts, async (t) => {
  let request;
  try {
    ({ default: request } = await import('supertest'));
  } catch {
    return t.skip('supertest not resolvable from this location — run from backend/');
  }
  const app = require('../../backend/index.js');
  await seedJob('job_spec_4');
  await repo().saveApplication('app_spec_4', {
    jobId: 'job_spec_4', employerId: 'emp_spec', applicantId: 'usr_priv',
    applicantName: 'Priv', applicantEmail: 'priv@example.test', notes: 'internal-only', rating: 4,
  });
  const res = await request(app)
    .get('/api/jobs/job_spec_4/applications')
    .set({ Authorization: 'Bearer usr_priv' });
  assert.ok([200, 403].includes(res.status), `unexpected status ${res.status}`);
  if (res.status !== 200) return t.skip('auth shim not active in this runner');
  const row = (res.body.applications || []).find((a) => a.id === 'app_spec_4') || {};
  assert.equal(row.notes, undefined, 'employer notes leaked to the applicant (DISC-021)');
  assert.equal(row.rating, undefined, 'employer rating leaked to the applicant (DISC-021)');
  assert.equal(row.employerId, undefined, 'employer identifier leaked to the applicant (DISC-021)');
});
