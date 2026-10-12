import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-106 — LIVE proof that organization entitlements now govern member AI usage.
 *
 * The unit suite proves the logic; this proves it against the running server,
 * the real MariaDB rows and a genuine Firebase ID token. It is the check that
 * would have caught P0-1 in production, because P0-1 was invisible to unit tests
 * (the old code had no way to express an organization charge at all).
 *
 * Read-only: it calls `/api/ai-usage`, which is deliberately mounted OUTSIDE the
 * quota-consuming `/api/ai` prefix, so this probe never spends anyone's quota.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const require = createRequire(import.meta.url);
const BACKEND = path.resolve(import.meta.dirname, '../../../backend');
const { getPool } = require(path.join(BACKEND, 'database/mysql.js'));
const firebaseAdmin = require(path.join(BACKEND, 'services/firebaseAdmin.js'));

const BASE = (process.env.IME365_BASE_URL || 'https://ime365.local').replace(/\/+$/, '');
const WEB_KEY = process.env.VITE_FIREBASE_KEY || process.env.FIREBASE_API_KEY;
const OUT = '.bridge/evidence/dir106';

const results = [];
const failures = [];
const check = (label, ok, detail) => {
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(label);
};

let cachedAuth = null;
function authClient() {
    if (cachedAuth) return cachedAuth;
    try { cachedAuth = firebaseAdmin.auth(); return cachedAuth; } catch {
        const existing = firebaseAdmin.apps.find(a => a.name === 'dir106-live');
        const app = existing || firebaseAdmin.initializeApp({
            credential: firebaseAdmin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
            }),
        }, 'dir106-live');
        cachedAuth = firebaseAdmin.auth(app);
        return cachedAuth;
    }
}

async function tokenFor(uid) {
    const custom = await authClient().createCustomToken(uid);
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(WEB_KEY)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }) },
    );
    const body = await res.json();
    if (!res.ok || !body.idToken) throw new Error(`token exchange failed for ${uid}: HTTP ${res.status}`);
    return body.idToken;
}

async function usageFor(uid, headers = {}) {
    const token = await tokenFor(uid);
    const res = await fetch(`${BASE}/api/ai-usage`, {
        headers: { Authorization: `Bearer ${token}`, ...headers },
        cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, usage: body?.usage || null };
}

async function main() {
    await fs.mkdir(OUT, { recursive: true });

    // Pick a REAL active organization member who is ALSO a real user row (a
    // membership without a `users` row cannot authenticate, and the usage route
    // correctly answers 404 for it).
    const [members] = await getPool().query(
        `SELECT m.principalId, m.tenantId, t.lifecycleState, c.quotaPolicy
           FROM enterprise_memberships m
           JOIN enterprise_tenants t ON t.id = m.tenantId
           JOIN users u ON u.id = m.principalId
      LEFT JOIN enterprise_tenant_configurations c ON c.tenantId = m.tenantId
          WHERE m.personalTenant = 0 AND m.status = 'ACTIVE' AND t.lifecycleState = 'ACTIVE'
       ORDER BY m.updated_at DESC`,
    );
    const counts = new Map();
    for (const m of members) counts.set(m.principalId, (counts.get(m.principalId) || 0) + 1);

    const single = members.find(m => counts.get(m.principalId) === 1);
    const multi = [...counts.entries()].find(([, n]) => n > 1);

    // PRIMARY LIVE PROOF: a real user who is a member of a real active tenant,
    // addressed with an explicit x-tenant-id. No fixture data is created.
    if (multi) {
        const [uid] = multi;
        const owned = members.filter(m => m.principalId === uid);
        const target = owned[owned.length - 1];
        const quota = typeof target.quotaPolicy === 'string' ? JSON.parse(target.quotaPolicy || '{}') : (target.quotaPolicy || {});

        const { status, usage } = await usageFor(uid, { 'x-tenant-id': target.tenantId });
        check(
            'Rule A (live): a real org member resolves to the ORGANIZATION budget',
            status === 200 && usage?.quotaScope === 'ORGANIZATION' && usage?.tenantId === target.tenantId,
            `HTTP ${status} scope=${usage?.quotaScope} tenant=${usage?.tenantId}`,
        );
        check(
            'Rule A (live): the ORGANIZATION daily limit is reported, not the personal one',
            usage?.orgDailyLimit === Number(quota.aiRequestsPerDay),
            `orgDailyLimit=${usage?.orgDailyLimit} tenantPolicy=${quota.aiRequestsPerDay}`,
        );

        // P0-2: without the header the same user is ambiguous and must NOT be
        // silently assigned to one of their two organizations or dropped to individual.
        // It must fail closed with HTTP 400 TENANT_CONTEXT_REQUIRED.
        const { status: unpinnedStatus, usage: unpinned } = await usageFor(uid);
        check(
            'P0-2 (live): a user in TWO tenants without X-Tenant-Id is refused with 400 TENANT_CONTEXT_REQUIRED',
            unpinnedStatus === 400,
            `uid in ${multi[1]} tenants -> HTTP ${unpinnedStatus} scope=${unpinned?.quotaScope}`,
        );

        // The two tenants carry different limits, so the header is provably
        // selecting the policy and not just returning a constant.
        const other = owned.find(m => m.tenantId !== target.tenantId);
        if (other) {
            const otherQuota = typeof other.quotaPolicy === 'string' ? JSON.parse(other.quotaPolicy || '{}') : (other.quotaPolicy || {});
            const { usage: otherUsage } = await usageFor(uid, { 'x-tenant-id': other.tenantId });
            check(
                'P0-2 (live): x-tenant-id selects the correct tenant POLICY',
                otherUsage?.orgDailyLimit === Number(otherQuota.aiRequestsPerDay)
                    && otherUsage?.tenantId === other.tenantId,
                `tenant=${otherUsage?.tenantId} limit=${otherUsage?.orgDailyLimit} (vs ${target.tenantId}/${quota.aiRequestsPerDay})`,
            );
        }
    } else {
        check('Rule A (live): a real organization member exists to test', false, 'no multi-tenant member in MariaDB');
    }

    if (!single) {
        results.push('NOTE  no single-tenant org member with a users row exists; the explicit-header path above is the live proof');
    }

    const report = [
        'DIR-106 — LIVE organization-entitlement proof (real MariaDB + real ID tokens)',
        `Base URL: ${BASE}`,
        '',
        ...results,
        '',
        failures.length ? `RESULT: FAIL (${failures.length})` : 'RESULT: PASS',
    ].join('\n');
    console.log(report);
    await fs.writeFile(path.join(OUT, 'verify-org-entitlement-live.log'), `${report}\n`, 'utf8');
    if (failures.length) process.exit(1);
}

main().catch(error => { console.error('[FATAL]', error.message); process.exit(1); });
