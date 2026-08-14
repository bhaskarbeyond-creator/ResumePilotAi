/**
 * Direct Google SDK sessions cannot mint Firebase ID tokens and therefore cannot cross
 * the backend/Firestore trust boundary. Keep the compatibility entry point fail-closed;
 * administrators must configure Google as a Firebase Auth provider.
 */
export async function directGoogleAuthFallback(_closeModal, throwError) {
    const message = 'Google sign-in is temporarily unavailable. The Firebase Google provider must be configured by an administrator.';
    if (throwError) { throwError(message); return false; }
    throw new Error(message);
}
