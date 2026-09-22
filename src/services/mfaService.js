import QRCode from 'qrcode';
import { getAuth, multiFactor, TotpMultiFactorGenerator, getMultiFactorResolver } from 'firebase/auth';
import fire from '../conf/fire';

// In no-Firebase environments `fire` is the compat proxy with no initialized
// app (`fire._delegate` is undefined); getAuth() would throw "No Firebase App".
// Return a null-shaped auth object instead so callers degrade gracefully.
const NULL_AUTH = { currentUser: null };
const modularAuth = () => {
    try {
        const app = fire._delegate || fire.app?._delegate;
        return app ? getAuth(app) : getAuth();
    } catch (_e) {
        try { return getAuth(); } catch (_) { return NULL_AUTH; }
    }
};

export async function beginTotpEnrollment() {
    const user = modularAuth().currentUser;
    if (!user) throw new Error('Authentication required');
    if (!user.emailVerified) throw new Error('Verify your email before enabling two-factor authentication.');
    const token = await user.getIdTokenResult();
    if (['linkedin', 'github'].includes(token.claims.signInProvider)) {
        throw new Error('Authenticator MFA for LinkedIn/GitHub requires configuring that provider as native Firebase OIDC. Use an email/password or native Firebase provider account for MFA.');
    }
    const session = await multiFactor(user).getSession();
    const secret = await TotpMultiFactorGenerator.generateSecret(session);
    const otpauthUrl = secret.generateQrCodeUrl(user.email || user.uid, 'IME365');
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
    return { secret, secretKey: secret.secretKey, qrCodeDataUrl };
}

export async function completeTotpEnrollment(secret, verificationCode) {
    if (!secret || !/^\d{6}$/.test(String(verificationCode || ''))) throw new Error('A valid 6-digit code is required.');
    const user = modularAuth().currentUser;
    if (!user) throw new Error('Authentication required');
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, String(verificationCode));
    await multiFactor(user).enroll(assertion, 'Authenticator app');
    await user.getIdToken(true);
    return getTotpStatus();
}

export async function getTotpStatus() {
    const user = modularAuth().currentUser;
    if (!user) return { enabled: false, enrolledFactors: [] };
    await user.reload();
    const factors = multiFactor(user).enrolledFactors.filter(factor => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID || factor.factorId === 'totp');
    return {
        enabled: factors.length > 0,
        enrolledFactors: factors.map(factor => ({ uid: factor.uid, displayName: factor.displayName || 'Authenticator app', enrollmentTime: factor.enrollmentTime }))
    };
}

export async function disableTotpEnrollment() {
    const user = modularAuth().currentUser;
    if (!user) throw new Error('Authentication required');
    await user.reload();
    const factors = multiFactor(user).enrolledFactors || [];
    const factor = factors.find(item => item.factorId === TotpMultiFactorGenerator.FACTOR_ID || item.factorId === 'totp') || factors[0];
    if (factor) {
        await multiFactor(user).unenroll(factor);
    }
    await user.getIdToken(true);
    return getTotpStatus();
}

export function getTotpSignInResolver(error) {
    if (!error) return null;
    const isMfaRequired = error.code === 'auth/multi-factor-auth-required' || String(error.message || '').includes('multi-factor-auth-required');
    if (!isMfaRequired) return null;
    
    let resolver = error.resolver || null;
    if (!resolver) {
        try {
            const auth = modularAuth();
            resolver = getMultiFactorResolver(auth, error._delegate || error);
        } catch (_err) {
            try {
                resolver = getMultiFactorResolver(getAuth(), error._delegate || error);
            } catch (_) {}
        }
    }
    if (!resolver) return null;
    const hints = resolver.hints || [];
    const hint = hints.find(item => item.factorId === TotpMultiFactorGenerator.FACTOR_ID || item.factorId === 'totp') || hints[0];
    return { resolver, hint: hint || { uid: hints[0]?.uid || 'totp', factorId: 'totp' } };
}

export async function completeTotpSignIn(resolverState, verificationCode) {
    if (!resolverState?.resolver || !/^\d{6}$/.test(String(verificationCode || ''))) {
        throw new Error('A valid 6-digit authenticator code is required.');
    }
    const hintUid = resolverState.hint?.uid || resolverState.resolver?.hints?.[0]?.uid;
    if (!hintUid) throw new Error('No second-factor enrollment hint found on account.');
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hintUid, String(verificationCode));
    return resolverState.resolver.resolveSignIn(assertion);
}
