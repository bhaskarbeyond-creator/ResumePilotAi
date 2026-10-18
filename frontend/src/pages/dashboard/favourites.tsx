/**
 * Favourites Dashboard
 *
 * Saved jobs and documents that the candidate has bookmarked.
 * Supports filtering by type (jobs vs documents), search, and bulk actions.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import {
  Star,
  Briefcase,
  FileText,
  Search,
  Trash2,
  Filter,
  ChevronRight,
  MapPin,
  DollarSign,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useFavourites, useRemoveFavourite, type FavouriteItem } from '@/hooks/use-api-hooks';

type FavouriteFilter = 'all' | 'jobs' | 'documents';

const badgeConfigs: Record<string, string> = {
  green: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  blue: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  purple: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  red: 'bg-red-500/10 text-red-600 border-red-500/20',
  gray: 'bg-neutral-200 text-neutral-600 border-neutral-300',
};

function getBadgeConfig(_badge: string, tone: string) {
  return badgeConfigs[tone] || badgeConfigs.gray;
}

export function FavouritesPage() {
  const { data: favourites = [], isLoading, error, refetch } = useFavourites();
  const [activeFilter, setActiveFilter] = useState<FavouriteFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const removeMutation = useRemoveFavourite();

  const filteredFavourites = useMemo(() => {
    return favourites.filter((item) => {
      // Type filter
      if (activeFilter === 'jobs' && item.kind !== 'job') return false;
      if (activeFilter === 'documents' && item.kind !== 'document') return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesCompany = item.company?.toLowerCase().includes(query) ?? false;
        const matchesLocation = item.location.toLowerCase().includes(query);
        if (!matchesTitle && !matchesCompany && !matchesLocation) return false;
      }

      return true;
    });
  }, [favourites, activeFilter, searchQuery]);

  const jobs = filteredFavourites.filter((f) => f.kind === 'job');
  const documents = filteredFavourites.filter((f) => f.kind === 'document');

  const toggleSelect = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredFavourites.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredFavourites.map((f) => f.id)));
    }
  };

  const handleBulkRemove = async () => {
    for (const id of selectedItems) {
      await removeMutation.mutateAsync(id);
    }
    setSelectedItems(new Set());
    refetch();
  };

  const handleRemove = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await removeMutation.mutateAsync(id);
    refetch();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-edge pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
            <Star className="size-6 fill-amber-400 text-amber-500" />
            Saved Items
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Your bookmarked job opportunities and resume documents. {favourites.length} total saved.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="text-xs gap-1.5"
            aria-label={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
          >
            {viewMode === 'grid' ? (
              <>
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="9" rx="1" />
                  <rect x="14" y="3" width="7" height="9" rx="1" />
                  <rect x="3" y="15" width="7" height="9" rx="1" />
                  <rect x="14" y="15" width="7" height="9" rx="1" />
                </svg>
                List
              </>
            ) : (
              <>
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
                Grid
              </>
            )}
          </Button>

          {selectedItems.size > 0 && (
            <Button variant="outline" size="sm" onClick={handleBulkRemove} className="text-xs gap-1.5" disabled={removeMutation.isPending}>
              <Trash2 className="size-3.5" />
              Remove Selected ({selectedItems.size})
            </Button>
          )}
        </div>
      </div>

      {/* ─── Error State ─── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700" role="alert">
          <XCircle className="size-4 shrink-0" />
          Failed to load favourites. Please check your connection and try again.
        </div>
      )}

      {/* ─── Filter & Search Bar ─── */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {(['all', 'jobs', 'documents'] as FavouriteFilter[]).map((filter) => {
            const count = filter === 'all' ? favourites.length : filter === 'jobs' ? jobs.length : documents.length;
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  'rounded-lg px-3 py-1.5 font-medium text-xs transition-colors whitespace-nowrap flex items-center gap-1.5',
                  activeFilter === filter
                    ? 'bg-accent text-white'
                    : 'text-ink-muted hover:bg-canvas bg-transparent'
                )}
              >
                <span className="capitalize">{filter}</span>
                <span className="inline-flex items-center justify-center size-5 rounded-full text-[10px] font-bold bg-black/10">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="size-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search by title, company, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs h-9"
          />
        </div>
      </div>

      {/* ─── Content ─── */}
      {isLoading && favourites.length === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: viewMode === 'grid' ? 6 : 8 }).map((_, i) => (
            <Skeleton key={i} className={viewMode === 'grid' ? 'h-48' : 'h-20'} />
          ))}
        </div>
      ) : filteredFavourites.length === 0 ? (
        <div className="border border-edge rounded-2xl bg-surface p-12 text-center">
          <Star className="size-16 text-ink-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-ink mb-2">
            {searchQuery ? 'No matches found' : 'No saved items yet'}
          </h3>
          <p className="text-sm text-ink-muted mb-6 max-w-md mx-auto">
            {searchQuery
              ? 'Try adjusting your search or filter criteria.'
              : 'Bookmark jobs from the job board or save resume versions from the builder to see them here.'}
          </p>
          {!searchQuery && (
            <Button size="sm" asChild className="text-xs gap-1.5">
              <a href="/jobs">
                <Briefcase className="size-3.5" />
                Browse Jobs
              </a>
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Jobs Section */}
          {jobs.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-ink-muted flex items-center gap-2">
                <Briefcase className="size-4 text-accent" />
                Saved Jobs ({jobs.length})
              </h2>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {jobs.map((job) => (
                    <FavouriteJobCard key={job.id} job={job} selected={selectedItems.has(job.id)} onToggleSelect={toggleSelect} onRemove={handleRemove} />
                  ))}
                </div>
              ) : (
                <div className="border border-edge rounded-xl bg-surface overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-edge bg-canvas-soft/70">
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={selectedItems.size === jobs.length && selectedItems.size > 0}
                            onChange={toggleSelectAll}
                            className="size-4 text-accent rounded"
                          />
                        </th>
                        <th className="p-3.5 font-semibold text-ink">Position</th>
                        <th className="p-3.5 font-semibold text-ink">Company</th>
                        <th className="p-3.5 font-semibold text-ink">Location</th>
                        <th className="p-3.5 font-semibold text-ink">Salary</th>
                        <th className="p-3.5 font-semibold text-ink">Saved</th>
                        <th className="p-3.5 font-semibold text-ink text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge/60">
                      {jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-canvas-soft/20 transition-colors">
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedItems.has(job.id)}
                              onChange={() => toggleSelect(job.id)}
                              className="size-4 text-accent rounded mx-auto"
                            />
                          </td>
                          <td className="p-3.5 font-medium text-ink">{job.title}</td>
                          <td className="p-3.5 text-ink-muted">{job.company}</td>
                          <td className="p-3.5 flex items-center gap-1 text-ink-muted text-[11px]">
                            <MapPin className="size-3" />
                            {job.location}
                          </td>
                          <td className="p-3.5 text-ink">{job.salary}</td>
                          <td className="p-3.5 text-ink-muted text-[11px]">{job.createdAt}</td>
                          <td className="p-3.5 text-right">
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-ink-muted hover:text-red-500" onClick={(e) => handleRemove(job.id, e)} disabled={removeMutation.isPending}>
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Documents Section */}
          {documents.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-edge">
              <h2 className="text-sm font-semibold text-ink-muted flex items-center gap-2">
                <FileText className="size-4 text-accent" />
                Saved Documents ({documents.length})
              </h2>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documents.map((doc) => (
                    <FavouriteDocCard key={doc.id} doc={doc} selected={selectedItems.has(doc.id)} onToggleSelect={toggleSelect} onRemove={handleRemove} />
                  ))}
                </div>
              ) : (
                <div className="border border-edge rounded-xl bg-surface overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-edge bg-canvas-soft/70">
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={selectedItems.size === documents.length && selectedItems.size > 0}
                            onChange={toggleSelectAll}
                            className="size-4 text-accent rounded"
                          />
                        </th>
                        <th className="p-3.5 font-semibold text-ink">Document</th>
                        <th className="p-3.5 font-semibold text-ink">Type</th>
                        <th className="p-3.5 font-semibold text-ink">Status</th>
                        <th className="p-3.5 font-semibold text-ink">Saved</th>
                        <th className="p-3.5 font-semibold text-ink text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge/60">
                      {documents.map((doc) => (
                        <tr key={doc.id} className="hover:bg-canvas-soft/20 transition-colors">
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedItems.has(doc.id)}
                              onChange={() => toggleSelect(doc.id)}
                              className="size-4 text-accent rounded mx-auto"
                            />
                          </td>
                          <td className="p-3.5 font-medium text-ink">{doc.title}</td>
                          <td className="p-3.5 capitalize">{doc.documentType}</td>
                          <td className="p-3.5">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border', getBadgeConfig(doc.badge, doc.badgeTone))}>
                              {doc.badge}
                            </span>
                          </td>
                          <td className="p-3.5 text-ink-muted text-[11px]">{doc.createdAt}</td>
                          <td className="p-3.5 text-right">
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-ink-muted hover:text-red-500" onClick={(e) => handleRemove(doc.id, e)} disabled={removeMutation.isPending}>
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Job Card Component ─── */
function FavouriteJobCard({
  job,
  selected,
  onToggleSelect,
  onRemove,
}: {
  job: FavouriteItem;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string, e?: React.MouseEvent) => void;
}) {
  return (
    <Card className={cn('border-edge shadow-sm flex flex-col', selected && 'ring-2 ring-accent/50')}>
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-ink truncate">{job.title}</h3>
            <p className="text-xs text-ink-muted truncate">{job.company}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(job.id)}
              className="size-4 text-accent rounded"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-ink-muted mb-3">
          <span className="flex items-center gap-1">
            <MapPin className="size-3" />
            {job.location}
          </span>
          <span className="flex items-center gap-1">
            <DollarSign className="size-3" />
            {job.salary}
          </span>
        </div>

        {job.summary && (
          <p className="text-xs text-ink-muted line-clamp-2 mb-3 flex-1">{job.summary}</p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-edge/50">
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border', getBadgeConfig(job.badge, job.badgeTone))}>
            {job.badge}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-ink-muted hover:text-red-500" onClick={(e) => onRemove(job.id, e)}>
            Remove
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ─── Document Card Component ─── */
function FavouriteDocCard({
  doc,
  selected,
  onToggleSelect,
  onRemove,
}: {
  doc: FavouriteItem;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string, e?: React.MouseEvent) => void;
}) {
  return (
    <Card className={cn('border-edge shadow-sm flex flex-col', selected && 'ring-2 ring-accent/50')}>
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="size-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
              {doc.documentType === 'resume' ? <FileText className="size-5" /> : <FileText className="size-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-ink truncate">{doc.title}</h3>
              <p className="text-xs text-ink-muted capitalize">{doc.documentType}</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(doc.id)}
            className="size-4 text-accent rounded shrink-0"
          />
        </div>

        {doc.summary && (
          <p className="text-xs text-ink-muted line-clamp-2 mb-3 flex-1">{doc.summary}</p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-edge/50">
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border', getBadgeConfig(doc.badge, doc.badgeTone))}>
            {doc.badge}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-ink-muted hover:text-red-500" onClick={(e) => onRemove(doc.id, e)}>
            Remove
          </Button>
        </div>
      </div>
    </Card>
  );
}