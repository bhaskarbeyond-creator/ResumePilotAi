/**
 * Shared probe-runner library — REBUILT harness (R15).
 * Faithful reconstruction of the lost /tmp/probe scripts from the documented
 * technique in developer-review/engine-audit-2026-10-24.md. All SQL runs
 * against the sandbox bridge through the TARGET tree's own database/mysql
 * module (baseline clone or current tip — never a cross-tree mix).
 */

import { createRequire } from 'node:module';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const CONFIG_HOT_RELOAD_WAIT_MS = 13_000; // documented: visible after <= 12 s

export function makeSql(targetBackendDir, dbName) {
  const require = createRequire(`${targetBackendDir}/`);
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3306';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = '';
  process.env.DB_NAME = dbName;
  const { getPool } = require('./database/mysql');
  return {
    async query(sql, params = []) {
      const [rows] = await getPool().query(sql, params);
      return rows;
    },
    async end() {
      try { await getPool().end(); } catch { /* already closed */ }
    },
  };
}

/** Write public_config.ai (selectionMode/provider/...) the way the admin save does. */
export async function setPublicAiConfig(sql, aiConfig) {
  const rows = await sql.query("SELECT data, revision FROM system_settings WHERE category = 'public_config'");
  const current = rows.length ? (typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data) : {};
  const next = { ...current, ai: { ...(current.ai || {}), ...aiConfig } };
  if (rows.length) {
    await sql.query('UPDATE system_settings SET data = ?, revision = revision + 1, updated_at = NOW() WHERE category = ?', [JSON.stringify(next), 'public_config']);
  } else {
    await sql.query('INSERT INTO system_settings (category, data, revision, updated_at) VALUES (?, ?, 1, NOW())', ['public_config', JSON.stringify(next)]);
  }
  return next;
}

export async function waitForEngine(enginePort, { timeoutMs = 90_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${enginePort}/healthz`);
      if (response.ok) return true;
      lastError = new Error(`healthz ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1000);
  }
  throw new Error(`engine on :${enginePort} never became healthy: ${lastError?.message}`);
}

export async function v1Chat({ enginePort, apiKey, prompt, timeoutMs = 120_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${enginePort}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'auto',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 64,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
    return { status: response.status, body, wallMs: null };
  } finally {
    clearTimeout(timer);
  }
}

/** The normalized wire extraction — the byte-equality comparison surface.
 *  Timing fields (wall/latency) are deliberately EXCLUDED (documented in the
 *  transcript header): they are physically nondeterministic. */
export function normalizeWire(result, call) {
  const freellm = result.body?._freellmapi || {};
  const rd = freellm.routing_decision || null;
  return {
    call,
    status: result.status,
    provider: freellm.provider ?? null,
    model: freellm.actual_model ?? null,
    cached: freellm.cached ?? null,
    mode: rd?.mode ?? null,
    exploration: rd?.exploration ?? null,
    qualityEvidence: rd?.qualityEvidence ?? null,
    observationCount: rd?.observationCount ?? null,
    lastResort: rd?.lastResort === true,
    fallbacks: (freellm.fallbacks || []).map(f => ({ provider: f.provider ?? null, model: f.model ?? null, status: f.status ?? null })),
    decisionIdPresent: Boolean(rd?.decisionId),
    content: result.body?.choices?.[0]?.message?.content ?? null,
  };
}

export async function stubStats(stubPort) {
  const response = await fetch(`http://127.0.0.1:${stubPort}/__stats`);
  return response.json();
}

export async function stubReset(stubPort) {
  const response = await fetch(`http://127.0.0.1:${stubPort}/__reset`, { method: 'POST' });
  return response.json();
}

export async function adminResetState({ enginePort, token, body = {} }) {
  const response = await fetch(`http://127.0.0.1:${enginePort}/api/admin/ai/reset-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

export async function previewLogin({ enginePort, email, password = 'probe-fixture-password' }) {
  const response = await fetch(`http://127.0.0.1:${enginePort}/api/auth/preview-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.token) throw new Error(`preview-login failed for ${email}: ${response.status} ${JSON.stringify(body)?.slice(0, 200)}`);
  return body.token;
}
