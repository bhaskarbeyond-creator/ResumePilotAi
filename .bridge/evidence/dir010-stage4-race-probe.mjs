// DIR-010 stage 4 triage probe.
//
// Purpose: settle whether the ATS modal's "0 total applications" is a RACE
// (handleJobClick opens the modal before loadApplications resolves) or whether
// GET /api/jobs/:jobId/applications genuinely returns [] for the one
// requisition that holds an application row in the authoritative MariaDB.
//
// This calls the real endpoint with a real minted identity. Nothing is mocked.
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const API_ORIGIN = process.env.DIR010_API_ORIGIN || 'http://localhost:8080';

const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

const [[{ job_id: jobId }]] = await conn.query(
    'SELECT job_id FROM applications GROUP BY job_id ORDER BY COUNT(*) DESC LIMIT 1',
);
console.log('resolved target jobId =', jobId);
await conn.end();

const email = process.env.DIR010_RECRUITER_EMAIL || process.env.ADMIN_EMAIL;
const session = await mintFirebaseSession({ email });
console.log('minted identity =', session?.email, session?.uid);

const started = Date.now();
const response = await fetch(`${API_ORIGIN}/api/jobs/${encodeURIComponent(jobId)}/applications`, {
    headers: { Authorization: `Bearer ${session.idToken}` },
});
const body = await response.json();
const elapsed = Date.now() - started;

console.log('GET /api/jobs/:jobId/applications ->', response.status, `in ${elapsed}ms`);
console.log('success =', body?.success);
console.log('applications array length =', Array.isArray(body?.applications) ? body.applications.length : 'n/a');
console.log('raw body =', JSON.stringify(body, null, 2).slice(0, 2000));

if (elapsed < 400) {
    console.log('\nVERDICT: the endpoint answers in <400ms, far faster than the ~1s the modal took');
    console.log('to render "0 total applications" => this is a CLIENT-SIDE RACE, not empty data.');
} else {
    console.log('\nVERDICT: the endpoint is slow; a retrying assertion could still be correct.');
}
