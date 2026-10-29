#!/usr/bin/env node
/**
 * m8b-runtime-probes.cjs — M8B runtime closure probes.
 *
 * Executes the highest-priority runtime tests from MANDATE 8B §6 against a locally started
 * backend. Identity uses the repo's own non-production HMAC verifier
 * (backend/security/auth.js: issueLocalTestToken, `rptest.` prefix, TEST_AUTH_HMAC_SECRET,
 * inert when NODE_ENV=production). No Firebase, no production credential, no provider account.
 *
 * HONEST SCOPE — every result written by this script carries these caveats:
 *   * repository is IN_MEMORY_REPOSITORY=1, which is NOT MariaDB and NOT a production store
 *   * an in-process write-then-read proves route wiring and in-memory persistence,
 *     NOT database durability, replication or migration correctness
 *   * no browser is involved, so nothing here is browser end-to-end evidence
 *   * no payment provider is contacted, so no settlement behaviour is proven
 *
 * Usage: node developer-review/tools/m8b-runtime-probes.cjs [--base http://127.0.0.1:5099]
 */
'use strict';
const crypto = require('crypto');

const BASE = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:5099').replace(/\/$/, '');
const SECRET = process.env.TEST_AUTH_HMAC_SECRET;

function mint(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return `rptest.${body}.${sig}`;
}

const now = Math.floor(Date.now() / 1000);
const SUPER = mint({ uid: 'probe-super', email: 'probe-super@example.test', role: 'SUPER_ADMIN', exp: now + 3600 });
const USER = mint({ uid: 'probe-user', email: 'probe-user@example.test', role: null, exp: now + 3600 });
const OTHER = mint({ uid: 'probe-other', email: 'probe-other@example.test', role: null, exp: now + 3600 });

const results = [];

