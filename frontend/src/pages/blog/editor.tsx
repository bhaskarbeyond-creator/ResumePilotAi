/**
 * Enterprise Blog Editor (/blog-editor, /blog-editor/:postId) — DISC-039.
 *
 * Authoring for publication managers & admins against the real CMS API:
 *   GET    /api/blog-data/posts/:id     load the article (draft included)
 *   POST   /api/blog-data/posts         create a draft (or publish explicitly)
 *   PUT    /api/blog-data/posts/:id     save (compare-and-swap on `revision`)
 *   DELETE /api/blog-data/posts/:id     delete (requires expectedRevision)
 *
 * Truthfulness rules enforced here:
 *  - a failed load is an error state, never a demo article standing in for it;
 *  - "Saved" appears only after the server returns the persisted record;
 *  - a stale revision or a duplicate slug is shown as such, and the content the
 *    author typed is kept so nothing is lost;
 *  - the preview renders Markdown into React nodes (no HTML injection), so any
 *    markup in the article is shown as text instead of being executed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageSpinner } from '@/components/ui/loading';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { get, post, put, del, normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Eye,
  Edit3,
  ArrowLeft,
  Sparkles,
  Globe,
  CheckCircle,
  AlertCircle,
  Trash2,
  RefreshCw,
  Save,
} from 'lucide-react';

type PostStatus = 'draft' | 'published';

interface BlogPostData {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  coverImage: string;
  status: PostStatus;
  tags: string[];
  revision: number;
}

const CATEGORIES = [
  'Career Advice',
  'Resume Optimization',
  'Technical Interviews',
  'AI & Technology',
  'Salary Negotiation',
];

function emptyDraft(): BlogPostData {
  return {
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    category: 'Career Advice',
    author: '',
    coverImage: '',
    status: 'draft',
    tags: [],
    revision: 0,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 180)
    .replace(/-$/, '');
}

/** Server record -> editor state. Unknown values are not invented. */
function toEditorPost(raw: Record<string, unknown>): BlogPostData {
  const text = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
  const published = raw.published === true || raw.published === 1;
  const status = text(raw.status).toLowerCase();
  return {
    id: text(raw.id),
    title: text(raw.title),
    slug: text(raw.slug),
    excerpt: text(raw.excerpt),
    content: text(raw.content),
    category: text(raw.category) || 'Career Advice',
    author: text(raw.author),
    coverImage: text(raw.coverImage) || text(raw.cover_image),
    status: status === 'published' || status === 'approved' || published ? 'published' : 'draft',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    revision: Number(raw.revision) > 0 ? Number(raw.revision) : 0,
  };
}

// ───────────────────────── safe Markdown rendering ─────────────────────────
// The article body is untrusted input. It is parsed into React elements, never
// into HTML: every character the author typed is rendered as text (React
// escapes it), so `<script>` in an article shows up as visible text and cannot
// execute. Only http(s) links become anchors.

