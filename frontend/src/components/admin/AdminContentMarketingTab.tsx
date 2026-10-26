/**
 * Marketing content: the ATS phrase dictionary and published testimonials.
 *
 * Two sections, because those are the two surfaces the backend actually serves:
 *
 *   GET    /api/phrases                     canonical_documents('phrases') — category tree
 *   POST   /api/phrases                     whole-category replace {categories:{name:[…]}}
 *   DELETE /api/phrases/:category           remove a category
 *   GET    /api/reviews?limit=              approved testimonials only (repository filters)
 *
 * Two sections were **removed**, not implemented: "Trusted By logos" and "Landing pages &
 * SEO". Neither has a route, a table or a document type in this codebase, and both were
 * rendering invented rows (Google Cloud Partner, NVIDIA Inception, `/executive-resume-builder`
 * with 24 190 views and a 14.2 % conversion rate) that no one could edit, publish or verify.
 * Keeping a fabricated analytics table is worse than an empty tab: it invites decisions.
 * Topic tracked as `OI-CMS-1`; if those surfaces are wanted they need schema first.
 *
 * The review list is read-only for the same reason: the repository exposes approved reviews
 * (`getReviews({approvedOnly:true})`) and no moderation route, so the previous
 * approve/reject buttons changed local state and nothing else.
 */

import { useCallback, useMemo, useState } from 'react';
import { BookOpen, Plus, Star, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { del, get, post } from '@/lib/api-client';
import { AdminEmptyPanel, AdminErrorPanel, AdminLoadingPanel } from './AdminDataState';
import { useAdminResource } from './use-admin-resource';
import { describeAdminFailure } from './admin-data-state';

interface PhraseCategory {
  id: string;
  name: string;
  phrases: string[];
  revision: number;
}

interface ReviewRow {
  id: string;
  author?: string;
  name?: string;
  role?: string;
  company?: string;
  rating?: number;
  content?: string;
  text?: string;
  createdAt?: string;
}

type SubTab = 'phrases' | 'reviews';

function readCategories(payload: unknown): PhraseCategory[] {
  const rows = (payload as { categories?: unknown })?.categories;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      id: String(row.id ?? row.name ?? ''),
      name: String(row.name ?? row.id ?? ''),
      phrases: Array.isArray(row.phrases) ? row.phrases.map(String) : [],
      revision: Number(row.revision ?? 0),
    }))
    .filter((category) => category.id !== '');
}

function readReviews(payload: unknown): ReviewRow[] {
  const rows = (payload as { reviews?: unknown })?.reviews;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is ReviewRow => typeof row === 'object' && row !== null);
}

export function AdminContentMarketingTab() {
  const [subTab, setSubTab] = useState<SubTab>('phrases');
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const announce = (tone: 'success' | 'error', text: string) => setFlash({ tone, text });
  const report = (error: unknown) => {
    const failure = describeAdminFailure(error);
    announce('error', `${failure.message} (${failure.code}${failure.requestId ? ` · request ${failure.requestId}` : ''})`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">Content &amp; marketing</h2>
        <p className="text-xs text-ink-muted">
          Phrase dictionaries and published testimonials. Every row is stored; nothing is
          generated for display.
        </p>
      </div>

      {flash && (
        <div
          role={flash.tone === 'success' ? 'status' : 'alert'}
          className={cn(
            'flex items-start gap-2 rounded-xl border p-3 text-xs',
            flash.tone === 'success'
              ? 'border-success-100 bg-success-50 text-success-700'
              : 'border-error-100 bg-error-50 text-error-700',
          )}
        >
          <span className="flex-1">{flash.text}</span>
          <button type="button" onClick={() => setFlash(null)} className="min-h-11 cursor-pointer px-2 text-2xs font-bold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:min-h-9">Dismiss</button>
        </div>
      )}

      <div role="tablist" aria-label="Content sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {(
          [
            { id: 'phrases', label: 'ATS phrase dictionary', icon: BookOpen },
            { id: 'reviews', label: 'Testimonials', icon: Star },
          ] as const
        ).map((entry) => {
          const Icon = entry.icon;
          const active = subTab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`content-panel-${entry.id}`}
              onClick={() => setSubTab(entry.id)}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 text-xs font-bold transition-colors',
                active ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              <Icon className="size-3.5" />
              {entry.label}
            </button>
          );
        })}
      </div>

      {subTab === 'phrases' && <PhrasesPanel announce={announce} report={report} />}
      {subTab === 'reviews' && <ReviewsPanel />}
    </div>
  );
}

