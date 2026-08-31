process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLegacyPrompt,
  buildResumeParsingPrompt,
  clearProviderConfigurationCache,
  executeContentOperation,
  executeResumeParsing,
  groundResumeExtraction,
  loadProviderConfiguration,
  parseAiResponse,
  providerOrder,
  requestProvider,
} = require('../services/aiRuntime');

async function seedRuntimeSettings({ secrets = {}, publicAi = {}, legacyAi = {} } = {}) {
  const settings = {
    ai_providers: secrets,
    public_config: { ai: publicAi },
    system_settings: { ai: legacyAi },
  };
  require('../repositories').setRepositoryForTests({
    async getSetting(category) { return settings[category] || null; },
  });
  clearProviderConfigurationCache();
}

const okJson = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('content prompts require source evidence and distinguish recommendations from candidate claims', () => {
  const work = buildLegacyPrompt('generate-work-description', {
    jobTitle: 'Platform Engineer', employer: 'Acme', city: 'Vijayawada',
    existingText: 'Migrated the billing API to containers', focusTone: 'technical', language: 'en',
  }, { sessionId: 'fixture' }).prompt;
  assert.match(work, /expert resume writer/i);
  assert.match(work, /Platform Engineer/);
  assert.match(work, /Acme/);
  assert.match(work, /Migrated the billing API to containers/);
  assert.match(work, /Tone preference: technical/);

  const summary = buildLegacyPrompt('generate-summary', {
    name: 'Asha Rao', jobTitle: 'Engineer', experience: '6+ years',
    workHistory: 'Engineer at Acme', education: 'M.Tech', skills: ['React', 'Node.js'],
    certifications: ['AWS'], projects: 'Payments modernization', language: 'en',
  }, { sessionId: 'fixture' }).prompt;
  for (const context of ['Asha Rao', '6+ years', 'Engineer at Acme', 'M.Tech', 'React, Node.js', 'AWS', 'Payments modernization']) assert.match(summary, new RegExp(context.replace(/[+.]/g, '\\$&')));
  assert.match(summary, /executive resume writer/i);
  assert.match(summary, /"summary"/);

  const skills = buildLegacyPrompt('generate-skills', {
    occupation: 'Engineer', existingSkills: ['JavaScript'],
  }, { sessionId: 'fixture' }).prompt;
  assert.match(skills, /in-demand, highly relevant professional skill ideas/i);
  assert.match(skills, /"category":"recommended"/);
  assert.match(skills, /JavaScript/);

  const autocomplete = buildLegacyPrompt('autocomplete', { type: 'skill', query: 'Rea' }, { sessionId: 'fixture' }).prompt;
  assert.match(autocomplete, /taxonomy value/);
  assert.match(autocomplete, /"Rea"/);
  assert.throws(
    () => buildLegacyPrompt('autocomplete', { type: 'certificationIssuer', query: 'Ama' }),
    error => error.code === 'INVALID_AI_INPUT'
  );
});

