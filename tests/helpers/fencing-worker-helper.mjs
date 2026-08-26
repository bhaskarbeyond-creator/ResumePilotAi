import { getPool } from '../../backend/database/mysql.js';

const workerName = process.argv[2] || 'Worker-Unknown';
const expectedBaseGen = Number(process.argv[3] || 10);

async function run() {
    let pool;
    try {
        pool = getPool();
        const nextGen = expectedBaseGen + 1;
        const leaseExpiry = Date.now() + 30000;

        // Atomic CAS transition: Only the first worker that finds generation === expectedBaseGen will succeed
        const [res] = await pool.query(
            'UPDATE database_authority SET generation = ?, write_engine = "firestore", mode = "MARIADB_FAILED_OVER", lease_owner = ?, lease_expires_at = ?, reason = "Failover by worker" WHERE id = "active_authority" AND generation = ?',
            [nextGen, workerName, leaseExpiry, expectedBaseGen]
        );

        if (res.affectedRows === 1) {
            console.log(`ACQUIRED_TRANSITION by ${workerName} to gen ${nextGen}`);
        } else {
            console.log(`FENCE_REJECTED for ${workerName} (expected gen ${expectedBaseGen})`);
        }
    } catch (err) {
        console.error(`ERROR in ${workerName}:`, err.message);
        process.exit(1);
    } finally {
        if (pool) {
            try { await pool.end(); } catch (_) {}
        }
        process.exit(0);
    }
}

run();
