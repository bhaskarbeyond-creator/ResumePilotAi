'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeRequest, sanitizeString } = require('../security/sanitize');

function run(body, extra = {}) {
  const req = { body, query: {}, params: {}, ...extra };
  let called = false;
  sanitizeRequest()(req, { locals: {} }, () => { called = true; });
  assert.equal(called, true, 'sanitizer must always call next()');
  return req;
}

test('prototype-pollution keys are stripped at every depth and never reach Object.prototype', () => {
  const polluted = JSON.parse('{"__proto__":{"polluted":true},"name":"Ada","nested":{"constructor":{"x":1},"ok":2}}');
  const req = run(polluted);
  assert.equal({}.polluted, undefined, 'Object.prototype must be untouched');
  assert.equal(req.body.name, 'Ada', 'sibling keys must survive');
  assert.equal('polluted' in req.body, false);
  assert.equal(req.body.nested.ok, 2);
  assert.equal('x' in req.body.nested, false);
});

test('a raw Buffer body (Stripe webhook) survives byte-for-byte so HMAC verification still works', () => {
  const payload = JSON.stringify({ id: 'evt_test', amount: 100 });
  const req = run(Buffer.from(payload, 'utf8'));
  assert.equal(Buffer.isBuffer(req.body), true, 'raw body must stay a Buffer');
  assert.equal(req.body.toString('utf8'), payload, 'signed bytes must be untouched');
});

test('candidate text that merely mentions dangerous syntax is NOT corrupted', () => {
  const req = run({
    summary: 'Wrote <script>alert(1)</script> samples for my docs about XSS.',
    code: 'if (a < b && c > d) { return `a<b`; }',
    sql: 'SELECT * FROM users WHERE id = 1; -- comment',
    phrase: 'We learned that javascript: URLs are dangerous, DROP TABLE is a joke.',
    skills: ['React', 'Node.js', 'SQL'],
    profileImage: 'data:image/png;base64,iVBORw0KGgo=',
  });
  assert.equal(req.body.summary, 'Wrote <script>alert(1)</script> samples for my docs about XSS.');
  assert.equal(req.body.code, 'if (a < b && c > d) { return `a<b`; }');
  assert.equal(req.body.sql, 'SELECT * FROM users WHERE id = 1; -- comment');
  assert.equal(req.body.phrase, 'We learned that javascript: URLs are dangerous, DROP TABLE is a joke.');
  assert.deepEqual(req.body.skills, ['React', 'Node.js', 'SQL']);
  assert.equal(req.body.profileImage, 'data:image/png;base64,iVBORw0KGgo=');
});

test('a value that IS entirely an active-content URL is neutralized', () => {
  const req = run({
    website: 'javascript:alert(document.cookie)',
    xss: 'JavaScript:alert(1)',
    evil: 'data:text/html;base64,PHNjcmlwdD4=',
    svg: 'data:image/svg+xml,<svg onload=alert(1)>',
    safe: 'https://example.com/portfolio',
  });
  for (const field of ['website', 'xss', 'evil', 'svg']) {
    assert.doesNotMatch(req.body[field], /^(javascript|data):/i, field);
  }
  assert.equal(req.body.safe, 'https://example.com/portfolio');
});

/**
 * REGRESSION GUARD (DIR-040): the previous implementation encoded the colon as
 * the HTML entity `&#58;`. Browsers decode character references in an attribute
 * value BEFORE the URL parser runs, so that "neutralized" value arrived at the
 * URL parser as `javascript::alert(1)` — still executable. Neutralization must
 * therefore survive an entity-decoding round trip.
 */
test('neutralization survives HTML entity decoding (the real browser href pipeline)', () => {
  const decodeEntities = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  const vectors = [
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'data:image/svg+xml,<svg onload=alert(1)>',
  ];
  for (const vector of vectors) {
    const neutralized = decodeEntities(sanitizeString(vector));
    assert.doesNotMatch(neutralized, /^\s*(?:javascript|vbscript|data)\s*:/i, `revived: ${vector}`);
  }
});

const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);

test('NUL bytes and C0 controls are stripped but tabs/newlines survive', () => {
  // Constructed from char codes so this test SOURCE holds no literal control
  // character that an editor or transport could silently drop. An earlier
  // version embedded a real NUL and was therefore vacuous (it compared 'ab'
  // to 'ab' and would have passed even if stripping were removed entirely).
  const req = run({ withNul: `a${NUL}b`, withBel: `x${BEL}y`, resume: 'Line1\nLine2\tTabbed' });
  assert.equal(req.body.withNul, 'ab', 'NUL must be removed');
  assert.equal(req.body.withBel, 'xy', 'C0 controls must be removed');
  assert.equal(req.body.resume, 'Line1\nLine2\tTabbed', 'tab/newline are legitimate in resumes');
});

test('query and params are sanitized too', () => {
  const req = run({}, { query: { next: 'javascript:alert(1)', q: 'resume writer' }, params: { id: 'abc', __proto__: { bad: 1 } } });
  assert.doesNotMatch(req.query.next, /^javascript:/i);
  assert.equal(req.query.q, 'resume writer');
  assert.equal(req.params.id, 'abc');
  assert.equal('bad' in req.params, false);
});

test('deeply nested bodies are bounded instead of exhausting the stack', () => {
  let deep = { leaf: true };
  for (let i = 0; i < 5000; i += 1) deep = { child: deep };
  const req = run(deep);
  let node = req.body;
  let depth = 0;
  while (node && node.child) { node = node.child; depth += 1; }
  assert.ok(depth <= 30, `depth was bounded to ${depth}`);
});