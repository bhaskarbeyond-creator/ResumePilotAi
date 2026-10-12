import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-105 — END-TO-END proof that the menubar allowance is fed by REAL data.
 *
 * WHY THIS EXISTS. The browser harness cannot authenticate, so it can only
 * prove the UI contract. It reported "PASS" while the feature was in fact
 * broken in production, because it treated the honest-degradation path
 * (`data-ai-ready="false"`) as a success. That was a blind spot, not a proof.
 *
 * This script closes it: it mints a genuine Firebase ID token for a REAL user
 * (custom token -> Identity Toolkit exchange, using the server credential and
 * the web API key from the environment) and calls `/api/ai-usage` exactly as
 * the browser does. Only then is the numeric path actually evidenced.
 *
 * The token is NEVER printed or persisted.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const require = createRequire(import.meta.url);
const BACKEND = path.resolve(import.meta.dirname, '../../../backend');

const { getPool } = require(path.join(BACKEND, 'database/mysql.js'));
const firebaseAdmin = require(path.join(BACKEND, 'services/firebaseAdmin.js'));

const BASE = (process.env.IME365_BASE_URL || 'https://ime365.local').replace(/\/+$/, '');
const EMAIL = process.argv[2] || process.env.DIR105_PROBE_EMAIL || 'bhaskar.beyond@gmail.com';
const OUT_DIR = '.bridge/evidence/dir105';

const lines = [];
const log = (line) => { lines.push(line); console.log(line); };

function authClient() {
    try {
        return firebaseAdmin.auth();
    } catch {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
        if (!projectId || !clientEmail || !privateKey) {
            throw new Error('Firebase admin credential is unavailable in the environment.');
        }
        const app = firebaseAdmin.initializeApp(
            { credential: firebaseAdmin.credential.cert({ projectId, clientEmail, privateKey }) },
            'dir105-e2e',
        );
        return firebaseAdmin.auth(app);
    }
}

async function main() {
    await fs.mkdir(OUT_DIR, { recursive: true });

    const [rows] = await getPool().query('SELECT id, email FROM users WHERE email = ? LIMIT 1', [EMAIL]);
    if (!rows.length) throw new Error(`No user row for ${EMAIL}`);
    const uid = rows[0].id;
    log(`user          : ${rows[0].email} (uid resolved from MariaDB)`);

    const customToken = await authClient().createCustomToken(uid);

    const webKey = process.env.VITE_FIREBASE_KEY || process.env.FIREBASE_API_KEY;
    if (!webKey) throw new Error('VITE_FIREBASE_KEY is required to exchange the custom token.');

    const exchange = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(webKey)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        },
    );
    const session = await exchange.json();
    if (!exchange.ok || !session.idToken) {
        throw new Error(`Token exchange failed: HTTP ${exchange.status} ${JSON.stringify(session?.error || {})}`);
    }
    log('id token      : minted (not printed, not persisted)');

    const res = await fetch(`${BASE}/api/ai-usage`, {
        headers: { Authorization: `Bearer ${session.idToken}` },
        cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    log(`GET /api/ai-usage : HTTP ${res.status}`);

    const usage = body?.usage;
    const ok = res.status === 200 && body?.success === true && usage && typeof usage.usedToday === 'number';
    log(`payload       : ${JSON.stringify(usage || body)}`);

    log('');
    log(ok
        ? 'RESULT: PASS — the endpoint answers a REAL authenticated user with live MariaDB figures.'
        : 'RESULT: FAIL — the endpoint did not return live usage for a real user.');

    await fs.writeFile(path.join(OUT_DIR, 'e2e-ai-usage.log'), `${lines.join('\n')}\n`, 'utf8');
    process.exit(ok ? 0 : 1);
}

main().catch(async (error) => {
    log(`[FATAL] ${error.message}`);
    try { await fs.mkdir(OUT_DIR, { recursive: true }); await fs.writeFile(path.join(OUT_DIR, 'e2e-ai-usage.log'), `${lines.join('\n')}\n`, 'utf8'); } catch { /* best effort */ }
    process.exit(1);
});
