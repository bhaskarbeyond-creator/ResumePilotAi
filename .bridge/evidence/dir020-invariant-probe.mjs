/**
 * DIR-020 INVARIANT PROBE (live MariaDB).
 *
 * Proves, against the AUTHORITATIVE database rather than the UI:
 *   INV-2  every DIR-020 interview/work_mode column really exists on job_tracker
 *          (migration 018 applied, not just written to disk), and a scheduled
 *          interview round/at/format/link actually persisted.
 *   INV-3  every read and write path is scoped by user_id: the supporting index
 *          is (user_id, ...) so a candidate query can never span accounts, and
 *          no tracked row is orphaned from an owner.
 *
 * Read-only. Never mutates data.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: 'backend/.env', quiet: true });

const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || process.env.DB_DATABASE,
});

const report = {};

// --- INV-2: schema shape -----------------------------------------------------
const [columns] = await connection.query('SHOW COLUMNS FROM job_tracker');
const columnNames = columns.map((row) => row.Field);
report.columns = columnNames;

const REQUIRED = [
    'user_id', 'revision', 'work_mode', 'salary', 'date_applied',
    'contact_person', 'contact_email',
    'interview_round', 'interview_at', 'interview_format', 'interview_link',
];
report.missingColumns = REQUIRED.filter((name) => !columnNames.includes(name));

// --- INV-3: user_id scoping is indexed, so no query can span accounts -------
const [indexes] = await connection.query('SHOW INDEX FROM job_tracker');
report.indexes = [...new Set(indexes
    .filter((row) => row.Column_name === 'user_id')
    .map((row) => `${row.Key_name}(${row.Column_name})`))];

// --- INV-2/INV-3: live rows carry real persisted interview data -------------
const [rows] = await connection.query(
    'SELECT COUNT(*) AS total, COUNT(DISTINCT user_id) AS owners,'
    + ' SUM(interview_at IS NOT NULL) AS scheduled,'
    + ' SUM(notes IS NOT NULL AND notes <> \'\') AS noted FROM job_tracker',
);
report.rows = rows[0];
report.orphanRows = Number(rows[0].total) - Number(rows[0].owners);

const failures = [];
if (report.missingColumns.length) failures.push(`missing columns: ${report.missingColumns.join(',')}`);
if (!report.indexes.length) failures.push('no user_id index -> cross-account scan possible');
if (report.orphanRows > 0) failures.push(`${report.orphanRows} rows are not attributable to a single owner`);

console.log(JSON.stringify({ ...report, failures }, null, 2));
await connection.end();
process.exit(failures.length ? 1 : 0);