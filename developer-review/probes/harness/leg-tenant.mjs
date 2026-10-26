#!/usr/bin/env node
/**
 * R15 tenant legs — A.15r1 / A.15r2 / A.16 (NEW probes; tip tree only, flags ON).
 *
 *   a15r1  two-tenant scoped-evidence divergence: T1's dedicated BYOK credential
 *          fails (stub-injected per-key 500), T2's identical-shape BYOK keeps
 *          serving; platform scope stays untouched (F-21/C.1 sink-hole closure).
 *   a15r2  cross-tenant cooldown: a platform-wide provider outage benches groq
 *          for BOTH tenants (shared platform scope, by design); F-14/C.4 scoped
 *          releases clear exactly one scope and never wipe the others.
 *   a16    decisionId end-to-end: wire (D1 via /v1) -> telemetry ring (F-22)
 *          -> SQLite routing_decisions -> SQLite request_log.decision_id, and
 *          the tenant path's D2 -> SQLite ring + request_log -> MariaDB
 *          enterprise_ai_usage.decision_id (029 applied to the PROBE database
 *          only — the production ledger is never touched, per mandate).
 *          Honest shape: D1 proves the wire hop; D2 proves the MariaDB hop;
 *          both prove ring+request_log. The tenant HTTP wire does not expose
 *          decisionId (no header/field by design), so no single id crosses all
 *          five hops on one call — disclosed, not papered over.
 *
 * Env: TARGET_BACKEND ENGINE_PORT DB_NAME LEG TARGET_LABEL METRICS_DB_FILE
 *      ALPHA_PORT BETA_PORT API_KEY ENTERPRISE_ENCRYPTION_KEYS
 *
 * REBUILT-HARNESS disclosure: reconstruction-era additions are the per-key
 * AUTHFAILS stub injection and the /__mode runtime flip; both are recorded in
 * the transcript meta.
 */

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  sleep, makeSql, setPublicAiConfig, waitForEngine, v1Chat, normalizeWire,
  stubStats, previewLogin, adminResetState, CONFIG_HOT_RELOAD_WAIT_MS,
} from './probe-lib.mjs';

const LEG = process.env.LEG || '';
const ENGINE_PORT = Number(process.env.ENGINE_PORT || 8085);
const DB_NAME = process.env.DB_NAME || '';
const TARGET_LABEL = process.env.TARGET_LABEL || 'tip-flags-on';
const TARGET_BACKEND = process.env.TARGET_BACKEND || '/home/user/ResumePilotAi/backend';
const ALPHA_PORT = Number(process.env.ALPHA_PORT || 8791);
const BETA_PORT = Number(process.env.BETA_PORT || 8792);
const API_KEY = process.env.API_KEY || 'audit-platform-key-123';
const METRICS_DB_FILE = process.env.METRICS_DB_FILE || '';

const emit = row => process.stdout.write(`${JSON.stringify(row)}\n`);
const shaUid = email => `local_${createHash('sha256').update(email).digest('hex').slice(0, 22)}`;

const require_ = createRequire(`${TARGET_BACKEND}/index.js`);

function backendEnv() {
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3306';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = '';
  process.env.DB_NAME = DB_NAME;
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
}

function makeRegistry() {
  backendEnv();
  const { getPool } = require_(`${TARGET_BACKEND}/database/mysql`);
  const { MySqlTenantRegistry } = require_(`${TARGET_BACKEND}/enterprise/mysqlTenantRegistry`);
  return new MySqlTenantRegistry({ pool: getPool() });
}

