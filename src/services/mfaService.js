import QRCode from 'qrcode';
import { getAuth, multiFactor, TotpMultiFactorGenerator, getMultiFactorResolver } from 'firebase/auth';
import fire from '../conf/fire';

// In no-Firebase environments `fire` is the compat proxy with no initialized
// app (`fire._delegate` is undefined); getAuth() would throw "No Firebase App".
// Return a null-shaped auth object instead so callers degrade gracefully.
const NULL_AUTH = { currentUser: null };
const modularAuth = () => {
    try {
        const app = fire._delegate;
        return app ? getAuth(app) : NULL_AUTH;
    } catch (_e) {
        return NULL_AUTH;
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
    const otpauthUrl = secret.generateQrCodeUrl(user.email || user.uid, 'ResumePilot AI');
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
    const factors = multiFactor(user).enrolledFactors.filter(factor => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    return {
        enabled: factors.length > 0,
        enrolledFactors: factors.map(factor => ({ uid: factor.uid, displayName: factor.displayName || 'Authenticator app', enrollmentTime: factor.enrollmentTime }))
    };
}

export async function disableTotpEnrollment() {
    const user = modularAuth().currentUser;
    if (!user) throw new Error('Authentication required');
    await user.reload();
    const factor = multiFactor(user).enrolledFactors.find(item => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!factor) return { enabled: false, enrolledFactors: [] };
    await multiFactor(user).unenroll(factor);
    await user.getIdToken(true);
    return getTotpStatus();
}

export function getTotpSignInResolver(error) {
    if (error?.code !== 'auth/multi-factor-auth-required') return null;
    const resolver = getMultiFactorResolver(modularAuth(), error._delegate || error);
    const hint = resolver.hints.find(item => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    return hint ? { resolver, hint } : null;
}

export async function completeTotpSignIn(resolverState, verificationCode) {
    if (!resolverState?.resolver || !resolverState.hint || !/^\d{6}$/.test(String(verificationCode || ''))) {
        throw new Error('A valid authenticator code is required.');
    }
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(resolverState.hint.uid, String(verificationCode));
    return resolverState.resolver.resolveSignIn(assertion);
}
