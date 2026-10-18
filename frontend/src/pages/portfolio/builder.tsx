/**
 * Portfolio Builder
 *
 * Comprehensive online portfolio builder allowing job seekers and developers
 * to customize profile branding, showcase featured projects with live links,
 * highlight categorized skills, configure custom themes, and publish a live portfolio.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { get, post, put, normalizeError } from '@/lib/api-client';
import {
  Globe,
  ExternalLink,
  Plus,
  Trash2,
  Eye,
  Check,
  Copy,
  FolderGit2,
  Sparkles,
  Palette,
  User,
  Layers,
  Share2,
  Save,
  Loader2,
} from 'lucide-react';

interface ProjectItem {
  id: string;
  title: string;
  description: string;
  techStack: string[];
  liveUrl: string;
  githubUrl: string;
  featured?: boolean;
}

interface PortfolioConfig {
  slug: string;
  fullName: string;
  headline: string;
  bio: string;
  location: string;
  avatarUrl: string;
  availableForHire: boolean;
  theme: 'meridian' | 'minimal' | 'cyber' | 'editorial';
  projects: ProjectItem[];
  skills: { category: string; list: string[] }[];
}

const DEFAULT_PORTFOLIO: PortfolioConfig = {
  slug: 'alex-morgan',
  fullName: 'Alex Morgan',
  headline: 'Staff Full-Stack Engineer & Cloud Systems Architect',
  bio: 'Building resilient distributed web systems and delightful user experiences. Over 7 years shipping high-scale React, TypeScript, Node.js, and cloud platforms.',
  location: 'San Francisco, CA / Remote',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=250&auto=format&fit=crop&q=80',
  availableForHire: true,
  theme: 'meridian',
  projects: [
    {
      id: 'proj-1',
      title: 'CloudMesh — Distributed Observability Platform',
      description: 'High-throughput telemetry ingestion pipeline processing over 50M metrics/sec with sub-second dashboards.',
      techStack: ['Go', 'Kubernetes', 'ClickHouse', 'React 19', 'Tailwind CSS'],
      liveUrl: 'https://example.com/cloudmesh',
      githubUrl: 'https://github.com/example/cloudmesh',
      featured: true,
    },
    {
      id: 'proj-2',
      title: 'SynthAI — Multimodal Prompt Engineering Studio',
      description: 'LLM playground featuring intelligent model routing, latency benchmarking, and automated prompt eval test suites.',
      techStack: ['TypeScript', 'Next.js', 'PostgreSQL', 'OpenAI API', 'Tailwind CSS'],
      liveUrl: 'https://example.com/synthai',
      githubUrl: 'https://github.com/example/synthai',
      featured: true,
    },
    {
      id: 'proj-3',
      title: 'FlowState — Offline-First Task Engine',
      description: 'Local-first collaborative workspace with CRDT-backed real-time sync and zero data-loss resilience.',
      techStack: ['React', 'WebSockets', 'IndexedDB', 'Node.js'],
      liveUrl: 'https://example.com/flowstate',
      githubUrl: 'https://github.com/example/flowstate',
    },
  ],
  skills: [
    { category: 'Frontend', list: ['React 19', 'TypeScript', 'Next.js', 'Tailwind CSS', 'Vite', 'GraphQL'] },
    { category: 'Backend & Systems', list: ['Node.js', 'Go', 'PostgreSQL', 'Redis', 'Kafka', 'REST/gRPC'] },
    { category: 'Cloud & Infrastructure', list: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD Pipelines'] },
  ],
};

const THEMES = [
  { id: 'meridian', name: 'Meridian Glass', desc: 'Vibrant gradients, translucent cards, and executive typography' },
  { id: 'minimal', name: 'Clean Minimal', desc: 'High contrast, generous whitespace, and laser-focused readability' },
  { id: 'cyber', name: 'Dark Terminal', desc: 'Monospaced accents, subtle neon borders, and hacker aesthetic' },
  { id: 'editorial', name: 'Editorial Serif', desc: 'Sophisticated typography inspired by high-end design magazines' },
];

export function PortfolioBuilderPage() {
  const [data, setData] = useState<PortfolioConfig>(DEFAULT_PORTFOLIO);
  const [activeTab, setActiveTab] = useState<'profile' | 'projects' | 'skills' | 'theme' | 'preview'>('profile');
  const [copied, setCopied] = useState(false);
  const [isPublished, setIsPublished] = useState(true);
  const [newTag, setNewTag] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);

  // Load portfolio on mount
  useEffect(() => {
    setLoading(true);
    get<{ portfolio: PortfolioConfig }>('/api/portfolios')
      .then((res) => {
        if (res?.portfolio) {
          setData(res.portfolio);
          setPortfolioId(res.portfolio.slug);
          setIsPublished(true);
        }
      })
      .catch((err) => {
        setError(normalizeError(err).message);
      })
      .finally(() => setLoading(false));
  }, []);

  const copyShareLink = () => {
    const url = `${window.location.origin}/portfolio/${data.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      if (portfolioId) {
        await put<{ portfolio: PortfolioConfig }>(`/api/portfolios/${portfolioId}`, data);
      } else {
        const result = await post<{ portfolio: PortfolioConfig }>('/api/portfolios', data);
        if (result?.portfolio?.slug) {
          setPortfolioId(result.portfolio.slug);
        }
      }
      setSaveMessage('Saved successfully');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!portfolioId) {
      await handleSave();
      if (!portfolioId) return;
    }
    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      await post<{ portfolio: PortfolioConfig }>(`/api/portfolios/${portfolioId}/publish`, {});
      setIsPublished(true);
      setSaveMessage('Published successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const addProject = () => {
    const newProj: ProjectItem = {
      id: `proj-${Date.now()}`,
      title: 'New Featured Project',
      description: 'Describe the problem solved, architectural decisions, and tangible impact.',
      techStack: ['TypeScript', 'React'],
      liveUrl: 'https://',
      githubUrl: 'https://github.com',
      featured: false,
    };
    setData({ ...data, projects: [newProj, ...data.projects] });
  };

  const removeProject = (id: string) => {
    setData({ ...data, projects: data.projects.filter((p) => p.id !== id) });
  };

  const updateProject = (id: string, updates: Partial<ProjectItem>) => {
    setData({
      ...data,
      projects: data.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    });
  };

  const addProjectTag = (projectId: string) => {
    const tag = newTag[projectId]?.trim();
    if (!tag) return;
    const project = data.projects.find((p) => p.id === projectId);
    if (!project || project.techStack.includes(tag)) return;

    updateProject(projectId, { techStack: [...project.techStack, tag] });
    setNewTag({ ...newTag, [projectId]: '' });
  };

  const removeProjectTag = (projectId: string, tagToRemove: string) => {
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) return;
    updateProject(projectId, {
      techStack: project.techStack.filter((t) => t !== tagToRemove),
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ─── Top Header & Share Bar ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-edge pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
              <Globe className="size-6 text-accent" />
              Portfolio Builder
            </h1>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border',
                isPublished
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-canvas-soft text-ink-muted border-edge'
              )}
            >
              {isPublished ? '● Live & Published' : '○ Draft'}
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-1">
            Build and share a high-conversion, responsive personal portfolio website in minutes.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={copyShareLink}
            className="text-xs gap-1.5"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-emerald-500" />
                Copied Link!
              </>
            ) : (
              <>
                <Share2 className="size-3.5" />
                Share Link
              </>
            )}
          </Button>

          <Button
            variant={isPublished ? 'secondary' : 'primary'}
            size="sm"
            onClick={handlePublish}
            loading={saving}
            className="text-xs font-semibold gap-1.5"
          >
            <Sparkles className="size-3.5" />
            {isPublished ? 'Update Changes' : 'Publish Portfolio'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            loading={saving}
            className="text-xs font-semibold gap-1.5"
          >
            <Save className="size-3.5" />
            Save Draft
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm" role="alert">
          {error}
        </div>
      )}

      {saveMessage && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          {saveMessage}
        </div>
      )}

      {/* ─── Builder Tabs ─── */}
      <div className="flex items-center gap-1 border-b border-edge overflow-x-auto pb-px">
        {[
          { id: 'profile', label: 'Profile & Bio', icon: User },
          { id: 'projects', label: `Projects (${data.projects.length})`, icon: FolderGit2 },
          { id: 'skills', label: 'Skills & Tech Stack', icon: Layers },
          { id: 'theme', label: 'Theme & URL', icon: Palette },
          { id: 'preview', label: 'Live Preview', icon: Eye },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                isActive
                  ? 'border-accent text-accent font-semibold'
                  : 'border-transparent text-ink-muted hover:text-ink hover:border-edge-strong'
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: Profile & Bio ─── */}
      {activeTab === 'profile' && (
        <Card className="border-edge shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Personal Branding & Bio</CardTitle>
            <CardDescription className="text-xs">
              This information sits prominently at the top of your public portfolio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Full Name</label>
                <Input
                  value={data.fullName}
                  onChange={(e) => setData({ ...data, fullName: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Location</label>
                <Input
                  value={data.location}
                  onChange={(e) => setData({ ...data, location: e.target.value })}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Professional Headline</label>
              <Input
                value={data.headline}
                onChange={(e) => setData({ ...data, headline: e.target.value })}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Biography & Value Proposition</label>
              <textarea
                rows={4}
                value={data.bio}
                onChange={(e) => setData({ ...data, bio: e.target.value })}
                className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Avatar / Headshot URL</label>
                <Input
                  value={data.avatarUrl}
                  onChange={(e) => setData({ ...data, avatarUrl: e.target.value })}
                  placeholder="https://..."
                  className="text-xs h-9"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="avail"
                  checked={data.availableForHire}
                  onChange={(e) => setData({ ...data, availableForHire: e.target.checked })}
                  className="size-4 rounded text-accent focus:ring-accent"
                />
                <label htmlFor="avail" className="text-xs font-medium text-ink cursor-pointer">
                  Show "Available for New Opportunities" Badge
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── TAB 2: Projects Showcase ─── */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-muted">
              Add your most impressive software engineering or design deliverables.
            </p>
            <Button size="sm" onClick={addProject} className="text-xs gap-1.5">
              <Plus className="size-3.5" />
              Add Project
            </Button>
          </div>

          <div className="space-y-4">
            {data.projects.map((proj, idx) => (
              <Card key={proj.id} className="border-edge shadow-sm relative">
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2">
                    <span className="size-6 rounded-full bg-accent/10 text-accent font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <CardTitle className="text-sm font-bold">{proj.title || 'Untitled Project'}</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeProject(proj.id)}
                    className="h-7 px-2 text-ink-muted hover:text-red-500"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-ink mb-1">Project Title</label>
                      <Input
                        value={proj.title}
                        onChange={(e) => updateProject(proj.id, { title: e.target.value })}
                        className="text-xs h-8"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-ink mb-1">Live URL</label>
                      <Input
                        value={proj.liveUrl}
                        onChange={(e) => updateProject(proj.id, { liveUrl: e.target.value })}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-ink mb-1">Description & Impact</label>
                    <textarea
                      rows={2}
                      value={proj.description}
                      onChange={(e) => updateProject(proj.id, { description: e.target.value })}
                      className="w-full rounded-lg border border-edge bg-canvas px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
                    />
                  </div>

                  {/* Tech Stack Tags */}
                  <div>
                    <label className="block text-[11px] font-semibold text-ink mb-1.5">Technologies Used</label>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {proj.techStack.map((tech) => (
                        <span
                          key={tech}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-canvas-soft border border-edge text-ink"
                        >
                          {tech}
                          <button
                            type="button"
                            onClick={() => removeProjectTag(proj.id, tech)}
                            className="text-ink-muted hover:text-red-500"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2 max-w-sm">
                      <Input
                        placeholder="Add technology (e.g. Docker, GraphQL)"
                        value={newTag[proj.id] || ''}
                        onChange={(e) => setNewTag({ ...newTag, [proj.id]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addProjectTag(proj.id);
                          }
                        }}
                        className="text-xs h-7"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => addProjectTag(proj.id)}
                        className="h-7 text-xs px-2.5"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 3: Skills ─── */}
      {activeTab === 'skills' && (
        <Card className="border-edge shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Categorized Skills & Core Competencies</CardTitle>
            <CardDescription className="text-xs">
              Organized skill badges that give recruiters an immediate high-confidence overview.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.skills.map((cat) => (
              <div key={cat.category} className="p-3.5 rounded-lg border border-edge bg-surface/50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-xs text-ink uppercase tracking-wider">{cat.category}</h3>
                  <span className="text-[11px] text-ink-muted">{cat.list.length} skills</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.list.map((item) => (
                    <span
                      key={item}
                      className="px-2.5 py-1 rounded-md text-xs font-medium bg-canvas border border-edge text-ink shadow-2xs"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── TAB 4: Theme & URL ─── */}
      {activeTab === 'theme' && (
        <div className="space-y-6">
          <Card className="border-edge shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Custom Domain & URL Slug</CardTitle>
              <CardDescription className="text-xs">
                Your portfolio will be instantly accessible at this unique URL.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center max-w-md">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-edge bg-canvas-soft text-xs text-ink-muted h-9">
                  ime365.com/p/
                </span>
                <Input
                  value={data.slug}
                  onChange={(e) => setData({ ...data, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="rounded-l-none text-xs h-9 font-semibold"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-edge shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Visual Theme & Layout Style</CardTitle>
              <CardDescription className="text-xs">
                Pick a typography and layout preset tailored to your personality.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {THEMES.map((theme) => {
                  const isSelected = data.theme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setData({ ...data, theme: theme.id as typeof data.theme })}
                      className={cn(
                        'p-4 rounded-xl border text-left transition-all',
                        isSelected
                          ? 'border-accent bg-accent-soft/30 shadow-sm ring-2 ring-accent/30'
                          : 'border-edge hover:border-edge-strong bg-surface'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-ink">{theme.name}</span>
                        {isSelected && <Check className="size-4 text-accent" />}
                      </div>
                      <p className="text-[11px] text-ink-muted">{theme.desc}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 5: Live Preview ─── */}
      {activeTab === 'preview' && (
        <div className="rounded-2xl border border-edge overflow-hidden shadow-xl bg-canvas">
          {/* Simulated Browser Bar */}
          <div className="bg-canvas-soft px-4 py-2.5 border-b border-edge flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-red-400" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="size-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="px-3 py-1 rounded bg-surface border border-edge text-[11px] text-ink-muted font-mono flex items-center gap-1">
              <Globe className="size-3" />
              https://ime365.com/p/{data.slug}
            </div>
            <div className="text-[11px] text-ink-muted">Live Preview</div>
          </div>

          {/* Rendered Portfolio Simulation */}
          <div className="p-6 sm:p-12 max-w-4xl mx-auto space-y-12">
            {/* Hero */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <img
                src={data.avatarUrl}
                alt={data.fullName}
                className="size-24 rounded-full object-cover border-2 border-accent shadow-md"
              />
              <div className="space-y-1.5">
                {data.availableForHire && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    ● Available for Opportunities
                  </span>
                )}
                <h1 className="text-2xl sm:text-3xl font-extrabold text-ink">{data.fullName}</h1>
                <p className="text-sm font-semibold text-accent">{data.headline}</p>
                <p className="text-xs text-ink-muted max-w-xl">{data.bio}</p>
              </div>
            </div>

            {/* Featured Projects */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-ink border-b border-edge pb-2">
                Featured Projects
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {data.projects.map((proj) => (
                  <div key={proj.id} className="p-4 rounded-xl border border-edge bg-surface/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-ink">{proj.title}</h3>
                      <div className="flex items-center gap-3">
                        {proj.liveUrl && (
                          <a
                            href={proj.liveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-accent hover:underline flex items-center gap-1"
                          >
                            Live Demo <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-ink-muted">{proj.description}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {proj.techStack.map((tech) => (
                        <span key={tech} className="px-2 py-0.5 rounded text-[10px] font-medium bg-canvas-soft border border-edge/60 text-ink">
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-ink border-b border-edge pb-2">
                Technical Expertise
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {data.skills.map((cat) => (
                  <div key={cat.category} className="space-y-2">
                    <h3 className="text-xs font-bold text-ink uppercase tracking-wider">{cat.category}</h3>
                    <div className="flex flex-wrap gap-1">
                      {cat.list.map((item) => (
                        <span key={item} className="px-2 py-0.5 rounded text-[11px] bg-canvas-soft border border-edge text-ink">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
