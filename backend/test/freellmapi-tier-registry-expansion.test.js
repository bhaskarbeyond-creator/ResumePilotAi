'use strict';

/**
 * PH4-ENGINE-031 (S2, option b) — quality-tier registry expansion:
 * wave-2 curation covers the platform catalog's verifiable model ids;
 * opaque mesh aliases, specialized models and tool endpoints stay unknown
 * (fail closed — a suffix string is never evidence).
 *
 * Complements backend/test/freellmapi-quality-tier.test.js (wave-1 snapshot,
 * certified; untouched).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const freellmRoot = path.resolve(__dirname, '..', 'freellmapi');
const {
  PROVIDER_REGISTRY,
  MODEL_QUALITY_TIERS,
  getModelQualityTier,
} = require(path.join(freellmRoot, 'providers', 'registry'));
const { rankCandidates } = require(path.join(freellmRoot, 'services', 'selectionPolicy'));

const TOOL_IDS = ['search', 'tts', 'crawl'];

// The 40 opaque mesh/aggregator aliases in the catalog at curation time
// (2026-10-25). Deliberately uncurated: their backing model is unverified,
// and '-70b'/'-fast'/'-large'/'-free' suffix strings are name-inference,
// which the never-guess rule forbids. This list is a DRIFT CANARY: if the
// catalog gains a mesh provider, this test fails until an operator decides
// (curate with evidence, or add the alias here with the same rule).
const MESH_ALIASES = [
  'aclide-large', 'agnes-chat', 'ainative-chat', 'aion-large', 'apinex-chat',
  'bai-chat', 'bazaar-auto', 'beat-chat', 'blaze-fast', 'blockrun-70b',
  'clod-large', 'dp-chat', 'electronhub-default', 'exp-chat', 'freeai-70b',
  'gizmo-fast', 'inferbase-70b', 'lite', 'llm7-chat', 'llmtr-chat',
  'logfare-chat', 'longcat-chat', 'lucidity-large', 'nara-chat', 'navy-70b',
  'opencode-zen', 'orca-free', 'plugsky-chat', 'radeon-70b', 'requesty-chat',
  'router9-auto', 'routeway-70b', 'sail-70b', 'sea-lion-70b', 'septor-70b',
  'simplellm-large', 'speka-chat', 'uno-free', 'waterfall-large', 'xkiro-free',
];

// Documented exclusions: chat ids without sufficient public benchmark
// coverage of their GENERAL instruction-following class at curation time
// (codestral-latest is a code specialist; typhoon-v1.5-instruct and
// doubao-pro-32k lack verifiable LMSYS/ArtificialAnalysis coverage).
const DESIGNED_EXCLUSIONS = ['codestral-latest', 'doubao-pro-32k', 'typhoon-v1.5-instruct'];

function registryChatIds() {
  const ids = new Set();
  for (const p of Object.values(PROVIDER_REGISTRY)) {
    for (const m of [p.defaultModel, p.fastModel, ...(p.recommendedModels || [])]) {
      if (m && typeof m === 'string') ids.add(m);
    }
  }
  return [...ids].filter((m) => !TOOL_IDS.includes(m));
}

describe('PH4-ENGINE-031 — tier registry wave-2 expansion', () => {
  it('1. curates every wave-2 id with the documented tier', () => {
    const wave2 = {
      // premium — frontier flagships / 70B-class open flagships (Arena top band)
      'gemini-1.5-pro': 'premium',
      'Qwen/Qwen2.5-72B-Instruct': 'premium',
      'qwen/qwen-2.5-72b-instruct:free': 'premium',
      'deepseek-ai/DeepSeek-V3': 'premium',
      'meta-llama/Llama-3.3-70B-Instruct': 'premium',
      'Meta-Llama-3.3-70B-Instruct': 'premium',
      'mistralai/mistral-large-2-instruct': 'premium',
      'nvidia/llama-3.1-nemotron-70b-instruct': 'premium',
      // standard — documented mid-tier generals and aliases
      'command-r': 'standard',
      'mixtral-8x7b-32768': 'standard',
      'gemini-1.5-flash': 'standard',
      'google/gemini-2.0-flash-exp:free': 'standard',
      // economy — documented small/fast/lite variants and aliases
      'ernie-speed-128k': 'economy',
      'glm-4-flash': 'economy',
      'reka-edge': 'economy',
      'open-mistral-nemo': 'economy',
      'meta/llama-3.2-3b-instruct': 'economy',
      '@cf/meta/llama-3.1-8b-instruct': 'economy',
      'llama3.1-8b': 'economy',
      'moondream-2': 'economy',
    };
    for (const [id, tier] of Object.entries(wave2)) {
      assert.equal(getModelQualityTier(id), tier, `${id} should be ${tier}`);
    }
    assert.equal(Object.keys(MODEL_QUALITY_TIERS).length, 47, '27 wave-1 + 20 wave-2');
  });

  it('2. keeps one model = one class across every catalog casing/alias', () => {
    const llama33_70b = [
      'llama-3.3-70b-versatile', 'llama3.3-70b', 'meta-llama/llama-3.3-70b-instruct',
      'meta-llama/llama-3.3-70b-instruct:free', '@cf/meta/llama-3.1-70b-instruct',
      'Meta-Llama-3_3-70B-Instruct', 'Meta-Llama-3.3-70B-Instruct',
      'meta-llama/Llama-3.3-70B-Instruct',
    ];
    for (const id of llama33_70b) assert.equal(getModelQualityTier(id), 'premium', id);
    // @cf/meta/llama-3.1-70b-instruct is the 3.1 70B flagship-class open model
    for (const id of ['gemini-2.0-flash', 'google/gemini-2.0-flash-exp:free']) {
      assert.equal(getModelQualityTier(id), 'standard', id);
    }
    for (const id of ['Mistral-Nemo-Instruct-2407', 'open-mistral-nemo']) {
      assert.equal(getModelQualityTier(id), 'economy', id);
    }
    for (const id of ['llama-3.1-8b-instant', 'llama3.1-8b', '@cf/meta/llama-3.1-8b-instruct']) {
      assert.equal(getModelQualityTier(id), 'economy', id);
    }
  });

  it('3. leaves every opaque mesh alias unknown — suffix strings are not evidence', () => {
    for (const alias of new Set(MESH_ALIASES)) {
      assert.equal(getModelQualityTier(alias), null, `${alias} must stay uncurated`);
    }
    for (const id of TOOL_IDS) assert.equal(getModelQualityTier(id), null, id);
    for (const id of DESIGNED_EXCLUSIONS) assert.equal(getModelQualityTier(id), null, id);
  });

  it('4. catalog coverage is exactly the curated/uncurated split (drift canary)', () => {
    const chat = registryChatIds();
    const curated = chat.filter((m) => getModelQualityTier(m));
    const unknown = chat.filter((m) => !getModelQualityTier(m));
    assert.equal(chat.length, 80, 'registry chat-capable ids (truthy, tools excluded)');
    assert.equal(curated.length, 37, 'curated coverage (was 17 before wave 2)');
    assert.equal(unknown.length, 43, '40 mesh aliases + 3 documented exclusions');
    const allowedUnknown = new Set([...MESH_ALIASES, ...DESIGNED_EXCLUSIONS]);
    for (const id of unknown) {
      assert.ok(allowedUnknown.has(id), `${id} is unknown but not a documented exclusion`);
    }
  });

  it('5. lookup stays exact-match only — no case folding, no prefix matching', () => {
    assert.equal(getModelQualityTier('GPT-4O'), null);
    assert.equal(getModelQualityTier('gpt-4o-2024-08-06'), null);
    assert.equal(getModelQualityTier('gemini-1.5-pro-latest'), null);
    assert.equal(getModelQualityTier(''), null);
    assert.equal(getModelQualityTier(null), null);
    assert.equal(getModelQualityTier('constructor'), null, 'prototype keys must not leak');
  });

  it('6. quality mode ranks on the new entries: curated premium beats curated economy, unknown ranks below both', () => {
    // rankCandidates' default qualityTierFor reads candidate.model (the
    // resolved effective model), matching the certified wave-1 test shape.
    const candidates = [
      { id: 'meshy', label: 'Mesh', apiKey: 'k', model: 'sail-70b', defaultModel: 'sail-70b', models: ['sail-70b'], supportsJson: true },
      { id: 'eco', label: 'Eco', apiKey: 'k', model: 'llama3.1-8b', defaultModel: 'llama3.1-8b', models: ['llama3.1-8b'], supportsJson: true },
      { id: 'prem', label: 'Prem', apiKey: 'k', model: 'gemini-1.5-pro', defaultModel: 'gemini-1.5-pro', models: ['gemini-1.5-pro'], supportsJson: true },
    ];
    // primary preference on the mesh provider (primaryBonus +5) and on the
    // economy provider: curated evidence must still decide quality mode.
    const meshFirst = rankCandidates(candidates, { mode: 'quality', primary: 'meshy', now: new Date() });
    assert.deepEqual(meshFirst.map((c) => c.id), ['prem', 'eco', 'meshy']);
    const ecoFirst = rankCandidates(candidates, { mode: 'quality', primary: 'eco', now: new Date() });
    assert.deepEqual(ecoFirst.map((c) => c.id), ['prem', 'eco', 'meshy']);
    // speed mode must NOT read tiers (F-06 contract preserved under wave 2)
    const speedRanked = rankCandidates(candidates, { mode: 'speed', primary: 'meshy', now: new Date() });
    assert.equal(speedRanked[0].id, 'meshy', 'primary wins tie on equal unobserved latency in speed mode');
  });
});
