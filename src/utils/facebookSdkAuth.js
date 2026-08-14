/**
 * Direct Facebook SDK sessions are intentionally disabled because unsigned local browser
 * profiles are not authentication. Configure Facebook through Firebase Auth instead.
 */
export async function directFacebookAuthFallback(_closeModal, throwError) {
    const message = 'Facebook sign-in is temporarily unavailable. The Firebase Facebook provider must be configured by an administrator.';
    if (throwError) { throwError(message); return false; }
    throw new Error(message);
}
