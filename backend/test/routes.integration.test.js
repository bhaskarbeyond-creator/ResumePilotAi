process.env.NODE_ENV = 'test';
process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';
process.env.SMTP_PASS = 'fixture-mail-password';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'unverified') return { uid: 'user-2', email: 'pending@example.com', email_verified: false, role: 'USER', auth_time: now };
  if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  if (token === 'employer') return { uid: 'employer-1', email: 'employer@example.com', email_verified: true, role: 'EMPLOYER', auth_time: now };
  if (token === 'unverified-admin') return { uid: 'admin-2', email: 'admin2@example.com', email_verified: false, role: 'ADMIN', auth_time: now };
  if (token === 'super-admin') return { uid: 'super-1', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
  if (token === 'stale-admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now - 3600 };
  if (token === 'stale-super-admin') return { uid: 'super-1', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now - 3600 };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

test('minimal health endpoint is public and does not cache', async () => {
  const response = await request(app).get('/healthz');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('readiness is truthful and marks unprobed providers as not checked', async () => {
  const response = await request(app).get('/readyz');
  assert.equal(response.status, 503);
  assert.equal(response.body.status, 'not_ready');
  assert.equal(response.body.checks.aiProviders, 'NOT_CHECKED');
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('protected endpoint rejects absent and invalid Firebase tokens', async () => {
  const absent = await request(app).get('/api/rtl-font-config');
  assert.equal(absent.status, 401);
  assert.equal(absent.body.error.code, 'AUTH_REQUIRED');
  const invalid = await request(app).get('/api/rtl-font-config').set(bearer('invalid'));
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.error.code, 'INVALID_AUTH_TOKEN');
});

test('one-time export render data endpoint is public only through an opaque token', async () => {
  const missing = await request(app).get('/api/export-render-data');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers['cache-control'], 'no-store, private');
  const forged = await request(app).get('/api/export-render-data?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  assert.equal(forged.status, 404);
});

test('valid authenticated user reaches an ordinary route', async () => {
  const response = await request(app).get('/api/rtl-font-config').set(bearer('user'));
  assert.equal(response.status, 200);
  assert.equal(response.body.isRtlSupported, true);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('admin aliases and mail logs reject an ordinary authenticated user', async () => {
  for (const route of ['/api/auth/purge-orphaned-auth', '/api/email/logs', '/api/email/admin/test-imap', '/api/send-sms', '/api/admin/blog/publish-due', '/api/admin/ai/test-provider']) {
    const method = route.includes('logs') ? 'get' : 'post';
    const response = await request(app)[method](route).set(bearer('user')).send({});
    assert.equal(response.status, 403, route);
    assert.equal(response.body.error.code, 'FORBIDDEN', route);
  }
});

test('stale admin sessions cannot perform sensitive administration or provider tests', async () => {
  for (const [method, route] of [
    ['post', '/api/admin/payments/refund'],
    ['patch', '/api/admin/users/victim'],
    ['patch', '/api/admin/employer-applications/victim'],
    ['post', '/api/admin/system-health-settings'],
    ['post', '/api/admin/twilio-settings'],
    ['get', '/api/email/admin/settings'],
    ['get', '/api/admin/settings'],
    ['post', '/api/admin/test-imap'],
    ['post', '/api/admin/settings/modules'],
    ['patch', '/api/admin/jobs/job-1'],
    ['patch', '/api/admin/companies/company-1'],
    ['post', '/api/admin/reviews'],
    ['post', '/api/admin/global-rating'],
    ['post', '/api/admin/trusted-by'],
    ['post', '/api/admin/ads'],
    ['post', '/api/admin/landing-content'],
    ['post', '/api/admin/ai-settings'],
    ['post', '/api/admin/ai/test-provider'],
    ['post', '/api/admin/payment/test-provider'],
    ['get', '/api/auth/linkedin/test-credentials'],
    ['get', '/api/auth/github/test-credentials'],
    ['post', '/api/account/delete']
  ]) {
    const response = await request(app)[method](route).set(bearer('stale-admin')).send({ paymentOrderId: 'order', suspended: true });
    assert.equal(response.status, 403, route);
    assert.equal(response.body.error.code, 'RECENT_AUTH_REQUIRED', route);
  }
});

test('unverified admin cannot load or mutate protected configuration', async () => {
  for (const [method, route] of [['get', '/api/admin/ai-settings'], ['post', '/api/admin/ai-settings'], ['post', '/api/admin/ai/test-provider'], ['get', '/api/email/admin/settings'], ['get', '/api/admin/twilio-settings'], ['post', '/api/admin/settings/modules']]) {
    const response = await request(app)[method](route).set(bearer('unverified-admin')).send({});
    assert.equal(response.status, 403, route);
    assert.equal(response.body.error.code, 'EMAIL_VERIFICATION_REQUIRED', route);
  }
});

test('email settings projection exposes configured state but no runtime credential', async () => {
  for (const route of ['/api/email/admin/settings', '/api/admin/settings']) {
    const response = await request(app).get(route).set(bearer('admin'));
    assert.equal(response.status, 200, route);
    assert.equal(response.body.settings.smtp.passwordConfigured, true, route);
    assert.equal(Object.hasOwn(response.body.settings.smtp, 'password'), false, route);
    assert.doesNotMatch(JSON.stringify(response.body), /fixture-mail-password/, route);
  }
});

test('Twilio settings persist in the canonical secret namespace without response disclosure', async () => {
  const store = new Map();
  const merge = (left, right) => {
    const output = { ...(left || {}) };
    for (const [key, value] of Object.entries(right || {})) output[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(output[key], value) : value;
    return output;
  };
  let automaticId = 0;
  const ref = path => ({ path, async get() { const data = store.get(path); return { exists: data !== undefined, data: () => data }; } });
  const fakeDb = {
    collection(name) { return { doc(id = `auto-${automaticId++}`) { return ref(`${name}/${id}`); } }; },
    runTransaction: callback => callback({ get: reference => reference.get(), set(reference, value, options) { store.set(reference.path, options?.merge ? merge(store.get(reference.path), value) : value); } }),
  };
  const originalDb = app.get('db');
  app.set('db', fakeDb);
  try {
    const authToken = 'fixture-twilio-auth-token-1234';
    const saved = await request(app).post('/api/admin/twilio-settings').set(bearer('admin')).send({
      accountSid: `AC${'a'.repeat(32)}`, authToken, fromPhoneNumber: '+14155552671', enableSmsAlerts: true, expectedRevision: 0,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.revision, 1);
    assert.doesNotMatch(JSON.stringify(saved.body), /fixture-twilio-auth-token/);
    assert.equal(store.get('settings/admin_configuration').twilio.authToken, authToken);
    const loaded = await request(app).get('/api/admin/twilio-settings').set(bearer('admin'));
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.settings.accountSidConfigured, true);
    assert.equal(Object.hasOwn(loaded.body.settings, 'authToken'), false);
    const bypass = await request(app).post('/api/admin/settings/twilio').set(bearer('admin')).send({ data: { authToken }, expectedRevision: 0 });
    assert.equal(bypass.status, 400);
  } finally {
    app.set('db', originalDb);
  }
});

test('Ads create and revision-safe delete persist through audited backend routes', async () => {
  const store = new Map();
  let automaticId = 0;
  const ref = (path, id) => ({ id, path, async get() { const data = store.get(path); return { exists: data !== undefined, data: () => data }; } });
  const collection = name => ({ doc(id = `auto-${automaticId++}`) { return ref(`${name}/${id}`, id); } });
  const fakeDb = {
    collection,
    batch() {
      const operations = [];
      return { set(reference, value) { operations.push(() => store.set(reference.path, value)); }, async commit() { for (const operation of operations) operation(); } };
    },
    runTransaction: callback => callback({
      get: reference => reference.get(),
      set(reference, value) { store.set(reference.path, value); },
      delete(reference) { store.delete(reference.path); },
    }),
  };
  const originalDb = app.get('db');
  app.set('db', fakeDb);
  try {
    const created = await request(app).post('/api/admin/ads').set(bearer('admin')).send({ name: 'Release banner', imageLink: 'https://cdn.example.com/banner.png', destinationLink: '/pricing' });
    assert.equal(created.status, 200);
    assert.equal(created.body.item.revision, 1);
    const adId = created.body.item.id;
    assert.equal(store.get(`ads/${adId}`).name, 'Release banner');
    const stale = await request(app).delete(`/api/admin/ads/${adId}`).set(bearer('admin')).send({ expectedRevision: 0 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'ADMIN_TARGET_CHANGED');
    assert.equal(store.has(`ads/${adId}`), true);
    const removed = await request(app).delete(`/api/admin/ads/${adId}`).set(bearer('admin')).send({ expectedRevision: 1 });
    assert.equal(removed.status, 200);
    assert.equal(store.has(`ads/${adId}`), false);
    assert.ok([...store.keys()].some(key => key.startsWith('security_audit_logs/')));
  } finally {
    app.set('db', originalDb);
  }
});

test('job application submission and employer status transitions are atomic, audited, and revision safe', async () => {
  const store = new Map([
    ['jobs/active-job', { employerId: 'employer-1', status: 'active', applicationsCount: 0, title: 'Engineer', company: 'Example Co' }],
    ['users/user-1/resumes/resume-1', { title: 'Primary resume', summary: 'Owned candidate resume' }],
  ]);
  let automaticId = 0;
  const ref = (path, id) => ({
    id, path,
    collection(name) { return { doc(childId = `auto-${automaticId++}`) { return ref(`${path}/${name}/${childId}`, childId); } }; },
    async get() { const data = store.get(path); return { exists: data !== undefined, data: () => data }; },
  });
  const fakeDb = {
    collection(name) { return { doc(id = `auto-${automaticId++}`) { return ref(`${name}/${id}`, id); } }; },
    runTransaction: callback => callback({
      get: reference => reference.get(),
      set(reference, value, options) { store.set(reference.path, options?.merge ? { ...(store.get(reference.path) || {}), ...value } : value); },
      update(reference, value) { store.set(reference.path, { ...(store.get(reference.path) || {}), ...value }); },
    }),
  };
  const originalDb = app.get('db');
  app.set('db', fakeDb);
  try {
    const submitted = await request(app).post('/api/jobs/active-job/applications').set(bearer('user')).send({
      fullName: 'Candidate One', phone: '+14155552671', coverLetter: `<p>${'A'.repeat(80)}</p>`, resumeId: 'resume-1', linkedinUrl: 'https://linkedin.example/candidate',
    });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.revision, 1);
    const applicationId = submitted.body.applicationId;
    const application = store.get(`jobApplications/${applicationId}`);
    assert.equal(application.userId, 'user-1');
    assert.equal(application.applicantEmail, 'user@example.com');
    assert.equal(application.selectedResume.data.summary, 'Owned candidate resume');
    assert.equal(store.get('jobs/active-job').applicationsCount, 1);
    assert.ok([...store.keys()].some(key => key.startsWith('security_audit_logs/')));
    const duplicate = await request(app).post('/api/jobs/active-job/applications').set(bearer('user')).send({
      fullName: 'Candidate One', phone: '+14155552671', coverLetter: `<p>${'A'.repeat(80)}</p>`,
    });
    assert.equal(duplicate.status, 409);

    const updated = await request(app).patch(`/api/job-applications/${encodeURIComponent(applicationId)}/status`).set(bearer('employer')).send({ status: 'interview', expectedStatus: 'pending', expectedRevision: 1 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.revision, 2);
    assert.equal(store.get(`jobApplications/${applicationId}`).status, 'interview');
    const stale = await request(app).patch(`/api/job-applications/${encodeURIComponent(applicationId)}/status`).set(bearer('employer')).send({ status: 'accepted', expectedStatus: 'pending', expectedRevision: 1 });
    assert.equal(stale.status, 409);
    const outsider = await request(app).patch(`/api/job-applications/${encodeURIComponent(applicationId)}/status`).set(bearer('user')).send({ status: 'accepted', expectedStatus: 'interview', expectedRevision: 2 });
    assert.equal(outsider.status, 404);
  } finally {
    app.set('db', originalDb);
  }
});

test('generic settings preserve omitted and blank backend secrets without browser disclosure', async () => {
  const store = new Map([['settings/admin_configuration', {
    socialAuth: { linkedinClientId: 'existing-client', linkedinClientSecret: 'fixture-existing-client-secret', nested: { accessToken: 'fixture-existing-access-token' } },
    _revisions: { socialAuth: 2 },
  }]]);
  const merge = (left, right) => {
    const output = { ...(left || {}) };
    for (const [key, value] of Object.entries(right || {})) output[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(output[key], value) : value;
    return output;
  };
  let automaticId = 0;
  const ref = path => ({ path, async get() { const data = store.get(path); return { exists: data !== undefined, data: () => data }; } });
  const fakeDb = {
    collection(name) { return { doc(id = `auto-${automaticId++}`) { return ref(`${name}/${id}`); } }; },
    runTransaction: callback => callback({ get: reference => reference.get(), set(reference, value, options) { store.set(reference.path, options?.merge ? merge(store.get(reference.path), value) : value); } }),
  };
  const originalDb = app.get('db');
  app.set('db', fakeDb);
  try {
    const response = await request(app).post('/api/admin/settings/socialAuth').set(bearer('admin')).send({
      data: { linkedinClientId: 'updated-client', linkedinClientSecret: '' }, expectedRevision: 2,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.revision, 3);
    assert.doesNotMatch(JSON.stringify(response.body), /fixture-existing/);
    const persisted = store.get('settings/admin_configuration').socialAuth;
    assert.equal(persisted.linkedinClientSecret, 'fixture-existing-client-secret');
    assert.equal(persisted.nested.accessToken, 'fixture-existing-access-token');
    assert.equal(store.get('data/public_config').socialAuth.linkedinClientSecret, undefined);
    const providerStatus = await request(app).get('/api/auth/linkedin/test-credentials').set(bearer('admin'));
    assert.equal(providerStatus.status, 200);
    assert.equal(providerStatus.body.configured, true);
    assert.doesNotMatch(JSON.stringify(providerStatus.body), /fixture-existing-client-secret/);
  } finally {
    app.set('db', originalDb);
  }
});

test('email runtime save rejects unencrypted or malformed transport configuration', async () => {
  const response = await request(app).post('/api/email/admin/save-smtp').set(bearer('admin')).send({
    smtp: { host: 'smtp.example.com', port: 25, encryption: 'none', username: 'mailer@example.com', password: 'replacement' },
  });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Encrypted smtp transport is required/);
});

test('Firebase credential status loads without recent auth but runtime rotation remains recent-auth protected', async () => {
  const loaded = await request(app).get('/api/admin/firebase-service-account').set(bearer('stale-super-admin'));
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.runtimeRotationEnabled, false);
  const changed = await request(app).post('/api/admin/firebase-service-account').set(bearer('stale-super-admin')).send({});
  assert.equal(changed.status, 403);
  assert.equal(changed.body.error.code, 'RECENT_AUTH_REQUIRED');
  const disabled = await request(app).post('/api/admin/firebase-service-account').set(bearer('super-admin')).send({ projectId: 'p', clientEmail: 'x@example.com', privateKey: 'secret' });
  assert.equal(disabled.status, 501);
  assert.equal(disabled.body.code, 'RUNTIME_SECRET_ROTATION_DISABLED');
});

test('loading non-secret AI settings does not require recent authentication', async () => {
  const response = await request(app).get('/api/admin/ai-settings').set(bearer('stale-admin'));
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'AI_SETTINGS_UNAVAILABLE');
});

test('fresh authorized admin reaches revisioned AI settings persistence without secret disclosure', async () => {
  const store = new Map([
    ['data/public_config', { ai: { provider: 'gemini' }, aiRevision: 0 }],
    ['settings/ai_providers', {}],
    ['data/system_settings', {}],
  ]);
  const merge = (left, right) => {
    const output = { ...(left || {}) };
    for (const [key, value] of Object.entries(right || {})) output[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(output[key], value) : value;
    return output;
  };
  const ref = path => ({ path, async get() { const data = store.get(path); return { exists: data !== undefined, data: () => data }; } });
  const fakeDb = {
    collection(name) { return { doc(id = `auto-${store.size}`) { return ref(`${name}/${id}`); } }; },
    runTransaction: callback => callback({ get: reference => reference.get(), set(reference, value, options) { store.set(reference.path, options?.merge ? merge(store.get(reference.path), value) : value); } }),
  };
  const originalDb = app.get('db');
  app.set('db', fakeDb);
  try {
    const saved = await request(app).post('/api/admin/ai-settings').set(bearer('admin')).send({ provider: 'gemini', model: 'gemini-2.0-flash', geminiApiKey: 'gemini-secret-value', expectedRevision: 0, enableFallback: true });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.success, true);
    assert.equal(saved.body.revision, 1);
    assert.equal(saved.body.configuredProviders.gemini, true);
    assert.doesNotMatch(JSON.stringify(saved.body), /gemini-secret-value/);
    const loaded = await request(app).get('/api/admin/ai-settings').set(bearer('admin'));
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.revision, 1);
    assert.doesNotMatch(JSON.stringify(loaded.body), /gemini-secret-value/);
  } finally { app.set('db', originalDb); }
});

test('legacy shared test endpoint cannot falsely report an AI provider success', async () => {
  const response = await request(app).post('/api/admin/test-connection').set(bearer('admin')).send({ type: 'gemini' });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'EMAIL_TEST_TYPE_UNSUPPORTED');
  assert.equal(response.body.success, false);
});

test('fresh authorized admin provider test reaches the dedicated AI route with useful errors', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) });
    const valid = await request(app).post('/api/admin/ai/test-provider').set(bearer('admin')).send({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'openai-secret-value' });
    assert.equal(valid.status, 200);
    assert.equal(valid.body.success, true);
    assert.equal(valid.body.provider, 'openai');
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'provider-sensitive-detail' } }) });
    const invalid = await request(app).post('/api/admin/ai/test-provider').set(bearer('admin')).send({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'invalid-secret-value' });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.code, 'AI_PROVIDER_AUTHENTICATION_FAILED');
    assert.doesNotMatch(JSON.stringify(invalid.body), /provider-sensitive-detail|invalid-secret-value/);
  } finally { global.fetch = originalFetch; }
});

