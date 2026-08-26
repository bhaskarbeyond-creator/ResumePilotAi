import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { getPool } from '../backend/database/mysql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = path.join(__dirname, 'worker-process.mjs');

async function runRealOsFencingTest() {
  const pool = getPool();
  console.log('🔷 [Real OS Process Fencing] Initializing MariaDB authority state...');

  // Reset authority table to generation 100 with expired lease
  await pool.query(
    `INSERT INTO database_authority (id, generation, write_engine, mode, lease_owner, lease_expires_at)
     VALUES ('primary_authority', 100, 'mysql', 'NORMAL', 'none', 0)
     ON DUPLICATE KEY UPDATE generation = 100, lease_owner = 'none', lease_expires_at = 0`
  );

  const workerNames = ['Worker_A', 'Worker_B', 'Worker_C', 'Worker_D'];
  console.log(`🔷 [Real OS Process Fencing] Spawning ${workerNames.length} distinct OS child processes...`);

  const processes = workerNames.map((name) => {
    const cp = fork(WORKER_SCRIPT, [], {
      env: { ...process.env, WORKER_ID: name }
    });
    return { name, cp, pid: cp.pid };
  });

  console.log('  Spawned processes:', processes.map(p => `${p.name} (PID ${p.pid})`).join(', '));

  // Step 1: Simultaneous Lease Acquisition for Generation 200
  console.log('\n--- Step 1: Simultaneous Atomic Lease Acquisition (Generation 200) ---');
  const t0 = performance.now();
  const leasePromises = processes.map((p) => {
    return new Promise((resolve) => {
      p.cp.once('message', (msg) => {
        if (msg.type === 'LEASE_RESULT') resolve(msg);
      });
      p.cp.send({ action: 'ACQUIRE_LEASE', targetGeneration: 200, leaseDurationMs: 15000 });
    });
  });

  const results = await Promise.all(leasePromises);
  const t1 = performance.now();
  const acquisitionTime = (t1 - t0).toFixed(2);

  console.log(`  Acquisition attempt completed in ${acquisitionTime}ms.`);
  results.forEach((r) => {
    console.log(`  Process ${r.workerId} (PID ${r.pid}): won = ${r.won} (Current Owner: ${r.currentOwner})`);
  });

  const winners = results.filter(r => r.won);
  assert.equal(winners.length, 1, 'Exactly ONE OS process must win the generation 200 lease');
  const winningWorker = winners[0];
  console.log(`  ✅ Verified: Exactly 1 Winner -> ${winningWorker.workerId} (PID ${winningWorker.pid})`);

  // Step 2: Kill the winning OS process
  console.log(`\n--- Step 2: Hard-Killing Winning Process ${winningWorker.workerId} (PID ${winningWorker.pid}) ---`);
  const winningProc = processes.find(p => p.name === winningWorker.workerId);
  winningProc.cp.kill('SIGKILL');
  console.log(`  Process ${winningWorker.workerId} terminated.`);

  // Step 3: Spawn New OS Process Worker_E to claim recovery generation 201
  console.log('\n--- Step 3: Spawning Worker_E to acquire recovery Generation 201 ---');
  // First expire the dead worker's lease in database to simulate lease timeout recovery
  await pool.query('UPDATE database_authority SET lease_expires_at = 0 WHERE id = "primary_authority"');

  const workerE = fork(WORKER_SCRIPT, [], { env: { ...process.env, WORKER_ID: 'Worker_E' } });
  const workerEResult = await new Promise((resolve) => {
    workerE.once('message', (msg) => {
      if (msg.type === 'LEASE_RESULT') resolve(msg);
    });
    workerE.send({ action: 'ACQUIRE_LEASE', targetGeneration: 201, leaseDurationMs: 15000 });
  });

  console.log(`  Worker_E (PID ${workerE.pid}): won = ${workerEResult.won} (Generation: ${workerEResult.generation})`);
  assert.equal(workerEResult.won, true, 'Worker_E must acquire recovery lease generation 201');

  // Step 4: Stale Writer Rejection: One of the remaining old loser processes attempts a write with stale generation 200
  console.log('\n--- Step 4: Stale Generation 200 Writer Rejection Test ---');
  const staleWorker = processes.find(p => p.name !== winningWorker.workerId && p.cp.connected);
  console.log(`  Attempting write from stale ${staleWorker.name} with generation 200 (Active is 201)...`);

  const staleWriteResult = await new Promise((resolve) => {
    staleWorker.cp.once('message', (msg) => {
      if (msg.type === 'WRITE_RESULT') resolve(msg);
    });
    staleWorker.cp.send({
      action: 'ATTEMPT_WRITE',
      claimGeneration: 200,
      entityId: `stale-doc-${Date.now()}`,
      payload: { data: 'stale mutation' }
    });
  });

  console.log('  Stale Write Response:', staleWriteResult);
  assert.equal(staleWriteResult.success, false, 'Stale generation write must be rejected');
  assert.equal(staleWriteResult.rejectedReason, 'FENCING_TOKEN_STALE', 'Must reject with FENCING_TOKEN_STALE');
  console.log('  ✅ Verified: Stale OS worker write successfully rejected by MariaDB fencing token guard.');

  // Cleanup child processes
  processes.forEach(p => { if (p.cp.connected) p.cp.kill(); });
  if (workerE.connected) workerE.kill();

  console.log('\n🎉 Real OS Multi-Process Fencing Test PASSED (0 Split Brain, Strict Generation Monotonicity Verified).');
  process.exit(0);
}

runRealOsFencingTest().catch((err) => {
  console.error('❌ Real OS Fencing Test FAILED:', err);
  process.exit(1);
});
