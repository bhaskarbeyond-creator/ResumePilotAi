/**
 * CMS Blog Articles Management Tab
 *
 * Binds to:
 * - GET /blog/posts (article listings, categories, tags)
 * - Navigation links to /blog-editor and /blog-editor/:postId
 *
 * INVARIANTS:
 * 1. IN-APP BLOG EDITOR PRESERVATION: Direct launch to /blog-editor for full authoring.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { get, del } from '@/lib/api-client';
import { AdminEmptyPanel, AdminErrorPanel, AdminLoadingPanel } from './AdminDataState';
import { useAdminResource } from './use-admin-resource';
import { describeAdminFailure } from './admin-data-state';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Edit3,
  Trash2,
  ExternalLink,
  Calendar,
  Eye,
  X,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface ArticleSummary {
  id: string;
  title: string;
  slug: string;
  category: string;
  author: string;
  status: 'published' | 'draft';
  publishedAt: string;
  readTime?: string;
  excerpt?: string;
  content?: string;
  /** Optimistic-concurrency token the delete route requires. */
  revision?: number;
}

export function AdminBlogManagementTab() {
  /**
   * `GET /api/blog-data` — the route is mounted at `/api/blog-data` (index.js:544); the
   * previous `/blog/posts` read 404'd on every load, which is why the tab always showed its
   * sample articles.
   */
  const loadArticles = useCallback(
    (signal: AbortSignal) =>
      get<{ posts?: ArticleSummary[] }>('/blog-data', { limit: 100 }, { signal }),
    [],
  );
  const resource = useAdminResource(loadArticles);
  const articles = resource.data?.posts ?? [];

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');
  const [previewArticle, setPreviewArticle] = useState<ArticleSummary | null>(null);
  const [deleteConfirmArticle, setDeleteConfirmArticle] = useState<ArticleSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const navigate = useNavigate();

  const report = (error: unknown) => {
    const failure = describeAdminFailure(error);
    setFeedback({
      tone: 'error',
      text: `${failure.message} (${failure.code}${failure.requestId ? ` · request ${failure.requestId}` : ''})`,
    });
  };

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewArticle) setPreviewArticle(null);
        else if (deleteConfirmArticle) setDeleteConfirmArticle(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewArticle, deleteConfirmArticle]);

  /**
   * `DELETE /api/blog-data/:id?expectedRevision=` — the repository refuses a delete without
   * the revision it read (400 `REVISION_REQUIRED`) or when the post moved on (409
   * `CAS_CONFLICT`). Both answers are surfaced rather than smoothed over.
   */
  const handleDelete = async (article: ArticleSummary) => {
    setBusy(article.id);
    try {
      await del(`/blog-data/${encodeURIComponent(article.id)}`, {
        expectedRevision: article.revision,
      });
      setDeleteConfirmArticle(null);
      setFeedback({ tone: 'success', text: `Article “${article.title}” deleted.` });
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  const filteredArticles = articles.filter((a) => {
    const matchesFilter =
      statusFilter === 'ALL' ||
      (statusFilter === 'PUBLISHED' && a.status === 'published') ||
      (statusFilter === 'DRAFT' && a.status === 'draft');

    if (!matchesFilter) return false;
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    return a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink flex items-center gap-2">
            <FileText className="size-5 text-brand-600" />
            Blog Engine & CMS Publication Management
          </h2>
          <p className="text-xs text-ink-muted">
            Manage editorial articles, career guides, categories, and author publications with the full In-App Editor.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/blog-editor')}
          >
            <Plus className="size-3.5 mr-1" />
            Create New Article
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.tone === 'success' ? 'status' : 'alert'}
          className={cn(
            'flex items-start gap-2 rounded-xl border p-3 text-xs',
            feedback.tone === 'success'
              ? 'border-success-100 bg-success-50 text-success-700'
              : 'border-error-100 bg-error-50 text-error-700',
          )}
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="min-h-11 cursor-pointer px-2 text-2xs font-bold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:min-h-9">
            Dismiss
          </button>
        </div>
      )}

      {resource.status === 'loading' && resource.data === null && (
        <AdminLoadingPanel label="Reading the article catalogue…" />
      )}
      {resource.status === 'failed' && resource.error && (
        <AdminErrorPanel
          title="The article catalogue could not be read"
          error={resource.error}
          onRetry={resource.reload}
        />
      )}
      {resource.status === 'ready' && articles.length === 0 && (
        <AdminEmptyPanel
          title="No article yet"
          description="The blog store answered with no rows. Create the first article in the editor."
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search article titles, slugs, categories…"
            className="pl-8 text-xs h-8"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {(['ALL', 'PUBLISHED', 'DRAFT'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={cn(
                'rounded-lg px-2.5 py-1 font-semibold transition-colors cursor-pointer',
                statusFilter === filter
                  ? 'bg-brand-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-ink-muted hover:bg-neutral-200'
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Table */}
      {articles.length > 0 && (
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-xs min-w-[700px]">
          <thead className="bg-canvas border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Article Title & Slug</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Category</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Author</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Published Date</th>
              <th className="px-4 py-3 text-right font-semibold text-ink-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredArticles.map((article) => (
              <tr key={article.id} className="hover:bg-neutral-25 dark:hover:bg-neutral-800/30 transition-colors">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/blog-editor/${article.id}`)}
                    className="min-h-11 cursor-pointer text-left font-bold text-ink hover:text-brand-600 sm:min-h-0 dark:hover:text-brand-400"
                  >
                    {article.title}
                  </button>
                  <div className="text-[11px] text-ink-muted font-mono">/blog/{article.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-2xs font-medium text-ink-secondary">
                    {article.category || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-secondary">{article.author || '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-2xs font-bold uppercase',
                      article.status === 'published'
                        ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                        : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                    )}
                  >
                    {article.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-muted">{article.publishedAt || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setPreviewArticle(article)}
                      className="h-7 px-2 text-xs font-semibold text-brand-600 hover:text-brand-700"
                      title="Live article simulation preview"
                    >
                      <Eye className="size-3 mr-1" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => navigate(`/blog-editor/${article.id}`)}
                      title="Edit in In-App Blog Editor"
                      className="h-7 px-2 text-xs"
                    >
                      <Edit3 className="size-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={() => setDeleteConfirmArticle(article)}
                      title="Delete article"
                      className="h-7 px-2 text-xs"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredArticles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-muted">
                  No articles found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      )}
      {/* ─── Modal 1: Live Blog Article Preview Modal ─── */}
      {previewArticle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          onClick={() => setPreviewArticle(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="blog-preview-modal-title"
        >
          <div
            className="w-full max-w-3xl bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-brand-900 to-neutral-950 px-6 py-4 text-white flex items-center justify-between shrink-0 border-b border-neutral-800">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                  <Eye className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="blog-preview-modal-title" className="text-base font-extrabold text-white truncate">
                    Article Reader Preview
                  </h3>
                  <p className="text-xs text-neutral-300 font-mono mt-0.5">
                    /blog/{previewArticle.slug} · Status: {previewArticle.status.toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewArticle(null)}
                className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition cursor-pointer"
                aria-label="Close preview"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Article Simulation Body */}
            <div className="p-8 overflow-y-auto space-y-6">
              <div className="space-y-3 border-b border-border pb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand-100 text-brand-800 px-3 py-1 text-xs font-bold uppercase tracking-wider">
                    {previewArticle.category}
                  </span>
                  <span className="text-xs text-ink-muted flex items-center gap-1">
                    <Clock className="size-3.5 text-ink-muted" /> {previewArticle.readTime}
                  </span>
                  <span className="text-xs text-ink-muted">·</span>
                  <span className="text-xs text-ink-muted flex items-center gap-1">
                    <Calendar className="size-3.5 text-ink-muted" /> {previewArticle.publishedAt}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight leading-tight">
                  {previewArticle.title}
                </h1>
                <div className="flex items-center gap-2 pt-2">
                  <div className="size-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-xs">
                    {previewArticle.author.charAt(0)}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-ink block">{previewArticle.author}</span>
                    <span className="text-2xs text-ink-muted">Verified Technical Contributor</span>
                  </div>
                </div>
              </div>

              {previewArticle.excerpt && (
                <p className="text-sm font-medium text-ink-secondary italic border-l-4 border-brand-500 pl-4 py-1 bg-brand-50/30 rounded-r-lg">
                  {previewArticle.excerpt}
                </p>
              )}

              <div className="prose prose-sm dark:prose-invert max-w-none text-ink-secondary text-xs sm:text-sm leading-relaxed space-y-4">
                {(previewArticle.content || previewArticle.excerpt || '')
                  .split('\n\n')
                  .map((paragraph, idx) => {
                    if (paragraph.startsWith('### ')) {
                      return (
                        <h3 key={idx} className="text-base font-bold text-ink pt-2">
                          {paragraph.replace('### ', '')}
                        </h3>
                      );
                    }
                    return <p key={idx}>{paragraph}</p>;
                  })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-neutral-50 border-t border-border flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/blog/${previewArticle.slug}`)}
                className="text-xs"
              >
                <ExternalLink className="size-3 mr-1" />
                Open Live Public URL
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreviewArticle(null)} className="text-xs">
                  Close Preview
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    navigate(`/blog-editor/${previewArticle.id}`);
                  }}
                  className="text-xs font-semibold"
                >
                  <Edit3 className="size-3 mr-1" />
                  Edit in Authoring Studio
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Delete Article Confirmation Dialog ─── */}
      {deleteConfirmArticle && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          onClick={() => setDeleteConfirmArticle(null)}
          role="alertdialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-rose-100 bg-rose-50 flex items-center gap-3 text-rose-900">
              <AlertTriangle className="size-5 text-rose-600" />
              <h3 className="font-bold text-sm">Delete Blog Article?</h3>
            </div>
            <div className="p-5 text-xs text-ink-muted leading-relaxed">
              Are you sure you want to permanently delete article &quot;{deleteConfirmArticle.title}&quot;?
              This will remove the publication from the public career guide and cannot be undone.
            </div>
            <div className="p-4 pt-2 flex justify-end gap-2 bg-neutral-50/50 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmArticle(null)} className="text-xs">
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(deleteConfirmArticle)}
                loading={busy === deleteConfirmArticle.id}
                className="text-xs font-bold"
              >
                Delete Article
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
