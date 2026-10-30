/**
 * Portfolio gallery — /portfolios (anonymous).
 *
 * Lists GET /api/portfolios/public, the server's published summaries: title,
 * description, tags, template and publication date. Search and the template
 * filter work only on those fields and are kept in the URL (?q=, ?template=),
 * so results can be linked and survive reload and back/forward. Earlier the page
 * read name, headline, skills and avatar fields that summaries do not contain.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Globe, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listPublishedPortfolios, toPortfolioError, type PortfolioApiError, type PublicPortfolioSummary } from '@/lib/portfolio';
import { PORTFOLIO_TEMPLATES, resolveTemplate, templateMeta } from '@/lib/portfolio-document';

type State =
  | { status: 'loading' }
  | { status: 'ready'; portfolios: PublicPortfolioSummary[] }
  | { status: 'error'; error: PortfolioApiError };

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
};

const templateOf = (portfolio: PublicPortfolioSummary) => resolveTemplate(portfolio.data?.templateKey || portfolio.data?.template || portfolio.theme);

export function PortfolioGalleryPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [params, setParams] = useSearchParams();
  // Filters live in the URL so they survive reload, back/forward and can be
  // shared. Unknown values are ignored rather than trusted: an arbitrary
  // ?template= cannot put the page into a state no filter can undo.
  const rawQuery = params.get('q') ?? '';
  const query = rawQuery.slice(0, 120);
  const requestedTemplate = params.get('template') ?? '';
  const templateFilter = PORTFOLIO_TEMPLATES.some((template) => template.id === requestedTemplate)
    ? requestedTemplate
    : '';

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    listPublishedPortfolios(controller.signal)
      .then((portfolios) => setState({ status: 'ready', portfolios }))
      .catch((cause: unknown) => {
        const error = toPortfolioError(cause);
        if (!error.cancelled) setState({ status: 'error', error });
      });
    return () => controller.abort();
  }, [attempt]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key === 'q' });
  };

  const portfolios = state.status === 'ready' ? state.portfolios : [];
  const presentTemplates = PORTFOLIO_TEMPLATES.filter((template) => portfolios.some((portfolio) => templateOf(portfolio) === template.id));
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return portfolios.filter((portfolio) => {
      if (templateFilter && templateOf(portfolio) !== templateFilter) return false;
      if (!needle) return true;
      const haystack = [portfolio.title, portfolio.metadata?.description ?? '', ...(portfolio.metadata?.tags ?? [])].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [portfolios, query, templateFilter]);

  const filtering = Boolean(query.trim() || templateFilter);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-surface px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-bold text-ink">Portfolios</h1>
          <p className="mt-2 text-ink-secondary">Web CV portfolios that candidates have chosen to publish.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="portfolio-search" className="mb-1 block text-sm font-medium text-ink">Search</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                <Input id="portfolio-search" type="search" value={query} onChange={(event) => updateParam('q', event.target.value)} placeholder="Title, description or tag" className="pl-9" />
              </div>
            </div>
            <div className="sm:w-56">
              <label htmlFor="portfolio-template" className="mb-1 block text-sm font-medium text-ink">Template</label>
              <select
                id="portfolio-template"
                value={templateFilter}
                onChange={(event) => updateParam('template', event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"
              >
                <option value="">All templates</option>
                {(presentTemplates.length ? presentTemplates : PORTFOLIO_TEMPLATES).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
        <p role="status" className="mb-4 text-sm text-ink-secondary">
          {state.status === 'ready' && (filtering
            ? `${filtered.length} of ${portfolios.length} ${portfolios.length === 1 ? 'portfolio' : 'portfolios'} match`
            : `${portfolios.length} published ${portfolios.length === 1 ? 'portfolio' : 'portfolios'}`)}
        </p>

        {state.status === 'loading' && (
          <ul aria-busy="true" aria-label="Loading portfolios" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <li key={index} className="h-40 animate-pulse rounded-2xl bg-neutral-100" />)}
          </ul>
        )}

        {state.status === 'error' && (
          <div role="alert" className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800">
            <p className="font-semibold">Portfolios could not be loaded</p>
            <p className="mt-1">{state.error.message}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              <RotateCcw aria-hidden="true" /> Try again
            </Button>
          </div>
        )}

        {state.status === 'ready' && portfolios.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <Globe className="size-10 text-ink-muted" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold text-ink">No portfolios have been published yet</h2>
          </div>
        )}

        {state.status === 'ready' && portfolios.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <h2 className="text-lg font-semibold text-ink">No portfolios match</h2>
            <Button className="mt-4" variant="outline" onClick={() => setParams(new URLSearchParams())}>Clear search and filter</Button>
          </div>
        )}

        {filtered.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((portfolio) => {
              const template = templateMeta(templateOf(portfolio));
              // Legacy documents default their tags to the template id, which the card already shows.
              const tags = (portfolio.metadata?.tags ?? []).filter((tag) => tag !== template.id).slice(0, 4);
              return (
                <li key={portfolio.id} className="flex flex-col rounded-2xl border border-border bg-surface p-5">
                  <p className="text-xs font-medium text-brand-700">{template.name}</p>
                  <h2 className="mt-1 text-base font-semibold text-ink break-words">{portfolio.title}</h2>
                  {portfolio.metadata?.description && <p className="mt-2 line-clamp-3 text-sm text-ink-secondary break-words">{portfolio.metadata.description}</p>}
                  {tags.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
                      {tags.map((tag) => <li key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-ink-secondary">{tag}</li>)}
                    </ul>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    {formatDate(portfolio.publishedAt) && <p className="text-xs text-ink-muted">Published {formatDate(portfolio.publishedAt)}</p>}
                    <Link to={`/portfolio/${portfolio.slug}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
                      View<span className="sr-only"> {portfolio.title}</span><ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
