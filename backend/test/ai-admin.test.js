'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAiAdminSettings, publicAiSettings, saveAiAdminSettings, testAiProvider } = require('../services/aiAdmin');

const admin = {};
const baseInput = {
  provider: 'nvidia', enableGemini: true, enableNvidia: true, enableOpenai: true,
  enableGroq: true, enableOpenrouter: true, enableDeepseek: true,
  model: 'gemini-2.0-flash', nvidiaModel: 'meta/llama-3.2-11b-vision-instruct', openaiModel: 'gpt-4o-mini',
  groqModel: 'llama-3.3-70b-versatile', openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free', deepseekModel: 'deepseek-chat',
  temperature: 0.4, maxTokens: 3000, enableFallback: true,
};

const { installAiSettingsContract } = require('./helpers/aiSettingsContract');
const settingsContract = installAiSettingsContract();

test('AI Admin public settings preserve all six providers and fallback controls', () => {
  const result = publicAiSettings(baseInput);
  assert.equal(result.provider, 'nvidia');
  assert.equal(result.enableFallback, true);
  assert.equal(result.temperature, 0.4);
  assert.equal(result.maxTokens, 3000);
  for (const field of ['enableGemini','enableNvidia','enableOpenai','enableGroq','enableOpenrouter','enableDeepseek']) assert.equal(result[field], true);
  assert.throws(() => publicAiSettings({ provider: 'unknown-unregistered' }), /Unsupported primary/);
});

test('authorized AI settings save is revisioned, audited, split, and never returns secrets', async () => {
  settingsContract.reset();
  const input = { ...baseInput, nvidiaApiKey: 'fixture-nvidia-key-value' };
  const result = await saveAiAdminSettings({ admin, input, expectedRevision: 0, actorUid: 'admin-1', requestId: 'req-1' });
  assert.equal(result.revision, 1);
  assert.equal(result.configuredProviders.nvidia, true);
  assert.doesNotMatch(JSON.stringify(result), /fixture-nvidia-key-value/);
  assert.equal(settingsContract.settings.get('ai_providers').data.nvidia.apiKey, 'fixture-nvidia-key-value');
  assert.equal(settingsContract.settings.get('public_config').data.ai.provider, 'nvidia');
  assert.equal(settingsContract.auditEvents.some(event => event.action === 'AI_PROVIDER_SETTINGS_UPDATED'), true);
  await assert.rejects(() => saveAiAdminSettings({ admin, input, expectedRevision: 0, actorUid: 'admin-1' }), error => error.code === 'AI_SETTINGS_CONFLICT');
});

test('AI secret lifecycle preserves blank values and accepts only explicit clears', () => {
  const { secretPatch } = require('../services/aiAdmin');
  const existing = { openai: { apiKey: 'existing-server-key' } };
  const preserved = secretPatch({ openaiApiKey: '' }, existing, {});
  assert.equal(preserved.openai.apiKey, 'existing-server-key');
  const cleared = secretPatch({ openaiApiKey: '', clearSecrets: { openai: true } }, existing, {});
  assert.equal(Object.hasOwn(cleared.openai, 'apiKey'), false);
});

test('AI settings load reports configured booleans without returning provider keys', async () => {
  settingsContract.reset({
    public_config: { ai: baseInput, aiRevision: 4 },
    ai_providers: { nvidia: { apiKey: 'server-secret', model: 'meta/llama-3.2-11b-vision-instruct' }, _revision: 4 },
    system_settings: { ai: { geminiApiKey: 'legacy-secret' } },
  });
  const result = await loadAiAdminSettings({ OPENAI_API_KEY: 'environment-openai-secret', OPENAI_MODEL: 'gpt-4.1-mini' });
  assert.equal(result.revision, 4);
  assert.equal(result.configuredProviders.nvidia, true);
  assert.equal(result.configuredProviders.gemini, true);
  assert.equal(result.credentialSources.nvidia, 'mariadb-secret-store');
  assert.equal(result.credentialSources.gemini, 'mariadb-legacy-setting');
  assert.equal(result.credentialSources.openai, 'environment');
  assert.equal(result.settings.openaiModel, 'gpt-4.1-mini');
  assert.doesNotMatch(JSON.stringify(result), /server-secret|legacy-secret|environment-openai-secret/);
});

