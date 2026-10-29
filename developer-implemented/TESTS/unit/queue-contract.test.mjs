import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQueueSnapshot } from '../../../frontend/src/components/admin/queue-contract.ts';
const sample = {summary: {totalInspected:1,deadLetterCount:1,pendingCount:0,successCount:0,source:'MARIADB_OUTBOXES',sampled:true},jobs:[{id:'x',queue:'notification',channel:'email',state:'DEAD_LETTER',attemptCount:2,recipient:null,templateType:'notice',lastError:'real diagnostic',createdAt:null}]};
test('accepts sampled backend telemetry and retains real diagnostic', () => assert.equal(parseQueueSnapshot(sample).jobs[0].lastError,'real diagnostic'));
test('rejects malformed and incomplete telemetry, not as empty success', () => {
  for (const value of [null, {}, { ...sample, jobs: [] }, {...sample, summary:{...sample.summary,source:'unknown'}}, {...sample,jobs:[{...sample.jobs[0],attemptCount:'2'}]}]) assert.throws(() => parseQueueSnapshot(value));
});