async function probe(id, label, method, path, { token, body, expectNote } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let status = 0, text = '';
  try {
    const res = await fetch(BASE + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = res.status;
    text = await res.text();
  } catch (e) {
    status = -1;
    text = `TRANSPORT_ERROR ${e.message}`;
  }
  const rec = {
    id, label, method, path: path.replace(/\/[\w-]{8,}(?=\/|$)/g, '/{id}'),
    identity: token === SUPER ? 'SUPER_ADMIN' : token === USER ? 'USER(probe-user)' : token === OTHER ? 'USER(probe-other)' : 'ANONYMOUS',
    status, body: text.slice(0, 240), note: expectNote || '',
  };
  results.push(rec);
  console.log(`${String(status).padEnd(4)} ${rec.identity.padEnd(12)} ${method.padEnd(6)} ${rec.path}  ${rec.body.slice(0, 110)}`);
  return { status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

(async () => {
  if (!SECRET || SECRET.length < 16) {
    console.error('FATAL: TEST_AUTH_HMAC_SECRET missing/short; cannot mint a test identity.');
    process.exit(2);
  }

  console.log('## T2 contact form — backend validation and admission');
  await probe('T2a', 'valid payload', 'POST', '/api/contact', { body: { name: 'Probe User', email: 'probe@example.test', subject: 'M8B', message: 'Synthetic M8B runtime probe message, disposable.' } });
  await probe('T2b', 'message too short', 'POST', '/api/contact', { body: { name: 'Probe User', email: 'probe@example.test', message: 'short' } });
  await probe('T2c', 'malformed email', 'POST', '/api/contact', { body: { name: 'Probe User', email: 'not-an-email', message: 'This message is comfortably long enough to pass length validation.' } });
  await probe('T2d', 'honeypot populated', 'POST', '/api/contact', { body: { name: 'Bot', email: 'bot@example.test', message: 'bot fills every field including the hidden one', website: 'http://spam.test' } });

  console.log('\n## T3 queue telemetry failure condition (the state that reveals FS-M8A-05)');
  await probe('T3a', 'real queue route', 'GET', '/api/platform/queues', { token: SUPER });
  await probe('T3b', 'client fallback URL', 'GET', '/api/admin/queues', { token: SUPER });
  await probe('T3c', 'retired purge', 'POST', '/api/platform/queues/purge', { token: SUPER, body: {} });

  console.log('\n## T4 CMS published / unknown slug / admin publish');
  await probe('T4a', 'public list', 'GET', '/api/public/custom-pages');
  await probe('T4b', 'unknown slug', 'GET', '/api/public/custom-pages/m8b-nonexistent-slug');
  const created = await probe('T4c', 'admin publish (PUT)', 'PUT', '/api/admin/pages/m8b-probe-page', {
    token: SUPER, body: { title: 'M8B probe page', content: '<p>synthetic</p>', published: true },
  });
  await probe('T4d', 'published slug read', 'GET', '/api/public/custom-pages/m8b-probe-page');
  await probe('T4e', 'admin list', 'GET', '/api/admin/pages', { token: SUPER });

  console.log('\n## T5 blog reader routes');
  await probe('T5a', 'route the client calls', 'GET', '/api/blog/posts', { token: SUPER });
  await probe('T5b', 'route the client calls (anonymous)', 'GET', '/api/blog/posts');
  await probe('T5c', 'real list', 'GET', '/api/blog-data');
  await probe('T5d', 'real slug (missing)', 'GET', '/api/blog-data/slug/m8b-missing-post');

  console.log('\n## T6 profile persistence (write then read)');
  await probe('T6a', 'write profile', 'POST', '/api/users-data/profile', {
    token: USER, body: { fullName: 'Probe User', headline: 'M8B synthetic', summary: 'in-memory persistence probe', skills: [{ name: 'audit', rating: 7 }] },
  });
  const t6b = await probe('T6b', 'read profile back', 'GET', '/api/users-data/profile', { token: USER });

  console.log('\n## T7 billing / subscription console backend');
  await probe('T7a', 'transaction history', 'GET', '/api/payment-orders', { token: USER });
  await probe('T7b', 'invoice list', 'GET', '/api/invoices', { token: USER });
  await probe('T7c', 'coupon validation', 'POST', '/api/coupons/validate', { token: USER, body: { code: 'M8B-NOT-A-REAL-CODE' } });

  console.log('\n## T8 TOTP / session controls');
  await probe('T8a', 'mfa disable (no factor)', 'POST', '/api/users-data/mfa/disable', { token: USER, body: { factorId: 'm8b-nonexistent', code: '000000' } });
  await probe('T8b', 'mfa enrol endpoint probe', 'POST', '/api/users-data/mfa/enroll', { token: USER, body: {} });

  console.log('\n## T9 enterprise team membership');
  await probe('T9a', 'teams list', 'GET', '/api/enterprise/teams', { token: SUPER });
  await probe('T9b', 'team members', 'GET', '/api/enterprise/teams/m8b-team/members', { token: SUPER });

  console.log('\n## T10 employer messaging persistence (two identities)');
  const conv = await probe('T10a', 'create conversation', 'POST', '/api/messages/conversations', {
    token: USER, body: { participantId: 'probe-other', subject: 'M8B synthetic thread' },
  });
  const cid = conv.json && (conv.json.conversationId || (conv.json.conversation && conv.json.conversation.id) || conv.json.id);
  if (cid) {
    await probe('T10b', 'send message', 'POST', '/api/messages/send', { token: USER, body: { conversationId: cid, content: 'synthetic M8B message' } });
    await probe('T10c', 'read as sender', 'GET', `/api/messages/conversations/${cid}/messages`, { token: USER });
    await probe('T10d', 'read as other participant', 'GET', `/api/messages/conversations/${cid}/messages`, { token: OTHER });
    await probe('T10e', 'read as third party', 'GET', `/api/messages/conversations/${cid}/messages`, { token: SUPER });
  } else {
    results.push({ id: 'T10b-e', label: 'conversation id not returned; dependent probes skipped', status: -2, body: '' });
    console.log('-    conversation id not returned; T10b..e skipped');
  }
  await probe('T10f', 'conversation list', 'GET', '/api/messages/conversations', { token: USER });

  console.log('\n## T11 admin financial operations');
  await probe('T11a', 'admin payment orders', 'GET', '/api/admin/payment-orders', { token: SUPER });
  await probe('T11b', 'refund without recent step-up auth', 'POST', '/api/admin/payments/refund', { token: SUPER, body: { orderId: 'm8b-nonexistent', amount: 100 } });
  await probe('T11c', 'refund as non-admin', 'POST', '/api/admin/payments/refund', { token: USER, body: { orderId: 'm8b-nonexistent', amount: 100 } });
  await probe('T11d', 'invoice generate', 'POST', '/api/invoice/generate', { token: SUPER, body: { paymentOrderId: 'm8b-nonexistent' } });

  console.log('\n## T14 checkout rejection path (server side only)');
  await probe('T14a', 'pay with no order', 'POST', '/api/pay', { token: USER, body: {} });
  await probe('T14b', 'razorpay create-order unconfigured', 'POST', '/api/razorpay/create-order', { token: USER, body: { amount: 100, currency: 'INR' } });
  await probe('T14c', 'paypal create-order unconfigured', 'POST', '/api/paypal/create-order', { token: USER, body: { amount: 1, currency: 'USD' } });

  const out = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    repository: 'IN_MEMORY_REPOSITORY=1 (NOT MariaDB, NOT production)',
    identity: 'local HMAC test tokens via backend/security/auth.js issueLocalTestToken (rptest.*, NODE_ENV=development)',
    caveats: [
      'in-memory repository: write-then-read proves route wiring and in-process persistence only',
      'no browser: nothing here is browser end-to-end evidence',
      'no payment provider contacted: no settlement behaviour proven',
    ],
    totals: {
      probes: results.length,
      byStatusClass: results.reduce((a, r) => {
        const k = r.status === -1 ? 'transport' : r.status === -2 ? 'skipped'
          : r.status < 300 ? '2xx' : r.status < 400 ? '3xx' : r.status < 500 ? '4xx' : '5xx';
        a[k] = (a[k] || 0) + 1; return a;
      }, {}),
    },
    probes: results,
  };
  require('fs').writeFileSync(process.env.M8B_PROBE_OUT || '/tmp/m8b-runtime-probes.json',
    JSON.stringify(out, null, 2));
  console.log('\n## summary', JSON.stringify(out.totals));
})();