function PhrasesPanel({
  announce,
  report,
}: {
  announce: (tone: 'success' | 'error', text: string) => void;
  report: (error: unknown) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => get<unknown>('/phrases', undefined, { signal }).then(readCategories),
    [],
  );
  const resource = useAdminResource<PhraseCategory[]>(load);
  const categories = useMemo(() => resource.data ?? [], [resource.data]);

  const [category, setCategory] = useState<string>('');
  const [phrase, setPhrase] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const activeCategory = categories.find((entry) => entry.name === category) ?? categories[0] ?? null;

  /** The write route replaces a whole category, so the list is sent complete. */
  const writeCategory = async (name: string, phrases: string[]) => {
    await post('/phrases', { categories: { [name]: phrases } });
  };

  const addPhrase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeCategory || phrase.trim().length < 3) return;
    setBusy('add');
    try {
      const next = [...activeCategory.phrases, phrase.trim()];
      await writeCategory(activeCategory.name, next);
      announce('success', `Phrase added to “${activeCategory.name}” (${next.length} total).`);
      setPhrase('');
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  const removePhrase = async (target: string) => {
    if (!activeCategory) return;
    setBusy(target);
    try {
      const next = activeCategory.phrases.filter((entry) => entry !== target);
      await writeCategory(activeCategory.name, next);
      announce('success', `Phrase removed from “${activeCategory.name}”.`);
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  const removeCategory = async () => {
    if (!activeCategory) return;
    setBusy('category');
    try {
      await del(`/phrases/${encodeURIComponent(activeCategory.name)}`);
      announce('success', `Category “${activeCategory.name}” deleted.`);
      setCategory('');
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  if (resource.status === 'loading' && resource.data === null) {
    return <AdminLoadingPanel label="Reading the phrase dictionary…" />;
  }
  if (resource.status === 'failed' && resource.error) {
    return <AdminErrorPanel title="The phrase dictionary could not be read" error={resource.error} onRetry={resource.reload} />;
  }
  if (categories.length === 0) {
    return (
      <AdminEmptyPanel
        title="No phrase category"
        description="canonical_documents('phrases') returned no documents. The dictionary is empty, so AI bullet suggestions have no curated source."
      />
    );
  }

  const visible = (activeCategory?.phrases ?? []).filter((entry) =>
    entry.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <section id="content-panel-phrases" role="tabpanel" className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="phrase-category" className="block text-2xs font-bold text-ink">Category</label>
          <select
            id="phrase-category"
            value={activeCategory?.name ?? ''}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-ink sm:h-9"
          >
            {categories.map((entry) => (
              <option key={entry.id} value={entry.name}>
                {entry.name} ({entry.phrases.length})
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={removeCategory}
          loading={busy === 'category'}
          className="min-h-11 text-error-700 sm:min-h-9"
        >
          <Trash2 className="mr-1 size-3.5" />
          Delete category
        </Button>
        <div className="ml-auto w-full max-w-xs space-y-1">
          <label htmlFor="phrase-filter" className="block text-2xs font-bold text-ink">Filter</label>
          <Input
            id="phrase-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter phrases…"
            className="h-11 text-xs sm:h-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {activeCategory?.name} — {activeCategory?.phrases.length ?? 0} phrases
          </CardTitle>
          <CardDescription>
            Revision {activeCategory?.revision ?? 0}. Saving replaces the whole category, which is
            what the endpoint does; the page never patches a single phrase optimistically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={addPhrase} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              placeholder="Architected a multi-region failover that cut p99 latency by 38%…"
              aria-label="New phrase"
              className="h-11 flex-1 text-xs sm:h-9"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={busy === 'add'}
              disabled={phrase.trim().length < 3}
              className="min-h-11 sm:min-h-9"
            >
              <Plus className="mr-1.5 size-4" />
              Add phrase
            </Button>
          </form>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-border p-4 text-center text-xs text-ink-muted">
              {activeCategory?.phrases.length === 0
                ? 'This category holds no phrase yet.'
                : `No phrase contains “${filter.trim()}”.`}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {visible.map((entry) => (
                <li key={entry} className="flex items-center justify-between gap-3 p-3 hover:bg-neutral-25 dark:hover:bg-neutral-800/30">
                  <p className="text-xs text-ink">{entry}</p>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => removePhrase(entry)}
                    loading={busy === entry}
                    aria-label={`Remove phrase: ${entry}`}
                    className="min-h-11 text-error-700 sm:min-h-7"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ReviewsPanel() {
  const load = useCallback(
    (signal: AbortSignal) => get<unknown>('/reviews', { limit: 50 }, { signal }).then(readReviews),
    [],
  );
  const resource = useAdminResource<ReviewRow[]>(load);
  const reviews = resource.data ?? [];

  if (resource.status === 'loading' && resource.data === null) {
    return <AdminLoadingPanel label="Reading testimonials…" />;
  }
  if (resource.status === 'failed' && resource.error) {
    return <AdminErrorPanel title="Testimonials could not be read" error={resource.error} onRetry={resource.reload} />;
  }
  if (reviews.length === 0) {
    return <AdminEmptyPanel title="No testimonial" description="No approved testimonial exists yet." />;
  }

  return (
    <section id="content-panel-reviews" role="tabpanel" className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {reviews.map((review) => (
          <li key={review.id} className="space-y-1 p-4">
            <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-ink">
              {review.author || review.name || 'Anonymous'}
              {typeof review.rating === 'number' && (
                <span className="rounded-full border border-warning-100 bg-warning-50 px-2 py-0.5 text-2xs font-bold text-warning-700">
                  {review.rating}/5
                </span>
              )}
            </p>
            <p className="text-2xs text-ink-muted">
              {[review.role, review.company].filter(Boolean).join(' · ') || 'no role recorded'}
              {review.createdAt ? ` · ${review.createdAt.slice(0, 10)}` : ''}
            </p>
            <p className="text-xs text-ink-secondary">{review.content || review.text || ''}</p>
          </li>
        ))}
      </ul>
      <p className="text-2xs text-ink-muted">
        {reviews.length} approved testimonials · the repository exposes approved rows only, and
        there is no moderation route, so this list is read-only (`OI-CMS-1`).
      </p>
    </section>
  );
}
