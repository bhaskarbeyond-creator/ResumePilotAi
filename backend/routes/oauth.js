'use strict';

const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const OAUTH_EXCHANGE_TTL_MS = 60 * 1000;

/**
 * OAuth routes: LinkedIn/GitHub sign-in, callback, exchange, credential tests.
 *
 * @param {object} deps
 * @param {object} deps.admin - Firebase Admin instance
 * @param {string} deps.protocol
 * @param {string} deps.websiteName
 * @param {Function} deps.getRepository
 * @param {Function} deps.chooseCredentialPair
 * @param {object} deps.oauthSecurity - { hashOpaque, createPkceChallenge, parseCookies, assertStateBinding, assertStateRecord, assertVerifiedIdentity, assertAccountLinkSafe, assertExchangeRecord }
 * @param {object} deps.resetSecurity - { isOpaqueToken }
 */
function createOAuthRouter(deps) {
    const router = express.Router();
    const {
        admin,
        protocol,
        websiteName,
        getRepository,
        chooseCredentialPair,
        oauthSecurity: {
            hashOpaque,
            createPkceChallenge,
            parseCookies,
            assertStateBinding,
            assertStateRecord,
            assertVerifiedIdentity,
            assertAccountLinkSafe,
            assertExchangeRecord,
        },
        resetSecurity: { isOpaqueToken },
    } = deps;

    const oauthCookie = (state, clear = false) => {
        const secure = protocol === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
        return `rp_oauth_state=${clear ? '' : encodeURIComponent(state)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 300}${secure}`;
    };
    const safeRedirect = (res, value) => res.redirect(`${protocol}://${websiteName}${value}`);

    async function getSocialAuthCredentials(provider) {
        let storedClientId = '';
        let storedClientSecret = '';
        const legacyPrefix = provider === 'linkedin' ? 'linkedin' : 'github';
        try {
            const { getPool } = require('../database/mysql');
            const pool = getPool();
            const [rows] = await pool.query(
                "SELECT category, data FROM system_settings WHERE category IN ('admin_configuration','system_settings') LIMIT 2"
            ).catch(() => [[]]);
            let canonical = {};
            for (const row of rows || []) {
                const data = row && row.data ? (typeof row.data === 'string' ? safeJsonParse(row.data) : row.data) : {};
                const social = (data && data.socialAuth) || {};
                canonical = { ...canonical, ...social };
            }
            storedClientId = String(canonical[`${legacyPrefix}ClientId`] || canonical[`${legacyPrefix}ClientID`] || '').trim();
            storedClientSecret = String(canonical[`${legacyPrefix}ClientSecret`] || '').trim();
        } catch (error) {
            console.warn(`[OAuth config ${provider}]`, error.message);
        }
        const envPrefix = provider === 'linkedin' ? 'LINKEDIN' : 'GITHUB';
        const selected = chooseCredentialPair({
            environmentId: process.env[`${envPrefix}_CLIENT_ID`],
            environmentSecret: process.env[`${envPrefix}_CLIENT_SECRET`],
            storedId: storedClientId,
            storedSecret: storedClientSecret,
        });
        return { clientId: selected.id, clientSecret: selected.secret, source: selected.source };
    }

    function safeJsonParse(value) {
        try { return JSON.parse(value); } catch { return {}; }
    }

    function failOAuthBegin(res, provider, reason) {
        return safeRedirect(res, `/login?error=${encodeURIComponent(reason)}&provider=${encodeURIComponent(provider)}`);
    }

    async function beginOAuth(provider, req, res) {
        try {
            const { createOAuthState } = require('../database/oauthStore');
            const { clientId, clientSecret } = await getSocialAuthCredentials(provider);
            if (!clientId || !clientSecret) {
                console.warn(`[OAuth begin ${provider}] no client id configured`);
                return failOAuthBegin(res, provider, 'oauth_not_configured');
            }
            const state = crypto.randomBytes(32).toString('base64url');
            const codeVerifier = crypto.randomBytes(32).toString('base64url');
            const challenge = createPkceChallenge(codeVerifier);
            await createOAuthState({ stateHash: hashOpaque(state), provider, codeVerifier, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
            res.setHeader('Set-Cookie', oauthCookie(state));
            const callback = `${protocol}://${websiteName}/api/auth/${provider}/callback`;
            const url = provider === 'linkedin'
                ? new URL('https://www.linkedin.com/oauth/v2/authorization')
                : new URL('https://github.com/login/oauth/authorize');
            const params = provider === 'linkedin'
                ? { response_type: 'code', client_id: clientId, redirect_uri: callback, state, scope: 'openid profile email', code_challenge: challenge, code_challenge_method: 'S256' }
                : { client_id: clientId, redirect_uri: callback, state, scope: 'read:user user:email', code_challenge: challenge, code_challenge_method: 'S256' };
            for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
            return res.redirect(url.href);
        } catch (error) {
            console.error(`[OAuth begin ${provider}]`, error.message);
            return failOAuthBegin(res, provider, 'oauth_unavailable');
        }
    }

    async function consumeOAuthState(provider, req) {
        const state = typeof req.query.state === 'string' ? req.query.state : '';
        const cookieState = parseCookies(req.headers.cookie).rp_oauth_state || '';
        assertStateBinding(state, cookieState);
        const { consumeOAuthState: consumeStateRow } = require('../database/oauthStore');
        const record = await consumeStateRow({ stateHash: hashOpaque(state), provider });
        if (!record) throw new Error('OAUTH_STATE_INVALID');
        assertStateRecord({ ...record, expiresAt: Number(record.expiresAt) || 0 }, provider);
        return { codeVerifier: record.codeVerifier };
    }

    async function upsertFederatedIdentity({ provider, providerId, email, emailVerified, displayName, photoURL }) {
        if (!admin?.auth) throw new Error('OAUTH_IDENTITY_INVALID');
        const normalizedEmail = assertVerifiedIdentity({ provider, providerId, email, emailVerified });
        const providerUid = `${provider}:${String(providerId)}`.slice(0, 128);
        let providerUser = null;
        let emailOwner = null;
        try { providerUser = await admin.auth().getUser(providerUid); }
        catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
        if (!providerUser) {
            try { emailOwner = await admin.auth().getUserByEmail(normalizedEmail); }
            catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
        }
        assertAccountLinkSafe({ providerUid, providerUser, emailOwner, normalizedEmail });
        const user = providerUser || await admin.auth().createUser({
            uid: providerUid,
            email: normalizedEmail,
            emailVerified: true,
            displayName: String(displayName || 'User').slice(0, 100),
            photoURL: photoURL || undefined
        });
        if (!user.emailVerified) await admin.auth().updateUser(user.uid, { emailVerified: true });
        const parts = String(displayName || 'User').trim().split(/\s+/);
        const profile = {
            userId: user.uid,
            email: normalizedEmail,
            firstname: parts[0] || 'User',
            lastname: parts.slice(1).join(' '),
            displayName: String(displayName || 'User').slice(0, 100),
            ...(photoURL ? { photoURL } : {}),
        };
        try {
            const repo = getRepository();
            const existingProfile = await repo.getUser(user.uid);
            await repo.saveUser(user.uid, {
                ...profile,
                membership: existingProfile && existingProfile.membership ? existingProfile.membership : 'Basic',
                paymentStatus: existingProfile && existingProfile.paymentStatus ? existingProfile.paymentStatus : 'INACTIVE',
            });
        } catch (repoErr) {
            console.error('[OAuth] Authoritative MySQL profile write failed:', repoErr.message);
            const err = new Error('OAUTH_PROFILE_WRITE_FAILED');
            err.status = 503;
            throw err;
        }
        return user.uid;
    }

    async function issueOAuthExchange(uid, provider) {
        const code = crypto.randomBytes(32).toString('base64url');
        const { createOAuthExchangeCode } = require('../database/oauthStore');
        await createOAuthExchangeCode({ codeHash: hashOpaque(code), uid, provider, expiresAt: Date.now() + OAUTH_EXCHANGE_TTL_MS });
        return code;
    }

    // Routes
    router.get('/auth/linkedin', (req, res) => beginOAuth('linkedin', req, res));
    router.get('/auth/github', (req, res) => beginOAuth('github', req, res));

    router.get('/auth/linkedin/callback', async (req, res) => {
        res.setHeader('Set-Cookie', oauthCookie('', true));
        if (req.query.error) return safeRedirect(res, '/login?error=linkedin_denied');
        try {
            const state = await consumeOAuthState('linkedin', req);
            const code = typeof req.query.code === 'string' ? req.query.code : '';
            if (!code) throw new Error('OAUTH_CODE_MISSING');
            const { clientId, clientSecret } = await getSocialAuthCredentials('linkedin');
            const redirectUri = `${protocol}://${websiteName}/api/auth/linkedin/callback`;
            const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000,
                body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, code_verifier: state.codeVerifier }).toString()
            });
            const tokenData = await tokenRes.json();
            if (!tokenRes.ok || !tokenData.access_token) throw new Error('OAUTH_TOKEN_EXCHANGE_FAILED');
            const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` }, timeout: 10_000 });
            const profile = await profileRes.json();
            if (!profileRes.ok || profile.email_verified !== true) throw new Error('OAUTH_EMAIL_NOT_VERIFIED');
            const uid = await upsertFederatedIdentity({
                provider: 'linkedin', providerId: profile.sub, email: profile.email, emailVerified: true,
                displayName: profile.name || `${profile.given_name || ''} ${profile.family_name || ''}`.trim() || 'LinkedIn User',
                photoURL: /^https:\/\//.test(profile.picture || '') ? profile.picture : null
            });
            const exchange = await issueOAuthExchange(uid, 'linkedin');
            return safeRedirect(res, `/dashboard#oauth_code=${encodeURIComponent(exchange)}&provider=linkedin`);
        } catch (error) {
            console.error('[LinkedIn OAuth callback]', error.message);
            return safeRedirect(res, '/login?error=linkedin_callback_failed');
        }
    });

    router.get('/auth/github/callback', async (req, res) => {
        res.setHeader('Set-Cookie', oauthCookie('', true));
        if (req.query.error) return safeRedirect(res, '/login?error=github_denied');
        try {
            const state = await consumeOAuthState('github', req);
            const code = typeof req.query.code === 'string' ? req.query.code : '';
            if (!code) throw new Error('OAUTH_CODE_MISSING');
            const { clientId, clientSecret } = await getSocialAuthCredentials('github');
            const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 10_000,
                body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, code_verifier: state.codeVerifier })
            });
            const tokenData = await tokenRes.json();
            if (!tokenRes.ok || !tokenData.access_token) throw new Error('OAUTH_TOKEN_EXCHANGE_FAILED');
            const headers = { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': `${websiteName}-OAuth`, Accept: 'application/vnd.github+json' };
            const [profileRes, emailsRes] = await Promise.all([
                fetch('https://api.github.com/user', { headers, timeout: 10_000 }),
                fetch('https://api.github.com/user/emails', { headers, timeout: 10_000 })
            ]);
            const profile = await profileRes.json();
            const emails = await emailsRes.json();
            const verified = Array.isArray(emails) ? (emails.find(item => item.primary && item.verified) || emails.find(item => item.verified)) : null;
            if (!profileRes.ok || !emailsRes.ok || !verified?.email) throw new Error('OAUTH_EMAIL_NOT_VERIFIED');
            const uid = await upsertFederatedIdentity({
                provider: 'github', providerId: profile.id, email: verified.email, emailVerified: true,
                displayName: profile.name || profile.login || 'GitHub User',
                photoURL: /^https:\/\//.test(profile.avatar_url || '') ? profile.avatar_url : null
            });
            const exchange = await issueOAuthExchange(uid, 'github');
            return safeRedirect(res, `/dashboard#oauth_code=${encodeURIComponent(exchange)}&provider=github`);
        } catch (error) {
            console.error('[GitHub OAuth callback]', error.message);
            return safeRedirect(res, '/login?error=github_callback_failed');
        }
    });

    router.post('/auth/oauth/exchange', async (req, res) => {
        const code = String(req.body.code || '');
        if (!isOpaqueToken(code) || !admin?.auth) return res.status(400).json({ error: 'Invalid OAuth exchange code' });
        try {
            const { redeemOAuthExchangeCode } = require('../database/oauthStore');
            const record = await redeemOAuthExchangeCode({ codeHash: hashOpaque(code) });
            if (!record) throw new Error('INVALID_EXCHANGE_CODE');
            assertExchangeRecord({ ...record, expiresAt: Number(record.expiresAt) || 0 });
            const customToken = await admin.auth().createCustomToken(record.uid, { signInProvider: record.provider });
            res.setHeader('Cache-Control', 'no-store');
            return res.json({ customToken });
        } catch (_) {
            return res.status(400).json({ error: 'Invalid or expired OAuth exchange code' });
        }
    });

    router.get('/auth/linkedin/test-credentials', async (req, res) => {
        const { clientId, clientSecret } = await getSocialAuthCredentials('linkedin');
        const configured = !!(clientId && clientSecret);
        return res.json({
            provider: 'linkedin',
            configured,
            callbackUrl: `${protocol}://${websiteName}/api/auth/linkedin/callback`,
            note: configured ? 'LinkedIn credentials active in Admin Settings / Environment.' : 'LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are not set in Admin Settings or .env.'
        });
    });

    router.get('/auth/github/test-credentials', async (req, res) => {
        const { clientId, clientSecret } = await getSocialAuthCredentials('github');
        const configured = !!(clientId && clientSecret);
        return res.json({
            provider: 'github',
            configured,
            callbackUrl: `${protocol}://${websiteName}/api/auth/github/callback`,
            note: configured ? 'GitHub credentials active in Admin Settings / Environment.' : 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not set in Admin Settings or .env.'
        });
    });

    return router;
}

module.exports = { createOAuthRouter };
