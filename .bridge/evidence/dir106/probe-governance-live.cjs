'use strict';

/**
 * DIR-106 — LIVE governance probe against the REAL MariaDB (no test pool).
 *
 * Proves, on real rows, that:
 *   - the STRICT resolver still fails closed on an ambiguous multi-tenant caller
 *     (execution paths keep their tenant boundary), and
 *   - the GRACEFUL telemetry opt-in resolves that same caller to its primary
 *     organization instead of returning HTTP 400 TENANT_CONTEXT_REQUIRED.
 *
 * It prints only figures/ids; it never prints a credential or token.
 */
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        v = v.replace(/\\n/g, '\n');
        if (!process.env[m[1]]) process.env[m[1]] = v;
    }
}

const ROOT = path.resolve(__dirname, '../../..');
loadEnv(path.join(ROOT, '.env'));
loadEnv(path.join(ROOT, 'backend', '.env'));

const BACKEND = path.join(ROOT, 'backend');
const { getPool } = require(path.join(BACKEND, 'database', 'mysql.js'));
const { resolveAiGovernance } = require(path.join(BACKEND, 'security', 'aiGovernance.js'));

const EMAIL = process.argv[2] || 'bhaskar.beyond@gmail.com';
const OUT = path.join(ROOT, '.bridge', 'evidence', 'dir106');

(async () => {
    const lines = [];
    const log = (s) => { lines.push(s); console.log(s); };
    const checks = [];
    const check = (label, ok, detail) => { checks.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); };

    const [rows] = await getPool().query('SELECT id, email, role FROM users WHERE email = ? LIMIT 1', [EMAIL]);
    if (!rows.length) throw new Error(`No user row for ${EMAIL}`);
    const uid = rows[0].id;
    log(`user            : ${rows[0].email} (role=${rows[0].role || 'n/a'}, uid from MariaDB)`);

    const [mems] = await getPool().query(
        'SELECT tenantId, status, personalTenant FROM enterprise_memberships WHERE principalId = ?',
        [uid],
    );
    const orgs = mems.filter((m) => m.personalTenant !== 1);
    log(`org memberships : ${orgs.length} (personal tenants excluded)`);

    const req = { user: { uid }, get: () => undefined, body: {}, query: {} };

    const strict = await resolveAiGovernance(req);
    log(`STRICT   -> source=${strict.source} reason=${strict.reason} error=${strict.error ? `${strict.error.code}/${strict.error.status}` : 'none'}`);

    const graceful = await resolveAiGovernance(req, { allowAmbiguousSelection: true });
    log(`GRACEFUL -> source=${graceful.source} scope=${graceful.quota?.scope} tenant=${graceful.tenant?.tenantId} userLimit=${graceful.quota?.userLimit} sharedLimit=${graceful.quota?.sharedLimit} ambiguous=${graceful.ambiguousTenant} error=${graceful.error ? graceful.error.code : 'none'}`);

    if (orgs.length > 1) {
        check('strict resolver still fails closed on an ambiguous multi-tenant caller', strict.source === 'NONE' && strict.error?.status === 400, `source=${strict.source} error=${strict.error?.code}`);
        check('graceful telemetry resolves to an ORGANIZATION budget (no 400)', graceful.source === 'ORGANIZATION' && !graceful.error, `source=${graceful.source} error=${graceful.error?.code || 'none'}`);
        check('graceful telemetry is deterministic across repeated reads', (await resolveAiGovernance(req, { allowAmbiguousSelection: true })).tenant?.tenantId === graceful.tenant?.tenantId, `tenant=${graceful.tenant?.tenantId}`);
        check('the selected tenant is one of the caller\'s real memberships', orgs.some((m) => String(m.tenantId) === String(graceful.tenant?.tenantId)), `selected=${graceful.tenant?.tenantId}`);
    } else {
        check('single-org caller resolves without ambiguity', !strict.error, `source=${strict.source}`);
    }

    log('');
    log('ASSERTIONS:');
    checks.forEach((c) => log('  ' + c));
    const failed = checks.filter((c) => c.startsWith('FAIL'));
    log('');
    log(failed.length ? `RESULT: FAIL (${failed.length})` : 'RESULT: PASS');

    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'probe-governance-live.log'), `${lines.join('\n')}\n`, 'utf8');
    process.exit(failed.length ? 1 : 0);
})().catch((error) => {
    console.error('[FATAL]', error.message);
    process.exit(1);
});
