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
import {
  getPublishedPortfolio,
  publicPortfolioUrl,
  toPortfolioError,
  type PortfolioApiError,
  type PublicPortfolio,
} from '@/lib/portfolio';
import { canonicalWithVisibility, hasContent, normalizeCanonical } from '@/lib/portfolio-document';

type State =
  | { status: 'loading' }
  | { status: 'ready'; portfolio: PublicPortfolio }
  | { status: 'not-found' }
  | { status: 'error'; error: PortfolioApiError };

/* ─── Document metadata (client-side only) ───
 *
 * The SPA updates <title>, the description meta tag, the canonical link and the
 * Open Graph/Twitter tags for the portfolio being shown. Everything is written
 * through DOM APIs (never innerHTML), and each tag this page created or changed
 * is restored when the route changes, so a previous portfolio's title can never
 * linger. This is client-side metadata: crawlers that do not run JavaScript, and
 * social scrapers that only read the static HTML, still see the shell's tags.
 */

interface MetaSnapshot {
  title: string;
  entries: Array<{ element: HTMLMetaElement | HTMLLinkElement; attribute: 'name' | 'property' | 'rel'; key: string; created: boolean; previous: string | null }>;
}

function setHeadTag(
  snapshot: MetaSnapshot,
  tagName: 'meta' | 'link',
  attribute: 'name' | 'property' | 'rel',
  key: string,
  content: string,
) {
  const selector = `${tagName}[${attribute}="${key}"]`;
  let element = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement(tagName);
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
    snapshot.entries.push({ element, attribute, key, created: true, previous: null });
  } else {
    snapshot.entries.push({ element, attribute, key, created: false, previous: element.getAttribute('content') ?? element.getAttribute('href') });
  }
  element.setAttribute(tagName === 'link' ? 'href' : 'content', content);
}

function applyPortfolioMetadata(portfolio: PublicPortfolio): MetaSnapshot {
  const snapshot: MetaSnapshot = { title: document.title, entries: [] };
  const name = portfolio.metadata?.seoTitle?.trim() || portfolio.title?.trim() || 'Portfolio';
  const description = (portfolio.metadata?.seoDescription || portfolio.metadata?.description || '').trim();
  const canonicalUrl = publicPortfolioUrl(portfolio.slug);

  document.title = `${name} · IME365`;
  if (description) {
    setHeadTag(snapshot, 'meta', 'name', 'description', description);
    setHeadTag(snapshot, 'meta', 'property', 'og:description', description);
  }
  setHeadTag(snapshot, 'meta', 'property', 'og:title', `${name} · IME365`);
  setHeadTag(snapshot, 'meta', 'name', 'twitter:card', 'summary');
  if (/^https?:\/\//i.test(canonicalUrl)) {
    setHeadTag(snapshot, 'link', 'rel', 'canonical', canonicalUrl);
    setHeadTag(snapshot, 'meta', 'property', 'og:url', canonicalUrl);
  }
  return snapshot;
}

function restoreMetadata(snapshot: MetaSnapshot) {
  document.title = snapshot.title;
  for (const entry of snapshot.entries) {
    if (entry.created) {
      entry.element.remove();
    } else if (entry.previous === null) {
      entry.element.removeAttribute(entry.attribute === 'rel' ? 'href' : 'content');
    } else {
      entry.element.setAttribute(entry.element.tagName === 'LINK' ? 'href' : 'content', entry.previous);
    }
  }
}

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
    if (state.status !== 'ready') {
      document.title = 'Portfolio · IME365';
      return;
    }
    const snapshot = applyPortfolioMetadata(state.portfolio);
    return () => restoreMetadata(snapshot);
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

  const canonical = canonicalWithVisibility(
    normalizeCanonical(data.canonical ?? {}, data.templateKey ?? data.template ?? portfolio.theme),
  );
  return (
    <div className="min-h-screen bg-canvas">
      {topBar}
      <main id="main-content">
        {!hasContent(canonical) && (
          <p className="mx-auto max-w-2xl px-4 pt-8 text-sm text-ink-secondary">
            This portfolio has no visible content yet. Its owner has not filled in any sections.
          </p>
        )}
        <PortfolioView canonical={canonical} headingLevel={1} className="min-h-[calc(100vh-3rem)]" />
      </main>
    </div>
  );
}
