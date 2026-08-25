import { apiFetch } from './client';

export async function getCovers() {
    const data = await apiFetch('/api/covers');
    return data.covers || [];
}

export async function getCover(coverId) {
    const data = await apiFetch(`/api/covers/${coverId}`);
    return data.cover;
}

export async function saveCover(coverId, coverData) {
    const data = await apiFetch(`/api/covers/${coverId}`, {
        method: 'POST',
        body: JSON.stringify(coverData)
    });
    return data.cover;
}

export async function deleteCover(coverId) {
    await apiFetch(`/api/covers/${coverId}`, { method: 'DELETE' });
    return true;
}
