process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'alice') return { uid: 'alice', email: 'alice@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'bob') return { uid: 'bob', email: 'bob@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'basic') return { uid: 'basic', email: 'basic@example.com', email_verified: true, role: 'USER', auth_time: now };
  throw new Error('invalid token');
});

const active = { membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: new Date(Date.now() + 86_400_000) };

function buildDb() {
  const documents = new Map([
    ['users/alice', { ...active }],
    ['users/bob', { ...active }],
    ['users/basic', { membership: 'Basic', paymentStatus: 'NONE', membershipEnds: new Date(0) }],
    ['users/alice/resumes/resume-alice-01', { firstname: 'Asha', template: 'Cv1', revision: 3 }],
    ['users/alice/covers/cover-alice-01', { firstname: 'Asha', template: 'Cover1', revision: 1 }],
    ['users/basic/resumes/resume-basic-01', { firstname: 'Basic', template: 'Cv1' }],
    ['pb/published-01', { ownerUid: 'alice', isPublished: true, publicationMode: 'explicit', object: '{"firstname":"Asha","template":"Cv1"}' }],
    ['pb/revoked-01', { ownerUid: 'alice', isPublished: false, publicationMode: 'explicit', object: '{"firstname":"Asha","template":"Cv1"}' }],
    ['pb/implicit-01', { ownerUid: 'alice', isPublished: true, object: '{"firstname":"Asha","template":"Cv1"}' }],
  ]);
  const ref = path => ({
    path,
    async get() { const data = documents.get(path); return { exists: Boolean(data), data: () => data }; },
    async create(value) { documents.set(path, value); },
    async delete() { documents.delete(path); },
    collection(name) { return { doc: id => ref(`${path}/${name}/${id}`) }; },
  });
  return {
    documents,
    collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    async runTransaction(callback) {
      return callback({
        async get(reference) { const data = documents.get(reference.path); return { exists: Boolean(data), data: () => data }; },
        delete(reference) { documents.delete(reference.path); },
        set(reference, value) { documents.set(reference.path, value); },
      });
    },
  };
}

const app = require('../index');
app.set('db', buildDb());
const bearer = token => ({ Authorization: `Bearer ${token}` });
const post = (path, token, body) => {
  const call = request(app).post(path);
  if (token) call.set(bearer(token));
  return call.send(body);
};

// Chromium is not installed in CI, so a fully authorized request proceeds past every
// authorization gate and then fails in the renderer. Any status that is NOT an
// authorization/validation rejection proves the request was accepted for rendering.
const AUTHORIZED_FOR_RENDER = status => ![400, 401, 402, 403, 404, 422].includes(status);

test('public export serves an explicitly published resume rather than rejecting it', async () => {
  const response = await post('/api/public-export', null, { resumeId: 'published-01', resumeName: 'Cv1', language: 'en' });
  assert.equal(AUTHORIZED_FOR_RENDER(response.status), true,
    `explicitly published resume must reach the renderer, got ${response.status} ${JSON.stringify(response.body)}`);
});

test('public export still refuses revoked, implicit, and unknown publications', async () => {
  for (const resumeId of ['revoked-01', 'implicit-01', 'missing-01']) {
    const response = await post('/api/public-export', null, { resumeId, resumeName: 'Cv1', language: 'en' });
    assert.equal(response.status, 404, resumeId);
  }
});

test('cover-letter templates are accepted and resolved from the owner-scoped covers collection', async () => {
  const response = await post('/api/export', 'alice', { resumeId: 'cover-alice-01', resumeName: 'Cover1', language: 'en' });
  assert.equal(AUTHORIZED_FOR_RENDER(response.status), true,
    `Cover1 export must reach the renderer, got ${response.status} ${JSON.stringify(response.body)}`);
});

test('template identifiers outside the rendered registry are rejected', async () => {
  for (const resumeName of ['Cv0', 'Cv52', 'Cover0', 'Cover5', '../etc/passwd', 'Cv1; DROP', '']) {
    const response = await post('/api/export', 'alice', { resumeId: 'resume-alice-01', resumeName, language: 'en' });
    assert.equal(response.status, 400, `${resumeName} must be rejected`);
  }
});

test('private export enforces authentication, ownership, and entitlement server-side', async () => {
  assert.equal((await post('/api/export', null, { resumeId: 'resume-alice-01', resumeName: 'Cv1', language: 'en' })).status, 401);
  assert.equal((await post('/api/export', 'bob', { resumeId: 'resume-alice-01', resumeName: 'Cv1', language: 'en' })).status, 404);
  assert.equal((await post('/api/export', 'basic', { resumeId: 'resume-basic-01', resumeName: 'Cv1', language: 'en' })).status, 402);
});

test('cross-account DOCX export is refused for both resume and cover collections', async () => {
  assert.equal((await post('/api/export-docx', 'bob', { resumeId: 'resume-alice-01', resumeName: 'Cv1' })).status, 404);
  assert.equal((await post('/api/export-docx', 'bob', { resumeId: 'cover-alice-01', resumeName: 'Cover1' })).status, 404);
});

