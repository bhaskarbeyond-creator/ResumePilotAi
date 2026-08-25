import { apiFetch } from './client';

export async function getCurrentUserProfile() {
    const data = await apiFetch('/api/users-data/profile');
    return data.user;
}

export async function saveCurrentUserProfile(profileData) {
    const data = await apiFetch('/api/users-data/profile', {
        method: 'POST',
        body: JSON.stringify(profileData)
    });
    return data.user;
}

export async function getUserProfile(userId) {
    const data = await apiFetch(`/api/users-data/${userId}`);
    return data.user;
}
