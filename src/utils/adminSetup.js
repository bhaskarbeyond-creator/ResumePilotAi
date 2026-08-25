import fire from '../conf/fire';

export async function checkCurrentUserAdminStatus() {
    const user = fire.auth().currentUser;
    if (!user) return false;
    try {
        const token = await user.getIdTokenResult();
        return ['ADMIN', 'SUPER_ADMIN'].includes(String(token.claims.role || '').toUpperCase());
    } catch {
        return false;
    }
}

export async function makeCurrentUserAdmin() {
    throw new Error('Client-side role assignment is disabled.');
}

/** Read-only diagnostic; never writes fabricated public statistics. */
export async function testFrontendStatsPermissions() {
    try {
        const res = await fetch('/api/health');
        return { success: res.ok, exists: true };
    } catch (error) {
        return { success: false, error: error.message || 'READ_FAILED' };
    }
}

export async function cleanupAuthState() {
    try {
        if (fire.auth().currentUser) await fire.auth().signOut();
        return fire.auth().currentUser === null;
    } catch {
        return false;
    }
}

export async function checkIfAdminEmailExists(_adminEmail) {
    // Firebase intentionally prevents client-side account enumeration.
    return false;
}

export async function runAdminDiagnostics() {
    if (!await checkCurrentUserAdminStatus()) return { success: false, error: 'ADMIN_REQUIRED' };
    return testFrontendStatsPermissions();
}
