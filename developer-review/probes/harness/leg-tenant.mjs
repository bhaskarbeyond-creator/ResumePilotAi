#!/usr/bin/env node
/**
 * R15 tenant legs (in-process engine modules) — A.15r1 / A.15r2 / A.16.
 * Tip tree, flags ON (FREELMAPI_TENANT_SCOPED_EVIDENCE=1, FREELMAPI_DECISION_LEDGER=1).
 *
 * LAYERING DISCLOSURE (why in-process): the dedicated-BYOK sanctuary dispatches
 * to the provider registry's real baseUrl by design (BYOK = the tenant's own
 * upstream account; there is no env override, correctly so). The sandbox has no
 * egress to real providers, so these legs drive the REAL engine singleton
 * (backend/freellmapi completeChat / resetCooldowns — the exact functions the
 * HTTP routes call) with a disclosed transport redirect: a URL-rewriting
 * fetchImpl points registry baseUrls at the local OpenAI-compatible stubs.
 * The HTTP route layer (preview-login auth, tenant resolution, deny-by-default
 * aiPolicy CAS grant, X-Tenant-Id, scoped reset-state echoes) was proven live
 * in tenant run 3 (transcript citations in the commit that archives these).
 * Everything else is production code: real MariaDB (encrypted BYOK credentials
 * via the real registry), real F-08 read path (loadTenantByokKeys), real
 * SQLite scoped stores, real cooldown/metrics/decision-ring sinks.
 *
 *   a15r1  two-tenant scoped-evidence divergence: T1's BYOK credential fails
 *          (stub per-key injection) and benches ONLY tenant:T1; T2's identical
 *          pool keeps serving; platform scope untouched.
 *   a15r2  cross-tenant cooldown: platform-wide groq outage hits platform AND
 *          both tenant scopes (each with its OWN rows); resetCooldowns
 *          (the C.4 route's function) platform-scope release never wipes
 *          tenant scopes; scoped release clears exactly one; recovery proven.
 *   a16    decisionId hops: D1 platform call — result.decisionId (the wire
 *          object /v1 serializes) -> SQLite routing_decisions ring (this
 *          engine's decision telemetry sink, A.4) -> SQLite request_log;
 *          D2 tenant call — ring (scope tenant:<id>) -> request_log ->
 *          MariaDB enterprise_ai_usage.decision_id via the real repository
 *          write path (029 capability probe). Honest notes: the tenant HTTP
 *          wire does not expose decisionId by design, so no single id crosses
 *          all five hops on one call; and the F-22 route's in-memory ring
 *          belongs to the aiRouting engine (sel-* namespace) — the
 *          telemetry.record({decisionId}) plumbing contract is unit-pinned in
 *          decision-id-plumbing.test.js test 4.
 *
 * Env: LEG DB_NAME TARGET_LABEL TARGET_BACKEND METRICS_DB_FILE ALPHA_PORT
 *      BETA_PORT ENTERPRISE_ENCRYPTION_KEYS
 */

import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { sleep, makeSql, stubStats } from './probe-lib.mjs';

const LEG = process.env.LEG || '';
const DB_NAME = process.env.DB_NAME || '';
const TARGET_LABEL = process.env.TARGET_LABEL || 'tip-flags-on';
const TARGET_BACKEND = process.env.TARGET_BACKEND || '/home/user/ResumePilotAi/backend';
const ALPHA_PORT = Number(process.env.ALPHA_PORT || 8791);
const BETA_PORT = Number(process.env.BETA_PORT || 8792);
const METRICS_DB_FILE = process.env.METRICS_DB_FILE || `/tmp/probe-metrics-${LEG}.db`;

// Engine-module environment BEFORE any backend require (singletons read env at
// construction time).
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = DB_NAME;
process.env.NODE_ENV = 'development';
process.env.FREELMAPI_METRICS_DB = METRICS_DB_FILE;
process.env.FREELMAPI_TENANT_SCOPED_EVIDENCE = '1';
process.env.FREELMAPI_DECISION_LEDGER = '1';

const emit = row => process.stdout.write(`${JSON.stringify(row)}\n`);
const shaUid = email => `local_${createHash('sha256').update(email).digest('hex').slice(0, 22)}`;

