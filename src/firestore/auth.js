import fire from '../conf/fire';

/** Refresh non-sensitive metadata for the currently authenticated UID only. */
export async function updateUserOnLogin(userId, { photoURL, displayName, authProvider } = {}) {
    if (!userId || fire.auth().currentUser?.uid !== userId) return;
    try {
        const { saveCurrentUserProfile } = await import('../services/api/users.js');
        const updates = {};
        if (photoURL) updates.photoURL = photoURL;
        if (displayName) {
            const parts = displayName.trim().split(/\s+/);
            updates.firstname = parts[0] || '';
            updates.lastname = parts.slice(1).join(' ');
        }
        if (authProvider) updates.authProvider = authProvider;
        await saveCurrentUserProfile({ userId, ...updates });
    } catch (error) {
        console.warn('User login metadata could not be refreshed:', error?.code || error?.message);
    }
}

/**
 * Create the owner-scoped user profile for the cryptographically authenticated UID.
 * MySQL (via the backend API) is the authoritative profile store; the browser
 * never queries another user by email, copies another UID's data, or inherits
 * entitlement. There is no Firestore fallback.
 */
async function addUser(userId, firstname, lastname, email, { authProvider = 'email', photoURL = null } = {}) {
    const currentUser = fire.auth().currentUser;
    if (!currentUser || currentUser.uid !== userId) throw new Error('Authenticated user mismatch.');
    const normalizedEmail = String(currentUser.email || email || '').trim().toLowerCase();
    const displayParts = String(currentUser.displayName || '').trim().split(/\s+/).filter(Boolean);
    const first = String(firstname && firstname !== 'User' ? firstname : displayParts[0] || normalizedEmail.split('@')[0] || 'User').slice(0, 120);
    const last = String(lastname && lastname !== 'User' ? lastname : displayParts.slice(1).join(' ')).slice(0, 120);

    // 1. Synchronize to MySQL active primary via API (authoritative)
    let existed = true;
    try {
        const usersApi = await import('../services/api/users.js');
        const existing = await usersApi.getUserProfile(userId);
        existed = Boolean(existing && existing.userId === userId);
        await usersApi.saveCurrentUserProfile({
            userId, firstname: first, lastname: last, email: normalizedEmail,
            membership: 'Basic', authProvider,
            ...(photoURL ? { photoURL } : {}),
        });
    } catch (apiErr) {
        console.warn('[auth] Profile API save bypassed:', apiErr.message);
    }

    return { success: true, isNewUser: !existed, message: existed ? 'User already exists' : 'User created successfully' };
}

export async function setA() {
    throw new Error('Client-side role assignment is disabled. Provision SUPER_ADMIN out-of-band or use the audited server role endpoint.');
}

export default addUser;
