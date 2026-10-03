// @ts-check
/**
 * DIR-006 session identity.
 *
 * Mints a GENUINE Firebase ID token for an existing Firebase Auth user so the
 * real browser client (src/conf/fire.js initialises against the live project)
 * accepts the session. Nothing is fabricated and nothing is hardcoded:
 *   - the service account comes from backend/.env (FIREBASE_*),
 *   - the web API key comes from .env (VITE_FIREBASE_KEY),
 *   - the identity is looked up in live Firebase Auth by email,
 *   - and the resulting token is signed by Google for the live project's audience.
 *
 * If no identity is configured the caller gets null and the spec reports the
 * limitation honestly rather than silently testing a signed-out browser.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

/**
 * @param {{ email?: string }} options
 * @returns {Promise<{ uid: string, email: string, idToken: string, refreshToken: string, apiKey: string } | null>}
 */
export async function mintFirebaseSession(options = {}) {
    const email = options.email || process.env.DIR006_EMAIL || '';
    const apiKey = process.env.VITE_FIREBASE_KEY || '';
    const projectId = process.env.FIREBASE_PROJECT_ID || '';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
    const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!email || !apiKey || !projectId || !clientEmail || !privateKey) return null;

    if (getApps().length === 0) {
        initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
    }

    const user = await getAuth().getUserByEmail(email);
    const role = (user.customClaims && user.customClaims.role) || 'USER';
    const customToken = await getAuth().createCustomToken(user.uid, { role });

    const exchange = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        },
    );
    const payload = await exchange.json();
    if (!exchange.ok || !payload.idToken) {
        throw new Error(`Identity Toolkit rejected the session exchange: ${exchange.status}`);
    }

    return {
        uid: user.uid,
        email: user.email || email,
        idToken: payload.idToken,
        refreshToken: payload.refreshToken || '',
        apiKey,
    };
}