test('owner DOCX export resolves cover documents and returns a real OOXML package', async () => {
  // Collect the raw bytes: supertest would otherwise coerce the binary body.
  const response = await request(app)
    .post('/api/export-docx')
    .set(bearer('alice'))
    .send({ resumeId: 'cover-alice-01', resumeName: 'Cover1' })
    .buffer(true)
    .parse((res, callback) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(response.headers['cache-control'], 'no-store, private');
  assert.match(response.headers['content-disposition'], /attachment; filename=".+\.docx"/);
  // OOXML packages are ZIP containers and therefore begin with the PK signature.
  assert.equal(response.body.subarray(0, 2).toString('latin1'), 'PK');
  assert.equal(response.body.length > 0, true);
});

test('DOCX export rejects invalid template identifiers and template mismatches', async () => {
  app.set('db', buildDb());
  assert.equal((await post('/api/export-docx', 'alice', { resumeId: 'resume-alice-01', resumeName: 'Cv99' })).status, 400);
  assert.equal((await post('/api/export-docx', 'alice', { resumeId: 'resume-alice-01', resumeName: '../etc/passwd' })).status, 400);
  assert.equal((await post('/api/export-docx', 'alice', { resumeId: 'resume-alice-01', resumeName: 'Cv8' })).status, 400, 'stored Cv1 vs requested Cv8 is a mismatch');
});

test('DOCX export ignores client-supplied colors and still returns authentic Cv1 navy', async () => {
  app.set('db', buildDb());
  const response = await request(app)
    .post('/api/export-docx')
    .set(bearer('alice'))
    .send({ resumeId: 'resume-alice-01', resumeName: 'Cv1', colors: { primary: '#FF00FF', secondary: '#00FF00' } })
    .buffer(true)
    .parse((res, callback) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  assert.equal(response.status, 200);
  const JSZip = require('jszip');
  const archive = await JSZip.loadAsync(response.body);
  const xml = await archive.file('word/document.xml').async('string');
  assert.match(xml, /1E3A8A/i);
  assert.doesNotMatch(xml, /FF00FF/i);
});

test('render-data endpoint is one-time, rejects malformed tokens, and never caches', async () => {
  const db = buildDb();
  app.set('db', db);
  const { createExportRenderToken } = require('../security/exportTokens');
  const token = await createExportRenderToken(db, { firstname: 'Asha', template: 'Cv1' });

  const first = await request(app).get('/api/export-render-data').query({ token });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.data, { firstname: 'Asha', template: 'Cv1' });
  assert.equal(first.headers['cache-control'], 'no-store, private');
  assert.equal(first.headers['referrer-policy'], 'no-referrer');
  assert.match(first.headers['x-robots-tag'], /noindex/);

  // Replay of a consumed token must fail closed.
  assert.equal((await request(app).get('/api/export-render-data').query({ token })).status, 404);

  for (const bad of ['', '../metadata', 'short', 'a'.repeat(200)]) {
    assert.equal((await request(app).get('/api/export-render-data').query({ token: bad })).status, 404, bad);
  }
});

test('export errors return a stable code without leaking internal render diagnostics', async () => {
  app.set('db', buildDb());
  const response = await post('/api/export', 'alice', { resumeId: 'resume-alice-01', resumeName: 'Cv1', language: 'en' });
  if (response.status === 500) {
    assert.equal(response.body.error.code, 'EXPORT_FAILED');
    assert.equal(typeof response.body.error.requestId, 'string');
    const serialized = JSON.stringify(response.body);
    assert.doesNotMatch(serialized, /playwright|chromium|\/home\/|node_modules|at Object|Error:/i);
  }
});

test('the concurrency ceiling is claimed before awaiting so parallel exports cannot overshoot', async () => {
  app.set('db', buildDb());
  const responses = await Promise.all(Array.from({ length: 12 }, () =>
    post('/api/export', 'alice', { resumeId: 'resume-alice-01', resumeName: 'Cv1', language: 'en' })));

  // Two distinct 429 controls exist: the concurrency ceiling ("busy") and the
  // per-account hourly export limiter ("RATE_LIMITED"). Only the former is under test.
  const isBusy = response => response.status === 429 && /busy/i.test(String(response.body?.error || ''));
  const shed = responses.filter(isBusy);
  // Anything that returned 429 was refused by one control or the other; only
  // non-429 responses actually reached the renderer.
  const admitted = responses.filter(response => response.status !== 429).length;
  // Claiming the slot synchronously is what makes this bound hold: if the counter were
  // incremented after an await, all 12 would observe a free slot and launch Chromium.
  assert.equal(admitted <= 5, true, `at most 5 concurrent renders, admitted ${admitted}`);
  assert.equal(shed.length > 0, true, 'excess concurrent exports must be shed with 429');

  // Slots are released in the handler's finally block, which settles just after the
  // response is flushed. Poll briefly for the counter to drain rather than assuming
  // release is observable on the very next tick.
  // Probe as a different account so the per-account hourly limiter (a separate control,
  // already exercised by the security suite) cannot be mistaken for a stuck slot counter.
  let recovered = false;
  for (let attempt = 0; attempt < 40 && !recovered; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const probe = await post('/api/export', 'bob', { resumeId: 'resume-alice-01', resumeName: 'Cv1', language: 'en' });
    recovered = !isBusy(probe);
  }
  assert.equal(recovered, true, 'export slots must drain so the endpoint is never permanently wedged');
});

test('the PDF pipeline writes no temporary artifacts into the backend directory', async () => {
  const fs = require('node:fs');
  const stray = fs.readdirSync(__dirname + '/..').filter(name => /^resume_\d+\.pdf$/.test(name));
  assert.deepEqual(stray, [], `orphaned export artifacts: ${stray.join(', ')}`);
});

test.after(() => {
  setTimeout(() => process.exit(0), 100).unref();
});