function inlineNodes(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Ordered alternation: code, bold, italic, link.
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-i${index++}`;
    if (match[1]) {
      nodes.push(<code key={key} className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.85em]">{match[1].slice(1, -1)}</code>);
    } else if (match[2]) {
      nodes.push(<strong key={key}>{match[2].slice(2, -2)}</strong>);
    } else if (match[3]) {
      nodes.push(<em key={key}>{match[3].slice(1, -1)}</em>);
    } else if (match[4] && match[5]) {
      const label = match[4].slice(1).split('](')[0];
      nodes.push(
        <a key={key} href={match[5]} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-600 underline">
          {label}
        </a>,
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderMarkdown(markdown: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  const lines = String(markdown || '').split('\n');
  let listItems: string[] = [];
  let codeLines: string[] | null = null;

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={key} className="my-3 list-disc space-y-1 pl-5">
        {listItems.map((item, index) => <li key={`${key}-${index}`}>{inlineNodes(item, `${key}-${index}`)}</li>)}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const key = `b${index}`;
    if (/^\s*```/.test(line)) {
      if (codeLines === null) {
        flushList(`${key}-list`);
        codeLines = [];
      } else {
        blocks.push(
          <pre key={key} className="my-3 overflow-x-auto rounded-lg bg-neutral-100 p-3 text-xs">
            <code>{codeLines.join('\n')}</code>
          </pre>,
        );
        codeLines = null;
      }
      return;
    }
    if (codeLines !== null) {
      codeLines.push(line);
      return;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushList(`${key}-list`);
      const level = heading[1].length;
      const sizes = ['text-2xl', 'text-xl', 'text-lg', 'text-base'];
      const Tag = (`h${Math.min(level + 1, 6)}`) as 'h2' | 'h3' | 'h4' | 'h5';
      blocks.push(
        <Tag key={key} className={cn('mt-5 mb-2 font-bold text-ink', sizes[level - 1])}>
          {inlineNodes(heading[2], key)}
        </Tag>,
      );
      return;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }
    if (/^\s*>\s?/.test(line)) {
      flushList(`${key}-list`);
      blocks.push(
        <blockquote key={key} className="my-3 border-l-4 border-border pl-4 italic text-ink-muted">
          {inlineNodes(line.replace(/^\s*>\s?/, ''), key)}
        </blockquote>,
      );
      return;
    }
    if (line.trim() === '') {
      flushList(`${key}-list`);
      return;
    }
    flushList(`${key}-list`);
    blocks.push(<p key={key} className="my-2 leading-relaxed">{inlineNodes(line, key)}</p>);
  });

  if (codeLines !== null) {
    blocks.push(
      <pre key="code-open" className="my-3 overflow-x-auto rounded-lg bg-neutral-100 p-3 text-xs">
        <code>{codeLines.join('\n')}</code>
      </pre>,
    );
  }
  flushList('list-tail');
  return blocks;
}

