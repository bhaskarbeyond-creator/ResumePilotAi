import { apiFetch } from './client.js';

export async function getBlogPosts(options = {}) {
    const params = new URLSearchParams(options).toString();
    const data = await apiFetch(`/api/blog-data${params ? `?${params}` : ''}`);
    return data.posts || [];
}

export async function getBlogPostBySlug(slug) {
    const data = await apiFetch(`/api/blog-data/slug/${encodeURIComponent(slug)}`);
    return data.post;
}

export async function saveBlogPost(id, postData) {
    const data = await apiFetch(`/api/blog-data/${id}`, {
        method: 'POST',
        body: JSON.stringify(postData)
    });
    return data.post;
}

export async function deleteBlogPost(id) {
    await apiFetch(`/api/blog-data/${id}`, { method: 'DELETE' });
    return true;
}