test('response normalization preserves UI contracts across markdown, aliases, and cleanup', () => {
  assert.deepEqual(parseAiResponse('generate-work-description', '```json\n{"bullets":[{"text":"Spearheaded migration [X%]"},"Built APIs"]}\n```'), {
    suggestions: ['Led migration', 'Built APIs'],
  });
  assert.deepEqual(parseAiResponse('generate-summary', '{"description":"Engineer with distributed systems experience."}'), {
    summary: 'Engineer with distributed systems experience.',
  });
  assert.deepEqual(parseAiResponse('generate-skills', '{"keywords":["React (e.g. React.js)",{"skill":"Docker","type":"mandatory"}]}'), {
    skills: [
      { name: 'React', category: 'recommended' },
      { name: 'Docker', category: 'recommended' },
    ],
  });
  // Broken trailing comma JSON with raw bracketry is parsed and sanitized without leaking JSON fragments
  assert.deepEqual(parseAiResponse('generate-skills', '{"skills":[{"name":"Cloud Computing","category":"recommended"},{"name":"DevOps","category":"recommended"},]}'), {
    skills: [
      { name: 'Cloud Computing', category: 'recommended' },
      { name: 'DevOps', category: 'recommended' },
    ],
  });
  // Unparsed raw string with JSON patterns extracts clean skill names and drops broken syntax
  assert.deepEqual(parseAiResponse('generate-skills', '{"skills":[{"name":"Data Analysis"},{"name":"Cyber Security"}]}'), {
    skills: [
      { name: 'Data Analysis', category: 'recommended' },
      { name: 'Cyber Security', category: 'recommended' },
    ],
  });
  assert.deepEqual(parseAiResponse('generate-certifications', '{"certs":[{"name":"AWS Certified Developer","organization":"Amazon Web Services"}]}'), {
    certifications: [{ title: 'AWS Certified Developer', issuer: 'Amazon Web Services', category: 'mandatory' }],
  });
  assert.deepEqual(parseAiResponse('enhance-single-bullet', 'Leveraged automation to reduce deployment time.'), {
    enhancedBullet: 'Used automation to reduce deployment time.',
  });
  assert.deepEqual(parseAiResponse('generate-summary', '{"summary":"<script>alert(1)</script><b>Secure engineer</b>"}'), {
    summary: 'Secure engineer',
  });
});

test('grammar responses are deterministically bounded and invalid indexes are rejected', () => {
  const text = 'Teh company is growing. ';
  const raw = JSON.stringify({
    hasErrors: true,
    corrections: [
      { original: 'Teh', suggestion: 'The', type: 'spelling', explanation: 'Spelling', startIndex: 0, endIndex: 3 },
      { original: 'Nope', suggestion: 'Never', type: 'grammar', explanation: 'Stale index', startIndex: 99, endIndex: 103 },
      { original: 'Teh', suggestion: 'The', type: 'spelling', explanation: 'Duplicate range', startIndex: 0, endIndex: 3 },
      { original: 'growing. ', suggestion: 'growing.', type: 'style', explanation: 'Trailing space', startIndex: 15, endIndex: 24 },
      { original: 'bad', suggestion: 'evil', type: 'injection', explanation: 'Bad type', startIndex: 0, endIndex: 3 },
    ],
    overallSuggestion: 'Review the issue.'
  });
  assert.deepEqual(parseAiResponse('check-grammar', raw, { sourceText: text }), {
    hasErrors: true,
    corrections: [
      { original: 'Teh', suggestion: 'The', type: 'spelling', explanation: 'Spelling', startIndex: 0, endIndex: 3 },
      { original: 'growing. ', suggestion: 'growing.', type: 'style', explanation: 'Trailing space', startIndex: 15, endIndex: 24 },
    ],
    overallSuggestion: 'Review the issue.'
  });
  assert.deepEqual(parseAiResponse('check-grammar', '{"hasErrors":false,"corrections":[],"overallSuggestion":"All good."}', { sourceText: text }), {
    hasErrors: false, corrections: [], overallSuggestion: 'All good.'
  });
});

test('server configuration preserves primary provider, model, controls, and fallback order without exposing keys', async () => {
  await seedRuntimeSettings({
    secrets: {
      nvidia: { apiKey: 'nvidia-test-key-12345', model: 'meta/custom-model' },
      gemini: { apiKey: 'gemini-test-key-12345' },
      openai: { apiKey: 'openai-test-key-12345' },
    },
    publicAi: { provider: 'nvidia', enableNvidia: true, enableGemini: true, enableOpenai: false, enableFallback: true, temperature: 0.4, maxTokens: 1337 },
  });
  const configuration = await loadProviderConfiguration({});
  assert.equal(configuration.primary, 'nvidia');
  assert.equal(configuration.providers.nvidia.model, 'meta/custom-model');
  assert.equal(configuration.temperature, 0.4);
  assert.equal(configuration.maxTokens, 1337);
  assert.deepEqual(providerOrder(configuration), ['nvidia', 'gemini']);
  assert.doesNotMatch(JSON.stringify({ ...configuration, providers: Object.fromEntries(Object.entries(configuration.providers).map(([key, value]) => [key, { enabled: value.enabled, model: value.model }])) }), /test-key/);
});

