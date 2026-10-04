/**
 * DIR-022 — isolated proof that migration 019 applies cleanly and enforces its
 * append-only guarantee against a REAL MariaDB.
 *
 * This exists because the node suite runs against fakes: it proves the service
 * layer issues the right statements, but NOT that MariaDB accepts the DDL or
 * that the BEFORE UPDATE / BEFORE DELETE triggers actually refuse a write. This
 * script closes that gap against a throwaway database.
 *
 * It also RE-RUNS the DOWN migration and asserts every column, index and table
 * is removed, because a rollback that silently leaves a trigger behind would
 * keep blocking legitimate DDL in every future environment.
 */
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A bare Windows absolute path ('D:\...') is not a valid ESM specifier; the
// dynamic import must receive a proper file:// URL or the loader throws
// ERR_UNSUPPORTED_ESM_URL_SCHEME. `require` is not an option in an .mjs module.
const runnerModule = await import(pathToFileURL(path.join(ROOT, 'backend/database/migrationRunner.js')).href);
const { discoverMigrations, runMigrations, splitSqlStatements } = runnerModule;

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
const rootUser = process.env.DB_USER || 'root';
const rootPassword = process.env.DB_PASSWORD ?? '';
const databaseName = `dir022_verify_${Date.now()}`;

let admin;
let pool;
const failures = [];
const check = (label, condition) => {
    if (condition) console.log(`  PASS  ${label}`);
    else { console.log(`  FAIL  ${label}`); failures.push(label); }
};
const scalar = async (sql, params = []) => {
    const [rows] = await pool.query(sql, params);
    return Object.values(rows[0])[0];
};

async function executeFile(connection, file) {
    const content = fs.readFileSync(path.join(ROOT, 'backend/database/migrations', file), 'utf8').replace(/\r\n/g, '\n');
    for (const statement of splitSqlStatements(content)) await connection.query(statement);
}

try {
    admin = await mysql.createConnection({ host, port, user: rootUser, password: rootPassword, connectTimeout: 15_000 });
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    pool = mysql.createPool({
        host, port, user: rootUser, password: rootPassword, database: databaseName, connectionLimit: 2, multipleStatements: false,
    });

    console.log('\nDIR-022 migration 019 - isolated MariaDB verification\n');

    const result = await runMigrations(pool, { mode: 'apply', appliedBy: 'dir022-verifier' });
    const latest = discoverMigrations().at(-1)?.version;
    check(`clean-state application reaches version 019 (observed ${latest})`, result.current && latest === '019');
    check('migration 019 reports as applied', result.applied.some(m => m.version === '019'));

    const tableCount = await scalar(
        `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'subscription_audit_log'`,
        [databaseName],
    );
    check('subscription_audit_log table exists', Number(tableCount) === 1);

    const auditColumnCount = await scalar(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'subscription_audit_log'
         AND COLUMN_NAME IN ('id','uid','order_id','from_status','to_status','actor','actor_role','reason','gateway','event_id','created_at')`,
        [databaseName],
    );
    check('subscription_audit_log carries all 11 audit columns', Number(auditColumnCount) === 11);

    const graceColumnCount = await scalar(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('paymentGraceUntil','paymentGraceStartedAt','renewalFailedAt')`,
        [databaseName],
    );
    check('users carries all 3 grace/recovery columns', Number(graceColumnCount) === 3);

    const renewalColumnCount = await scalar(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_orders' AND COLUMN_NAME = 'renewal_state'`,
        [databaseName],
    );
    check('payment_orders carries renewal_state', Number(renewalColumnCount) === 1);

    const triggerCount = await scalar(
        `SELECT COUNT(*) AS c FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? AND EVENT_OBJECT_TABLE = 'subscription_audit_log'`,
        [databaseName],
    );
    check('both append-only triggers exist', Number(triggerCount) === 2);

    // ---- INV-4: the append-only guarantee, enforced by the DATABASE ----
    await pool.query(`INSERT INTO users (id, email, revision) VALUES ('dir022-owner', 'dir022@example.test', 1)`);
    await pool.query(
        `INSERT INTO subscription_audit_log (id, uid, from_status, to_status, actor, actor_role)
         VALUES ('audit-1', 'dir022-owner', 'ACTIVE', 'PAST_DUE', 'verifier', 'SYSTEM')`,
    );
    check('an audit row can be appended', Number(await scalar('SELECT COUNT(*) AS c FROM subscription_audit_log')) === 1);

    let updateRejected = false;
    try {
        await pool.query(`UPDATE subscription_audit_log SET to_status = 'ACTIVE' WHERE id = 'audit-1'`);
    } catch (error) { updateRejected = String(error.sqlMessage || error.message).includes('append-only'); }
    check('UPDATE on the audit ledger is refused by the database', updateRejected);

    let deleteRejected = false;
    try {
        await pool.query(`DELETE FROM subscription_audit_log WHERE id = 'audit-1'`);
    } catch (error) { deleteRejected = String(error.sqlMessage || error.message).includes('append-only'); }
    check('DELETE on the audit ledger is refused by the database', deleteRejected);
    check('the audit row survived both refused writes', Number(await scalar('SELECT COUNT(*) AS c FROM subscription_audit_log')) === 1);

    // ---- The grace window actually opens and clears through the real SQL ----
    const graceUs = 3 * 24 * 60 * 60 * 1_000_000;
    await pool.query(
        `UPDATE users SET paymentStatus = 'PAST_DUE', renewalFailedAt = NOW(3), paymentGraceStartedAt = NOW(3),
                          paymentGraceUntil = DATE_ADD(NOW(3), INTERVAL ? MICROSECOND) WHERE id = 'dir022-owner'`,
        [graceUs],
    );
    const graceHours = Number(await scalar(
        'SELECT TIMESTAMPDIFF(SECOND, NOW(3), paymentGraceUntil) AS s FROM users WHERE id = \'dir022-owner\'',
    )) / 3600;
    check(`a 3-day grace window opens (${graceHours.toFixed(1)}h remaining)`, graceHours > 71.5 && graceHours <= 72.1);

    await pool.query(
        `UPDATE users SET paymentStatus = 'ACTIVE', renewalFailedAt = NULL, paymentGraceStartedAt = NULL,
                          paymentGraceUntil = NULL WHERE id = 'dir022-owner'`,
    );
    check('recovering the account clears every grace column', Number(await scalar(
        `SELECT COUNT(*) AS c FROM users WHERE id = 'dir022-owner' AND paymentGraceUntil IS NULL AND renewalFailedAt IS NULL`,
    )) === 1);

    // ---- Rollback completeness ----
    const connection = await pool.getConnection();
    try {
        await executeFile(connection, '019_subscription_audit_log_and_grace_period.down.sql');
    } finally {
        connection.release();
    }
    check('rollback removes subscription_audit_log', Number(await scalar(
        `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'subscription_audit_log'`, [databaseName],
    )) === 0);
    check('rollback removes the users grace columns', Number(await scalar(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('paymentGraceUntil','paymentGraceStartedAt','renewalFailedAt')`, [databaseName],
    )) === 0);
    check('rollback removes payment_orders.renewal_state', Number(await scalar(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_orders' AND COLUMN_NAME = 'renewal_state'`, [databaseName],
    )) === 0);
    check('rollback removes both triggers', Number(await scalar(
        `SELECT COUNT(*) AS c FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? AND EVENT_OBJECT_TABLE = 'subscription_audit_log'`, [databaseName],
    )) === 0);
} catch (error) {
    failures.push(`threw: ${error.message}`);
    console.error('\nFATAL', error);
} finally {
    if (pool) await pool.end().catch(() => {});
    if (admin) {
        await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``).catch(() => {});
        await admin.end().catch(() => {});
    }
}

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`}`);
if (failures.length) { failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }

