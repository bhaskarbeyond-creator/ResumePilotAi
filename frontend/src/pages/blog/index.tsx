/**
 * Blog — public article listing (DISC-025).
 *
 * Reads the published articles from GET /api/blog-data (published-only on the
 * server) and the taxonomy from GET /api/blog-data/categories. Search, category
 * and pagination are server-side; the page never falls back to placeholder
 * articles, and a failed request is shown as a failure — not as "no articles".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import { get, normalizeError } from '@/lib/api-client';
import { parsePublicBlogPosts, type PublicBlogPost } from './blog-contract';
import { cn } from '@/lib/utils';
import {
  Search,
  Clock,
  BookOpen,
  User,
  CalendarDays,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  XCircle,
} from 'lucide-react';

const PAGE_SIZE = 9;
const SEARCH_DEBOUNCE_MS = 300;

interface PageMeta {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface Category {
  id: string;
  slug: string;
  name: string;
  postCount: number;
}

const EMPTY_META: PageMeta = { page: 1, limit: PAGE_SIZE, total: 0, hasMore: false };

export function BlogPage() {
  const [posts, setPosts] = useState<PublicBlogPost[]>([]);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_META);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [page, setPage] = useState(1);

  // Every article request carries a sequence number: a response that arrives
  // after a newer request started is discarded, so an older search can never
  // overwrite newer results.
  const requestSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadPosts = useCallback(async () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setState('loading');
    setErrorMessage(null);
    try {
      const params: Record<string, unknown> = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (search) params.search = search;
      if (activeCategory !== 'all') params.category = activeCategory;

      const data = await get<unknown>('/blog-data', params);
      if (seq !== requestSeq.current) return; // A newer request superseded this one.
      const parsed = parsePublicBlogPosts(data);
      const responseMeta = (data as { meta?: Partial<PageMeta> })?.meta;
      setPosts(parsed);
      setMeta({
        page: Number(responseMeta?.page) || page,
        limit: Number(responseMeta?.limit) || PAGE_SIZE,
        total: Number(responseMeta?.total) || parsed.length,
        hasMore: responseMeta?.hasMore === true,
      });
      setState('ready');
    } catch (error) {
      if (seq !== requestSeq.current) return;
      const failure = normalizeError(error);
      setPosts([]);
      setMeta(EMPTY_META);
      setState('error');
      setErrorMessage(failure.message || 'Articles are currently unavailable.');
    }
  }, [page, search, activeCategory]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  // Categories are a public taxonomy with published-post counts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await get<{ categories?: Category[] }>('/blog-data/categories');
        if (cancelled) return;
        setCategories(Array.isArray(data.categories) ? data.categories : []);
        setCategoriesFailed(false);
      } catch {
        // The filter row simply falls back to "All"; the article request (and its
        // error state) is unaffected.
        if (!cancelled) {
          setCategories([]);
          setCategoriesFailed(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totalPages = Math.max(1, Math.ceil(meta.total / Math.max(1, meta.limit)));
  const filtering = search !== '' || activeCategory !== 'all';

  return (
    <div className="min-h-screen bg-canvas">
      <div className="border-b border-border bg-surface px-4 py-12 text-center">
        <h1 className="text-3xl font-bold text-ink lg:text-4xl">Career Insights Blog</h1>
        <p className="mt-2 text-ink-secondary">Expert advice on resumes, interviews, and career growth.</p>

        <div className="relative mx-auto mt-6 max-w-md">
          <label htmlFor="blog-search" className="sr-only">Search articles</label>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <Input
            id="blog-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search articles…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="border-b border-border bg-surface px-4">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto py-3" role="group" aria-label="Filter articles by category">
          <button
            type="button"
            onClick={() => { setActiveCategory('all'); setPage(1); }}
            aria-pressed={activeCategory === 'all'}
            className={cn(
              'whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
              activeCategory === 'all' ? 'bg-brand-600 text-white' : 'text-ink-secondary hover:bg-neutral-100',
            )}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => { setActiveCategory(category.slug); setPage(1); }}
              aria-pressed={activeCategory === category.slug}
              className={cn(
                'whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                activeCategory === category.slug ? 'bg-brand-600 text-white' : 'text-ink-secondary hover:bg-neutral-100',
              )}
            >
              {category.name}
              <span className="ml-1.5 text-xs opacity-70">{category.postCount}</span>
            </button>
          ))}
        </div>
        {categoriesFailed && (
          <p className="mx-auto max-w-5xl pb-2 text-[11px] text-ink-muted">
            Categories could not be loaded, so only “All” is offered. Articles are still available.
          </p>
        )}
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {state === 'loading' && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-72" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-error-200 bg-error-50 px-6 py-12 text-center">
            <AlertTriangle className="size-10 text-error-600" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-ink">Articles are currently unavailable</h3>
            <p className="max-w-sm text-sm text-ink-muted">{errorMessage}</p>
            <Button variant="outline" onClick={() => void loadPosts()}>
              <RefreshCw aria-hidden="true" /> Try again
            </Button>
          </div>
        )}

        {state === 'ready' && posts.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <BookOpen className="mb-4 size-12 text-ink-subtle" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-ink">
              {filtering ? 'No articles match your search' : 'No articles published yet'}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              {filtering
                ? 'Try a different search term, or choose another category.'
                : 'Check back soon for new content.'}
            </p>
            {filtering && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => { setSearchInput(''); setSearch(''); setActiveCategory('all'); setPage(1); }}
              >
                <XCircle aria-hidden="true" /> Clear search and filters
              </Button>
            )}
          </div>
        )}

        {state === 'ready' && posts.length > 0 && (
          <>
            <p className="mb-4 text-xs text-ink-muted" role="status">
              {filtering
                ? `Showing ${posts.length} of ${meta.total} matching articles`
                : `Showing ${posts.length} of ${meta.total} articles`}
            </p>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <Card key={post.id} className="group overflow-hidden transition-all hover:shadow-lg">
                  <div className="relative aspect-video overflow-hidden bg-neutral-100">
                    <div className="absolute inset-0 flex items-center justify-center bg-brand-50">
                      <BookOpen className="size-8 text-brand-300" aria-hidden="true" />
                    </div>
                    {post.featured && (
                      <span className="absolute right-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                        Featured
                      </span>
                    )}
                  </div>

                  <CardContent className="p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-600">
                        {post.category || 'General'}
                      </span>
                      {post.readTime !== null && (
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" aria-hidden="true" />{post.readTime} min read
                        </span>
                      )}
                    </div>

                    <h3 className="line-clamp-2 text-base font-semibold text-ink transition-colors group-hover:text-brand-600">
                      {post.title}
                    </h3>

                    <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{post.excerpt}</p>

                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                      <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <User className="size-3" aria-hidden="true" />
                        {post.author || 'IME365 Editorial'}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <CalendarDays className="size-3" aria-hidden="true" />
                        {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : 'Date unavailable'}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {(meta.total > meta.limit) && (
              <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Article pages">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft aria-hidden="true" /> Previous
                </Button>
                <p className="text-xs text-ink-muted" aria-live="polite">
                  Page {page} of {totalPages}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!meta.hasMore}
                >
                  Next <ChevronRight aria-hidden="true" />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