test('provider configuration cache avoids cross-request mutation of generation controls', async () => {
  await seedRuntimeSettings({ secrets: { gemini: { apiKey: 'gemini-test-key-12345' } }, publicAi: { temperature: 0.4, maxTokens: 1337 } });
  const first = await loadProviderConfiguration({});
  first.temperature = 0.1;
  first.maxTokens = 4096;
  const second = await loadProviderConfiguration({});
  assert.equal(second.temperature, 0.4);
  assert.equal(second.maxTokens, 1337);
});

test('legacy server-side provider settings remain migration-compatible without returning secrets to browsers', async () => {
  await seedRuntimeSettings({
    legacyAi: { provider: 'groq', groqApiKey: 'legacy-groq-key-12345', groqModel: 'legacy/model', enableGroq: true },
  });
  const configuration = await loadProviderConfiguration({});
  assert.equal(configuration.primary, 'groq');
  assert.equal(configuration.providers.groq.enabled, true);
  assert.equal(configuration.providers.groq.model, 'legacy/model');
});

test('provider failure falls back in configured order and returns the original normalized contract', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options: JSON.parse(options.body) });
    if (url.includes('nvidia.com')) return new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 503 });
    return okJson({ candidates: [{ content: { parts: [{ text: '```json\n{"summary":"Platform Engineer. Built and maintained APIs.","sourceExcerpts":["Built and maintained APIs"]}\n```' }] } }] });
  };
  await seedRuntimeSettings({
    secrets: { nvidia: { apiKey: 'nvidia-test-key-12345' }, gemini: { apiKey: 'gemini-test-key-12345' } },
    publicAi: { provider: 'nvidia', enableFallback: true },
  });
  const result = await executeContentOperation({
    operation: 'generate-summary', payload: { name: 'Asha', jobTitle: 'Platform Engineer', workHistory: 'Built and maintained APIs' },
    environment: {}, fetchImpl, requestId: 'fixture',
  });
  assert.equal(result.provider, 'gemini');
  assert.deepEqual(result.data, { summary: 'Platform Engineer. Built and maintained APIs.' });
  assert.equal(result.grounding, 'source-validated');
  assert.equal(calls.length, 2);
  assert.match(calls[0].options.messages[0].content, /Asha/);
  assert.match(calls[1].options.contents[0].parts[0].text, /Built and maintained APIs/);
});

test('disabled fallback fails after the selected provider and never spends against another provider', async () => {
  let calls = 0;
  await seedRuntimeSettings({
    secrets: { nvidia: { apiKey: 'nvidia-test-key-12345' }, gemini: { apiKey: 'gemini-test-key-12345' } },
    publicAi: { provider: 'nvidia', enableFallback: false },
  });
  const configuration = await loadProviderConfiguration({});
  await assert.rejects(() => require('../services/aiRuntime').generateWithProviders({
    prompt: 'fixture', operation: 'generate-summary', configuration,
    fetchImpl: async () => { calls += 1; return new Response('{}', { status: 503 }); },
  }), error => error.code === 'AI_PROVIDER_ERROR');
  assert.equal(calls, 1);
});

