// @ts-check
/**
 * DIR-014 tenant-flag forensics probe (Step 6).
 *
 * The Stage-3 E2E reported "ATS branch exercised: DISABLED (fail-closed)".
 * That branch is only legitimate if the AUTHORITATIVE MariaDB row actually has
 * enableAtsScoreModule=false. If MariaDB says true while the UI still hides the
 * matcher, the fail-closed branch is masking a real defect - so this probe
 * reads the authoritative row and cross-checks the public API the browser sees.
 *
 * Writes .bridge/evidence/dir014-tenant-flags.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const report = { database: null, publicConfig: null, apiObservations: [], discrepancies: [] };

const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    database: process.env.DB_NAME || 'ai_resume_builder',
});

try {
    const [rows] = await conn.query(
        "SELECT category, revision, data FROM system_settings WHERE category = 'public_config'",
    );
    report.database = process.env.DB_NAME || 'ai_resume_builder';
    if (!rows.length) {
        report.discrepancies.push('no public_config row exists in system_settings');
    } else {
        const row = rows[0];
        const modules = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        report.publicConfig = {
            revision: row.revision,
            atsScore: modules?.modules?.enableAtsScoreModule,
            coverLetter: modules?.modules?.enableCoverLetterModule,
            atsChecker: modules?.modules?.atsChecker,
        };
    }
} finally {
    await conn.end();
}

// Cross-check what an unauthenticated client can actually observe, because a
// mismatch between the stored row and the served payload is itself a defect.
for (const url of [
    'http://localhost:8080/api/system-settings/public',
    'http://localhost:3000/api/system-settings/public',
]) {
    try {
        const res = await fetch(url);
        const body = await res.json().catch(() => null);
        const modules = body?.modules ?? body?.data?.modules ?? null;
        report.apiObservations.push({
            url,
            status: res.status,
            atsScore: modules?.enableAtsScoreModule ?? null,
            coverLetter: modules?.enableCoverLetterModule ?? null,
        });
    } catch (err) {
        report.apiObservations.push({ url, status: 'unreachable', error: err.message });
    }
}

const stored = report.publicConfig?.atsScore;
for (const obs of report.apiObservations) {
    if (obs.status === 200 && stored !== undefined && obs.atsScore !== null
        && obs.atsScore !== stored) {
        report.discrepancies.push(
            `${obs.url} serves enableAtsScoreModule=${obs.atsScore} but MariaDB stores ${stored}`,
        );
    }
}

// The fail-closed branch is CORRECT only when the stored flag is genuinely off.
report.failClosedBranchLegitimate = stored === false;
report.verdict = report.failClosedBranchLegitimate && report.discrepancies.length === 0
    ? 'LEGITIMATE: tenant has ATS administratively OFF; fail-closed branch is correct'
    : 'SUSPECT: see discrepancies';

fs.mkdirSync('.bridge/evidence', { recursive: true });
fs.writeFileSync('.bridge/evidence/dir014-tenant-flags.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!report.failClosedBranchLegitimate) process.exitCode = 1;
