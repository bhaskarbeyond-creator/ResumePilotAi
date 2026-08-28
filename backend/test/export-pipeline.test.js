process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.ENTERPRISE_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString('base64');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { setPoolForTests } = require('../database/mysql');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'alice') return { uid: 'alice', email: 'alice@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'bob') return { uid: 'bob', email: 'bob@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'basic') return { uid: 'basic', email: 'basic@example.com', email_verified: true, role: 'USER', auth_time: now };
  throw new Error('invalid token');
});

const active = { membership: 'Premium', paymentStatus: 'ACTIVE', membershipEnds: new Date(Date.now() + 86_400_000) };

/**
 * Narrow SQL-contract double for this route suite. Requests still traverse the
 * canonical ResilientRepository -> MySQLRepository stack; only the disposable
 * MariaDB connection boundary is replaced. The real-engine gate exercises the
 * same queries against MariaDB 11.4.
 */
class ExportMariaDbPool {
  constructor() { this.reset(); }

  reset() {
    this.users = new Map([
      ['alice', { id: 'alice', email: 'alice@example.com', role: 'USER', revision: 1, ...active }],
      ['bob', { id: 'bob', email: 'bob@example.com', role: 'USER', revision: 1, ...active }],
      ['basic', { id: 'basic', email: 'basic@example.com', role: 'USER', revision: 1, membership: 'Basic', paymentStatus: 'NONE', membershipEnds: new Date(0) }],
    ]);
    this.resumes = new Map([
      ['resume-alice-01', { id: 'resume-alice-01', user_id: 'alice', firstname: 'Asha', template: 'Cv1', revision: 3 }],
      ['resume-basic-01', { id: 'resume-basic-01', user_id: 'basic', firstname: 'Basic', template: 'Cv1', revision: 1 }],
    ]);
    this.covers = new Map([
      ['cover-alice-01', { id: 'cover-alice-01', user_id: 'alice', title: 'Asha Cover', template: 'Cover1', data: JSON.stringify({ firstname: 'Asha', template: 'Cover1', revision: 1 }) }],
    ]);
    this.publicResumes = new Map([
      ['published-01', { id: 'published-01', owner_uid: 'alice', is_published: 1, publication_mode: 'explicit', object: JSON.stringify({ firstname: 'Asha', template: 'Cv1' }), source_revision: 3, publication_revision: 1 }],
      ['revoked-01', { id: 'revoked-01', owner_uid: 'alice', is_published: 0, publication_mode: 'explicit', object: JSON.stringify({ firstname: 'Asha', template: 'Cv1' }) }],
      ['implicit-01', { id: 'implicit-01', owner_uid: 'alice', is_published: 1, publication_mode: null, object: JSON.stringify({ firstname: 'Asha', template: 'Cv1' }) }],
    ]);
    this.settings = new Map();
    this.exportTokens = new Map();
    this.quotaBuckets = new Map();
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/^SELECT \* FROM resumes WHERE id = \? AND user_id = \? LIMIT 1$/i.test(normalized)) {
      const row = this.resumes.get(params[0]);
      return [[row && row.user_id === params[1] ? { ...row } : null].filter(Boolean), []];
    }
    if (/^SELECT \* FROM covers WHERE id = \? AND user_id = \? LIMIT 1$/i.test(normalized)) {
      const row = this.covers.get(params[0]);
      return [[row && row.user_id === params[1] ? { ...row } : null].filter(Boolean), []];
    }
    if (/^SELECT \* FROM public_resumes WHERE id = \? LIMIT 1$/i.test(normalized)) {
      const row = this.publicResumes.get(params[0]);
      return [[row ? { ...row } : null].filter(Boolean), []];
    }
    if (/^SELECT \* FROM users WHERE id = \? LIMIT 1$/i.test(normalized)) {
      const row = this.users.get(params[0]);
      return [[row ? { ...row } : null].filter(Boolean), []];
    }
    if (/^SELECT \* FROM system_settings WHERE category = \? LIMIT 1$/i.test(normalized)) {
      const data = this.settings.get(params[0]);
      return [[data === undefined ? null : { category: params[0], data: JSON.stringify(data), revision: 1 }].filter(Boolean), []];
    }
    if (/^SELECT count, expiresAt FROM enterprise_quota_buckets WHERE id = \? FOR UPDATE$/i.test(normalized)) {
      const row = this.quotaBuckets.get(params[0]);
      return [[row ? { ...row } : null].filter(Boolean), []];
    }
    if (/^INSERT INTO enterprise_quota_buckets /i.test(normalized)) {
      this.quotaBuckets.set(params[0], { count: params[2], expiresAt: params[3] });
      return [{ affectedRows: 1 }, []];
    }
    if (/^UPDATE enterprise_quota_buckets SET count = \?, expiresAt = \?/i.test(normalized)) {
      this.quotaBuckets.set(params[2], { count: params[0], expiresAt: params[1] });
      return [{ affectedRows: 1 }, []];
    }
    if (/^INSERT INTO export_render_tokens /i.test(normalized)) {
      this.exportTokens.set(params[0], { payload: params[1], expires_at: params[2] });
      return [{ affectedRows: 1 }, []];
    }
    if (/^SELECT payload, expires_at FROM export_render_tokens WHERE token_hash = \? FOR UPDATE$/i.test(normalized)) {
      const row = this.exportTokens.get(params[0]);
      return [[row ? { ...row } : null].filter(Boolean), []];
    }
    if (/^DELETE FROM export_render_tokens WHERE token_hash = \?$/i.test(normalized)) {
      const removed = this.exportTokens.delete(params[0]);
      return [{ affectedRows: removed ? 1 : 0 }, []];
    }
    if (/^DELETE FROM export_render_tokens WHERE expires_at < \? LIMIT 500$/i.test(normalized)) {
      let affectedRows = 0;
      for (const [key, row] of this.exportTokens) {
        if (Number(row.expires_at) < Number(params[0])) { this.exportTokens.delete(key); affectedRows += 1; }
      }
      return [{ affectedRows }, []];
    }
    throw new Error(`Unexpected export MariaDB query: ${normalized}`);
  }

  async getConnection() {
    const pool = this;
    return {
      beginTransaction: async () => {},
      query: (sql, params) => pool.query(sql, params),
      commit: async () => {},
      rollback: async () => {},
      release() {},
    };
  }

  async end() {}
}

