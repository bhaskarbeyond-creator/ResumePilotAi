/**
 * Shared plumbing for the live certification scripts.
 *
 * Design rules, all of which exist because the person running these scripts is
 * certifying production and must be able to trust the output:
 *
 *  - No credentials in source. Everything comes from the environment, and a
 *    missing variable is reported by name with the exact export to run.
 *  - No silent skips. A check that could not run is recorded as BLOCKED, never
 *    as a pass. `summarise()` counts BLOCKED separately so it can never be
 *    mistaken for green.
 *  - Machine-readable evidence. Every script writes JSON to test-results/ so
 *    the certification report can quote measured values rather than prose.
 *  - Non-zero exit on unexpected failure, so CI and shell pipelines stop.
 *  - Secrets are redacted from all recorded evidence.
 */

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_BASE_URL = 'https://airesume.projectdemo.guru';

export const STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
  SKIPPED: 'SKIPPED',
  INFO: 'INFO',
});

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bcfut_[A-Za-z0-9_-]{20,}/g,
  /\bsk_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bAKIA[0-9A-Z]{16}/g,
  /\brzp_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs / ID tokens
];

/** Removes anything credential-shaped from text destined for logs or evidence. */
export function redact(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') {
    try {
      return JSON.parse(redact(JSON.stringify(value)));
    } catch {
      return value;
    }
  }
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value);
}

/**
 * Reads required environment variables, returning `{ ok, values, missing }`.
 * Never throws: the caller decides whether a missing variable blocks the whole
 * run or only some checks.
 */
export function readEnv(spec) {
  const values = {};
  const missing = [];
  for (const [name, meta] of Object.entries(spec)) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
      if (meta.default !== undefined) {
        values[name] = meta.default;
        continue;
      }
      if (meta.required) missing.push({ name, description: meta.description });
      continue;
    }
    values[name] = raw;
  }
  return { ok: missing.length === 0, values, missing };
}

export function reportMissingEnv(missing, scriptName) {
  console.error(`\n${scriptName}: cannot run — required environment variables are not set.\n`);
  for (const { name, description } of missing) {
    console.error(`  ${name}`);
    console.error(`      ${description}`);
  }
  console.error('\nSet them and re-run. Never paste credentials into the repository.\n');
}

/** Collects results and renders both a console table and a JSON artifact. */
export class Recorder {
  constructor(name, meta = {}) {
    this.name = name;
    this.meta = meta;
    this.results = [];
    this.startedAt = new Date().toISOString();
  }

  record(status, check, detail = {}) {
    const entry = {
      check,
      status,
      at: new Date().toISOString(),
      ...JSON.parse(JSON.stringify(redact(detail))),
    };
    this.results.push(entry);

    const icon = { PASS: 'PASS ', FAIL: 'FAIL ', BLOCKED: 'BLOCK', SKIPPED: 'SKIP ', INFO: 'INFO ' }[status] || '?????';
    const suffix = detail.reason ? ` — ${redact(String(detail.reason))}` : '';
    console.log(`  [${icon}] ${check}${suffix}`);
    return entry;
  }

  pass(check, detail) { return this.record(STATUS.PASS, check, detail); }
  fail(check, detail) { return this.record(STATUS.FAIL, check, detail); }
  blocked(check, detail) { return this.record(STATUS.BLOCKED, check, detail); }
  skipped(check, detail) { return this.record(STATUS.SKIPPED, check, detail); }
  info(check, detail) { return this.record(STATUS.INFO, check, detail); }

  summarise() {
    const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, SKIPPED: 0, INFO: 0 };
    for (const result of this.results) counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }

  /**
   * Writes the evidence artifact and returns the process exit code.
   * BLOCKED is not a pass: it produces a distinct non-zero code so an operator
   * can tell "something is broken" (1) from "this could not be verified" (2).
   */
  finish(outputFile) {
    const counts = this.summarise();
    // A skipped or blocked check is evidence of incomplete certification, not
    // green. This is especially important for the inventory/CRUD tools, which
    // intentionally avoid destructive production mutations by default.
    const verdict = counts.FAIL > 0 ? 'FAIL' : (counts.BLOCKED > 0 || counts.SKIPPED > 0 ? 'INCOMPLETE' : 'PASS');

    const report = {
      script: this.name,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      meta: JSON.parse(JSON.stringify(redact(this.meta))),
      counts,
      verdict,
      results: this.results,
    };

    const target = path.resolve(outputFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

    console.log(`\n${'='.repeat(64)}`);
    console.log(`${this.name}`);
    console.log(`${'='.repeat(64)}`);
    console.log(`  PASS ${counts.PASS}   FAIL ${counts.FAIL}   BLOCKED ${counts.BLOCKED}   SKIPPED ${counts.SKIPPED}`);
    console.log(`  VERDICT: ${verdict}`);
    console.log(`  Evidence: ${path.relative(process.cwd(), target)}`);
    console.log(`${'='.repeat(64)}\n`);

    if (verdict === 'FAIL') return 1;
    if (verdict === 'INCOMPLETE') return 2;
    return 0;
  }
}

/** fetch with a timeout, returning a normalised result rather than throwing. */
export async function probe(url, options = {}) {
  const { timeoutMs = 20000, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return {
      ok: true,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text,
      json,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : error.message,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Exchanges an email/password for a Firebase ID token via the public REST API. */
export async function firebaseSignIn(apiKey, email, password) {
  const response = await probe(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!response.ok) throw new Error(`Firebase sign-in unreachable: ${response.error}`);
  if (response.status !== 200) {
    const message = response.json?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Firebase sign-in rejected: ${message}`);
  }
  return { idToken: response.json.idToken, uid: response.json.localId, email: response.json.email };
}

/** A disposable resource name, so live artifacts are always identifiable. */
export function disposableName(prefix = 'zz-cert') {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${nonce}`;
}
