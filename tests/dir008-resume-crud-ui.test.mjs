/**
 * DIR-008 — dashboard resume CRUD (R-17…R-19).
 *
 * The API lifecycle is covered end-to-end by
 * `backend/test/dir008-resume-crud.test.js`. This suite pins the client half:
 * write payloads carry content only (never ownership/revision/publication
 * metadata) and failures surface in the UI instead of an `alert()`.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, 'frontend');
const source = fs.readFileSync(path.join(FRONTEND, 'src/pages/dashboard/resumes.tsx'), 'utf8');

const vite = await createServer({
  root: FRONTEND,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
after(async () => { await vite.close(); });

const { resumeContentPayload } = await vite.ssrLoadModule('/src/lib/resume-payload.ts');

test('content payloads drop ownership, revision and publication metadata', () => {
  const row = {
    id: 'resume-1',
    userId: 'user-1',
    user_id: 'user-1',
    ownerUid: 'user-1',
    revision: 7,
    isPublished: true,
    publicationRevision: 3,
    publishedAt: '2026-01-01T00:00:00.000Z',
    pbId: 'pb-1',
    publicationMode: 'explicit',
    title: 'Platform Engineer',
    template: 'Cv42',
    summary: 'Reliability work',
    experience: [{ company: 'Acme' }],
  };
  const payload = resumeContentPayload(row);
  assert.deepEqual(Object.keys(payload).sort(), ['experience', 'summary', 'template', 'title']);
  assert.equal(payload.title, 'Platform Engineer');
  assert.equal(payload.template, 'Cv42');
  assert.deepEqual(payload.experience, [{ company: 'Acme' }]);
});

test('content payloads tolerate missing values without inventing fields', () => {
  assert.deepEqual(resumeContentPayload({}), {});
  assert.deepEqual(resumeContentPayload(null), {});
  assert.deepEqual(resumeContentPayload({ summary: null }), { summary: null });
});

test('duplicate and rename forward content payloads, not whole list rows', () => {
  const duplicate = source.slice(source.indexOf('const handleDuplicate'), source.indexOf('const handleOpenRename'));
  assert.match(duplicate, /\.\.\.resumeContentPayload\(source\)/);
  assert.match(duplicate, /expectedRevision: null/);
  assert.doesNotMatch(duplicate, /\.\.\.source,\s*\n\s*id:/);

  const rename = source.slice(source.indexOf('const handleSaveRename'), source.indexOf('const handleConfirmDelete'));
  assert.match(rename, /\.\.\.resumeContentPayload\(source\)/);
  assert.match(rename, /expectedRevision: typeof source\.revision === 'number'/);
});

test('rename and duplicate failures are shown in the dashboard, never via alert()', () => {
  assert.doesNotMatch(source, /\balert\(/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Could not duplicate/);
  assert.match(source, /Could not rename the resume/);
  assert.match(source, /Could not delete the resume/);
  assert.match(source, /Could not download the Word document/);
});

test('delete remains an explicit confirmation with an accessible description', () => {
  assert.match(source, /Delete resume\?/);
  assert.match(source, /cannot be undone/);
  assert.match(source, /<DialogDescription/);
  assert.match(source, /disabled=\{deleting\}/);
});
