import { apiFetch } from './client.js';

export async function getCustomPages(options = {}) {
    const params = new URLSearchParams(options).toString();
    const data = await apiFetch(`/api/cms-pages${params ? `?${params}` : ''}`);
    return data.pages || [];
}

export async function getCustomPageBySlug(slug) {
    const data = await apiFetch(`/api/cms-pages/slug/${encodeURIComponent(slug)}`);
    return data.page;
}

export async function saveCustomPage(id, pageData) {
    const data = await apiFetch(`/api/cms-pages/${id}`, {
        method: 'POST',
        body: JSON.stringify(pageData)
    });
    return data.page;
}

export async function deleteCustomPage(id) {
    await apiFetch(`/api/cms-pages/${id}`, { method: 'DELETE' });
    return true;
}

export async function getTrustedBy() {
    const data = await apiFetch('/api/cms-pages/trusted-by/list');
    return data.trustedBy || [];
}