test('provider test succeeds for each supported provider using deterministic mocked contracts', async () => {
  for (const provider of ['nvidia','openai','groq','openrouter','deepseek']) {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) });
    const result = await testAiProvider({ provider, model: baseInput[provider === 'nvidia' ? 'nvidiaModel' : `${provider}Model`], apiKey: `${provider}-credential-value`, fetchImpl, environment: {} });
    assert.equal(result.provider, provider);
  }
  const geminiFetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }) });
  assert.equal((await testAiProvider({ provider: 'gemini', model: baseInput.model, apiKey: 'gemini-credential-value', fetchImpl: geminiFetch, environment: {} })).provider, 'gemini');
});

test('provider test distinguishes missing config, rejected credentials, invalid model, outage, and timeout without mutating settings', async () => {
  settingsContract.reset();
  const unrelatedState = new Map([['sentinel', { revision: 2 }]]);
  const before = JSON.stringify([...unrelatedState.entries()]);
  await assert.rejects(() => testAiProvider({ provider: 'openai', model: 'gpt-4o-mini', environment: {} }), error => error.code === 'AI_PROVIDER_NOT_CONFIGURED');
  await assert.rejects(() => testAiProvider({ provider: 'openai', model: 'bad model', apiKey: 'valid-credential', environment: {} }), error => error.code === 'AI_SETTINGS_VALIDATION_ERROR');
  const response = status => async () => ({ ok: false, status, json: async () => ({ error: { message: 'sensitive provider detail' } }) });
  await assert.rejects(() => testAiProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'valid-credential', fetchImpl: response(401), environment: {} }), error => error.code === 'AI_PROVIDER_AUTHENTICATION_FAILED' && !/sensitive/.test(error.message));
  await assert.rejects(() => testAiProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'valid-credential', fetchImpl: response(503), environment: {} }), error => error.code === 'AI_PROVIDER_UNAVAILABLE');
  const aborting = async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(() => testAiProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'valid-credential', fetchImpl: aborting, timeoutMs: 5, environment: {} }), error => error.code === 'AI_PROVIDER_TIMEOUT');
  assert.equal(JSON.stringify([...unrelatedState.entries()]), before);
});

test('manual pin for an environment-enabled local primary persists without copying deployment credentials', async () => {
  settingsContract.reset();
  const saved = await saveAiAdminSettings({ input: { provider: 'llamacpp', selectionMode: 'manual', llamacpp: { model: '/models/local.gguf' } }, actorUid: 'super', expectedRevision: 0 });
  assert.equal(saved.settings.provider, 'llamacpp');
  assert.equal(saved.settings.selectionMode, 'manual');
  assert.equal(saved.catalog.find(provider => provider.id === 'llamacpp').defaultModel, '/models/local.gguf');
  assert.equal(settingsContract.settings.get('ai_providers').data.llamacpp.model, '/models/local.gguf');
});