test('unverified users cannot consume paid AI or payment endpoints', async () => {
  const ai = await request(app).post('/api/generate-summary').set(bearer('unverified')).send({ occupation: 'Engineer' });
  assert.equal(ai.status, 403);
  assert.equal(ai.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const payment = await request(app).post('/api/pay').set(bearer('unverified')).send({ planId: 'monthly' });
  assert.equal(payment.status, 403);
  assert.equal(payment.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const message = await request(app).post('/api/messages/send').set(bearer('unverified')).send({ conversationId: 'conversation', text: 'hello' });
  assert.equal(message.status, 403);
  assert.equal(message.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const participant = await request(app).get('/api/messages/conversations/conversation/participant-profile').set(bearer('unverified'));
  assert.equal(participant.status, 403);
  assert.equal(participant.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const application = await request(app).post('/api/jobs/active-job/applications').set(bearer('unverified')).send({});
  assert.equal(application.status, 403);
  assert.equal(application.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
  const applicationStatus = await request(app).patch('/api/job-applications/application/status').set(bearer('unverified')).send({});
  assert.equal(applicationStatus.status, 403);
  assert.equal(applicationStatus.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
});

test('password reset request is generic and timing-equalized for malformed accounts', async () => {
  const started = Date.now();
  const response = await request(app).post('/api/auth/custom-password-reset').send({ email: 'not-an-email' });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Date.now() - started >= 275);
  assert.doesNotMatch(JSON.stringify(response.body), /not-an-email|user.not.found/i);
});

test('verification and notification dispatch cannot target another account', async () => {
  const anonymous = await request(app).post('/api/auth/send-verification-email').send({ email: 'victim@example.com' });
  assert.equal(anonymous.status, 401);
  const notification = await request(app).post('/api/notify/user-signup').set(bearer('user')).send({ userEmail: 'victim@example.com' });
  assert.equal(notification.status, 403);
  assert.equal(notification.body.error.code, 'RECIPIENT_MISMATCH');
});

test('CORS grants only exact configured origins', async () => {
  const allowed = await request(app).options('/api/rtl-font-config')
    .set('Origin', 'https://app.example.com')
    .set('Access-Control-Request-Method', 'GET');
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://app.example.com');
  const denied = await request(app).options('/api/rtl-font-config')
    .set('Origin', 'https://app.example.com.evil.test')
    .set('Access-Control-Request-Method', 'GET');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});

test('public contact endpoint uses validation, honeypot and per-source throttling', async () => {
  const bot = await request(app).post('/api/contact').send({ website: 'https://spam.test', email: 'x@y.test', name: 'Bot', message: 'buy now spam' });
  assert.equal(bot.status, 202);
  const invalid1 = await request(app).post('/api/contact').send({ email: 'bad', name: 'x', message: 'short' });
  assert.equal(invalid1.status, 400);
  const invalid2 = await request(app).post('/api/contact').send({ email: 'bad', name: 'x', message: 'short' });
  assert.equal(invalid2.status, 400);
  const limited = await request(app).post('/api/contact').send({ email: 'bad', name: 'x', message: 'short' });
  assert.equal(limited.status, 429);
});

test('Stripe webhook fails closed without a configured signature secret', async () => {
  const response = await request(app).post('/api/stripe-webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 'forged')
    .send('{"id":"evt_forged"}');
  assert.equal(response.status, 400);
});

test('legacy/demo payment bypasses fail closed and client entitlement dates are ignored', async () => {
  const legacy = await request(app).post('/api/payment/razorpay-order').set(bearer('user')).send({ amount: 1, keySecret: 'attacker' });
  assert.equal(legacy.status, 410);
  const razorpay = await request(app).post('/api/razorpay/create-order').set(bearer('user')).send({ planId: 'monthly', amount: 1, userId: 'victim' });
  assert.equal(razorpay.status, 503);
  assert.equal(razorpay.body.error.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
  const entitlement = await request(app).post('/api/check').set(bearer('user')).send({ accountType: 'Premium', expDate: '2999-01-01' });
  assert.equal(entitlement.status, 503);
  assert.equal(entitlement.body.status, 'false');
});

test('payment verification rejects malformed or unbound provider orders', async () => {
  const paypal = await request(app).post('/api/paypal/verify').set(bearer('user')).send({ orderId: '../metadata', paymentOrderId: 'x' });
  assert.equal(paypal.status, 400);
  const razorpay = await request(app).post('/api/razorpay/verify-payment').set(bearer('user')).send({ razorpay_order_id: 'order', razorpay_payment_id: 'pay', razorpay_signature: 'forged' });
  assert.equal(razorpay.status, 400);
});

test('JSON body limit rejects oversized payloads before route work', async () => {
  const response = await request(app).post('/api/check')
    .set(bearer('user'))
    .send({ value: 'x'.repeat(300 * 1024) });
  assert.equal(response.status, 413);
});
