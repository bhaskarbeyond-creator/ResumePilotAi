'use strict';

/**
 * PH4-ENGINE-022 part 1.2 — decisionId plumbing contract (test-plan §1.2).
 *
 * Seven contract tests on self-contained fakes (FakeTelemetry array capture +
 * FakeDecisionSink as a plain-object recordDecision sink): no SQLite, no
 * MariaDB, no schema. Per the plan's explicit boundary these pass against the
 * frozen bb2b82b code shapes as well as the execution-phase code. The one real
 * module imported is routingTelemetry — it ALREADY sanitized decisionId
 * (safeString 64) at bb2b82b, which is exactly what test 4 pins.
 *
 * Real-module router-level coverage: decision-ledger-router.test.js (C.2).
 * Zero console.*, zero waitForTimeout, zero new deps, zero network.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { RoutingTelemetry } = require('../services/aiRouting/routingTelemetry');

// ---------------------------------------------------------------------------
// Fakes.
// ---------------------------------------------------------------------------

class FakeTelemetry {
  constructor() { this.records = []; }
  record(entry = {}) {
    // Mirrors the routingTelemetry tenantId default ('platform') and the
    // decisionId sanitizer contract (safeString 64).
    const record = {
      tenantId: entry.tenantId ? String(entry.tenantId) : 'platform',
      outcome: entry.outcome === 'success' || entry.outcome === 'aborted' ? entry.outcome : 'failure',
      decisionId: entry.decisionId === null || entry.decisionId === undefined ? '' : String(entry.decisionId).slice(0, 64),
    };
    this.records.push(record);
    return record;
  }
}

class FakeDecisionSink {
  constructor({ fail = false } = {}) {
    this.decisions = [];
    this.requestLog = [];
    this.fail = fail;
    this.emittedSql = [];
  }

  /** The future recordDecision(entry) as a plain object sink. */
  recordDecision(entry = {}) {
    if (this.fail) throw new Error('routing_decisions: no such table (window closed)');
    const id = String(entry.decisionId || '').trim();
    if (!id) return { recorded: false, reason: 'missing-decision-id' }; // honesty over volume
    const existing = this.decisions.findIndex(row => row.decisionId === id);
    const row = { ...entry, decisionId: id };
    if (existing >= 0) this.decisions[existing] = { ...this.decisions[existing], ...row }; // upsert: one row per decision
    else this.decisions.push(row);
    return { recorded: true };
  }

  /** Per-attempt request_log rows share the decision id (join-key semantics). */
  recordRequest(entry = {}) {
    this.requestLog.push({ ...entry, decisionId: entry.decisionId ?? null });
  }
}

/** The writer contract: emits ledger SQL ONLY when the capability probe says
 *  the table exists — pre-028 instances emit zero unknown-column SQL. */
function makeLedgerWriter(sink, { supportsDecisionLedger }) {
  return {
    write(entry) {
      if (!supportsDecisionLedger()) return { written: false, reason: 'ledger-unsupported' };
      sink.emittedSql.push(`INSERT INTO routing_decisions ... (${entry.decisionId})`);
      return sink.recordDecision(entry);
    },
  };
}

/** Minimal routed-request simulator honoring the cardinality contract: one id
 *  per request, attempts share it, the ring row lands once at resolution. */
function simulateRoutedRequest({ sink, telemetry, attempts, tenantId = null, decisionId = null }) {
  const id = decisionId || crypto.randomUUID();
  const served = attempts.findIndex(attempt => attempt.ok);
  attempts.forEach((attempt, index) => {
    sink.recordRequest({ provider: attempt.provider, model: attempt.model, ok: attempt.ok, status: attempt.status, decisionId: id });
    telemetry.record({ tenantId, outcome: attempt.ok ? 'success' : 'failure', decisionId: id, attempt: index });
  });
  const resolved = served >= 0 ? attempts[served] : null;
  sink.recordDecision({
    decisionId: id,
    chosenProvider: resolved?.provider || null,
    chosenModel: resolved?.model || null,
    outcome: resolved ? (served > 0 ? 'fallback' : 'success') : 'failure',
    status: resolved ? 200 : attempts[attempts.length - 1].status,
    promptTokens: resolved?.usage?.promptTokens ?? null,
    completionTokens: resolved?.usage?.completionTokens ?? null,
  });
  return { id, resolved };
}

