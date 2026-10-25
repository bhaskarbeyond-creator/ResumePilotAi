/**
 * Blog — Article listing and reading
 *
 * Public-facing blog with article cards, categories, and reading view.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import { get } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Search,
  Clock,
  BookOpen,
  User,
  CalendarDays,
} from 'lucide-react';

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  category: string;
  readTime: number;
  publishedAt: string;
  coverImage?: string;
  tags: string[];
  featured?: boolean;
}

const CATEGORIES = ['All', 'Career Tips', 'Resume Writing', 'Interview Prep', 'Job Search', 'Industry News'];

export function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await get<{ posts: BlogPost[] }>('/blog/posts');
        if (!cancelled) setPosts(data.posts ?? []);
      } catch {
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const filtered = posts.filter((p) => {
    const matchesSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase()) || p.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="border-b border-border bg-surface px-4 py-12 text-center">
        <h1 className="text-3xl font-bold text-ink lg:text-4xl">Career Insights Blog</h1>
        <p className="mt-2 text-ink-secondary">Expert advice on resumes, interviews, and career growth.</p>

        <div className="mx-auto mt-6 max-w-md relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="border-b border-border bg-surface px-4">
        <div className="mx-auto max-w-5xl flex gap-1 overflow-x-auto py-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                activeCategory === cat
                  ? 'bg-brand-600 text-white'
                  : 'text-ink-secondary hover:bg-neutral-100',
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        {loading && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <BookOpen className="mb-4 size-12 text-ink-subtle" />
            <h3 className="text-lg font-semibold text-ink">No articles found</h3>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              {searchQuery ? 'Try a different search term.' : 'Check back soon for new content.'}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((post) => (
              <Card key={post.id} className="group overflow-hidden transition-all hover:shadow-lg cursor-pointer">
                {/* Cover */}
                <div className="aspect-video bg-neutral-100 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center bg-brand-50">
                    <BookOpen className="size-8 text-brand-300" />
                  </div>
                  {post.featured && (
                    <span className="absolute top-2 right-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                      Featured
                    </span>
                  )}
                </div>

                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-ink-muted mb-2">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-600">{post.category}</span>
                    <span className="flex items-center gap-1"><Clock className="size-3" />{post.readTime} min read</span>
                  </div>

                  <h3 className="text-base font-semibold text-ink line-clamp-2 group-hover:text-brand-600 transition-colors">
                    {post.title}
                  </h3>

                  <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{post.excerpt}</p>

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <User className="size-3" />
                      {post.author}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <CalendarDays className="size-3" />
                      {new Date(post.publishedAt).toLocaleDateString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