export function BlogEditorPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const isNew = !postId || postId === 'new';

  const [postData, setPostData] = useState<BlogPostData>(emptyDraft);
  const [activeTab, setActiveTab] = useState<'write' | 'preview' | 'seo'>('write');
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(isNew ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; content?: string }>({});
  const [tagInput, setTagInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const loadPost = useCallback(async (id: string) => {
    setLoadState('loading');
    setLoadError(null);
    try {
      const data = await get<{ post?: Record<string, unknown> }>(`/blog-data/posts/${encodeURIComponent(id)}`);
      if (!data?.post) throw new Error('The article could not be read.');
      setPostData(toEditorPost(data.post));
      setLoadState('ready');
    } catch (error) {
      const failure = normalizeError(error);
      // No fallback article: a failed load is reported, not disguised.
      setLoadState('error');
      setLoadError(failure.status === 404
        ? 'This article no longer exists, or you do not have permission to edit it.'
        : failure.message || 'The article could not be loaded.');
    }
  }, []);

  useEffect(() => {
    if (isNew) {
      setPostData(emptyDraft());
      setLoadState('ready');
      return;
    }
    void loadPost(postId as string);
  }, [isNew, postId, loadPost]);

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const title = event.target.value;
    setPostData((current) => ({
      ...current,
      title,
      // The slug follows the title until the author edits it by hand.
      slug: current.slug && current.slug !== slugify(current.title) ? current.slug : slugify(title),
    }));
    if (fieldErrors.title) setFieldErrors((current) => ({ ...current, title: undefined }));
  };

  const handleAddTag = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' || !tagInput.trim()) return;
    event.preventDefault();
    const tag = tagInput.trim();
    setPostData((current) => (current.tags.includes(tag) ? current : { ...current, tags: [...current.tags, tag] }));
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setPostData((current) => ({ ...current, tags: current.tags.filter((tag) => tag !== tagToRemove) }));
  };

  const persist = async (targetStatus: PostStatus) => {
    if (pendingRef.current) return;
    const errors: { title?: string; content?: string } = {};
    if (postData.title.trim().length < 3) errors.title = 'Enter a title of at least 3 characters.';
    if (!postData.content.trim()) errors.content = 'Write the article before saving.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    pendingRef.current = true;
    setSaving(targetStatus === 'published' ? 'publish' : 'draft');
    setMessage(null);
    const payload = {
      title: postData.title.trim(),
      content: postData.content,
      excerpt: postData.excerpt,
      category: postData.category,
      tags: postData.tags,
      coverImage: postData.coverImage,
      slug: postData.slug,
      status: targetStatus,
      published: targetStatus === 'published',
    };
    try {
      let saved: Record<string, unknown> | undefined;
      if (isNew) {
        const created = await post<{ post?: Record<string, unknown> }>('/blog-data/posts', payload);
        saved = created?.post;
        if (saved?.id) {
          setPostData(toEditorPost(saved));
          setLoadState('ready');
          navigate(`/blog-editor/${encodeURIComponent(String(saved.id))}`, { replace: true });
        }
      } else {
        const updated = await put<{ post?: Record<string, unknown> }>(
          `/blog-data/posts/${encodeURIComponent(postId as string)}`,
          { ...payload, expectedRevision: postData.revision || undefined },
        );
        saved = updated?.post;
        if (saved) {
          const fromServer = toEditorPost(saved);
          // If the author kept typing while the save was in flight, their newer
          // text wins; only the server-owned metadata (revision, status, slug,
          // byline) is adopted so the next save still passes the CAS check.
          setPostData((current) => (
            current.title.trim() === payload.title
              && current.content === payload.content
              && current.excerpt === payload.excerpt
              ? fromServer
              : {
                ...current,
                id: fromServer.id,
                revision: fromServer.revision,
                status: fromServer.status,
                slug: fromServer.slug,
                author: fromServer.author,
              }
          ));
        }
      }
      if (!saved) throw new Error('The server did not return the saved article.');
      setMessage({
        tone: 'success',
        text: targetStatus === 'published' ? 'Article published.' : 'Draft saved.',
      });
    } catch (error) {
      const failure = normalizeError(error);
      if (failure.status === 409) {
        // Stale revision or slug collision: keep the author's text, explain it.
        setMessage({
          tone: 'error',
          text: failure.code === 'SLUG_CONFLICT'
            ? 'That URL slug is already used by another article. Choose a different slug and save again.'
            : 'This article changed in another tab or device, so your edits were not saved. Reload to get the latest version — your text is still here.',
        });
      } else if (failure.status === 403) {
        setMessage({ tone: 'error', text: 'You do not have permission to save or publish this article.' });
      } else if (failure.status === 400) {
        setMessage({ tone: 'error', text: failure.message });
      } else {
        setMessage({ tone: 'error', text: failure.message || 'The article could not be saved. Your text has not been lost.' });
      }
    } finally {
      pendingRef.current = false;
      setSaving(null);
    }
  };

  const removePost = async () => {
    if (deleting || isNew) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await del(`/blog-data/posts/${encodeURIComponent(postId as string)}`, {
        expectedRevision: postData.revision,
      });
      setConfirmDelete(false);
      navigate('/blog', { replace: true });
    } catch (error) {
      const failure = normalizeError(error);
      setDeleteError(failure.status === 409
        ? 'This article changed after you loaded it, so it was not deleted. Reload and try again.'
        : failure.message || 'The article could not be deleted.');
    } finally {
      setDeleting(false);
    }
  };

  const wordCount = useMemo(() => postData.content.trim().split(/\s+/).filter(Boolean).length, [postData.content]);
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));
  const preview = useMemo(() => renderMarkdown(postData.content), [postData.content]);

  if (loadState === 'loading') return <PageSpinner />;

  if (loadState === 'error') {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-6">
        <div role="alert" className="max-w-md rounded-2xl border border-error-200 bg-error-50 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 size-10 text-error-600" aria-hidden="true" />
          <h1 className="text-lg font-bold text-ink">Article not available</h1>
          <p className="mt-2 text-sm text-ink-muted">{loadError}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => postId && void loadPost(postId)}>
              <RefreshCw aria-hidden="true" /> Retry
            </Button>
            <Button asChild size="sm">
              <Link to="/blog"><ArrowLeft aria-hidden="true" /> Back to the blog</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-canvas p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/blog')} aria-label="Back to the blog">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-ink">{postData.title || 'Untitled Post'}</h1>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  postData.status === 'published'
                    ? 'bg-emerald-500/10 text-emerald-700'
                    : 'bg-amber-500/10 text-amber-700',
                )}
              >
                {postData.status === 'published' ? 'Published' : 'Draft'}
              </span>
              {!isNew && (
                <span className="text-[11px] text-ink-muted">revision {postData.revision || 1}</span>
              )}
            </div>
            <p className="text-xs text-ink-muted">
              {wordCount} words · {readingTimeMinutes} min read
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={saving === 'draft'}
            disabled={saving !== null}
            onClick={() => void persist('draft')}
          >
            <Save aria-hidden="true" /> Save Draft
          </Button>
          <Button
            size="sm"
            loading={saving === 'publish'}
            disabled={saving !== null}
            onClick={() => void persist('published')}
            className="bg-brand-600 hover:bg-brand-700"
          >
            <Sparkles className="mr-1.5 size-4" aria-hidden="true" />
            Publish
          </Button>
          {!isNew && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setDeleteError(null); setConfirmDelete(true); }}
              disabled={saving !== null}
              aria-label="Delete this article"
            >
              <Trash2 className="size-4 text-error-600" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4" role="status" aria-live="polite">
        {message && (
          <p
            className={cn(
              'flex items-center gap-2 rounded-lg border p-2.5 text-xs font-semibold',
              message.tone === 'success' && 'border-success-200 bg-success-50 text-success-700',
              message.tone === 'info' && 'border-border bg-canvas-soft text-ink',
              message.tone === 'error' && 'border-error-200 bg-error-50 text-error-700',
            )}
          >
            {message.tone === 'success'
              ? <CheckCircle className="size-4 shrink-0" aria-hidden="true" />
              : <AlertCircle className="size-4 shrink-0" aria-hidden="true" />}
            {message.text}
          </p>
        )}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-12">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm lg:col-span-8">
          <div className="flex items-center justify-between border-b border-border bg-canvas/40 px-4 py-2 text-xs">
            <div className="flex items-center gap-1" role="tablist" aria-label="Editor view">
              {([
                { id: 'write', label: 'Write', icon: Edit3 },
                { id: 'preview', label: 'Live Preview', icon: Eye },
                { id: 'seo', label: 'SEO & Social', icon: Globe },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500',
                    activeTab === id ? 'bg-brand-600 text-white' : 'text-ink-muted hover:bg-neutral-100 hover:text-ink',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <span className="hidden text-[11px] text-ink-muted sm:inline">Markdown syntax supported</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {activeTab === 'write' && (
              <div className="flex h-full flex-col space-y-4">
                <div>
                  <label htmlFor="post-title" className="sr-only">Article title</label>
                  <Input
                    id="post-title"
                    placeholder="Article Title…"
                    value={postData.title}
                    onChange={handleTitleChange}
                    error={Boolean(fieldErrors.title)}
                    aria-invalid={Boolean(fieldErrors.title) || undefined}
                    aria-describedby={fieldErrors.title ? 'post-title-error' : undefined}
                    className="border-none px-0 text-xl font-bold shadow-none focus-visible:ring-0"
                  />
                  {fieldErrors.title && (
                    <p id="post-title-error" className="mt-1 text-[11px] text-error-700">{fieldErrors.title}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="post-excerpt" className="sr-only">Excerpt</label>
                  <Input
                    id="post-excerpt"
                    placeholder="Short excerpt / teaser summary…"
                    value={postData.excerpt}
                    onChange={(event) => setPostData((current) => ({ ...current, excerpt: event.target.value }))}
                    className="border-none px-0 text-sm italic text-ink-muted shadow-none focus-visible:ring-0"
                  />
                </div>

                <div className="flex flex-1 flex-col">
                  <label htmlFor="post-content" className="sr-only">Article content (Markdown)</label>
                  <textarea
                    id="post-content"
                    value={postData.content}
                    onChange={(event) => {
                      setPostData((current) => ({ ...current, content: event.target.value }));
                      if (fieldErrors.content) setFieldErrors((current) => ({ ...current, content: undefined }));
                    }}
                    placeholder="Write your article in Markdown…"
                    aria-invalid={Boolean(fieldErrors.content) || undefined}
                    aria-describedby={fieldErrors.content ? 'post-content-error' : undefined}
                    className="min-h-[16rem] w-full flex-1 resize-y border-t border-border bg-transparent pt-4 font-mono text-sm leading-relaxed text-ink focus:outline-none"
                    rows={20}
                  />
                  {fieldErrors.content && (
                    <p id="post-content-error" className="mt-1 text-[11px] text-error-700">{fieldErrors.content}</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'preview' && (
              <article className="mx-auto max-w-2xl space-y-4 py-4">
                <div>
                  <span className="rounded bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600">
                    {postData.category}
                  </span>
                  <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
                    {postData.title || 'Untitled Article'}
                  </h2>
                  {postData.excerpt && <p className="mt-2 text-base italic text-ink-muted">{postData.excerpt}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-b border-border pb-4 text-xs text-ink-muted">
                    <span>By {postData.author || 'IME365 Editorial'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{readingTimeMinutes} min read</span>
                  </div>
                </div>
                <div className="max-w-none text-sm text-ink">
                  {postData.content.trim() ? preview : (
                    <p className="text-ink-muted">Nothing to preview yet — start writing in the Write tab.</p>
                  )}
                </div>
              </article>
            )}

            {activeTab === 'seo' && (
              <div className="mx-auto max-w-xl space-y-6 py-4">
                <div>
                  <h2 className="text-base font-semibold text-ink">Search Engine Optimization</h2>
                  <p className="text-xs text-ink-muted">
                    Configure how this article appears in Google search and social shares.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="post-slug" className="mb-1 block text-xs font-semibold text-ink">URL slug</label>
                    <Input
                      id="post-slug"
                      value={postData.slug}
                      onChange={(event) => setPostData((current) => ({ ...current, slug: slugify(event.target.value) }))}
                      placeholder="article-url-slug"
                      className="text-xs"
                    />
                    <p className="mt-1 text-[11px] text-ink-muted">
                      https://ime365.ai/blog/{postData.slug || 'article-slug'}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="post-category" className="mb-1 block text-xs font-semibold text-ink">Category</label>
                    <select
                      id="post-category"
                      value={postData.category}
                      onChange={(event) => setPostData((current) => ({ ...current, category: event.target.value }))}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
                    >
                      {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="post-cover" className="mb-1 block text-xs font-semibold text-ink">Cover image URL</label>
                    <Input
                      id="post-cover"
                      value={postData.coverImage}
                      onChange={(event) => setPostData((current) => ({ ...current, coverImage: event.target.value }))}
                      placeholder="https://images.example.com/cover.jpg"
                      className="text-xs"
                    />
                  </div>

                  {/* Google preview snippet */}
                  <div className="rounded-xl border border-border bg-canvas/50 p-4">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                      Google Search Preview
                    </span>
                    <div className="truncate text-base font-medium text-blue-600">
                      {postData.title || 'Article Title'}
                    </div>
                    <div className="mt-0.5 text-xs text-emerald-700">
                      https://ime365.ai/blog/{postData.slug || 'article-slug'}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-ink-muted">
                      {postData.excerpt || 'Article summary description…'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col space-y-4 lg:col-span-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">Publishing Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div>
                <span className="mb-1 block font-semibold text-ink">Author</span>
                <p className="rounded-lg border border-border bg-canvas px-3 py-2 text-ink-muted">
                  {postData.author || 'Derived from your signed-in account when saved'}
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  Byline and ownership come from the authenticated account, not from this form.
                </p>
              </div>

              <div>
                <label htmlFor="post-tags" className="mb-1 block font-semibold text-ink">Tags (press Enter)</label>
                <Input
                  id="post-tags"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Add a tag…"
                  className="text-xs"
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {postData.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-ink-muted transition-colors hover:bg-error-50 hover:text-error-600"
                      aria-label={`Remove tag ${tag}`}
                    >
                      #{tag} ×
                    </button>
                  ))}
                </div>
              </div>

              <p className="rounded-lg border border-border bg-canvas p-2.5 text-[11px] text-ink-muted">
                Saving keeps this article a draft. Publishing makes it publicly readable immediately; only
                editors with CMS permission can publish.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={(open) => { if (!open && !deleting) setConfirmDelete(false); }}>
        <DialogContent className="max-w-sm p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-ink">Delete this article?</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              “{postData.title || 'Untitled'}” will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="rounded-lg border border-error-200 bg-error-50 p-2.5 text-xs text-error-700">
              {deleteError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" loading={deleting} disabled={deleting} onClick={() => void removePost()}>
              <Trash2 aria-hidden="true" /> Delete article
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