test('resume extraction returns only source-contained values with grounding metadata', async () => {
  await seedRuntimeSettings({ secrets: { openai: { apiKey: 'openai-test-key-12345' } }, publicAi: { provider: 'openai' } });
  const prompt = buildResumeParsingPrompt('Asha Rao\nasha@example.com\nPlatform Engineer at Acme');
  assert.match(prompt, /Extract, but do not generate or rewrite/);
  assert.match(prompt, /Every non-empty value must be copied verbatim/);
  assert.match(prompt, /asha@example.com/);
  const result = await executeResumeParsing({
    rawText: 'Asha Rao\nasha@example.com\nPlatform Engineer at Acme',
    environment: {},
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.equal(request.temperature, 0.15);
      assert.equal(request.max_tokens, 4096);
      return okJson({ choices: [{ message: { content: '{"firstname":"Asha","lastname":"Rao","email":"asha@example.com","employments":[{"jobTitle":"Platform Engineer","employer":"Acme"}],"educations":[],"skills":[],"languages":[]}' } }] });
    },
  });
  assert.equal(result.data.firstname, 'Asha');
  assert.equal(result.data.employments[0].employer, 'Acme');
  assert.equal(result.data._grounding, 'source-extracted');
  assert.equal(result.grounding, 'source-extracted');
});

test('grounded factual responses reject uncited and lexically unsupported wording', () => {
  const payload = {
    jobTitle: 'Platform Engineer',
    employer: 'Acme',
    existingText: 'Reviewed APIs for deployment readiness',
  };
  assert.deepEqual(
    parseAiResponse(
      'generate-work-description',
      '{"suggestions":[{"text":"Reviewed APIs for deployment readiness","sourceExcerpt":"Reviewed APIs for deployment readiness"}]}',
      { payload, requireGrounding: true }
    ),
    { suggestions: ['Reviewed APIs for deployment readiness'] }
  );
  assert.throws(
    () => parseAiResponse(
      'generate-work-description',
      '{"suggestions":[{"text":"Reviewed elegant APIs for deployment readiness","sourceExcerpt":"Reviewed APIs for deployment readiness"}]}',
      { payload, requireGrounding: true }
    ),
    error => error.code === 'UNGROUNDED_AI_RESPONSE'
  );
  assert.throws(
    () => parseAiResponse(
      'generate-work-description',
      '{"suggestions":[{"text":"Reviewed APIs for deployment readiness","sourceExcerpt":"unrelated evidence"}]}',
      { payload, requireGrounding: true }
    ),
    error => error.code === 'UNGROUNDED_AI_RESPONSE'
  );
});

test('resume grounding drops hallucinations, unsupported associations, and implicit proficiency', () => {
  const source = [
    'Asha Rao',
    'asha@example.com',
    'Engineer | Acme | 2021 - Present',
    'Built APIs',
    'Skills: React 85%; Docker',
    'Languages: English Fluent',
  ].join('\n');
  const grounded = groundResumeExtraction({
    firstname: 'Asha', lastname: 'Mallory', email: 'asha@example.com',
    occupation: 'Senior Engineer', summary: 'Award-winning global leader', isAdmin: true,
    employments: [{
      jobTitle: 'Engineer', employer: 'Evil Corp', startDate: '2021', endDate: 'Present',
      city: 'Vijayawada', description: 'Built APIs\nLed global teams',
    }],
    educations: [{ school: 'Imaginary University', degree: 'M.Tech' }],
    skills: [
      { name: 'React', rating: 85 },
      { name: 'Docker', rating: 99 },
      { name: 'Kubernetes', rating: 100 },
    ],
    languages: [
      { name: 'English', level: 'Fluent' },
      { name: 'Telugu', level: 'Native' },
    ],
  }, source);

  assert.equal(grounded.firstname, 'Asha');
  assert.equal(grounded.lastname, '');
  assert.equal(grounded.occupation, '');
  assert.equal(grounded.summary, '');
  assert.deepEqual(grounded.employments, [{
    jobTitle: 'Engineer', employer: '', city: '', startDate: '2021', endDate: 'Present', description: 'Built APIs',
  }]);
  assert.deepEqual(grounded.educations, []);
  assert.deepEqual(grounded.skills, [
    { skillName: 'React', rating: 85 },
    { skillName: 'Docker', rating: null },
  ]);
  assert.deepEqual(grounded.languages, [{ language: 'English', level: 'Fluent' }]);
  assert.equal(grounded._grounding, 'source-extracted');
  assert.equal(Object.hasOwn(grounded, 'isAdmin'), false);
});