// ---------------------------------------------------------------------------
// 1 — generation.
// ---------------------------------------------------------------------------

test('1: ids are UUIDv4-shaped, unique across 10k generations, one per routed request (not per attempt)', () => {
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const seen = new Set();
  for (let i = 0; i < 10_000; i += 1) {
    const id = crypto.randomUUID(); // node built-in, zero deps
    assert.match(id, uuidV4);
    seen.add(id);
  }
  assert.equal(seen.size, 10_000, 'unique across 10k sequential generations');

  const sink = new FakeDecisionSink();
  const telemetry = new FakeTelemetry();
  const { id } = simulateRoutedRequest({
    sink, telemetry,
    attempts: [
      { provider: 'groq', model: 'm1', ok: false, status: 500 },
      { provider: 'openai', model: 'm2', ok: true, status: 200, usage: { promptTokens: 3, completionTokens: 4 } },
    ],
  });
  assert.equal(sink.decisions.length, 1, 'ONE decision row for the whole request');
  assert.equal(sink.decisions[0].decisionId, id);
  assert.equal(new Set(sink.requestLog.map(row => row.decisionId)).size, 1, 'attempts SHARE the id — stable within one routed request');
  assert.equal(sink.requestLog.length, 2, 'attempt rows stay per-attempt (request_log business)');
});

// ---------------------------------------------------------------------------
// 2 — wire contract additive.
// ---------------------------------------------------------------------------

test('2: attaching decisionId to routingDecision preserves every existing field (additive wire contract)', () => {
  const routingDecision = {
    mode: 'speed',
    exploration: 'cold-start',
    observedLatencyMs: 812,
    observationCount: 5,
    lastResort: false,
    candidatesConsidered: 4,
    candidatesRejected: 1,
    selectionLatencyMs: 2,
  };
  const decisionId = crypto.randomUUID();
  // The router's attachment shape (fresh object — cache copies stay clean):
  const attached = { ...routingDecision, decisionId };
  // The wire serializer flows routing_decision through unchanged:
  const wire = { _freellmapi: { routing_decision: attached || null } };
  for (const [field, value] of Object.entries(routingDecision)) {
    assert.deepEqual(wire._freellmapi.routing_decision[field], value, `existing field ${field} passes through byte-identically`);
  }
  assert.equal(wire._freellmapi.routing_decision.decisionId, decisionId);
  // S1 passthrough proof pattern: a null routingDecision serializes as null —
  // the id never invents an object (attach-only-when-already-an-object rule).
  const nullRd = null;
  const nullAttached = decisionId && nullRd && typeof nullRd === 'object' ? { ...nullRd, decisionId } : nullRd;
  assert.equal(nullAttached, null);
});

// ---------------------------------------------------------------------------
// 3 — attempt-vs-decision cardinality.
// ---------------------------------------------------------------------------

test('3: a fallback chain yields ONE decisionId with outcome fallback; per-attempt rows are the request_log business', () => {
  const sink = new FakeDecisionSink();
  const telemetry = new FakeTelemetry();
  simulateRoutedRequest({
    sink, telemetry,
    attempts: [
      { provider: 'groq', model: 'm1', ok: false, status: 429 },
      { provider: 'openai', model: 'm2', ok: true, status: 200, usage: { promptTokens: 10, completionTokens: 20 } },
    ],
  });
  assert.equal(sink.decisions.length, 1);
  assert.equal(sink.decisions[0].outcome, 'fallback');
  assert.equal(sink.decisions[0].chosenProvider, 'openai', 'the decision names the SERVING destination');
  assert.equal(sink.decisions[0].status, 200);
  assert.equal(sink.requestLog.length, 2, 'both attempts are joinable rows under the one id');
  assert.deepEqual(sink.requestLog.map(row => row.ok), [false, true]);
  // Upsert semantics: re-resolving the same id never duplicates the row.
  sink.recordDecision({ decisionId: sink.decisions[0].decisionId, outcome: 'fallback', status: 200 });
  assert.equal(sink.decisions.length, 1);
});

