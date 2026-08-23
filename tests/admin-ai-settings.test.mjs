import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadAdminAiSettings, normalizeAdminApiError, saveAdminAiSettings, testAdminAiProvider } from '../src/services/adminAiSettings.js';

test('frontend preserves authorization and provider error categories with request IDs', () => {
  const headers = { get: name => name === 'x-request-id' ? 'request-1' : null };
  const recent = normalizeAdminApiError({ status: 403, headers }, { error: { code: 'RECENT_AUTH_REQUIRED', message: 'internal' } }, 'fallback');
  assert.equal(recent.code, 'RECENT_AUTH_REQUIRED');
  assert.match(recent.message, /Reauthentication is required/);
  assert.equal(recent.requestId, 'request-1');
  const provider = normalizeAdminApiError({ status: 422, headers }, { code: 'AI_PROVIDER_AUTHENTICATION_FAILED', error: 'raw provider response' }, 'fallback');
  assert.match(provider.message, /rejected the configured credential/);
  assert.doesNotMatch(provider.message, /raw provider response/);
});

test('frontend load/save/test contracts preserve revisions and reject failed backend responses', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/test-provider')) return { ok: false, status: 504, headers: { get: () => 'req-timeout' }, json: async () => ({ code: 'AI_PROVIDER_TIMEOUT', error: 'internal timeout' }) };
      if (options.method === 'POST') return { ok: false, status: 409, headers: { get: () => 'req-conflict' }, json: async () => ({ code: 'AI_SETTINGS_CONFLICT', error: 'changed elsewhere' }) };
      return { ok: true, status: 200, headers: { get: () => 'req-load' }, json: async () => ({ success: true, settings: { provider: 'gemini' }, configuredProviders: { gemini: true }, revision: 7 }) };
    };
    assert.equal((await loadAdminAiSettings()).revision, 7);
    await assert.rejects(() => saveAdminAiSettings({ provider: 'gemini' }, 7), error => error.code === 'AI_SETTINGS_CONFLICT');
    await assert.rejects(() => testAdminAiProvider({ provider: 'gemini', model: 'gemini-2.0-flash' }), error => error.code === 'AI_PROVIDER_TIMEOUT');
    assert.equal(JSON.parse(calls[1].options.body).expectedRevision, 7);
    assert.equal(calls[2].url, '/api/admin/ai/test-provider');
  } finally { globalThis.fetch = originalFetch; }
});

test('AI Settings UI uses distinct load/save/test APIs and confirms success only after backend results', async () => {
  const [ui, service, payment] = await Promise.all([
    fs.readFile('src/components/admin/settings/AiSettings.jsx', 'utf8'),
    fs.readFile('src/services/adminAiSettings.js', 'utf8'),
    fs.readFile('src/components/admin/settings/subscriptionsSettings.jsx', 'utf8'),
  ]);
  assert.match(service, /\/api\/admin\/ai-settings/);
  assert.match(service, /\/api\/admin\/ai\/test-provider/);
  // Payment configuration is intentionally not allowed to reuse the email
  // connection route. This protects the regression where a provider test
  // returned success for the wrong subsystem.
  assert.doesNotMatch(payment, /\/api\/admin\/test-connection/);
  assert.match(payment, /getAdminPaymentSettings/);
  assert.match(ui, /await saveAdminAiSettings/);
  assert.match(ui, /setGlobalMessage\(\{ type: 'success'/);
  assert.match(ui, /RECENT_AUTH_REQUIRED/);
  assert.match(ui, /Reauthenticate and retry/);
  assert.match(ui, /AI_SETTINGS_CONFLICT/);
  assert.match(ui, /Reload AI settings successfully before saving/);
  assert.match(ui, /disabled=\{saving \|\| loadFailed\}/);
  assert.doesNotMatch(`${ui}\n${service}`, /localStorage|sessionStorage/);
});

test('AI, payment and email provider tests use unambiguous namespaces', async () => {
  const [index, ai, payment, paymentService, email] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/services/adminAiSettings.js', 'utf8'),
    fs.readFile('src/components/admin/settings/subscriptionsSettings.jsx', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('src/components/admin/settings/EmailSmtpSettings.jsx', 'utf8'),
  ]);
  assert.doesNotMatch(index, /app\.post\('\/api\/admin\/test-connection'/);
  assert.match(ai, /\/api\/admin\/ai\/test-provider/);
  assert.match(paymentService, /\/api\/admin\/payment\/test-provider/);
  assert.match(paymentService, /\/api\/platform\/payment-settings/);
  assert.match(payment, /testPaymentProvider/);
  assert.match(payment, /razorpayKeySecret/);
  assert.match(payment, /configuredProviders/);
  assert.match(email, /\/api\/email\/admin\/test-connection/);
});

test('generic Admin settings cannot bypass the revisioned AI settings endpoint', async () => {
  const [modules, settingsIndex, backend] = await Promise.all([
    fs.readFile('src/components/admin/settings/ModulesSettings.jsx', 'utf8'),
    fs.readFile('src/components/admin/settings/Settings.jsx', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
  ]);
  assert.doesNotMatch(modules, /saveSystemSettings\('ai'/);
  assert.doesNotMatch(settingsIndex, /import PaymentSettings/);
  const categories = backend.match(/GENERIC_ADMIN_SETTING_CATEGORIES[\s\S]*?\]\);/)?.[0] || '';
  assert.doesNotMatch(categories, /'ai'|'payments'/);
});

test('AI Settings supports exactly the restored secure provider set and preserves fallback controls', async () => {
  const [ui, backend] = await Promise.all([
    fs.readFile('src/components/admin/settings/AiSettings.jsx', 'utf8'),
    fs.readFile('backend/services/aiAdmin.js', 'utf8'),
  ]);
  for (const provider of ['gemini','nvidia','openai','groq','openrouter','deepseek']) {
    assert.match(ui.toLowerCase(), new RegExp(provider));
    assert.match(backend, new RegExp(provider));
  }
  assert.match(ui, /enableFallback/);
  assert.match(ui, /next configured provider/);
  assert.match(backend, /enableFallback/);
  assert.match(ui, /Not supported by the trusted multi-provider runtime/);
});

test('AI secrets remain backend-only and frontend fields receive secure masked tokens', async () => {
  const [ui, service, rules] = await Promise.all([
    fs.readFile('src/components/admin/settings/AiSettings.jsx', 'utf8'),
    fs.readFile('backend/services/aiAdmin.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'),
  ]);
  assert.match(service, /settings.*ai_providers/s);
  assert.match(service, /configuredProviders/);
  assert.match(service, /doesNotMatch|apiKey/); // server module owns key handling
  assert.match(ui, /masked\.gemini/);
  assert.match(ui, /masked\.nvidia/);
  assert.match(ui, /deployment-managed credential takes precedence/);
  assert.match(rules, /ai_providers/);
  assert.match(rules, /allow read: if admin\(\) && !\(id in/);
});
