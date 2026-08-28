import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const authority = require('../backend/database/authority');
const MySQLRepository = require('../backend/repositories/MySQLRepository');
const { ownershipMatrix } = require('../backend/database/ownership');

test('authoritative-store failure changes availability but never data ownership', () => {
  authority.__resetForTests({ mysqlHealthy: true });
  authority.recordFailure('mysql', 'write', new Error('connection lost'));
  authority.recordFailure('mysql', 'write', new Error('connection lost'));
  const degraded = authority.getStatus();
  assert.equal(degraded.mode, authority.MODES.MARIADB_UNAVAILABLE);
  assert.equal(degraded.operationalWriteEngine, 'mysql');
  assert.equal(degraded.configuredSecondary, null);
  assert.equal(degraded.canAcceptWrites, false);
  assert.equal(degraded.lastFailoverAt, null);
});

test('recovery requires positive health and restores the same owner', () => {
  authority.__resetForTests({ mysqlHealthy: true });
  authority.recordFailure('mysql', 'probe', new Error('connection lost'));
  authority.recordFailure('mysql', 'probe', new Error('connection lost'));
  authority.recordSuccess('mysql', 'probe');
  authority.recordSuccess('mysql', 'probe');
  authority.completeRecovery();
  const recovered = authority.getStatus();
  assert.equal(recovered.mode, authority.MODES.NORMAL);
  assert.equal(recovered.operationalWriteEngine, 'mysql');
  assert.equal(recovered.ownershipMutable, false);
  assert.ok(recovered.lastRecoveryAt);
});

test('payment webhook idempotency relies on the authoritative unique event key', async () => {
  const repository = new MySQLRepository();
  let calls = 0;
  repository._getPool = () => ({
    async query(sql, params) {
      calls += 1;
      assert.match(sql, /INSERT INTO payment_webhook_events/);
      assert.equal(params[0], 'provider-event-1');
      if (calls === 2) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY', errno: 1062 });
      return [{ affectedRows: 1 }];
    },
  });
  const event = { eventId: 'provider-event-1', provider: 'stripe', eventType: 'payment.succeeded', orderId: 'order-1' };
  assert.equal((await repository.claimWebhookEvent(event)).duplicate, false);
  assert.equal((await repository.claimWebhookEvent(event)).duplicate, true);
});

test('durable outboxes have idempotency, due-work, and terminal-state schema controls', async () => {
  const [baseline, lifecycleConstraint] = await Promise.all([
    fs.readFile('backend/database/migrations/001_baseline.sql', 'utf8'),
    fs.readFile('backend/database/migrations/008_notification_outbox_state_constraint.sql', 'utf8'),
  ]);
  const enterprise = baseline.match(/CREATE TABLE IF NOT EXISTS enterprise_outbox[\s\S]*?ENGINE=InnoDB/)?.[0] || '';
  const notifications = baseline.match(/CREATE TABLE IF NOT EXISTS notification_outbox[\s\S]*?ENGINE=InnoDB/)?.[0] || '';
  assert.match(enterprise, /UNIQUE KEY uq_ent_outbox_idempotency/);
  assert.match(enterprise, /idx_ent_outbox_due/);
  assert.match(enterprise, /DEAD_LETTER/);
  assert.match(notifications, /idempotency_key/);
  assert.match(notifications, /next_attempt_at/);
  for (const state of ['NOTIFICATION_QUEUED', 'DELIVERY_ATTEMPTED', 'RETRYING', 'DELIVERED', 'DEAD_LETTER', 'CANCELLED']) {
    assert.match(lifecycleConstraint, new RegExp(`'${state}'`));
  }
});

test('control-plane and data-plane ownership matrix has no ambiguous replica owner', () => {
  const rows = ownershipMatrix();
  for (const row of rows) {
    assert.notEqual(row.Owner, '', row.Entity);
    assert.equal(row.Replication, 'NONE', row.Entity);
    if (row.Table) assert.equal(row.Owner, 'MARIADB', row.Entity);
  }
  assert.equal(rows.filter(row => row.Owner === 'FIREBASE_AUTH').length, 1);
});
