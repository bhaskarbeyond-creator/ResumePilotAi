// @ts-check
/**
 * DIR-009 candidate identity probe.
 *
 * Reads a REAL candidate from the authoritative MariaDB so the E2E suite never
 * fabricates or hardcodes an identity. Prints the candidates available plus
 * how many resumes each owns, so the run can prove it is not passing on an
 * empty account (the anti-empty-state mandate).
 */
import mysql from 'mysql2/promise';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const [[version]] = await conn.query('SELECT VERSION() AS version, DATABASE() AS db');
console.log('server:', JSON.stringify(version));

const [tables] = await conn.query('SHOW TABLES');
console.log('tables:', tables.map(r => Object.values(r)[0]).join(', '));

const [users] = await conn.query(
    `SELECT u.id, u.email, u.role, u.created_at,
            (SELECT COUNT(*) FROM resumes r WHERE r.user_id = u.id) AS resume_count
       FROM users u
      WHERE u.email IS NOT NULL AND u.email <> ''
      ORDER BY resume_count DESC, u.created_at DESC
      LIMIT 12`,
);
console.log('candidates (ordered by real resume count):');
for (const u of users) console.log('  ', JSON.stringify(u));

await conn.end();