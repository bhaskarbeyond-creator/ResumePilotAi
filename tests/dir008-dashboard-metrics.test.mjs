/**
 * DIR-008 — dashboard metrics from real ATS scores (D-07/D-08, R-41…R-43).
 *
 * Product contract:
 *   Ready to Apply  >= 80  (green)
 *   Developing      60–79  (amber)
 *   Starting        < 60   (slate)
 *   Unscored        no score available — never counted as zero
 *
 * Also pins the list projection the dashboard scores from: the in-memory
 * repository used by local/QA runs must return the draft content, otherwise
 * every resume would silently render as "Unscored" in a non-MySQL deployment.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, 'frontend');
const require = createRequire(import.meta.url);

const vite = await createServer({
  root: FRONTEND,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
after(async () => { await vite.close(); });

const metrics = await vite.ssrLoadModule('/src/lib/resume-metrics.ts');

const scoreMap = { a: 92, b: 80, c: 79, d: 60, e: 59, f: null };

function sampleResumes() {
  return Object.entries(scoreMap).map(([id, score]) => ({
    id,
    template: id === 'a' ? 'Cv1' : id === 'b' ? 'Cv9' : 'Cv1',
    score,
  }));
}

const scoreOf = (resume) => (resume.score === undefined ? null : resume.score);

test('buckets follow the 80 / 60 contract exactly at the boundaries', () => {
  assert.equal(metrics.bucketForScore(100), 'ready');
  assert.equal(metrics.bucketForScore(80), 'ready');
  assert.equal(metrics.bucketForScore(79), 'developing');
  assert.equal(metrics.bucketForScore(60), 'developing');
  assert.equal(metrics.bucketForScore(59), 'starting');
  assert.equal(metrics.bucketForScore(0), 'starting');
  assert.equal(metrics.bucketForScore(null), 'unscored');
  assert.equal(metrics.bucketForScore(Number.NaN), 'unscored');
});

test('metrics count each resume once and never score an unscored resume as zero', () => {
  const result = metrics.computeResumeMetrics(sampleResumes(), scoreOf);
  assert.equal(result.total, 6);
  assert.equal(result.ready, 2);
  assert.equal(result.developing, 2);
  assert.equal(result.starting, 1);
  assert.equal(result.unscored, 1);
  assert.equal(result.scored, 5);
  // (92 + 80 + 79 + 60 + 59) / 5 = 74
  assert.equal(result.averageScore, 74);
});

test('unique templates are counted by id with the default template as Cv1', () => {
  const result = metrics.computeResumeMetrics(
    [{ id: '1', template: 'Cv5' }, { id: '2', template: 'Cv5' }, { id: '3' }],
    () => 70
  );
  assert.equal(result.uniqueTemplates, 2);
});

test('an account with no resumes reports zeroes and no average', () => {
  const result = metrics.computeResumeMetrics([], scoreOf);
  assert.deepEqual(
    { total: result.total, ready: result.ready, developing: result.developing, starting: result.starting, unscored: result.unscored, average: result.averageScore, templates: result.uniqueTemplates },
    { total: 0, ready: 0, developing: 0, starting: 0, unscored: 0, average: null, templates: 0 }
  );
});

test('badge tones map to the required colours and labels', () => {
  assert.match(metrics.bucketTone('ready').text, /emerald/);
  assert.match(metrics.bucketTone('developing').text, /amber/);
  assert.match(metrics.bucketTone('starting').text, /slate/);
  assert.equal(metrics.bucketTone('ready').label, 'Ready to Apply');
  assert.equal(metrics.bucketTone('developing').label, 'Developing');
  assert.equal(metrics.bucketTone('starting').label, 'Starting');
  assert.equal(metrics.bucketTone('unscored').label, 'Unscored');
});

test('the in-memory list projection returns the draft the dashboard scores', async () => {
  const InMemoryRepository = require(path.join(ROOT, 'backend/repositories/InMemoryRepository.js'));
  const repo = new InMemoryRepository();
  await repo.saveResume('user-1', 'resume-1', {
    title: 'Platform Engineer',
    template: 'Cv12',
    summary: 'Distributed systems',
    experience: [{ company: 'Acme', position: 'Engineer' }],
  });
  await repo.saveResume('user-2', 'resume-2', { title: 'Other tenant' });

  const rows = await repo.getResumes('user-1');
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.id, 'resume-1');
  assert.equal(row.title, 'Platform Engineer');
  assert.equal(row.template, 'Cv12');
  assert.equal(row.summary, 'Distributed systems');
  assert.equal(row.experience[0].company, 'Acme');
  assert.equal(row.userId, undefined, 'ownership metadata is not part of the list response');
});

test('the dashboard no longer hard-codes a demo candidate identity', () => {
  const source = fs.readFileSync(path.join(FRONTEND, 'src/pages/dashboard/resumes.tsx'), 'utf8');
  assert.doesNotMatch(source, /Alex Morgan/);
  assert.doesNotMatch(source, /streamline your career/i);
  assert.match(source, /computeResumeMetrics/);
  assert.match(source, /ATS_READY_THRESHOLD/);
  assert.match(source, /ATS_DEVELOPING_THRESHOLD/);
});

test('the login demo shortcut does not ship in production builds and carries no demo person', () => {
  const source = fs.readFileSync(path.join(FRONTEND, 'src/pages/auth/login.tsx'), 'utf8');
  assert.doesNotMatch(source, /Alex Morgan/);
  assert.doesNotMatch(source, /Sarah Administrator/);
  assert.match(source, /!import\.meta\.env\.PROD/);
});