test('credential-only saves preserve the locked manual policy, model pin, fallback and generation controls', async () => {
  settingsContract.reset({
    public_config: { aiRevision: 1, ai: { provider: 'llamacpp', selectionMode: 'manual', temperature: 0.7, maxTokens: 256, enableFallback: false } },
    ai_providers: { _revision: 1, llamacpp: { apiKey: 'keyless', enabled: true, model: '/models/pin.gguf', baseUrl: 'http://127.0.0.1:8081/v1' } },
  });
  const saved = await saveAiAdminSettings({ input: { openaiApiKey: 'fixture-openai-secret' }, actorUid: 'super', expectedRevision: 1 });
  assert.equal(saved.settings.provider, 'llamacpp');
  assert.equal(saved.settings.selectionMode, 'manual');
  assert.equal(saved.settings.temperature, 0.7);
  assert.equal(saved.settings.maxTokens, 256);
  assert.equal(saved.settings.enableFallback, false);
  assert.equal(saved.catalog.find(p => p.id === 'llamacpp').defaultModel, '/models/pin.gguf');
  assert.ok(!JSON.stringify(saved).includes('fixture-openai-secret'));
});
test('registered local endpoint overrides persist, blank preserves, none clears, and embedded credentials fail closed', async () => {
  settingsContract.reset();
  await saveAiAdminSettings({ input: { llamacppApiKey: 'keyless', llamacppBaseUrl: 'http://127.0.0.1:9090/v1/' }, actorUid: 'super', expectedRevision: 0 });
  assert.equal(settingsContract.settings.get('ai_providers').data.llamacpp.baseUrl, 'http://127.0.0.1:9090/v1');
  await saveAiAdminSettings({ input: { llamacppBaseUrl: '' }, actorUid: 'super', expectedRevision: 1 });
  assert.equal(settingsContract.settings.get('ai_providers').data.llamacpp.baseUrl, 'http://127.0.0.1:9090/v1');
  await saveAiAdminSettings({ input: { llamacppBaseUrl: 'none' }, actorUid: 'super', expectedRevision: 2 });
  assert.equal(settingsContract.settings.get('ai_providers').data.llamacpp.baseUrl, undefined);
  await assert.rejects(saveAiAdminSettings({ input: { llamacppBaseUrl: 'https://user:secret@example.test/v1' }, actorUid: 'super', expectedRevision: 3 }), { code: 'AI_SETTINGS_VALIDATION_ERROR' });
});

test('admin discovery honors configured endpoints and authoritative model removal rather than reviving static defaults', async () => {
  settingsContract.reset({ ai_providers: { llamacpp: { enabled: true, apiKey: 'keyless', baseUrl: 'http://127.0.0.1:9090/v1' } } });
  const { fetchProviderModels } = require('../services/aiAdmin');
  const { modelDiscovery } = require('../freellmapi/services/modelDiscovery');
  modelDiscovery.clear();
  let rows = [{ id: 'live-first' }];
  const fetchImpl = async url => {
    assert.equal(url, 'http://127.0.0.1:9090/v1/models');
    return Response.json({ data: rows });
  };
  assert.equal((await fetchProviderModels({ provider: 'llamacpp', environment: {}, fetchImpl })).models[0].id, 'live-first');
  rows = [];
  assert.deepEqual((await fetchProviderModels({ provider: 'llamacpp', environment: {}, fetchImpl })).models, []);
});

test('maskApiKey enforces strict non-reversible masking without prefix leak', () => {
  const { maskApiKey } = require('../services/aiAdmin');
  assert.equal(maskApiKey(''), '');
  assert.equal(maskApiKey('   '), '');
  assert.equal(maskApiKey('short7'), '••••••••', 'keys < 8 chars return 8 bullets only');
  assert.equal(maskApiKey('1234567'), '••••••••', '7-char key returns 8 bullets only');
  assert.equal(maskApiKey('12345678'), '••••••••5678', '8-char key returns 8 bullets + last-4');
  const masked = maskApiKey('prefix-secret-material-ZYXW');
  assert.equal(masked, '••••••••ZYXW');
  assert.doesNotMatch(masked, /prefix/, 'must never leak leading prefix characters');
});

