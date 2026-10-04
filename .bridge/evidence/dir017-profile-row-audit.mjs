// @ts-check
/**
 * DIR-017 stage-2 fixture audit (READ-ONLY, throws nothing away).
 *
 * Diagnostic #3 showed the live row already carries "Bhaskardir017" - probe
 * pollution from an earlier stage-2 run that timed out BEFORE its restore leg.
 * Stage 2 restores to whatever it reads as `original`, so once the row is
 * polluted every subsequent run happily "round-trips" the polluted value and
 * still passes: the fixture self-heals into a permanently wrong baseline.
 *
 * This reports the authoritative row so the real value can be restored by hand
 * from evidence, rather than guessed. It prints no credentials.
 */
import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'node:path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 1,
});

const [tables] = await pool.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
    [process.env.DB_NAME],
);
console.log('TABLES', JSON.stringify(tables.map((r) => r.t)));

const [rows] = await pool.query(
    "SELECT id, email, firstname, lastname, revision FROM users WHERE email = ?",
    ['bhaskar.beyond@gmail.com'],
);
console.log('ROW', JSON.stringify(rows, null, 2));
await pool.end();