test('provider requests honor cancellation and bounded timeout controls', async () => {
  const controller = new AbortController();
  const promise = requestProvider('openai', { key: 'openai-test-key-12345', model: 'gpt-4o-mini' }, 'prompt', { temperature: 0.7, maxTokens: 256 }, {
    signal: controller.signal,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }),
  });
  controller.abort();
  await assert.rejects(promise, error => error.name === 'AbortError');
});

test('getContentOperationFallback preserves candidate source or returns role-tailored recommendations', () => {
  const { getContentOperationFallback } = require('../services/aiRuntime');

  const certsFallback = getContentOperationFallback('generate-certifications', { jobTitle: 'Cybersecurity Analyst' });
  assert.ok(Array.isArray(certsFallback.certifications));
  assert.ok(certsFallback.certifications.length >= 4);
  assert.equal(certsFallback._source, 'role-tailored-fallback');
  assert.ok(certsFallback.certifications.some(c => c.title.includes('CISSP') || c.title.includes('Security+')));

  const bulletFallback = getContentOperationFallback('enhance-single-bullet', { bullet: 'Spearheaded unit tests' });
  assert.equal(bulletFallback.enhancedBullet, 'Spearheaded unit tests');
  assert.equal(bulletFallback._source, 'source-preserving-fallback');

  const autoFallback = getContentOperationFallback('autocomplete', { type: 'skill', query: 're' });
  assert.deepEqual(autoFallback.suggestions, []);
  assert.equal(autoFallback._source, 'empty-fallback');

  const skillsFallback = getContentOperationFallback('generate-skills', { occupation: 'Frontend Developer' });
  assert.ok(Array.isArray(skillsFallback.skills));
  assert.ok(skillsFallback.skills.length >= 5);
  assert.equal(skillsFallback._source, 'role-tailored-fallback');
  assert.ok(skillsFallback.skills.some(s => s.name === 'React.js' || s.name === 'JavaScript'));
});

test('executeContentOperation gracefully falls back on provider failure without throwing 502', async () => {
  await seedRuntimeSettings({ secrets: { gemini: { apiKey: 'test-key' } }, publicAi: { provider: 'gemini' } });
  const failingFetch = async () => new Response('{"error":"All providers down"}', { status: 503 });

  // A factual operation returns only submitted source when every provider fails.
  const summaryResult = await executeContentOperation({
    operation: 'generate-summary',
    payload: { jobTitle: 'DevOps Engineer', workHistory: 'Maintained deployment pipelines and incident runbooks' },
    environment: {},
    fetchImpl: failingFetch,
    requestId: 'test-fallback-summary',
  });
  assert.equal(summaryResult.provider, 'fallback');
  assert.equal(summaryResult.grounding, 'source-preserving-fallback');
  assert.equal(summaryResult.data.summary, 'DevOps Engineer. Maintained deployment pipelines and incident runbooks');

  // Enhance single bullet returns original bullet on provider failure
  const bulletResult = await executeContentOperation({
    operation: 'enhance-single-bullet',
    payload: { bullet: 'Managed a team of 5' },
    environment: {},
    fetchImpl: failingFetch,
    requestId: 'test-fallback-bullet',
  });
  assert.equal(bulletResult.provider, 'fallback');
  assert.equal(bulletResult.data.enhancedBullet, 'Managed a team of 5');

  // Invalid payload still throws a 400 error (validation error is preserved)
  await assert.rejects(
    () => executeContentOperation({
      operation: 'enhance-single-bullet',
      payload: {}, // Missing required bullet field
        environment: {},
      fetchImpl: failingFetch,
    }),
    error => error.status === 400
  );
});