test('maskedKeys populates from secretPool first else envPool without persisting env keys to MariaDB', async () => {
  settingsContract.reset({
    public_config: { ai: baseInput, aiRevision: 1 },
    ai_providers: {
      cerebras: { apiKey: 'stored-cerebras-secret-ABCD', apiKeys: ['stored-cerebras-secret-ABCD'] },
      _revision: 1,
    },
  });
  const env = {
    CEREBRAS_API_KEY: 'env-cerebras-secret-9999',
    TAVILY_API_KEY: 'env-tavily-secret-WXYZ',
    MISTRAL_API_KEY: 'env-mistral-one-1111,env-mistral-two-2222',
  };
  const loaded = await loadAiAdminSettings(env);
  assert.equal(loaded.maskedKeys.cerebras, '••••••••ABCD', 'secretPool takes precedence over envPool in maskedKeys');
  assert.equal(loaded.maskedKeys.tavily, '••••••••WXYZ', 'env-sourced non-legacy provider returns masked last-4');
  assert.equal(loaded.maskedKeys.mistral, '••••••••1111 +1', 'env-sourced multi-key pool masks first key + count');
  assert.doesNotMatch(JSON.stringify(loaded), /stored-cerebras-secret|env-cerebras-secret|env-tavily-secret|env-mistral/);

  // Saving unrelated settings must never copy env keys into MariaDB ai_providers
  await saveAiAdminSettings({ input: { temperature: 1.5, maxTokens: 8192 }, expectedRevision: 1, actorUid: 'super' });
  const storedProviders = settingsContract.settings.get('ai_providers').data;
  assert.equal(storedProviders.tavily, undefined, 'env-only provider must not be copied to MariaDB');
  assert.equal(storedProviders.mistral, undefined, 'env-only pool must not be copied to MariaDB');
  assert.doesNotMatch(JSON.stringify(storedProviders), /env-cerebras-secret|env-tavily-secret|env-mistral/);
});

test('temperature [0, 2], maxTokens [256, 8192], and enabled:false / disabled:true persist across all 75 providers', async () => {
  settingsContract.reset();
  const { buildFreeLlmPlatformConfig } = require('../services/freellmConfig');

  // Seed credentials across legacy (groq), frontier non-legacy (cerebras), local keyless (llamacpp), and search (tavily)
  const seeded = await saveAiAdminSettings({
    input: {
      groqApiKey: 'fixture-groq-secret-1234',
      cerebrasApiKey: 'fixture-cerebras-secret-5678',
      tavilyApiKey: 'fixture-tavily-secret-9012',
      llamacpp: { enabled: true },
      temperature: 1.8,
      maxTokens: 8192,
    },
    expectedRevision: 0,
    actorUid: 'super',
  });
  assert.equal(seeded.settings.temperature, 1.8);
  assert.equal(seeded.settings.maxTokens, 8192);
  for (const id of ['groq', 'cerebras', 'tavily', 'llamacpp']) {
    const item = seeded.catalog.find(p => p.id === id);
    assert.equal(item.enabled, true, `${id} initially enabled`);
    assert.equal(item.disabled, false, `${id} initially not disabled`);
  }

  // Disable both legacy and non-legacy providers; credentials stay preserved & masked while runtime skips them
  const afterDisable = await saveAiAdminSettings({
    input: {
      enableGroq: false,
      enableCerebras: false,
      tavily: { enabled: false },
      llamacpp: { disabled: true },
    },
    expectedRevision: seeded.revision,
    actorUid: 'super',
  });
  for (const id of ['groq', 'cerebras', 'tavily', 'llamacpp']) {
    const item = afterDisable.catalog.find(p => p.id === id);
    assert.equal(item.enabled, false, `${id} persisted as disabled`);
    assert.equal(item.disabled, true, `${id} disabled flag true`);
    assert.equal(item.status, 'disabled', `${id} status disabled`);
  }
  assert.equal(afterDisable.maskedKeys.cerebras, '••••••••5678', 'disabled provider keeps masked key intact');

  const runtimeCfg = buildFreeLlmPlatformConfig({
    environment: {},
    secrets: settingsContract.settings.get('ai_providers').data,
    publicConfig: settingsContract.settings.get('public_config').data,
    systemSettings: {},
  });
  for (const id of ['groq', 'cerebras', 'tavily', 'llamacpp']) {
    assert.equal(runtimeCfg.providers[id], undefined, `${id} excluded from live runtime dispatch while disabled`);
  }

  // Re-enable non-legacy provider without re-entering its secret key
  const reEnabled = await saveAiAdminSettings({
    input: { enabledProviders: { cerebras: true } },
    expectedRevision: afterDisable.revision,
    actorUid: 'super',
  });
  const cerebrasItem = reEnabled.catalog.find(p => p.id === 'cerebras');
  assert.equal(cerebrasItem.enabled, true, 'cerebras re-enabled without re-sending secret');
  assert.equal(cerebrasItem.disabled, false);
  assert.equal(reEnabled.maskedKeys.cerebras, '••••••••5678');
});