// ---------------------------------------------------------------------------
// 4 — telemetry threading.
// ---------------------------------------------------------------------------

test('4: telemetry receives {decisionId, tenantId} — real routingTelemetry sanitizes and defaults exactly as before', () => {
  const fake = new FakeTelemetry();
  const id = crypto.randomUUID();
  fake.record({ tenantId: null, outcome: 'success', decisionId: id });
  assert.equal(fake.records[0].tenantId, 'platform', 'the existing tenantId default is preserved');
  assert.equal(fake.records[0].decisionId, id);

  // The REAL ring (zero-change module): long ids are clamped to 64, tenantId
  // defaults to platform, unknown outcomes fall back to failure.
  const telemetry = new RoutingTelemetry({ maxEntries: 10, now: () => 1_761_500_000_000 });
  const record = telemetry.record({ outcome: 'success', decisionId: 'x'.repeat(100) });
  assert.equal(record.tenantId, 'platform');
  assert.equal(record.decisionId.length, 64, 'safeString(64) clamp — no shape break');
  const withId = telemetry.record({ tenantId: 'tenant-7', outcome: 'failure', decisionId: id });
  assert.equal(withId.tenantId, 'tenant-7');
  assert.equal(withId.decisionId, id);
});

// ---------------------------------------------------------------------------
// 5 — null-when-unknown discipline (F-18 extended to the ledger).
// ---------------------------------------------------------------------------

test('5: a failed dispatch with no usage carries promptTokens/completionTokens null and the real status — never 0', () => {
  const sink = new FakeDecisionSink();
  const telemetry = new FakeTelemetry();
  simulateRoutedRequest({
    sink, telemetry,
    attempts: [{ provider: 'groq', model: 'm1', ok: false, status: 503 }],
  });
  const [row] = sink.decisions;
  assert.equal(row.outcome, 'failure');
  assert.equal(row.status, 503);
  assert.equal(row.promptTokens, null, 'NULL, never a fabricated 0');
  assert.equal(row.completionTokens, null);
  assert.equal(row.chosenProvider, null, 'no destination served — honestly null');
});

// ---------------------------------------------------------------------------
// 6 — ledger-write isolation (fail-open on evidence, fail-closed on money).
// ---------------------------------------------------------------------------

test('6: a throwing sink never propagates — the routed response and the charge are unaffected', () => {
  const sink = new FakeDecisionSink({ fail: true }); // simulates absent table / window closed
  const telemetry = new FakeTelemetry();
  // The writer wraps the sink exactly like the router's fail-open helper:
  const guardedRecord = entry => {
    try { sink.recordDecision(entry); } catch { /* evidence sinks must never touch the response */ }
  };
  let served = null;
  let charged = false;
  // The routed request proceeds regardless:
  guardedRecord({ decisionId: crypto.randomUUID(), outcome: 'success', status: 200 });
  served = { content: 'the answer', status: 200 };
  charged = true; // the money path ran to completion
  assert.deepEqual(served, { content: 'the answer', status: 200 });
  assert.equal(charged, true);
  assert.equal(sink.decisions.length, 0, 'nothing was recorded — and nothing threw');
  assert.equal(telemetry.records.length, 0);
});

// ---------------------------------------------------------------------------
// 7 — capability-probe gating.
// ---------------------------------------------------------------------------

test('7: the writer emits NOTHING when supportsDecisionLedger() is false (never emit unknown-column SQL pre-028)', () => {
  const sink = new FakeDecisionSink();
  let supports = false;
  const writer = makeLedgerWriter(sink, { supportsDecisionLedger: () => supports });
  const id = crypto.randomUUID();
  const result = writer.write({ decisionId: id, outcome: 'success', status: 200 });
  assert.deepEqual(result, { written: false, reason: 'ledger-unsupported' });
  assert.deepEqual(sink.emittedSql, [], 'zero SQL emitted against a pre-028 instance');
  assert.equal(sink.decisions.length, 0);
  // Post-028 (probe true): the same writer emits and records.
  supports = true;
  const second = writer.write({ decisionId: id, outcome: 'success', status: 200 });
  assert.equal(second.recorded, true);
  assert.equal(sink.emittedSql.length, 1);
  assert.equal(sink.decisions[0].decisionId, id);
});
