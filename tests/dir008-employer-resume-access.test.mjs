/**
 * DIR-008 — employer resume access and shell share entry points (R-45, D-30).
 *
 * An employer must read a candidate resume through the permission-checked
 * employer endpoint. Opening `/shared/<resumeId>` from the review drawer used
 * to bypass that contract: it only worked if the candidate had chosen to
 * publish the resume, and it silently turned an internal review into a public
 * link. The drawer now renders the authorized payload in-place.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const drawer = read('frontend/src/components/employer/CandidateReviewDrawer.tsx');
const shell = read('frontend/src/components/layout/cuba-app-shell.tsx');
const hub = read('frontend/src/pages/dashboard/resumes.tsx');

test('the review drawer never sends an employer to a public share URL', () => {
  assert.doesNotMatch(drawer, /\/shared\/\$\{/);
  assert.doesNotMatch(drawer, /window\.open\(`\/shared/);
});

test('the drawer renders the authorized resume payload through the production renderer', () => {
  assert.match(drawer, /useApplicationResume/);
  assert.match(drawer, /normalizeResumeToDocument\(resumeData\.resume\)/);
  assert.match(drawer, /SmartResumeDocument/);
  assert.match(drawer, /data-testid="employer-resume-document"/);
  assert.match(drawer, /authorised through this application/);
});

test('the full-document viewer is an accessible dialog that fails honestly', () => {
  assert.match(drawer, /<DialogDescription/);
  assert.match(drawer, /could not be loaded/);
  assert.match(drawer, /cannot render/);
  assert.match(drawer, /disabled=\{!resumeData\?\.resume\}/);
});

test('the builder shell does not fabricate ids or templates in its preview actions', () => {
  assert.doesNotMatch(shell, /params\.resumeId \|\| 'demo'/);
  assert.match(shell, /disabled=\{!params\.resumeId\}/);
  // The shared template is resolved by the export page from the resume payload.
  assert.match(shell, /re-derives the persisted template/);
});

test('sharing from the shell opens the publish dialog instead of an unpublished URL', () => {
  assert.doesNotMatch(shell, /window\.open\(`\/shared\//);
  assert.match(shell, /navigate\(`\/dashboard\/resumes\?share=/);
  assert.match(hub, /searchParams\.get\('share'\)/);
  assert.match(hub, /setShareResume\(\{/);
});
