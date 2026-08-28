import fire from '../../conf/fire';
import { apiFetch } from './client.js';

export async function getCurrentUserProfile() {
    const data = await apiFetch('/api/users-data/profile');
    return data.user;
}

export async function saveCurrentUserProfile(profileData, { expectedRevision } = {}) {
    const source = profileData && typeof profileData === 'object' ? profileData : {};
    const profile = source.profile && typeof source.profile === 'object'
        ? { ...source.profile }
        : Object.fromEntries(Object.entries(source).filter(([key]) => !['userId', 'expectedRevision'].includes(key)));
    let revision = expectedRevision ?? source.expectedRevision ?? profile.revision;
    if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 0) {
        try {
            const current = await getCurrentUserProfile();
            revision = Number(current?.profile?.revision ?? current?.revision ?? 0);
        } catch (error) {
            if (error?.status !== 404) throw error;
            revision = 0;
        }
    }
    delete profile.revision;
    const data = await apiFetch('/api/users-data/profile', {
        method: 'POST',
        body: JSON.stringify({
            expectedRevision: Number(revision),
            ...(source.userId ? { userId: source.userId } : {}),
            profile,
        }),
    });
    return data.user;
}

export async function getUserProfile(userId) {
    const data = await apiFetch(`/api/users-data/${encodeURIComponent(userId)}`);
    return data.user;
}

/**
 * Refresh non-sensitive MariaDB profile metadata for the authenticated owner.
 * Firebase Authentication remains the identity authority; provider linkage is
 * intentionally derived server-side from the verified token rather than accepted
 * as client-authored profile state.
 */
export async function updateUserOnLogin(userId, { photoURL, displayName, authProvider } = {}) {
    const currentUser = fire.auth().currentUser;
    if (!currentUser || currentUser.uid !== userId) {
        throw new Error('Authenticated user mismatch.');
    }

    const updates = {};
    if (photoURL) updates.photoURL = photoURL;
    if (displayName) {
        const parts = displayName.trim().split(/\s+/);
        updates.firstname = parts[0] || '';
        updates.lastname = parts.slice(1).join(' ');
    }
    void authProvider;
    return saveCurrentUserProfile({ userId, ...updates });
}

/**
 * Create or refresh the MariaDB profile for the cryptographically authenticated
 * Firebase UID. Registration does not report success unless this authoritative
 * application-data write succeeds.
 */
async function addUser(userId, firstname, lastname, email, { authProvider = 'email', photoURL = null } = {}) {
    const currentUser = fire.auth().currentUser;
    if (!currentUser || currentUser.uid !== userId) {
        throw new Error('Authenticated user mismatch.');
    }

    const normalizedEmail = String(currentUser.email || email || '').trim().toLowerCase();
    const displayParts = String(currentUser.displayName || '').trim().split(/\s+/).filter(Boolean);
    const first = String(firstname && firstname !== 'User'
        ? firstname
        : displayParts[0] || normalizedEmail.split('@')[0] || 'User').slice(0, 120);
    const last = String(lastname && lastname !== 'User'
        ? lastname
        : displayParts.slice(1).join(' ')).slice(0, 120);

    let existing = null;
    try {
        existing = await getUserProfile(userId);
    } catch (error) {
        if (error?.status !== 404) throw error;
    }
    const existed = Boolean(existing && existing.userId === userId);
    const expectedRevision = Number(existing?.profile?.revision ?? existing?.revision ?? 0);
    await saveCurrentUserProfile({
        userId,
        firstname: first,
        lastname: last,
        email: normalizedEmail,
        ...(photoURL ? { photoURL } : {}),
    }, { expectedRevision });

    void authProvider;
    return {
        success: true,
        isNewUser: !existed,
        message: existed ? 'User profile refreshed' : 'User profile created successfully',
    };
}

export default addUser;
