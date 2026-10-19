/**
 * DIR-008 — public sharing contract (frontend).
 *
 * Exercises the publication state machine the Share dialog and the anonymous
 * viewer rely on, and guards the source-level invariants that previous defects
 * violated:
 *   - the dialog must publish/unpublish through the API, not a local toggle;
 *   - the viewer must use the tokenized public endpoint with a single `/api`
 *     prefix and render the shared template through the production renderer;
 *   - the export page must not fabricate a demo profile and must redeem the
 *     single-use render token.
 *
 * The backend lifecycle itself (publish → token read → unpublish → 404,
 * projection, cross-owner denial) is covered by
 * `backend/test/dir008-public-share.test.js`.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, 'frontend');

const vite = await createServer({
  root: FRONTEND,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
after(async () => { await vite.close(); });

const share = await vite.ssrLoadModule('/src/lib/share-publication.ts');
const viewModel = await vite.ssrLoadModule('/src/lib/resume-view-model.ts');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function fakeApi(handlers) {
  const calls = [];
  return {
    calls,
    async get(url) {
      calls.push({ method: 'GET', url });
      return handlers.get ? handlers.get(url) : {};
    },
    async post(url, body) {
      calls.push({ method: 'POST', url, body });
      return handlers.post ? handlers.post(url, body) : {};
    },
  };
}

test('publish requires and returns a server-issued token', async () => {
  const api = fakeApi({ post: () => ({ isPublished: true, publicationRevision: 2, shareToken: 'v1.abc.defghijklmnopqrstuvw' }) });
  const result = await share.publishResume(api, 'resume-1');
  assert.equal(api.calls[0].url, '/resumes/resume-1/publish');
  assert.equal(result.isPublished, true);
  assert.equal(result.shareToken, 'v1.abc.defghijklmnopqrstuvw');
  assert.equal(result.sharePath, '/shared/v1.abc.defghijklmnopqrstuvw');
});

test('publish without a token fails instead of inventing a link', async () => {
  const api = fakeApi({ post: () => ({ isPublished: true }) });
  await assert.rejects(
    () => share.publishResume(api, 'resume-1'),
    (error) => error.code === 'SHARE_LINK_MISSING' && /nothing was published/i.test(error.message)
  );
});

test('unpublish sends the publication revision it read, and reports revocation', async () => {
  const api = fakeApi({ post: () => ({ publicationRevision: 9 }) });
  const result = await share.revokeResume(api, 'resume-1', 8);
  assert.equal(api.calls[0].url, '/resumes/resume-1/unpublish');
  assert.deepEqual(api.calls[0].body, { expectedPublicationRevision: 8 });
  assert.equal(result.isPublished, false);
  assert.equal(result.publicationRevision, 9);
});

test('an unsaved resume cannot be published or read', async () => {
  const api = fakeApi({});
  await assert.rejects(() => share.publishResume(api, ''), /has not been saved/i);
  await assert.rejects(() => share.fetchPublicationState(api, '   '), /has not been saved/i);
  assert.equal(api.calls.length, 0);
});

test('publication reads never claim published without server confirmation', async () => {
  const api = fakeApi({ get: () => ({ isPublished: false, publicationRevision: 0 }) });
  const state = await share.fetchPublicationState(api, 'resume-1');
  assert.equal(api.calls[0].url, '/resumes/resume-1/publication');
  assert.equal(state.isPublished, false);
  assert.equal(state.shareToken, undefined);
});

test('share errors are described honestly for each failure class', () => {
  assert.match(share.describeShareError({ status: 409 }), /changed in another tab/i);
  assert.match(share.describeShareError({ status: 503 }), /not configured/i);
  assert.match(share.describeShareError({ status: 401 }), /session expired/i);
  assert.match(share.describeShareError({ status: 404 }), /no longer exists/i);
  assert.match(share.describeShareError({ status: 429 }), /too many/i);
  assert.match(share.describeShareError(new Error('network down')), /network down/);
});

test('share URL construction is origin-relative and idempotent', () => {
  assert.equal(share.buildShareUrl('https://app.example.com', 'v1.a.b'), 'https://app.example.com/shared/v1.a.b');
  assert.equal(share.buildShareUrl('https://app.example.com/', '/shared/v1.a.b'), 'https://app.example.com/shared/v1.a.b');
  assert.equal(share.buildShareUrl('https://app.example.com', null), '');
});

test('anonymous viewer resolves signed tokens to the token route and legacy ids to the id route', () => {
  const token = 'v1.cmVzdW1lLTE.abcdefghijklmnopqrstuv';
  assert.equal(share.resolvePublicResumeEndpoint(token), `/resumes/public/token/${encodeURIComponent(token)}`);
  assert.equal(share.resolvePublicResumeEndpoint('pub-sophia-vance'), '/resumes/public/pub-sophia-vance');
  assert.equal(share.isShareToken(token), true);
  assert.equal(share.isShareToken('pub-sophia-vance'), false);
  assert.throws(() => share.resolvePublicResumeEndpoint(''), /not found|no longer published/i);
  // The API client already prefixes "/api"; a second prefix is the historical bug.
  assert.ok(!share.resolvePublicResumeEndpoint(token).startsWith('/api/'));
});

test('share dialog publishes through the API and is accessible', () => {
  const source = read('frontend/src/components/ui/share-modal.tsx');
  assert.match(source, /publishResume\(/);
  assert.match(source, /revokeResume\(/);
  assert.match(source, /fetchPublicationState\(/);
  assert.doesNotMatch(source, /useState\(true\)\s*;.*isPublic/s, 'public state must not default to claimed-published');
  assert.match(source, /role="switch"/);
  assert.match(source, /aria-checked=\{isPublic\}/);
  assert.match(source, /DialogDescription/);
  assert.match(source, /\/shared\//);
  assert.doesNotMatch(source, /export\/\$\{templateId\}/, 'share links must not point at the authenticated export route');
  assert.match(source, /disabled=\{!canShare\}/, 'copy must be disabled until a token exists');
  assert.doesNotMatch(source, /console\.log/);
});

test('public viewer uses the token endpoint and the production renderer', () => {
  const source = read('frontend/src/pages/shared/resume-view.tsx');
  assert.match(source, /resolvePublicResumeEndpoint/);
  assert.doesNotMatch(source, /\/api\/api\//);
  assert.match(source, /SmartResumeDocument/);
  assert.match(source, /normalizeResumeToDocument/);
  assert.match(source, /This shared resume was not found or is no longer published\./);
  assert.match(source, /Download PDF/);
  assert.match(source, /print:hidden/);
  assert.doesNotMatch(source, /Alex Morgan|Alex Vance|SAMPLE_RESUME|FALLBACK_RESUME/, 'viewer must not contain demo profiles');
  assert.doesNotMatch(source, /heading!\./, 'viewer must not assert non-null on unvalidated data');
});

test('export page has no demo data and redeems the single-use render token', () => {
  const source = read('frontend/src/pages/export/cv-renderer.tsx');
  assert.doesNotMatch(source, /FALLBACK_RESUME|MULTIPAGE_RESUME|Alex Morgan/);
  assert.doesNotMatch(source, /resumeId === 'demo'|resumeId === 'sample'/);
  assert.match(source, /export-render-data/);
  assert.match(source, /normalizeResumeToDocument/);
  assert.match(source, /window\.history\.replaceState/, 'a spent token must be stripped from the URL');
  assert.match(source, /Math\.max\(50,/, 'zoom floor is 50%');
  assert.match(source, /Math\.min\(150,/, 'zoom ceiling is 150%');
  // The legacy per-template JSX renderers duplicated the document engine.
  assert.doesNotMatch(source, /function ModernBannerTemplate/);
});

test('export guard validates token shape instead of granting on presence', () => {
  const source = read('frontend/src/components/guards/require-export-access.tsx');
  assert.match(source, /RENDER_TOKEN_PATTERN = \/\^\[A-Za-z0-9_-\]\{43\}\$\//);
  assert.match(source, /RENDER_TOKEN_PATTERN\.test\(candidate\)/);
  assert.doesNotMatch(source, /console\.log/);
});

test('view model normalisation handles modern and legacy records without fabrication', () => {
  const modern = viewModel.normalizeResumeToDocument({
    id: 'r1', template: 'Cv75',
    heading: { firstName: 'Asha', lastName: 'Rao', title: 'Engineer', email: 'a@b.c', showPhoto: false },
    summary: 'Summary', experience: [{ position: 'Engineer', company: 'Acme', description: 'Did work' }],
    skillCategories: [{ id: 'c', category: 'Core', skills: ['Go'] }],
  });
  assert.equal(modern.heading.firstName, 'Asha');
  assert.equal(modern.template, 'Cv75');
  assert.equal(modern.experience[0].position, 'Engineer');
  assert.equal(modern.skillCategories[0].skills[0], 'Go');

  const legacy = viewModel.normalizeResumeToDocument({
    firstname: 'Noor', lastname: 'Khan', occupation: 'Analyst', city: 'Vijayawada', country: 'India',
    employments: [{ title: 'Analyst', employer: 'Acme', begin: '2019', end: 'Present', description: 'Work' }],
    educations: [{ school: 'IIT', degree: 'B.Tech', started: '2014', finished: '2018' }],
    skills: [{ name: 'SQL', category: 'Data' }],
  });
  assert.equal(legacy.heading.lastName, 'Khan');
  assert.equal(legacy.heading.location, 'Vijayawada, India');
  assert.equal(legacy.experience[0].position, 'Analyst');
  assert.equal(legacy.experience[0].company, 'Acme');
  assert.equal(legacy.education[0].institution, 'IIT');
  assert.equal(legacy.skillCategories[0].skills[0], 'SQL');

  const empty = viewModel.normalizeResumeToDocument(null);
  assert.equal(empty.heading.firstName, '');
  assert.equal(empty.name, '');
  assert.deepEqual(empty.experience, []);
  assert.ok(!JSON.stringify(empty).includes('Alex'), 'empty payload must not fall back to a demo person');
});