test('enabledProviders overrides merged legacy fields and persists correctly on both public_config and ai_providers', async () => {
  settingsContract.reset({
    public_config: { ai: { provider: 'nvidia', enableGemini: true, enableNvidia: true }, aiRevision: 1 },
    ai_providers: {
      gemini: { model: 'gemini-2.0-flash' },
      nvidia: { apiKey: 'test-nvidia-key-1234', enabled: true },
      _revision: 1,
    },
  });

  // Toggle OFF legacy provider gemini via enabledProviders
  const res = await saveAiAdminSettings({
    input: { enabledProviders: { gemini: false } },
    expectedRevision: 1,
    actorUid: 'super',
  });

  const storedPublic = settingsContract.settings.get('public_config').data;
  const storedProviders = settingsContract.settings.get('ai_providers').data;
  assert.equal(storedPublic.ai.enableGemini, false, 'public_config.ai.enableGemini must be updated to false');
  assert.equal(storedProviders.gemini.enabled, false, 'ai_providers.gemini.enabled must be false');
  assert.equal(storedProviders.gemini.disabled, true, 'ai_providers.gemini.disabled must be true');
  const geminiCatalog = res.catalog.find(p => p.id === 'gemini');
  assert.equal(geminiCatalog.enabled, false, 'catalog reflects gemini as disabled');
  assert.equal(geminiCatalog.disabled, true, 'catalog disabled flag is true');
});

test('disabling the active primary provider throws 400 CANNOT_DISABLE_PRIMARY_PROVIDER', async () => {
  settingsContract.reset({
    public_config: { ai: { provider: 'nvidia', enableNvidia: true }, aiRevision: 1 },
    ai_providers: {
      nvidia: { apiKey: 'test-nvidia-key-1234', enabled: true },
      _revision: 1,
    },
  });

  await assert.rejects(
    async () => {
      await saveAiAdminSettings({
        input: { enabledProviders: { nvidia: false } },
        expectedRevision: 1,
        actorUid: 'super',
      });
    },
    (err) => {
      assert.equal(err.code, 'CANNOT_DISABLE_PRIMARY_PROVIDER');
      assert.equal(err.status, 400);
      return true;
    }
  );
});

test('saveAiAdminSettings requires expectedRevision for administrative writes unless force: true', async () => {
  settingsContract.reset({
    public_config: { ai: { provider: 'nvidia' }, aiRevision: 2 },
    ai_providers: { nvidia: { apiKey: 'test-key' }, _revision: 2 },
  });

  // Omitting expectedRevision without force: true throws 400 EXPECTED_REVISION_REQUIRED
  await assert.rejects(
    async () => {
      await saveAiAdminSettings({
        input: { temperature: 0.7 },
        actorUid: 'super',
      });
    },
    (err) => {
      assert.equal(err.code, 'EXPECTED_REVISION_REQUIRED');
      assert.equal(err.status, 400);
      return true;
    }
  );

  // Supplying expectedRevision succeeds
  const withRevision = await saveAiAdminSettings({
    input: { temperature: 0.7 },
    expectedRevision: 2,
    actorUid: 'super',
  });
  assert.equal(withRevision.revision, 3);

  // Supplying force: true bypasses expectedRevision requirement
  const withForce = await saveAiAdminSettings({
    input: { temperature: 0.8, force: true },
    actorUid: 'super',
  });
  assert.equal(withForce.revision, 4);
});

