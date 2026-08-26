import fire from '../conf/fire';
import firebase from 'firebase/compat/app';

/** Refresh non-sensitive metadata for the currently authenticated UID only. */
export async function updateUserOnLogin(userId, { photoURL, displayName, authProvider } = {}) {
    if (!userId || fire.auth().currentUser?.uid !== userId) return;
    const updates = { lastLoginAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (photoURL) updates.photoURL = photoURL;
    if (displayName) {
        const parts = displayName.trim().split(/\s+/);
        updates.firstname = parts[0] || '';
        updates.lastname = parts.slice(1).join(' ');
    }
    if (authProvider) updates.authProvider = authProvider;
    try { await fire.firestore().collection('users').doc(userId).set(updates, { merge: true }); }
    catch (error) { console.warn('User login metadata could not be refreshed:', error.code || error.message); }
}

/**
 * Create the owner-scoped user profile for the cryptographically authenticated UID.
 * Provider account linking and identity merging are server/provider workflows; the browser
 * never queries another user by email, copies another UID's data, or inherits entitlement.
 */
async function addUser(userId, firstname, lastname, email, { authProvider = 'email', photoURL = null } = {}) {
    const currentUser = fire.auth().currentUser;
    if (!currentUser || currentUser.uid !== userId) throw new Error('Authenticated user mismatch.');
    const normalizedEmail = String(currentUser.email || email || '').trim().toLowerCase();
    const displayParts = String(currentUser.displayName || '').trim().split(/\s+/).filter(Boolean);
    const first = String(firstname && firstname !== 'User' ? firstname : displayParts[0] || normalizedEmail.split('@')[0] || 'User').slice(0, 120);
    const last = String(lastname && lastname !== 'User' ? lastname : displayParts.slice(1).join(' ')).slice(0, 120);

    // 1. Synchronize to MariaDB active primary via API
    try {
        const { saveCurrentUserProfile } = await import('../services/api/users.js');
        await saveCurrentUserProfile({
            userId, firstname: first, lastname: last, email: normalizedEmail,
            membership: 'Basic', authProvider,
            ...(photoURL ? { photoURL } : {}),
        });
    } catch (apiErr) {
        console.warn('[auth] Profile API save bypassed:', apiErr.message);
    }

    // 2. Direct Firestore fallback (resilient to quota/permission failures)
    try {
        const reference = fire.firestore().collection('users').doc(userId);
        const snapshot = await reference.get();
        if (snapshot.exists) {
            await updateUserOnLogin(userId, { photoURL, displayName: currentUser.displayName, authProvider });
            return { success: true, isNewUser: false, message: 'User already exists' };
        }
        await reference.set({
            userId, firstname: first, lastname: last, email: normalizedEmail,
            membership: 'Basic', authProvider,
            ...(photoURL ? { photoURL } : {}),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return { success: true, isNewUser: true, message: 'User created successfully' };
    } catch (dbErr) {
        console.warn('[auth] Direct Firestore addUser skipped non-fatal error:', dbErr.code || dbErr.message);
        return { success: true, isNewUser: false, message: 'User authenticated successfully' };
    }
}

export async function setA() {
    throw new Error('Client-side role assignment is disabled. Provision SUPER_ADMIN out-of-band or use the audited server role endpoint.');
}

export default addUser;
