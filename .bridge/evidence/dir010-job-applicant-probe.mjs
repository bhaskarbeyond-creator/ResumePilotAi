import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const [tables] = await conn.query('SHOW TABLES');
const names = tables.map((r) => Object.values(r)[0]).filter((n) => /job|applic/i.test(n));
console.log('TABLES:', names.join(', '));

const [jobCols] = await conn.query('SHOW COLUMNS FROM jobs');
console.log('JOBS COLS:', jobCols.map((c) => c.Field).join(', '));

const [appCols] = await conn.query('SHOW COLUMNS FROM applications');
console.log('APPS COLS:', appCols.map((c) => c.Field).join(', '));

const [jobs] = await conn.query(
    'SELECT id, title, employer_id, status, applicants_count FROM jobs ORDER BY id',
);
console.log('\n=== JOBS (live MariaDB) ===');
for (const j of jobs) {
    // eslint-disable-next-line no-await-in-loop
    const [cnt] = await conn.query(
        'SELECT COUNT(*) AS n FROM applications WHERE job_id = ?',
        [j.id],
    );
    console.log(`${j.id} | ${j.title} | status=${j.status} | applicants_count=${j.applicants_count} | realRows=${cnt[0].n}`);
}

const [perJob] = await conn.query(
    'SELECT job_id, COUNT(*) AS n FROM applications GROUP BY job_id ORDER BY n DESC',
);
console.log('\n=== APPLICATIONS PER JOB ===');
console.log(JSON.stringify(perJob, null, 2));

const [sample] = await conn.query(
    'SELECT * FROM applications ORDER BY id LIMIT 5',
);
console.log('\n=== SAMPLE APPLICATION ROWS ===');
console.log(JSON.stringify(sample, (k, v) => (k === 'cover_letter' ? String(v).slice(0, 60) : v), 2));

await conn.end();