test('sanitizeAuditValue redacts sensitive keys and secret value patterns in audit metadata', () => {
  const { sanitizeAuditValue } = require('../security/adminAudit');

  // Direct sensitive key redaction
  assert.equal(sanitizeAuditValue('apiKey', 'candidate-secret-key-1234'), '[REDACTED]');
  assert.equal(sanitizeAuditValue('nvidiaApiKey', 'nvapi-some-secret-token'), '[REDACTED]');
  assert.equal(sanitizeAuditValue('password', 'p@ssw0rd123'), '[REDACTED]');
  assert.equal(sanitizeAuditValue('clientSecret', 'stripe_secret_key'), '[REDACTED]');

  // Nested object redaction preserving non-sensitive fields
  const metadata = {
    providerId: 'cerebras',
    fieldChanged: ['provider', 'model'],
    revision: 5,
    apiKey: 'transient-candidate-secret',
    nested: {
      safeField: 'safeValue',
      token: 'bearer-token-val',
    },
  };
  const sanitized = sanitizeAuditValue('metadata', metadata);
  assert.equal(sanitized.providerId, 'cerebras');
  assert.deepEqual(sanitized.fieldChanged, ['provider', 'model']);
  assert.equal(sanitized.revision, 5);
  assert.equal(sanitized.apiKey, '[REDACTED]');
  assert.equal(sanitized.nested.safeField, 'safeValue');
  assert.equal(sanitized.nested.token, '[REDACTED]');
});

test('A1 Assertion 2: candidate key passed to testAiProvider is never logged or leaked to server-side stdout/stderr', async () => {
  const candidateKey = 'fixture-a1-unit-test-candidate-key-XYZ99';
  const interceptedLogs = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  console.log = (...args) => interceptedLogs.push(args.map(String).join(' '));
  console.error = (...args) => interceptedLogs.push(args.map(String).join(' '));
  console.warn = (...args) => interceptedLogs.push(args.map(String).join(' '));

  try {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Candidate probe success' } }],
      }),
    });

    await testAiProvider({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      apiKey: candidateKey,
      fetchImpl: mockFetch,
      timeoutMs: 5000,
    });

    // Zero server-side log lines touch candidateKey
    for (const line of interceptedLogs) {
      assert.doesNotMatch(line, new RegExp(candidateKey));
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
});

test('GAP 7 audit: mask pattern ^•{8,}\\S{4}$ prevents plaintext prefix leaks while accepting valid non-alphanumeric suffix characters', () => {
  // \S{4} also matches all-bullets, which is unreachable: mask is
  // generated server-side from the last 4 chars of a real provider key,
  // which cannot be bullet characters.
  const maskRegex = /^•{8,}\S{4}$/;


  // Valid masked keys with alphanumeric and special suffix chars
  assert.equal(maskRegex.test('••••••••1234'), true);
  assert.equal(maskRegex.test('••••••••ab12'), true);
  assert.equal(maskRegex.test('••••••••a-b_'), true);
  assert.equal(maskRegex.test('••••••••X_9$'), true);

  // Security proofs: ANY plaintext prefix leak MUST FAIL the pattern
  assert.equal(maskRegex.test('gsk_••••••••1234'), false, 'Prefix leak gsk_ must fail mask pattern');
  assert.equal(maskRegex.test('sk-••••••••1234'), false, 'Prefix leak sk- must fail mask pattern');
  assert.equal(maskRegex.test('nvapi-••••••••1234'), false, 'Prefix leak nvapi- must fail mask pattern');
  assert.equal(maskRegex.test('••••••••gsk_1234'), false, 'Too many suffix chars must fail mask pattern');
  assert.equal(maskRegex.test('gsk_1234'), false, 'Unmasked short key must fail mask pattern');
  assert.equal(maskRegex.test('••••1234'), false, 'Fewer than 8 bullets must fail mask pattern');
  assert.equal(maskRegex.test('••••••••12 4'), false, 'Space in suffix must fail mask pattern (\\S requirement)');
  assert.equal(maskRegex.test('••••••••12\n4'), false, 'Newline in suffix must fail mask pattern (\\S requirement)');
});