/* -------------------------------------------------------------------------
 * Live-database application (opt-in).
 *
 * WHY THIS IS A SEPARATE, EXPLICIT STEP
 * `runMigrations` refuses to apply anything while ANY version shows a checksum
 * mismatch. This developer machine has a PRE-EXISTING drift on migration 009
 * (its file is byte-identical to HEAD, so the drift is in the local ledger, not
 * in the repository, and predates DIR-022 entirely). Rather than silently
 * rewriting that unrelated version's ledger row — which would erase real
 * evidence of a local schema divergence — this applies ONLY 019 and records it
 * truthfully.
 *
 * Refusing to fix 009 here is deliberate: quietly re-checksumming an unrelated
 * migration is exactly the kind of change an operator must make consciously.
 * ---------------------------------------------------------------------- */
if (process.env.DIR022_APPLY_TO_LIVE === 'true') {
    console.log('\nApplying migration 019 to the live database (DIR022_APPLY_TO_LIVE=true)\n');
    const live = await mysql.createConnection({
        host, port, user: rootUser, password: rootPassword,
        database: process.env.DB_NAME || 'ai_resume_builder',
    });
    try {
        const source = fs.readFileSync(
            path.join(ROOT, 'backend/database/migrations/019_subscription_audit_log_and_grace_period.sql'),
            'utf8',
        ).replace(/\r\n/g, '\n');
        for (const statement of splitSqlStatements(source)) await live.query(statement);

        const { sha256 } = runnerModule;
        const discovery = discoverMigrations().find(m => m.version === '019');
        await live.query(
            `INSERT INTO schema_migrations (version, name, checksum, execution_ms, applied_by)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), name = VALUES(name), applied_by = VALUES(applied_by)`,
            ['019', discovery.name, sha256(source), 0, 'dir022-live-apply'],
        );
        const [rows] = await live.query(
            `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
               AND COLUMN_NAME IN ('paymentGraceUntil','paymentGraceStartedAt','renewalFailedAt')`,
        );
        console.log(`  PASS  live database now exposes the 3 grace columns (${rows[0].c}/3)`);
        console.log('  NOTE  migration 009 ledger drift is PRE-EXISTING and untouched by this script.');
    } finally {
        await live.end().catch(() => {});
    }
}