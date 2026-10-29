export interface PublicBlogPost {
  id: string; title: string; excerpt: string; author: string; category: string; readTime: number | null;
  publishedAt: string | null; coverImage?: string; tags: string[]; featured?: boolean;
}
export function parsePublicBlogPosts(data: unknown): PublicBlogPost[] {
  if (!data || typeof data !== 'object' || !('success' in data) || data.success !== true || !('posts' in data) || !Array.isArray(data.posts)) throw new Error('Invalid blog response');
  return data.posts.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid blog response');
    const p = value as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id || typeof p.title !== 'string' || !p.title || p.published !== true) throw new Error('Invalid published article');
    const stringOrEmpty = (v: unknown) => typeof v === 'string' ? v : '';
    const date = p.publishedAt || p.published_at || p.createdAt || p.created_at;
    const publishedAt = typeof date === 'string' && Number.isFinite(Date.parse(date)) ? date : null;
    const readTime = typeof p.readTime === 'number' && Number.isFinite(p.readTime) && p.readTime > 0 ? p.readTime : null;
    return { id:p.id, title:p.title, excerpt:stringOrEmpty(p.excerpt), author:stringOrEmpty(p.author), category:stringOrEmpty(p.category), readTime, publishedAt, tags:Array.isArray(p.tags) ? p.tags.filter((tag): tag is string => typeof tag === 'string') : [], featured:p.featured === true || p.featured === 1 };
  });
}
