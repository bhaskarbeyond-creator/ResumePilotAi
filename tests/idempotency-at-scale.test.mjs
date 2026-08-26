import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../backend/database/mysql.js';
import { rememberMutation } from '../backend/database/tombstones.js';

describe('Idempotency at Scale (100x Replays across 9 Entities)', () => {
  let pool;

  before(() => {
    pool = getPool();
  });

  const entities = [
    { type: 'users', id: `user-100x-${Date.now()}` },
    { type: 'resumes', id: `resume-100x-${Date.now()}` },
    { type: 'portfolios', id: `port-100x-${Date.now()}` },
    { type: 'jobs', id: `job-100x-${Date.now()}` },
    { type: 'applications', id: `app-100x-${Date.now()}` },
    { type: 'payment_orders', id: `pay-100x-${Date.now()}` },
    { type: 'memberships', id: `mem-100x-${Date.now()}` },
    { type: 'blog_posts', id: `blog-100x-${Date.now()}` },
    { type: 'deletions', id: `del-100x-${Date.now()}` },
  ];

  for (const ent of entities) {
    it(`100x Idempotency Replay for ${ent.type}`, async () => {
      const mutationId = `mut-scale-${ent.type}-${Date.now()}`;
      
      // 1st attempt: Must be processed (not duplicate)
      const first = await rememberMutation(pool, {
        mutationId,
        entityType: ent.type,
        entityId: ent.id,
        operation: ent.type === 'deletions' ? 'DELETE' : 'UPSERT',
        sourceEngine: 'mysql'
      });
      assert.equal(first, false, `${ent.type} 1st mutation must be applied`);

      // Replay 99 times: Must all be caught as duplicates
      let dupCount = 0;
      for (let i = 0; i < 99; i++) {
        const isDup = await rememberMutation(pool, {
          mutationId,
          entityType: ent.type,
          entityId: ent.id,
          operation: ent.type === 'deletions' ? 'DELETE' : 'UPSERT',
          sourceEngine: 'mysql'
        });
        if (isDup) dupCount++;
      }
      assert.equal(dupCount, 99, `${ent.type} all 99 replays must be deduplicated`);

      // Verify exactly 1 ledger record exists (zero revision inflation)
      const [rows] = await pool.query('SELECT COUNT(*) as count FROM processed_mutations WHERE mutation_id = ?', [mutationId]);
      assert.equal(rows[0].count, 1, `${ent.type} exactly 1 ledger entry must exist`);

      // Cleanup
      await pool.query('DELETE FROM processed_mutations WHERE mutation_id = ?', [mutationId]);
    });
  }
});
