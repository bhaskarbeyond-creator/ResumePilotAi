'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MySqlEnterpriseRepository } = require('../enterprise/mysqlEnterpriseRepository');

class AiLedgerPool {
  constructor() {
    this.rows = new Map();
    this.failInsert = null;
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('INSERT INTO enterprise_ai_usage')) {
      if (this.failInsert) throw this.failInsert;
      const [id, tenantId, workspaceId, principalId, dayKey, provider, model, operation,
        eventKey, correlationId, policyVersion, promptTokens, completionTokens,
        totalTokens, costEstimate, costMicros, recordedAt] = params;
      const key = `${tenantId}:${eventKey}`;
      if (this.rows.has(key)) return [{ affectedRows: 0 }];
      this.rows.set(key, {
        id, tenantId, workspaceId, principalId, dayKey, provider, model, operation,
        eventKey, correlationId, policyVersion, promptTokens, completionTokens,
        totalTokens, costEstimate, costMicros, recordedAt,
      });
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('SELECT id, workspaceId, principalId, provider, model, operation, correlationId,')) {
      const row = this.rows.get(`${params[0]}:${params[1]}`);
      return [[...(row ? [structuredClone(row)] : [])]];
    }
    throw new Error(`Unexpected SQL in AI ledger contract: ${normalized}`);
  }
}

function context(tenantId = crypto.randomUUID()) {
  return {
    tenantId,
    workspaceId: crypto.randomUUID(),
    principalId: crypto.randomUUID(),
    correlationId: 'corr-ai-ledger',
    policyVersion: 7,
  };
}

function usage(overrides = {}) {
  return {
    idempotencyKey: 'provider-event-42',
    provider: 'openai',
    model: 'gpt-4o-mini',
    operation: 'resume-summary',
    inputTokens: 120,
    outputTokens: 40,
    estimatedCostMicros: 99,
    now: '2026-08-28T08:30:00.000Z',
    ...overrides,
  };
}

test('AI usage retries collapse only when the idempotency key has identical immutable intent', async () => {
  const pool = new AiLedgerPool();
  const repository = new MySqlEnterpriseRepository({ pool });
  const ctx = context();

  assert.equal((await repository.recordAiUsage(ctx, usage())).outcome, 'RECORDED');
  assert.equal((await repository.recordAiUsage(ctx, usage({ now: '2026-08-28T08:31:00.000Z' }))).outcome, 'DUPLICATE_IGNORED');
  assert.equal(pool.rows.size, 1);

  await assert.rejects(
    () => repository.recordAiUsage(ctx, usage({ outputTokens: 41 })),
    error => error.code === 'AI_USAGE_IDEMPOTENCY_CONFLICT' && error.status === 409
  );
  assert.equal(pool.rows.size, 1);
});

test('AI usage idempotency is tenant-scoped and non-duplicate SQL failures propagate', async () => {
  const pool = new AiLedgerPool();
  const repository = new MySqlEnterpriseRepository({ pool });
  const first = context();
  const second = context();

  assert.equal((await repository.recordAiUsage(first, usage())).outcome, 'RECORDED');
  assert.equal((await repository.recordAiUsage(second, usage())).outcome, 'RECORDED');
  assert.equal(pool.rows.size, 2);

  pool.failInsert = Object.assign(new Error('database unavailable'), { code: 'ECONNRESET' });
  await assert.rejects(
    () => repository.recordAiUsage(first, usage({ idempotencyKey: 'new-event' })),
    error => error.code === 'ECONNRESET'
  );
});

test('AI usage rejects malformed or overflowing accounting values before SQL', async () => {
  const invalid = [
    { inputTokens: -1 },
    { outputTokens: 1.5 },
    { inputTokens: Number.NaN },
    { estimatedCostMicros: Number.POSITIVE_INFINITY },
    { inputTokens: 4_294_967_295, outputTokens: 1 },
  ];
  for (const values of invalid) {
    const pool = new AiLedgerPool();
    const repository = new MySqlEnterpriseRepository({ pool });
    await assert.rejects(
      () => repository.recordAiUsage(context(), usage(values)),
      error => error.code === 'INVALID_AI_USAGE_EVENT' && error.status === 400
    );
    assert.equal(pool.rows.size, 0);
  }
});
