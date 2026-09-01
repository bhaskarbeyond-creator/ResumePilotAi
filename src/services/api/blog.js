import { apiFetch } from './client.js';

export async function getBlogPosts(options = {}) {
    const params = new URLSearchParams(options).toString();
    const data = await apiFetch(`/api/blog-data${params ? `?${params}` : ''}`);
    return data.posts || [];
}

export async function getBlogPostById(id) {
    const data = await apiFetch(`/api/blog-data/${encodeURIComponent(id)}`);
    return data.post || null;
}

export async function getBlogPostBySlug(slug) {
    const data = await apiFetch(`/api/blog-data/slug/${encodeURIComponent(slug)}`);
    return data.post;
}

export async function saveBlogPost(id, postData) {
    const data = await apiFetch(`/api/blog-data/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify(postData)
    });
    return { success: true, post: data.post, postId: id, ...(data.post || {}) };
}

export async function deleteBlogPost(id, options = {}) {
    await apiFetch(`/api/blog-data/${encodeURIComponent(id)}`, { 
        method: 'DELETE',
        body: JSON.stringify(options)
    });
    return { success: true };
}

export default {
    getBlogPosts,
    getBlogPostById,
    getBlogPostBySlug,
    saveBlogPost,
    deleteBlogPost
};
