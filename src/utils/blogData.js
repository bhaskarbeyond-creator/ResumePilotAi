export const BLOG_STATUSES = Object.freeze(['draft', 'pending', 'approved', 'rejected', 'scheduled']);
const plain = (value, max) => String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, max);

export function normalizeBlogImageUrl(value) {
    const raw = plain(value, 2048);
    if (!raw) return '';
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    try {
        const parsed = new URL(raw);
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
    } catch {
        return '';
    }
}

export function normalizeBlogPost(input = {}) {
    const post = input && typeof input === 'object' ? input : {};
    return {
        title: plain(post.title, 200),
        slug: plain(post.slug, 180),
        content: String(post.content || '').slice(0, 500_000),
        excerpt: plain(post.excerpt, 500),
        categoryId: plain(post.categoryId, 128),
        tags: [...new Set((Array.isArray(post.tags) ? post.tags : []).map(tag => plain(tag, 60)).filter(Boolean))].slice(0, 30),
        featuredImage: normalizeBlogImageUrl(post.featuredImage),
        seoTitle: plain(post.seoTitle || post.title, 120),
        seoDescription: plain(post.seoDescription || post.excerpt, 320),
        status: BLOG_STATUSES.includes(post.status) ? post.status : 'draft',
        revision: Math.max(0, Number(post.revision) || 0),
        scheduledAt: post.scheduledAt || null,
    };
}

export function validateBlogTransition(currentStatus, nextStatus, { isAdmin = false } = {}) {
    if (!BLOG_STATUSES.includes(nextStatus)) return false;
    if (isAdmin) return true;
    return ['draft', 'pending', 'rejected'].includes(currentStatus) && ['draft', 'pending'].includes(nextStatus);
}

export function blogPostFitsFirestore(input) {
    return new Blob([JSON.stringify(input || {})]).size <= 900_000;
}
