/**
 * Portfolio Gallery — Public Community Showcase
 *
 * Route: /portfolios
 * Public gallery of published candidate portfolios with search and category filters.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import { get, normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Search,
  Globe,
  Briefcase,
  Code,
  Palette,
  ExternalLink,
  User,
  Star,
  Filter,
} from 'lucide-react';

interface PortfolioItem {
  id: string;
  slug: string;
  fullName: string;
  headline: string;
  location: string;
  avatarUrl: string;
  theme: string;
  skills: { category: string; list: string[] }[];
  featured?: boolean;
  publishedAt: string;
}

const CATEGORIES = ['All', 'Engineering', 'Design', 'Product', 'Marketing', 'Data', 'DevOps'];

export function PortfolioGalleryPage() {
  const [portfolios, setPortfolios] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const fetchPortfolios = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ portfolios: PortfolioItem[] }>('/api/portfolios/public');
      setPortfolios(data.portfolios ?? []);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPortfolios();
  }, []);

  const filtered = portfolios.filter((p) => {
    const matchesSearch = !searchQuery || p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || p.headline.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || p.skills.some((s) => s.category === activeCategory);
    return matchesSearch && matchesCategory;
  });

  const allSkillCategories = Array.from(new Set(portfolios.flatMap((p) => p.skills.map((s) => s.category))));

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="text-3xl font-bold text-ink lg:text-4xl">Community Portfolio Gallery</h1>
          <p className="mt-2 text-ink-secondary">Discover talented professionals showcasing their work.</p>

          {/* Search */}
          <div className="mx-auto mt-6 max-w-md relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, role, or skills…"
              className="pl-9"
            />
          </div>

          {/* Category Filters */}
          <div className="mx-auto mt-6 max-w-5xl flex flex-wrap justify-center gap-2">
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
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchPortfolios()}>
              Retry
            </Button>
          </div>
        )}

        {loading && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <Globe className="mb-4 size-12 text-ink-subtle" />
            <h3 className="text-lg font-semibold text-ink">No portfolios found</h3>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              {searchQuery ? 'Try a different search term.' : 'Check back soon for new portfolios.'}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((portfolio) => (
              <Card key={portfolio.id} className="group overflow-hidden transition-all hover:shadow-lg cursor-pointer">
                {/* Avatar/Preview */}
                <div className="aspect-video bg-neutral-100 relative overflow-hidden">
                  <img
                    src={portfolio.avatarUrl}
                    alt={`${portfolio.fullName}'s portfolio`}
                    className="object-cover w-full h-full opacity-80 transition-opacity group-hover:opacity-100"
                  />
                  {portfolio.featured && (
                    <span className="absolute top-2 right-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                      Featured
                    </span>
                  )}
                </div>

                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-ink-muted mb-2">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-600">{portfolio.theme}</span>
                    <span className="flex items-center gap-1"><User className="size-3" />{portfolio.location}</span>
                  </div>

                  <h3 className="text-base font-semibold text-ink line-clamp-1 group-hover:text-brand-600 transition-colors">
                    {portfolio.fullName}
                  </h3>

                  <p className="mt-1 line-clamp-1 text-sm text-ink-muted">{portfolio.headline}</p>

                  {/* Skills preview */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {portfolio.skills.flatMap((s) => s.list).slice(0, 4).map((skill) => (
                      <span key={skill} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-ink-secondary">
                        {skill}
                      </span>
                    ))}
                    {portfolio.skills.flatMap((s) => s.list).length > 4 && (
                      <span className="text-xs text-ink-muted">+{portfolio.skills.flatMap((s) => s.list).length - 4} more</span>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      asChild
                    >
                      <a href={`/portfolio/${portfolio.slug}`}>
                        View Portfolio <ExternalLink className="size-3.5 ml-1.5" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}