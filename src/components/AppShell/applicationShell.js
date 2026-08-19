/**
 * Application-shell visibility is a function of auth readiness, not of
 * which builder step is mounted. AuthWrapper already withholds routes until
 * Firebase onAuthStateChanged has fired (authReady). After that:
 *
 *   authenticated → ProfileDisplay + dashboardContentWrapper always mount
 *   guest         → builder may still run without the dashboard shell
 *
 * This decision must not depend on Firestore profile, module flags, or
 * resume-draft hydration. Those load inside the builder after the shell.
 */
export function resolveApplicationShell(authState) {
    const authReady = authState?.authReady === true;
    const userId = authState?.user?.uid || authState?.userId || null;
    if (!authReady) return { phase: 'wait', mountShell: false, userId: null };
    if (userId) return { phase: 'authenticated', mountShell: true, userId };
    return { phase: 'guest', mountShell: false, userId: null };
}

export function isApplicationShellRoute(pathname = '') {
    const path = String(pathname).toLowerCase();
    return path.startsWith('/build-resume') || path.startsWith('/create-resume');
}