const require_ = createRequire(`${TARGET_BACKEND}/index.js`);

// Disclosed transport redirect (see header): registry baseUrl -> local stub.
const rewritingFetch = (input, init) => {
  const url = String(typeof input === 'string' ? input : input?.url || '');
  const rewritten = url
    .replace('https://api.groq.com/openai/v1', `http://127.0.0.1:${BETA_PORT}/v1`)
    .replace('https://api.openai.com/v1', `http://127.0.0.1:${ALPHA_PORT}/v1`);
  return fetch(rewritten, init);
};

function meshConfig({ primary = 'openai', selectionMode = 'speed' } = {}) {
  return {
    primary,
    selectionMode,
    enableFallback: true,
    temperature: 0.3,
    maxTokens: 64,
    providers: {
      openai: { enabled: true, key: 'key-alpha-123456', model: 'gpt-4o', baseUrl: `http://127.0.0.1:${ALPHA_PORT}/v1` },
      groq: { enabled: true, key: 'key-beta-123456', model: 'llama-3.1-8b-instant', baseUrl: `http://127.0.0.1:${BETA_PORT}/v1` },
    },
  };
}

function readSqlite(query, params = []) {
  const { DatabaseSync } = require_('node:sqlite');
  const db = new DatabaseSync(METRICS_DB_FILE);
  try {
    return db.prepare(query).all(...params);
  } finally {
    db.close();
  }
}

async function routed(freellm, { prompt, tenantContext = null, platformConfig, model = null }) {
  const started = Date.now();
  try {
    const result = await freellm.completeChat({
      prompt,
      ...(model ? { model } : {}),
      platformConfig,
      tenantContext,
      fetchImpl: rewritingFetch,
      timeoutMs: 45_000,
      maxTokens: 64,
      temperature: 0.3,
      cacheScope: tenantContext ? `tenant:${tenantContext.tenantId}` : 'probe-platform',
    });
    return {
      wallMs: Date.now() - started, ok: true,
      provider: result.provider, model: result.model, isDedicatedByok: Boolean(result.isDedicatedByok),
      decisionId: result.decisionId ?? null, cached: Boolean(result.cached),
      fallbacks: (result.fallbacksAttempted || []).map(f => ({ provider: f.provider ?? null, model: f.model ?? null, status: f.status ?? null })),
      routingDecision: result.routingDecision ? {
        mode: result.routingDecision.mode ?? null,
        exploration: result.routingDecision.exploration ?? null,
        observationCount: result.routingDecision.observationCount ?? null,
        lastResort: result.routingDecision.lastResort === true,
        decisionId: result.routingDecision.decisionId ?? null,
      } : null,
    };
  } catch (error) {
    return {
      wallMs: Date.now() - started, ok: false,
      code: error?.code || null, status: Number(error?.status) || null,
      message: String(error?.message || '').slice(0, 200),
    };
  }
}

