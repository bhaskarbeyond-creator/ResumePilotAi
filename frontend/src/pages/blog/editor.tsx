/**
 * Enterprise Blog Editor
 *
 * Routes: /blog-editor, /blog-editor/:postId
 * Full-featured authoring suite for publication managers & admins.
 * Supports Markdown editing with live preview, metadata configuration,
 * word count statistics, and SEO optimization.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageSpinner } from '@/components/ui/loading';
import { get, post, put } from '@/lib/api-client';
import {
  Eye,
  Edit3,
  ArrowLeft,
  Sparkles,
  Globe,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface BlogPostData {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  coverImage?: string;
  status: 'draft' | 'published';
  metaTitle?: string;
  metaDescription?: string;
  tags?: string[];
}

const DEFAULT_POST: BlogPostData = {
  title: '',
  slug: '',
  excerpt: '',
  content: `# Modern Engineering Career Playbook

In today's competitive tech ecosystem, landing executive and staff-level software engineering positions requires more than just algorithmic aptitude. It demands **structured systems thinking**, proactive communication, and verifiable business impact.

## 1. The Power of Measurable Impact

When describing previous engineering achievements on your resume or portfolio, always frame your bullets through the STAR + Metric formula:

> **Action + Scope + Quantifiable Metric + Business Outcome**

*Example:*
- Spearheaded the redesign of the core billing microservices pipeline, reducing p99 API latency from 450ms to 92ms and eliminating $42,000 in monthly compute overhead.

## 2. Navigating the Modern ATS Scanner

Modern applicant tracking systems use semantic vector embeddings in addition to exact keyword matching. Ensure your skills block explicitly covers:
- Core systems programming languages (e.g., TypeScript, Go, Rust, Python)
- Modern cloud orchestrators (Kubernetes, Terraform, AWS ECS)
- Architecture paradigms (Event-driven architectures, Kafka, WebSockets)

## Summary

Keep iterating on your resume and interview simulations using continuous AI feedback. High preparation creates high confidence.
`,
  category: 'Career Advice',
  author: 'IME365 Editorial Board',
  status: 'draft',
  metaTitle: 'Modern Engineering Career Playbook | IME365',
  metaDescription: 'Strategic career advice for senior and staff software engineers aiming for top tech roles.',
  tags: ['Career', 'Engineering', 'Interviews', 'ATS'],
};

export function BlogEditorPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();

  const [postData, setPostData] = useState<BlogPostData>(DEFAULT_POST);
  const [activeTab, setActiveTab] = useState<'write' | 'preview' | 'seo'>('write');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (postId && postId !== 'new') {
      setLoading(true);
      get<BlogPostData>(`/blog/posts/${postId}`)
        .then((res) => {
          if (res) setPostData(res);
        })
        .catch(() => {
          // If not found or offline, keep default
        })
        .finally(() => setLoading(false));
    }
  }, [postId]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    const generatedSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setPostData((prev) => ({
      ...prev,
      title,
      slug: prev.slug && prev.slug !== generatedSlug.slice(0, -1) ? prev.slug : generatedSlug,
      metaTitle: `${title} | IME365`,
    }));
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim();
      if (!postData.tags?.includes(newTag)) {
        setPostData((prev) => ({
          ...prev,
          tags: [...(prev.tags || []), newTag],
        }));
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setPostData((prev) => ({
      ...prev,
      tags: prev.tags?.filter((t) => t !== tagToRemove) || [],
    }));
  };

  const handleSave = async (statusOverride?: 'draft' | 'published') => {
    setSaving(true);
    setSavedSuccess(false);
    setSaveError(null);
    const targetStatus = statusOverride || postData.status;
    const payload = {
      ...postData,
      status: targetStatus,
      published: targetStatus === 'published',
    };

    try {
      if (postId && postId !== 'new') {
        await put(`/blog/posts/${postId}`, payload);
      } else {
        await post('/blog/posts', payload);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save blog post.');
      setTimeout(() => setSaveError(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const wordCount = postData.content.trim().split(/\s+/).filter(Boolean).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  if (loading) return <PageSpinner />;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-canvas p-4 lg:p-6">
      {/* Top Action Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/blog')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-ink">
                {postData.title ? postData.title : 'Untitled Post'}
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  postData.status === 'published'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}
              >
                {postData.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              {wordCount} words · {readingTimeMinutes} min read
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-[fade-in_200ms_ease-out]">
              <CheckCircle className="size-4" />
              Saved
            </span>
          )}

          {saveError && (
            <span className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 animate-[fade-in_200ms_ease-out]">
              <AlertCircle className="size-4" />
              {saveError}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            loading={saving}
            onClick={() => handleSave('draft')}
          >
            Save Draft
          </Button>

          <Button
            size="sm"
            loading={saving}
            onClick={() => handleSave('published')}
            className="bg-brand-600 hover:bg-brand-700"
          >
            <Sparkles className="size-4 mr-1.5" />
            Publish
          </Button>
        </div>
      </div>

      {/* Editor Main Surface */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        {/* Left Column: Editor Tabs / Content (8 cols) */}
        <div className="flex flex-col lg:col-span-8 rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
          {/* Mode Switcher */}
          <div className="flex items-center justify-between border-b border-border bg-canvas/40 px-4 py-2 text-xs">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('write')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  activeTab === 'write'
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'text-ink-muted hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-ink'
                }`}
              >
                <Edit3 className="size-3.5" />
                Write
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  activeTab === 'preview'
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'text-ink-muted hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-ink'
                }`}
              >
                <Eye className="size-3.5" />
                Live Preview
              </button>
              <button
                onClick={() => setActiveTab('seo')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  activeTab === 'seo'
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'text-ink-muted hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-ink'
                }`}
              >
                <Globe className="size-3.5" />
                SEO & Social
              </button>
            </div>

            <span className="text-[11px] text-ink-muted hidden sm:inline">
              Markdown syntax supported
            </span>
          </div>

          {/* Tab Views */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {activeTab === 'write' && (
              <div className="h-full flex flex-col space-y-4">
                <Input
                  placeholder="Article Title..."
                  value={postData.title}
                  onChange={handleTitleChange}
                  className="text-xl font-bold border-none px-0 shadow-none focus-visible:ring-0 placeholder:text-neutral-400 dark:placeholder:text-neutral-600"
                />

                <Input
                  placeholder="Short excerpt / teaser summary..."
                  value={postData.excerpt}
                  onChange={(e) => setPostData({ ...postData, excerpt: e.target.value })}
                  className="text-sm italic text-ink-muted border-none px-0 shadow-none focus-visible:ring-0"
                />

                <textarea
                  value={postData.content}
                  onChange={(e) => setPostData({ ...postData, content: e.target.value })}
                  placeholder="Write your article in Markdown..."
                  className="w-full flex-1 resize-none border-t border-border pt-4 bg-transparent font-mono text-sm leading-relaxed text-ink focus:outline-none"
                  rows={20}
                />
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="max-w-2xl mx-auto py-4 space-y-6">
                <div>
                  <span className="rounded bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
                    {postData.category}
                  </span>
                  <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
                    {postData.title || 'Untitled Article'}
                  </h1>
                  {postData.excerpt && (
                    <p className="mt-2 text-base text-ink-muted italic">
                      {postData.excerpt}
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-3 text-xs text-ink-muted border-b border-border pb-4">
                    <span>By {postData.author}</span>
                    <span>·</span>
                    <span>{readingTimeMinutes} min read</span>
                  </div>
                </div>

                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line text-sm text-ink leading-relaxed">
                  {postData.content}
                </div>
              </div>
            )}

            {activeTab === 'seo' && (
              <div className="max-w-xl mx-auto py-4 space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-ink">Search Engine Optimization</h3>
                  <p className="text-xs text-ink-muted">
                    Configure how this article appears in Google search and social shares.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">
                      Meta Title
                    </label>
                    <Input
                      value={postData.metaTitle || ''}
                      onChange={(e) => setPostData({ ...postData, metaTitle: e.target.value })}
                      placeholder="Article title for search engines"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">
                      Meta Description
                    </label>
                    <textarea
                      value={postData.metaDescription || ''}
                      onChange={(e) => setPostData({ ...postData, metaDescription: e.target.value })}
                      placeholder="150-160 characters summarizing the article..."
                      rows={3}
                      className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-ink focus:border-brand-500 focus:outline-none"
                    />
                  </div>

                  {/* Google Preview Snippet */}
                  <div className="rounded-xl border border-border bg-canvas/50 p-4">
                    <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider block mb-2">
                      Google Search Preview
                    </span>
                    <div className="text-blue-600 dark:text-blue-400 text-base font-medium truncate">
                      {postData.metaTitle || postData.title || 'Article Title'}
                    </div>
                    <div className="text-xs text-emerald-700 dark:text-emerald-500 mt-0.5">
                      https://ime365.ai/blog/{postData.slug || 'article-slug'}
                    </div>
                    <div className="text-xs text-ink-muted mt-1 line-clamp-2">
                      {postData.metaDescription || postData.excerpt || 'Article summary description...'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Settings & Metadata (4 cols) */}
        <div className="flex flex-col lg:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">Publishing Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">URL Slug</label>
                <Input
                  value={postData.slug}
                  onChange={(e) => setPostData({ ...postData, slug: e.target.value })}
                  placeholder="article-url-slug"
                  className="text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Category</label>
                <select
                  value={postData.category}
                  onChange={(e) => setPostData({ ...postData, category: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
                >
                  <option value="Career Advice">Career Advice</option>
                  <option value="Resume Optimization">Resume Optimization</option>
                  <option value="Technical Interviews">Technical Interviews</option>
                  <option value="AI & Technology">AI & Technology</option>
                  <option value="Salary Negotiation">Salary Negotiation</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Author</label>
                <Input
                  value={postData.author}
                  onChange={(e) => setPostData({ ...postData, author: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Cover Image URL</label>
                <Input
                  value={postData.coverImage || ''}
                  onChange={(e) => setPostData({ ...postData, coverImage: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Tags (Press Enter)</label>
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Add a tag..."
                  className="text-xs"
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {postData.tags?.map((tag) => (
                    <span
                      key={tag}
                      onClick={() => handleRemoveTag(tag)}
                      className="cursor-pointer rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[11px] text-ink-muted hover:bg-error-50 hover:text-error-600 transition-colors"
                      title="Click to remove"
                    >
                      #{tag} ×
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