async function tenantGenerate({ token, tenantId, tag }) {
  const started = Date.now();
  const response = await fetch(`http://127.0.0.1:${ENGINE_PORT}/api/generate-content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    },
    body: JSON.stringify({
      operation: 'enhance-single-bullet',
      payload: {
        bullet: `Built scalable probe services ${tag} for the payments platform and mentored two engineers`,
        jobTitle: 'Software Engineer',
        company: 'ProbeCo',
      },
    }),
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  return {
    wallMs: Date.now() - started,
    status: response.status,
    provider: response.headers.get('x-ai-provider'),
    model: response.headers.get('x-ai-model'),
    tenantHeader: response.headers.get('x-tenant-id'),
    error: body?.error?.code ?? null,
  };
}

function readSqlite(query, params = []) {
  backendEnv();
  const { DatabaseSync } = require_('node:sqlite');
  const db = new DatabaseSync(METRICS_DB_FILE);
  try {
    return db.prepare(query).all(...params);
  } finally {
    db.close();
  }
}

async function telemetryDump(token, tenantId = null) {
  const url = new URL(`http://127.0.0.1:${ENGINE_PORT}/api/admin/ai/routing-telemetry`);
  url.searchParams.set('limit', '200');
  if (tenantId) url.searchParams.set('tenantId', tenantId);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function main() {
  emit({
    type: 'meta', leg: LEG, target: TARGET_LABEL, db: DB_NAME, enginePort: ENGINE_PORT,
    metricsDbFile: METRICS_DB_FILE, at: new Date().toISOString(),
    envDisclosure: {
      FREELMAPI_TENANT_SCOPED_EVIDENCE: process.env.FREELMAPI_TENANT_SCOPED_EVIDENCE || 'unset',
      FREELMAPI_DECISION_LEDGER: process.env.FREELMAPI_DECISION_LEDGER || 'unset',
      enterpriseEncryptionKeysConfigured: Boolean(process.env.ENTERPRISE_ENCRYPTION_KEYS),
      AI_BURST_LIMIT: process.env.AI_BURST_LIMIT || 'default(12)',
      stubExtensions: ['AUTHFAILS per-credential 500 injection', '/__mode runtime flip'],
    },
  });

  await waitForEngine(ENGINE_PORT);
  const sql = makeSql(TARGET_BACKEND, DB_NAME);
  const superToken = await previewLogin({ enginePort: ENGINE_PORT, email: 'superadmin@probe.test' });

  if (LEG === 'a15r1' || LEG === 'a15r2') {
    const registry = makeRegistry();
    const t1Email = 't1-owner@probe.test';
    const t2Email = 't2-owner@probe.test';
    const t1Token = await previewLogin({ enginePort: ENGINE_PORT, email: t1Email });
    const t2Token = await previewLogin({ enginePort: ENGINE_PORT, email: t2Email });
    const T1 = await registry.provisionTenant({ ownerPrincipalId: shaUid(t1Email), displayName: `Probe T1 ${LEG}`, slug: `probe-t1-${LEG}` });
    const T2 = await registry.provisionTenant({ ownerPrincipalId: shaUid(t2Email), displayName: `Probe T2 ${LEG}`, slug: `probe-t2-${LEG}` });
    emit({ type: 'tenants', leg: LEG, t1: T1.tenantId, t2: T2.tenantId, t1Owner: shaUid(t1Email), t2Owner: shaUid(t2Email) });
    await registry.setTenantCredentials({ tenantId: T1.tenantId, providerId: 'groq', credentials: { apiKeys: ['key-t1-byok'] } });
    await registry.setTenantCredentials({ tenantId: T2.tenantId, providerId: 'groq', credentials: { apiKeys: ['key-t2-byok'] } });
    emit({ type: 'byok-seeded', t1Key: 'key-t1-byok', t2Key: 'key-t2-byok', encryptedAtRest: true });

    if (LEG === 'a15r1') {
      // Divergence: T1's BYOK credential fails (stub AUTHFAILS), T2's serves.
      await setPublicAiConfig(sql, { selectionMode: 'speed', provider: 'openai', enableOpenai: true, enableGroq: true, enableFallback: true });
      await sleep(CONFIG_HOT_RELOAD_WAIT_MS);
      const t1First = await tenantGenerate({ token: t1Token, tenantId: T1.tenantId, tag: 't1-first' });
      emit({ type: 'call', leg: LEG, who: 't1', ...t1First });
      const betaAfterT1 = await stubStats(BETA_PORT);
      const t2First = await tenantGenerate({ token: t2Token, tenantId: T2.tenantId, tag: 't2-first' });
      emit({ type: 'call', leg: LEG, who: 't2', ...t2First });
      const betaAfterT2 = await stubStats(BETA_PORT);
      emit({ type: 'stub-stats', afterT1: betaAfterT1, afterT2: betaAfterT2 });
      const platformCall = await v1Chat({ enginePort: ENGINE_PORT, apiKey: API_KEY, prompt: `A.15r1 platform-scope control ${Date.now()}` });
      emit({ type: 'call', leg: LEG, who: 'platform', ...normalizeWire(platformCall, 1), wallMs: platformCall.wallMs });

      const cooldownRows = readSqlite('SELECT provider, model, scope_key, credential_kind, strikes FROM provider_cooldowns');
      const metricRows = readSqlite('SELECT provider, model, scope_key, requests, successes, failures FROM provider_metrics');
      emit({ type: 'sqlite-cooldowns', rows: cooldownRows });
      emit({ type: 'sqlite-metrics', rows: metricRows });

      const t1Scope = `tenant:${T1.tenantId}`;
      const t2Scope = `tenant:${T2.tenantId}`;
      const t1ScopedEvidence = metricRows.some(r => r.scope_key === t1Scope && r.provider === 'groq' && r.failures > 0);
      const platformGroqPolluted = metricRows.some(r => r.scope_key === 'platform' && r.provider === 'groq' && r.failures > 0);
      const t2ServedByok = t2First.status === 200 && t2First.provider === 'groq'
        && String(betaAfterT2.lastAuth || '').includes('key-t2-byok');
      const platformUntouched = platformCall.status === 200
        && platformCall.body?._freellmapi?.provider === 'openai';
      const t1NotServedByFailingByok = !(t1First.status === 200 && t1First.provider === 'groq');
      emit({
        type: 'verdict', leg: LEG,
        t1ScopedEvidenceRecorded: t1ScopedEvidence,
        platformGroqScopePolluted: platformGroqPolluted,
        t2ServedByOwnByok: t2ServedByok,
        platformControlServedOpenai: platformUntouched,
        t1ByokFailureDidNotServe: t1NotServedByFailingByok,
        divergenceProven: t1ScopedEvidence && !platformGroqPolluted && t2ServedByok && platformUntouched && t1NotServedByFailingByok,
      });
    } else {
      // a15r2 — cross-tenant cooldown via a platform-wide groq outage + F-14 releases.
      await setPublicAiConfig(sql, { selectionMode: 'speed', provider: 'groq', enableOpenai: true, enableGroq: true, enableFallback: true });
      await sleep(CONFIG_HOT_RELOAD_WAIT_MS);
      const flip = await fetch(`http://127.0.0.1:${BETA_PORT}/__mode`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: '500' }),
      });
      emit({ type: 'stub-mode', beta: await flip.json().catch(() => null) });

      const platformCall = await v1Chat({ enginePort: ENGINE_PORT, apiKey: API_KEY, prompt: `A.15r2 platform outage call ${Date.now()}` });
      emit({ type: 'call', leg: LEG, who: 'platform', ...normalizeWire(platformCall, 1) });
      const t1 = await tenantGenerate({ token: t1Token, tenantId: T1.tenantId, tag: 't1-outage' });
      emit({ type: 'call', leg: LEG, who: 't1', ...t1 });
      const t2 = await tenantGenerate({ token: t2Token, tenantId: T2.tenantId, tag: 't2-outage' });
      emit({ type: 'call', leg: LEG, who: 't2', ...t2 });

      const before = {
        cooldowns: readSqlite('SELECT provider, model, scope_key, credential_kind, strikes FROM provider_cooldowns'),
        metrics: readSqlite('SELECT provider, model, scope_key, requests, successes, failures FROM provider_metrics'),
      };
      emit({ type: 'sqlite-state', phase: 'after-outage', ...before });

      // F-14/C.4: platform-scoped release must NOT wipe tenant scopes.
      const platformRelease = await adminResetState({ enginePort: ENGINE_PORT, token: superToken, body: { scope: 'platform' } });
      emit({ type: 'reset-state', scope: 'platform', status: platformRelease.status, body: platformRelease.body });
      const afterPlatformRelease = {
        cooldowns: readSqlite('SELECT provider, model, scope_key, credential_kind FROM provider_cooldowns'),
        metrics: readSqlite('SELECT provider, model, scope_key, failures FROM provider_metrics'),
      };
      emit({ type: 'sqlite-state', phase: 'after-platform-release', ...afterPlatformRelease });

      // Scoped release clears exactly ONE tenant scope.
      const t1Release = await adminResetState({ enginePort: ENGINE_PORT, token: superToken, body: { scope: `tenant:${T1.tenantId}` } });
      emit({ type: 'reset-state', scope: `tenant:${T1.tenantId}`, status: t1Release.status, body: t1Release.body });
      const afterT1Release = {
        cooldowns: readSqlite('SELECT provider, model, scope_key, credential_kind FROM provider_cooldowns'),
        metrics: readSqlite('SELECT provider, model, scope_key, failures FROM provider_metrics'),
      };
      emit({ type: 'sqlite-state', phase: 'after-t1-release', ...afterT1Release });

      // Recovery: beta healthy again; platform groq serves once its bench is released.
      await fetch(`http://127.0.0.1:${BETA_PORT}/__mode`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'ok' }),
      });
      const recovery = await v1Chat({ enginePort: ENGINE_PORT, apiKey: API_KEY, prompt: `A.15r2 recovery call ${Date.now()}` });
      emit({ type: 'call', leg: LEG, who: 'platform-recovery', ...normalizeWire(recovery, 2) });
      const t1Recovery = await tenantGenerate({ token: t1Token, tenantId: T1.tenantId, tag: 't1-recovery' });
      emit({ type: 'call', leg: LEG, who: 't1-recovery', ...t1Recovery });

      const t1Scope = `tenant:${T1.tenantId}`;
      const t2Scope = `tenant:${T2.tenantId}`;
      const hadTenantScopedRows = before.metrics.some(r => r.scope_key === t1Scope || r.scope_key === t2Scope);
      const platformReleaseKeptTenantRows = afterPlatformRelease.metrics.some(r => r.scope_key === t1Scope || r.scope_key === t2Scope);
      const t1ReleaseClearedT1 = !afterT1Release.metrics.some(r => r.scope_key === t1Scope);
      const t1ReleaseKeptT2 = !hadTenantScopedRows || afterT1Release.metrics.some(r => r.scope_key === t2Scope) || !before.metrics.some(r => r.scope_key === t2Scope);
      const bothTenantsFellBack = t1.status === 200 && t2.status === 200 && t1.provider === 'openai' && t2.provider === 'openai';
      emit({
        type: 'verdict', leg: LEG,
        platformOutageAffectedBothTenants: bothTenantsFellBack,
        tenantScopedRowsExisted: hadTenantScopedRows,
        platformReleaseKeptTenantScopes: platformReleaseKeptTenantRows,
        scopedReleaseClearedExactlyT1: t1ReleaseClearedT1,
        scopedReleaseKeptT2: t1ReleaseKeptT2,
        scopedReleaseResultEchoed: t1Release.body?.scope === `tenant:${T1.tenantId}` || t1Release.body?.result?.scope === `tenant:${T1.tenantId}`,
        recoveryServed: recovery.status === 200,
      });
    }
    emit({ type: 'stub-stats', leg: LEG, alpha: await stubStats(ALPHA_PORT), beta: await stubStats(BETA_PORT) });
    return;
  }

  if (LEG === 'a16') {
    // 028/029 were applied to this probe database by the runner (never to a
    // production ledger). Verify the capability probe sees the column.
    const usageColumns = await sql.query("SHOW COLUMNS FROM enterprise_ai_usage LIKE 'decision_id'");
    emit({ type: 'ddl-probe', enterpriseUsageDecisionIdColumn: Array.isArray(usageColumns) && usageColumns.length > 0 });

    const call1 = await v1Chat({ enginePort: ENGINE_PORT, apiKey: API_KEY, prompt: `A.16 wire hop ${Date.now()}` });
    const d1 = call1.body?._freellmapi?.routing_decision?.decisionId ?? null;
    emit({ type: 'call', leg: LEG, who: 'platform', ...normalizeWire(call1, 1), decisionId: d1 });

    const telemetry = await telemetryDump(superToken);
    const telemetryJson = JSON.stringify(telemetry.body || {});
    const d1InTelemetry = Boolean(d1) && telemetryJson.includes(d1);
    emit({ type: 'telemetry', status: telemetry.status, entries: Array.isArray(telemetry.body?.entries) ? telemetry.body.entries.length : null, d1Found: d1InTelemetry });

    const ringRows = d1 ? readSqlite('SELECT decision_id, scope_key, chosen_provider, chosen_model, mode FROM routing_decisions WHERE decision_id = ?', [d1]) : [];
    const logRows = d1 ? readSqlite('SELECT id, provider, model, decision_id FROM request_log WHERE decision_id = ?', [d1]) : [];
    emit({ type: 'sqlite-ring', d1, rows: ringRows });
    emit({ type: 'sqlite-request-log', d1, rows: logRows });

    // Tenant path: D2 -> ring + request_log + MariaDB enterprise_ai_usage.
    const registry = makeRegistry();
    const ownerEmail = 'a16-owner@probe.test';
    const ownerToken = await previewLogin({ enginePort: ENGINE_PORT, email: ownerEmail });
    const T = await registry.provisionTenant({ ownerPrincipalId: shaUid(ownerEmail), displayName: 'Probe A16 tenant', slug: 'probe-a16' });
    await registry.setTenantCredentials({ tenantId: T.tenantId, providerId: 'groq', credentials: { apiKeys: ['key-a16-byok'] } });
    emit({ type: 'tenant', tenantId: T.tenantId });
    const tenantCall = await tenantGenerate({ token: ownerToken, tenantId: T.tenantId, tag: 'a16-decision' });
    emit({ type: 'call', leg: LEG, who: 'tenant', ...tenantCall });
    await sleep(3000); // usage write is fire-and-forget by design

    const tenantScope = `tenant:${T.tenantId}`;
    const d2Rows = readSqlite('SELECT decision_id, scope_key, chosen_provider FROM routing_decisions WHERE scope_key = ? ORDER BY created_at DESC LIMIT 3', [tenantScope]);
    const d2 = d2Rows[0]?.decision_id ?? null;
    const d2LogRows = d2 ? readSqlite('SELECT id, provider, model, decision_id FROM request_log WHERE decision_id = ?', [d2]) : [];
    const usageRows = await sql.query('SELECT id, decision_id, tenant_id, provider, model FROM enterprise_ai_usage ORDER BY id DESC LIMIT 10');
    const usageMatch = usageRows.filter(r => r.decision_id && d2 && String(r.decision_id) === String(d2));
    emit({ type: 'sqlite-ring', scope: tenantScope, d2, rows: d2Rows });
    emit({ type: 'sqlite-request-log', d2, rows: d2LogRows });
    emit({ type: 'mariadb-enterprise-ai-usage', recentRows: usageRows.map(r => ({ id: r.id, decision_id: r.decision_id, tenant_id: r.tenant_id })), d2MatchCount: usageMatch.length });

    emit({
      type: 'verdict', leg: LEG,
      d1, d2,
      wireHop: Boolean(d1),
      telemetryHop: d1InTelemetry,
      ringHopD1: ringRows.length === 1,
      requestLogHopD1: logRows.length >= 1,
      ringHopD2: Boolean(d2) && d2Rows.some(r => r.decision_id === d2),
      requestLogHopD2: d2LogRows.length >= 1,
      enterpriseUsageHopD2: usageMatch.length >= 1,
      singleIdE2E: Boolean(d1) && d1InTelemetry && ringRows.length === 1 && logRows.length >= 1
        && Boolean(d2) && d2LogRows.length >= 1 && usageMatch.length >= 1,
      disclosure: 'D1 crosses wire->telemetry->ring->request_log; D2 (tenant path) crosses ring->request_log->MariaDB usage. The tenant HTTP wire does not expose decisionId by design; no single id crosses all five hops on one call.',
    });
    emit({ type: 'stub-stats', leg: LEG, alpha: await stubStats(ALPHA_PORT), beta: await stubStats(BETA_PORT) });
    return;
  }

  throw new Error(`unknown LEG '${LEG}' (expected a15r1 | a15r2 | a16)`);
}

main().then(() => {
  // Pools opened via createRequire (makeSql/makeRegistry) keep the event loop
  // alive; the transcript is complete at this point.
  process.exit(0);
}).catch(error => {
  emit({ type: 'error', leg: LEG, message: error?.message || String(error), stack: String(error?.stack || '').split('\n').slice(0, 6) });
  process.exit(1);
});