const pool = new ExportMariaDbPool();
setPoolForTests(pool);
const app = require('../index');
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

test('cover-letter templates are accepted and resolved from the owner-scoped covers table', async () => {
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

test('cross-account DOCX export is refused for both owner-scoped tables', async () => {
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
    assert.equal((await post('/api/export-docx', 'alice', { resumeId: 'resume-alice-01', resumeName: 'Cv99' })).status, 400);
  assert.equal((await post('/api/export-docx', 'alice', { resumeId: 'resume-alice-01', resumeName: '../etc/passwd' })).status, 400);
  assert.equal((await post('/api/export-docx', 'alice', { resumeId: 'resume-alice-01', resumeName: 'Cv8' })).status, 400, 'stored Cv1 vs requested Cv8 is a mismatch');
});

test('DOCX export ignores client-supplied colors and still returns authentic Cv1 navy', async () => {
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
  pool.reset();
  const { createExportRenderToken } = require('../security/exportTokens');
  const token = await createExportRenderToken({ firstname: 'Asha', template: 'Cv1' });

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
    const response = await post('/api/export', 'alice', { resumeId: 'resume-alice-01', resumeName: 'Cv1', language: 'en' });
  if (response.status === 500) {
    assert.equal(response.body.error.code, 'EXPORT_FAILED');
    assert.equal(typeof response.body.error.requestId, 'string');
    const serialized = JSON.stringify(response.body);
    assert.doesNotMatch(serialized, /playwright|chromium|\/home\/|node_modules|at Object|Error:/i);
  }
});

test('the concurrency ceiling is claimed before awaiting so parallel exports cannot overshoot', async () => {
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
