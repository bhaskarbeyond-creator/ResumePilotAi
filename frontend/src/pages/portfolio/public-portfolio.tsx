/**
 * Public portfolio page — /portfolio/:slug (anonymous).
 *
 * Loads GET /api/portfolios/public/:slug, the server's explicit public projection
 * of a published portfolio. Owner data (user id, revision, drafts) never crosses
 * that boundary. Web CV portfolios render through the same PortfolioView the
 * builder previews with. Portfolios built with the older page editor carry layout
 * blocks this page cannot render, and they say so instead of showing a blank page.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, RotateCcw, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortfolioView } from '@/components/portfolio/portfolio-view';
import { getPublishedPortfolio, toPortfolioError, type PortfolioApiError, type PublicPortfolio } from '@/lib/portfolio';
import { normalizeCanonical } from '@/lib/portfolio-document';

type State =
  | { status: 'loading' }
  | { status: 'ready'; portfolio: PublicPortfolio }
  | { status: 'not-found' }
  | { status: 'error'; error: PortfolioApiError };

export function PublicPortfolioPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    getPublishedPortfolio(slug.toLowerCase(), controller.signal)
      .then((portfolio) => setState({ status: 'ready', portfolio }))
      .catch((cause: unknown) => {
        const error = toPortfolioError(cause);
        if (error.cancelled) return;
        // 400 is the server rejecting a malformed address: to a visitor that is simply not found.
        setState(error.status === 404 || error.status === 400 ? { status: 'not-found' } : { status: 'error', error });
      });
    return () => controller.abort();
  }, [slug, attempt]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const previous = document.title;
    document.title = `${state.portfolio.metadata?.seoTitle || state.portfolio.title} · IME365`;
    return () => { document.title = previous; };
  }, [state]);

  const topBar = (
    <nav aria-label="Portfolio" className="border-b border-border bg-surface px-4 py-3">
      <Link to="/portfolios" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" /> All portfolios
      </Link>
    </nav>
  );

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-canvas">
        {topBar}
        <main id="main-content" className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
          <p role="status" className="flex items-center gap-2 text-sm text-ink-secondary">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading portfolio…
          </p>
        </main>
      </div>
    );
  }

  if (state.status === 'not-found' || state.status === 'error') {
    const notFound = state.status === 'not-found';
    return (
      <div className="min-h-screen bg-canvas">
        {topBar}
        <main id="main-content" className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
          <SearchX className="size-10 text-ink-muted" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold text-ink">{notFound ? 'Portfolio not found' : 'This portfolio could not be loaded'}</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {notFound
              ? 'There is no published portfolio at this address. It may have been unpublished, or the link may be mistyped.'
              : state.error.message}
          </p>
          {!notFound && (
            <Button className="mt-5" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              <RotateCcw aria-hidden="true" /> Try again
            </Button>
          )}
        </main>
      </div>
    );
  }

  const { portfolio } = state;
  const data = portfolio.data ?? { content: [], root: {}, canonical: null };
  const blocks = Array.isArray(data.content) ? data.content : [];
  if (!data.canonical && blocks.length > 0) {
    return (
      <div className="min-h-screen bg-canvas">
        {topBar}
        <main id="main-content" className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="text-3xl font-bold text-ink break-words">{portfolio.title}</h1>
          {portfolio.metadata?.description && <p className="mt-3 whitespace-pre-line text-ink-secondary">{portfolio.metadata.description}</p>}
          <p className="mt-6 rounded-xl border border-border bg-surface p-4 text-sm text-ink-secondary">
            This portfolio was built with an earlier page editor, and its layout can’t be displayed on this page yet.
          </p>
        </main>
      </div>
    );
  }

  const canonical = normalizeCanonical(data.canonical ?? {}, data.templateKey ?? data.template ?? portfolio.theme);
  return (
    <div className="min-h-screen bg-canvas">
      {topBar}
      <main id="main-content">
        <PortfolioView canonical={canonical} headingLevel={1} className="min-h-[calc(100vh-3rem)]" />
      </main>
    </div>
  );
}
