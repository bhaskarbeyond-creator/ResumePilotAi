import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { filterAndSortTrackedJobs, normalizeTrackedJob, validateTrackedJob } from '../src/utils/jobTracker.js';

test('tracked jobs normalize malformed fields and reject required or dangerous values', () => {
  assert.deepEqual(normalizeTrackedJob({ title: '  Engineer  ', company: ' ACME ', status: 'invalid', order: -4 }), {
    title: 'Engineer', company: 'ACME', location: '', url: '', notes: '', deadline: '', status: 'wishlist', order: 0,
  });
  assert.equal(validateTrackedJob({ title: '', company: '' }).valid, false);
  assert.equal(validateTrackedJob({ title: 'Engineer', company: 'ACME', url: 'javascript:alert(1)' }).errors.url, 'Use a valid web address');
  assert.equal(validateTrackedJob({ title: 'Engineer', company: 'ACME', deadline: 'tomorrow' }).errors.deadline, 'Use a valid date');
});

test('tracked job search handles missing and Unicode fields without mutating board order', () => {
  const jobs = [
    { id: '2', title: 'Développeur', company: 'Équipe', location: null, status: 'wishlist', order: 2 },
    { id: '1', title: 'Engineer', company: 'ACME', notes: 'తెలుగు', status: 'applied', order: 1 },
  ];
  const snapshot = structuredClone(jobs);
  assert.deepEqual(filterAndSortTrackedJobs(jobs).map((job) => job.id), ['1', '2']);
  assert.deepEqual(filterAndSortTrackedJobs(jobs, 'équipe').map((job) => job.id), ['2']);
  assert.deepEqual(filterAndSortTrackedJobs(jobs, 'తెలుగు').map((job) => job.id), ['1']);
  assert.deepEqual(jobs, snapshot);
});

test('job tracker persistence is revisioned and destructive actions use an accessible confirmation', async () => {
  const [operations, tracker, routes, repository, migration] = await Promise.all([
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('src/components/AppliedJobs/JobTracker.jsx', 'utf8'),
    fs.readFile('backend/routes/jobsData.js', 'utf8'),
    fs.readFile('backend/repositories/MySQLRepository.js', 'utf8'),
    fs.readFile('backend/database/migrations/007_job_tracker_revision.sql', 'utf8'),
  ]);
  assert.match(operations, /\/api\/jobs-data\/tracker/);
  assert.match(operations, /expectedRevision/);
  assert.match(tracker, /JOB_TRACKER_CONFLICT/);
  assert.match(tracker, /role="alertdialog"/);
  assert.doesNotMatch(tracker, /window\.confirm/);
  assert.match(routes, /req\.repository\.getTrackedJobs\(req\.user\.uid\)/);
  assert.match(routes, /req\.repository\.updateTrackedJob\([\s\S]*req\.user\.uid/);
  assert.match(repository, /SELECT \* FROM job_tracker WHERE id = \? AND user_id = \? FOR UPDATE/);
  assert.match(repository, /JOB_TRACKER_CONFLICT/);
  assert.match(repository, /nextRevision = currentRevision \+ 1/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS revision/);
  assert.match(migration, /idx_jt_user_updated/);
});