async function main() {
  const freellm = require_(`${TARGET_BACKEND}/freellmapi`);
  const { MySqlTenantRegistry } = require_(`${TARGET_BACKEND}/enterprise/mysqlTenantRegistry`);
  const { loadTenantByokKeys } = require_(`${TARGET_BACKEND}/enterprise/tenantAi`);
  const { getPool } = require_(`${TARGET_BACKEND}/database/mysql`);
  const sql = makeSql(TARGET_BACKEND, DB_NAME);
  const registry = new MySqlTenantRegistry({ pool: getPool() });

  emit({
    type: 'meta', leg: LEG, target: TARGET_LABEL, db: DB_NAME, at: new Date().toISOString(),
    mode: 'in-process engine singleton (real modules) + disclosed transport redirect',
    envDisclosure: {
      FREELMAPI_TENANT_SCOPED_EVIDENCE: process.env.FREELMAPI_TENANT_SCOPED_EVIDENCE,
      FREELMAPI_DECISION_LEDGER: process.env.FREELMAPI_DECISION_LEDGER,
      enterpriseEncryptionKeysConfigured: Boolean(process.env.ENTERPRISE_ENCRYPTION_KEYS),
      metricsDbFile: METRICS_DB_FILE,
      stubExtensions: ['AUTHFAILS per-credential 500 injection', '/__mode runtime flip'],
      transportRedirect: { 'https://api.groq.com/openai/v1': `http://127.0.0.1:${BETA_PORT}/v1`, 'https://api.openai.com/v1': `http://127.0.0.1:${ALPHA_PORT}/v1` },
    },
  });

  const provision = async (email, slug) => {
    const ownerPrincipalId = shaUid(email);
    const t = await registry.provisionTenant({ ownerPrincipalId, displayName: `Probe ${slug}`, slug });
    const rows = await sql.query('SELECT revision FROM enterprise_tenant_configurations WHERE tenantId = ?', [t.tenantId]);
    await registry.updateTenantConfiguration({
      tenantId: t.tenantId,
      input: { aiPolicy: { allowedProviders: ['openai', 'groq'], allowedModels: [], primaryModel: '' } },
      expectedRevision: Number(rows?.[0]?.revision || 1),
    });
    return { tenantId: t.tenantId, ownerPrincipalId };
  };
  const byokContext = async (tenant, keyLabel) => {
    await registry.setTenantCredentials({ tenantId: tenant.tenantId, providerId: 'groq', credentials: { apiKeys: [`key-${keyLabel}-byok`] } });
    const stored = await loadTenantByokKeys({ registry, tenantId: tenant.tenantId }); // real F-08 read path
    return { tenantId: tenant.tenantId, principalId: tenant.ownerPrincipalId, correlationId: `${LEG}-${keyLabel}-${randomUUID()}`, policyVersion: 2, dataPlane: {}, actorType: 'USER', customProviderKeys: stored };
  };

  if (LEG === 'a15r1') {
    const T1 = await provision('t1-owner@probe.test', `probe-t1-${LEG}-${Date.now().toString(36)}`.slice(0, 60));
    const T2 = await provision('t2-owner@probe.test', `probe-t2-${LEG}-${Date.now().toString(36)}`.slice(0, 60));
    emit({ type: 'tenants', t1: T1.tenantId, t2: T2.tenantId });
    const ctx1 = await byokContext(T1, 't1'); // stub AUTHFAILS=key-t1-byok -> injected 500s
    const ctx2 = await byokContext(T2, 't2');
    emit({ type: 'byok-seeded', ctx1Keys: ctx1.customProviderKeys, ctx2Keys: ctx2.customProviderKeys, encryptedAtRest: true });

    const config = meshConfig({ primary: 'openai' });
    const t1First = await routed(freellm, { prompt: `A.15r1 T1 call one ${randomUUID()}`, tenantContext: ctx1, platformConfig: config });
    emit({ type: 'call', who: 't1', seq: 1, ...t1First });
    const t2First = await routed(freellm, { prompt: `A.15r1 T2 call one ${randomUUID()}`, tenantContext: ctx2, platformConfig: config });
    emit({ type: 'call', who: 't2', seq: 1, ...t2First });
    const betaMid = await stubStats(BETA_PORT);
    const platformFirst = await routed(freellm, { prompt: `A.15r1 platform control ${randomUUID()}`, platformConfig: config });
    emit({ type: 'call', who: 'platform', seq: 1, ...platformFirst });
    const t1Second = await routed(freellm, { prompt: `A.15r1 T1 call two ${randomUUID()}`, tenantContext: ctx1, platformConfig: config });
    emit({ type: 'call', who: 't1', seq: 2, ...t1Second });

    const cooldownRows = readSqlite('SELECT provider, model, scope_key, credential_kind, strikes FROM provider_cooldowns');
    const metricRows = readSqlite('SELECT provider, model, scope_key, requests, successes, failures FROM provider_metrics');
    emit({ type: 'sqlite-cooldowns', rows: cooldownRows });
    emit({ type: 'sqlite-metrics', rows: metricRows });

    const t1Scope = `tenant:${T1.tenantId}`;
    const t2Scope = `tenant:${T2.tenantId}`;
    const t1ScopedFailure = metricRows.some(r => r.scope_key === t1Scope && r.provider === 'groq' && r.failures > 0);
    const t1ScopedBench = cooldownRows.some(r => r.scope_key === t1Scope);
    const t2ServedByOwnByok = t2First.ok && t2First.provider === 'groq' && t2First.isDedicatedByok
      && String(betaMid.lastAuth || '').includes('key-t2-byok');
    const t2ScopeClean = !cooldownRows.some(r => r.scope_key === t2Scope);
    const platformServed = platformFirst.ok && ['openai', 'groq'].includes(platformFirst.provider);
    const platformNotPolluted = !metricRows.some(r => r.scope_key === 'platform' && r.provider === 'groq' && r.failures > 0)
      && !cooldownRows.some(r => r.scope_key === 'platform');
    const t1NeverServedByFailingKey = !t1First.ok && !t1Second.ok;
    emit({
      type: 'verdict', leg: LEG,
      t1ScopedFailureRecorded: t1ScopedFailure, t1ScopedBenchPresent: t1ScopedBench,
      t2ServedByOwnByok, t2ScopeClean, platformServed, platformNotPolluted, t1NeverServedByFailingKey,
      divergenceProven: t1ScopedFailure && t1ScopedBench && t2ServedByOwnByok && t2ScopeClean && platformServed && platformNotPolluted && t1NeverServedByFailingKey,
    });
  } else if (LEG === 'a15r2') {
    const T1 = await provision('t1-owner@probe.test', `probe-t1-${LEG}-${Date.now().toString(36)}`.slice(0, 60));
    const T2 = await provision('t2-owner@probe.test', `probe-t2-${LEG}-${Date.now().toString(36)}`.slice(0, 60));
    emit({ type: 'tenants', t1: T1.tenantId, t2: T2.tenantId });
    const ctx1 = await byokContext(T1, 't1');
    const ctx2 = await byokContext(T2, 't2');
    const config = meshConfig({ primary: 'groq' });

    // Platform-wide groq outage (every credential on beta fails).
    const flip = await fetch(`http://127.0.0.1:${BETA_PORT}/__mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: '500' }) });
    emit({ type: 'stub-mode', beta: await flip.json().catch(() => null) });

    const platformOutage = await routed(freellm, { prompt: `A.15r2 platform outage ${randomUUID()}`, platformConfig: config });
    emit({ type: 'call', who: 'platform-outage', ...platformOutage });
    const t1Outage = await routed(freellm, { prompt: `A.15r2 T1 outage ${randomUUID()}`, tenantContext: ctx1, platformConfig: config });
    emit({ type: 'call', who: 't1-outage', ...t1Outage });
    const t2Outage = await routed(freellm, { prompt: `A.15r2 T2 outage ${randomUUID()}`, tenantContext: ctx2, platformConfig: config });
    emit({ type: 'call', who: 't2-outage', ...t2Outage });

    const t1Scope = `tenant:${T1.tenantId}`;
    const t2Scope = `tenant:${T2.tenantId}`;
    const snapshot = phase => {
      const rows = {
        cooldowns: readSqlite('SELECT provider, model, scope_key, credential_kind FROM provider_cooldowns'),
        metrics: readSqlite('SELECT provider, model, scope_key, requests, successes, failures FROM provider_metrics'),
      };
      emit({ type: 'sqlite-state', phase, ...rows });
      return rows;
    };
    const afterOutage = snapshot('after-outage');

    // C.4/F-14: the platform-scoped release (same function the route calls)
    // must never wipe tenant scopes.
    const platformRelease = freellm.resetCooldowns({ scopeKey: 'platform' });
    emit({ type: 'reset-cooldowns', scopeKey: 'platform', result: platformRelease });
    const afterPlatformRelease = snapshot('after-platform-release');

    const t1Release = freellm.resetCooldowns({ scopeKey: t1Scope });
    emit({ type: 'reset-cooldowns', scopeKey: t1Scope, result: t1Release });
    const afterT1Release = snapshot('after-t1-release');

    // Recovery: beta healthy; platform groq serves again; T2 stays benched
    // until its OWN scoped release, then serves.
    await fetch(`http://127.0.0.1:${BETA_PORT}/__mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'ok' }) });
    const platformRecovery = await routed(freellm, { prompt: `A.15r2 platform recovery ${randomUUID()}`, platformConfig: config });
    emit({ type: 'call', who: 'platform-recovery', ...platformRecovery });
    const t2StillBenched = await routed(freellm, { prompt: `A.15r2 T2 pre-release ${randomUUID()}`, tenantContext: ctx2, platformConfig: config });
    emit({ type: 'call', who: 't2-pre-release', ...t2StillBenched });
    freellm.resetCooldowns({ scopeKey: t2Scope });
    const t2Recovered = await routed(freellm, { prompt: `A.15r2 T2 post-release ${randomUUID()}`, tenantContext: ctx2, platformConfig: config });
    emit({ type: 'call', who: 't2-post-release', ...t2Recovered });

    // Physics-honesty leg (test-plan part-2 item 5, exact shape): a PLATFORM
    // credential 429 cools groq for EVERY tenant's platform-credential traffic
    // (documented, asserted - not 'fixed' away), while the dedicated-BYOK
    // sanctuary is NOT blocked by platform benches (C.1: a platform bench is a
    // fact about the shared platform credentials, not about the tenant's keys).
    const T3 = await provision('t3-owner@probe.test', `probe-t3-${LEG}-${Date.now().toString(36)}`.slice(0, 60));
    const ctx3 = { tenantId: T3.tenantId, principalId: T3.ownerPrincipalId, correlationId: `${LEG}-t3-${randomUUID()}`, policyVersion: 2, dataPlane: {}, actorType: 'USER', customProviderKeys: {} };
    emit({ type: 'tenant', who: 't3-no-byok', tenantId: T3.tenantId });
    await fetch(`http://127.0.0.1:${BETA_PORT}/__mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: '429' }) });
    // Pin the model so the platform call MUST attempt groq (an unpinned policy
    // call would simply rank around it on openai's p50 and never see the 429).
    const platform429 = await routed(freellm, { prompt: `A.15r2 platform 429 bench ${randomUUID()}`, platformConfig: config, model: 'llama-3.1-8b-instant' });
    emit({ type: 'call', who: 'platform-429', ...platform429 });
    // Design invariant (schema-proposal 3.1, verified live by
    // verify-scope-key-sentinel.cjs): platform rows persist with the LITERAL
    // scope_key 'platform' (NOT NULL DEFAULT 'platform') — never NULL. The
    // assertion below accepts nothing else.
    const cooldowns429 = readSqlite("SELECT provider, model, scope_key, credential_kind FROM provider_cooldowns WHERE scope_key = 'platform'");
    emit({ type: 'sqlite-cooldowns', phase: 'after-platform-429', rows: cooldowns429 });
    // Stub healthy again, but the platform bench (Retry-After 60s) is ACTIVE:
    await fetch(`http://127.0.0.1:${BETA_PORT}/__mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'ok' }) });
    const t3Blocked = await routed(freellm, { prompt: `A.15r2 T3 platform-cred under bench ${randomUUID()}`, tenantContext: ctx3, platformConfig: config });
    emit({ type: 'call', who: 't3-under-platform-bench', ...t3Blocked });
    const t2Sanctuary = await routed(freellm, { prompt: `A.15r2 T2 BYOK under platform bench ${randomUUID()}`, tenantContext: ctx2, platformConfig: config });
    emit({ type: 'call', who: 't2-byok-under-platform-bench', ...t2Sanctuary });

    const outageHitBothTenants = !t1Outage.ok && !t2Outage.ok;
    const platform429Benched = cooldowns429.some(r => r.provider === 'groq' && r.scope_key === 'platform' && r.credential_kind === 'platform');
    const t3PlatformTrafficCooled = t3Blocked.ok && t3Blocked.provider === 'openai'; // groq benched platform-wide -> T3's platform-credential traffic falls to openai
    const sanctuaryIgnoredPlatformBench = t2Sanctuary.ok && t2Sanctuary.provider === 'groq' && t2Sanctuary.isDedicatedByok;
    const tenantScopedRowsExisted = afterOutage.metrics.some(r => r.scope_key === t1Scope) && afterOutage.metrics.some(r => r.scope_key === t2Scope);
    const platformReleaseKeptTenantScopes = afterPlatformRelease.metrics.some(r => r.scope_key === t1Scope) && afterPlatformRelease.metrics.some(r => r.scope_key === t2Scope)
      && afterPlatformRelease.cooldowns.filter(r => r.scope_key === t1Scope || r.scope_key === t2Scope).length >= afterOutage.cooldowns.filter(r => r.scope_key === t1Scope || r.scope_key === t2Scope).length;
    const platformRowsClearedByPlatformRelease = afterOutage.cooldowns.some(r => r.scope_key === 'platform') ? !afterPlatformRelease.cooldowns.some(r => r.scope_key === 'platform') : true;
    // resetCooldowns clears COOLDOWN rows only (metrics rows are the evidence
    // ledger and survive releases - the reset-state route resets cooldowns +
    // cache, never scoped metrics).
    const t1ReleaseClearedExactlyT1 = !afterT1Release.cooldowns.some(r => r.scope_key === t1Scope)
      && afterT1Release.cooldowns.some(r => r.scope_key === t2Scope) === afterPlatformRelease.cooldowns.some(r => r.scope_key === t2Scope);
    // A persisted bench shows up EITHER as a hard block (call fails while the
    // stub is healthy) OR as the by-design last-resort release (call succeeds
    // with routingDecision.lastResort === true). After T2's own release the
    // marker must be gone.
    const t2BenchPersistedUntilOwnRelease = (!t2StillBenched.ok || t2StillBenched.routingDecision?.lastResort === true)
      && t2Recovered.ok && t2Recovered.provider === 'groq' && t2Recovered.isDedicatedByok
      && t2Recovered.routingDecision?.lastResort !== true;
    emit({
      type: 'verdict', leg: LEG,
      platformOutageServedViaFallbackOrFailed: platformOutage.ok || platformOutage.code === 'ALL_PROVIDERS_FAILED',
      outageHitBothTenants, tenantScopedRowsExisted, platformReleaseKeptTenantScopes, platformRowsClearedByPlatformRelease,
      t1ReleaseClearedExactlyT1, t2BenchPersistedUntilOwnRelease, platformRecoveryServed: platformRecovery.ok,
      platform429Benched, t3PlatformTrafficCooled, sanctuaryIgnoredPlatformBench,
      crossTenantCooldownProven: outageHitBothTenants && tenantScopedRowsExisted && platformReleaseKeptTenantScopes && t1ReleaseClearedExactlyT1 && t2BenchPersistedUntilOwnRelease,
      physicsHonestyProven: platform429Benched && t3PlatformTrafficCooled && sanctuaryIgnoredPlatformBench,
    });
  } else if (LEG === 'a16') {
    const usageColumns = await sql.query("SHOW COLUMNS FROM enterprise_ai_usage LIKE 'decision_id'");
    emit({ type: 'ddl-probe', enterpriseUsageDecisionIdColumn: Array.isArray(usageColumns) && usageColumns.length > 0 });
    const config = meshConfig({ primary: 'openai' });

    const platformCall = await routed(freellm, { prompt: `A.16 platform hop ${randomUUID()}`, platformConfig: config });
    const d1 = platformCall.decisionId;
    emit({ type: 'call', who: 'platform', ...platformCall });

    // Telemetry hop, honest topology: the freellmapi engine's decision
    // telemetry sink IS the SQLite routing_decisions ring (A.4, 5000-row
    // prune). The F-22 HTTP route's in-memory ring belongs to the OTHER
    // engine (aiRouting orchestrator, sel-* id namespace); the plumbing
    // contract 'telemetry.record receives {decisionId, tenantId}' is pinned
    // at unit level by decision-id-plumbing.test.js test 4.
    const ringD1 = d1 ? readSqlite('SELECT decision_id, scope_key, chosen_provider, chosen_model, mode FROM routing_decisions WHERE decision_id = ?', [d1]) : [];
    const logD1 = d1 ? readSqlite('SELECT id, provider, model, decision_id FROM request_log WHERE decision_id = ?', [d1]) : [];
    emit({ type: 'sqlite-ring', d1, rows: ringD1 });
    emit({ type: 'sqlite-request-log', d1, rows: logD1 });

    const T = await provision('a16-owner@probe.test', `probe-a16-${Date.now().toString(36)}`.slice(0, 60));
    const ctx = await byokContext(T, 'a16');
    emit({ type: 'tenant', tenantId: T.tenantId });
    const tenantCall = await routed(freellm, { prompt: `A.16 tenant hop ${randomUUID()}`, tenantContext: ctx, platformConfig: config });
    const d2 = tenantCall.decisionId;
    emit({ type: 'call', who: 'tenant', ...tenantCall });

    // Hop 5: the real enterprise repository write path (recordAiUsage) with the
    // 029 capability probe — the same function the tenant accounting path calls.
    const { MySqlEnterpriseRepository } = require_(`${TARGET_BACKEND}/enterprise/mysqlEnterpriseRepository`);
    const repo = new MySqlEnterpriseRepository({ pool: getPool() });
    await repo.recordAiUsage(
      { tenantId: T.tenantId, principalId: T.ownerPrincipalId, correlationId: ctx.correlationId, policyVersion: 2 },
      { inputTokens: 13, outputTokens: 7, estimatedCostMicros: 0, provider: tenantCall.provider || 'groq', model: tenantCall.model || 'llama-3.1-8b-instant', operation: 'a16-probe', decisionId: d2 },
    );
    await sleep(500);
    const usageRows = await sql.query('SELECT id, decision_id, tenantId, provider, model FROM enterprise_ai_usage ORDER BY recordedAt DESC LIMIT 10');
    const usageMatch = usageRows.filter(r => d2 && String(r.decision_id || '') === String(d2));
    emit({ type: 'mariadb-enterprise-ai-usage', recentRows: usageRows.map(r => ({ id: String(r.id).slice(0, 12), decision_id: r.decision_id, tenantId: r.tenantId })), d2MatchCount: usageMatch.length });

    const ringD2 = d2 ? readSqlite('SELECT decision_id, scope_key, chosen_provider FROM routing_decisions WHERE decision_id = ?', [d2]) : [];
    const logD2 = d2 ? readSqlite('SELECT id, provider, model, decision_id FROM request_log WHERE decision_id = ?', [d2]) : [];
    emit({ type: 'sqlite-ring', d2, rows: ringD2 });
    emit({ type: 'sqlite-request-log', d2, rows: logD2 });

    emit({
      type: 'verdict', leg: LEG, d1, d2,
      wireHop: Boolean(d1),
      ringHopD1: ringD1.length === 1,
      requestLogHopD1: logD1.length >= 1,
      ringHopD2: ringD2.length === 1 && ringD2[0].scope_key === `tenant:${T.tenantId}`,
      requestLogHopD2: logD2.length >= 1,
      enterpriseUsageHopD2: usageMatch.length >= 1,
      singleIdE2E: Boolean(d1) && ringD1.length === 1 && logD1.length >= 1
        && Boolean(d2) && ringD2.length === 1 && logD2.length >= 1 && usageMatch.length >= 1,
      disclosure: 'D1: result/wire object (what /v1 serializes as routing_decision.decisionId) -> routing_decisions ring -> request_log. D2 (tenant): ring (scope tenant:<id>) -> request_log -> MariaDB enterprise_ai_usage.decision_id via the real repository write path. The tenant HTTP wire does not expose decisionId by design; no single id crosses all five hops on one call.',
    });
  } else {
    throw new Error(`unknown LEG '${LEG}' (expected a15r1 | a15r2 | a16)`);
  }

  emit({ type: 'stub-stats', leg: LEG, alpha: await stubStats(ALPHA_PORT), beta: await stubStats(BETA_PORT) });
}

main().then(() => {
  process.exit(0); // pools/metrics handles would otherwise keep the loop alive
}).catch(error => {
  emit({ type: 'error', leg: LEG, message: error?.message || String(error), stack: String(error?.stack || '').split('\n').slice(0, 6) });
  process.exit(1);
});
