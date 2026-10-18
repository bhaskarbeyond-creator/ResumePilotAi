/**
 * Public Portfolio Viewer
 *
 * Route: /portfolio/:slug
 * Public view of a published candidate portfolio - fetches from GET /api/portfolios/public/:slug
 * DOES NOT render the builder studio.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { get, normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  ExternalLink,
  MapPin,
  Globe,
  Briefcase,
  Code,
  Palette,
  Star,
  ChevronLeft,
  Mail,
  Phone,
  FolderGit2,
} from 'lucide-react';

function LinkedinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

interface PublicPortfolio {
  id: string;
  slug: string;
  fullName: string;
  headline: string;
  bio: string;
  location: string;
  avatarUrl: string;
  availableForHire: boolean;
  theme: string;
  projects: {
    id: string;
    title: string;
    description: string;
    techStack: string[];
    liveUrl: string;
    githubUrl: string;
    featured: boolean;
  }[];
  skills: { category: string; list: string[] }[];
  links: {
    website?: string;
    linkedin?: string;
    github?: string;
    email?: string;
  };
  publishedAt: string;
}

export function PublicPortfolioPage() {
  const { slug } = useParams<{ slug: string }>();
  const [portfolio, setPortfolio] = useState<PublicPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPortfolio() {
      if (!slug) {
        setError('Invalid portfolio slug');
        setLoading(false);
        return;
      }
      try {
        const data = await get<{ portfolio: PublicPortfolio }>(`/api/portfolios/public/${slug}`);
        setPortfolio(data.portfolio ?? null);
      } catch (err) {
        setError(normalizeError(err).message);
      } finally {
        setLoading(false);
      }
    }
    loadPortfolio();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <Briefcase className="mx-auto mb-4 size-12 text-ink-subtle" />
          <h1 className="text-2xl font-bold text-ink">Portfolio Not Found</h1>
          <p className="mt-2 text-ink-muted">
            {error ? `Error: ${error}` : 'This portfolio does not exist or has not been published.'}
          </p>
          <Link to="/portfolios" className="mt-6 inline-flex items-center gap-2 text-brand-600 hover:underline">
            <ChevronLeft className="size-4" />
            Browse All Portfolios
          </Link>
        </div>
      </div>
    );
  }

  const themeClasses: Record<string, string> = {
    meridian: 'from-brand-600 via-indigo-600 to-purple-600',
    minimal: 'from-neutral-600 to-neutral-700',
    cyber: 'from-emerald-600 via-cyan-600 to-blue-600',
    editorial: 'from-amber-600 via-orange-600 to-red-600',
  };

  const accentGradient = themeClasses[portfolio.theme] || themeClasses.meridian;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Floating Back Link */}
      <div className="mx-auto max-w-4xl px-4 pt-6 print:hidden">
        <Link
          to="/portfolios"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Gallery
        </Link>
      </div>

      {/* Portfolio Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 pb-16">
        {/* Hero Section */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br {accentGradient} p-8 sm:p-12 text-white">
          {/* Accent decoration */}
          <div className="absolute inset-0 opacity-10" aria-hidden="true">
            <div className="absolute -top-20 -right-20 size-72 rounded-full bg-white blur-3xl" />
            <div className="absolute -bottom-20 -left-20 size-72 rounded-full bg-white blur-3xl" />
          </div>

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {portfolio.availableForHire && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white/20 backdrop-blur-sm border border-white/30">
                    ● Available for Opportunities
                  </span>
                )}
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white/10 backdrop-blur-sm">
                  {portfolio.theme}
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{portfolio.fullName}</h1>
              <p className="text-lg sm:text-xl font-medium opacity-90">{portfolio.headline}</p>
              <p className="text-base opacity-80 max-w-2xl">{portfolio.bio}</p>

              {/* Contact Links */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {portfolio.links.linkedin && (
                  <a
                    href={`https://${portfolio.links.linkedin.replace(/^https?:\/\//, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm opacity-80 hover:opacity-100 transition-opacity"
                  >
                    <LinkedinIcon className="size-4" />
                    LinkedIn
                  </a>
                )}
                {portfolio.links.github && (
                  <a
                    href={`https://${portfolio.links.github.replace(/^https?:\/\//, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm opacity-80 hover:opacity-100 transition-opacity"
                  >
                    <GithubIcon className="size-4" />
                    GitHub
                  </a>
                )}
                {portfolio.links.website && (
                  <a
                    href={portfolio.links.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm opacity-80 hover:opacity-100 transition-opacity"
                  >
                    <Globe className="size-4" />
                    Website
                  </a>
                )}
                {portfolio.links.email && (
                  <a
                    href={`mailto:${portfolio.links.email}`}
                    className="flex items-center gap-1.5 text-sm opacity-80 hover:opacity-100 transition-opacity"
                  >
                    <Mail className="size-4" />
                    Email
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Location badge */}
          <div className="absolute bottom-6 left-8 right-8 sm:static sm:mt-8 sm:mb-0 flex items-center gap-2 opacity-80">
            <MapPin className="size-4" />
            <span className="text-sm">{portfolio.location}</span>
          </div>
        </div>

        {/* Featured Projects */}
        {portfolio.projects.length > 0 && (
          <section className="mt-12 space-y-6" aria-labelledby="projects-heading">
            <div className="flex items-center justify-between">
              <h2 id="projects-heading" className="text-2xl font-bold text-ink flex items-center gap-2">
                <FolderGit2 className="size-6 text-accent" />
                Featured Projects
              </h2>
              <span className="text-sm text-ink-muted">{portfolio.projects.length} project{portfolio.projects.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {portfolio.projects.map((project) => (
                <Card key={project.id} className="group overflow-hidden transition-all hover:shadow-lg border-border">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-ink group-hover:text-accent transition-colors">
                          {project.title}
                        </h3>
                        {project.featured && (
                          <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <Star className="size-3 mr-1" /> Featured
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-ink-muted line-clamp-3">{project.description}</p>

                    {/* Tech Stack */}
                    <div className="flex flex-wrap gap-1.5">
                      {project.techStack.slice(0, 6).map((tech) => (
                        <span key={tech} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-ink-secondary">
                          {tech}
                        </span>
                      ))}
                      {project.techStack.length > 6 && (
                        <span className="text-xs text-ink-muted">+{project.techStack.length - 6} more</span>
                      )}
                    </div>

                    {/* Project Links */}
                    <div className="flex items-center gap-3 pt-2 border-t border-border">
                      {project.liveUrl && project.liveUrl !== 'https://' && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={project.liveUrl} target="_blank" rel="noreferrer">
                            Live Demo <ExternalLink className="size-3.5 ml-1.5" />
                          </a>
                        </Button>
                      )}
                      {project.githubUrl && project.githubUrl !== 'https://github.com' && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={project.githubUrl} target="_blank" rel="noreferrer">
                            <GithubIcon className="size-3.5 mr-1.5" />
                            Code
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Skills */}
        {portfolio.skills.length > 0 && (
          <section className="mt-12 space-y-6" aria-labelledby="skills-heading">
            <h2 id="skills-heading" className="text-2xl font-bold text-ink flex items-center gap-2">
              <Palette className="size-6 text-accent" />
              Technical Expertise
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {portfolio.skills.map((category) => (
                <Card key={category.category} className="border-border">
                  <CardContent className="p-5 space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-ink">{category.category}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {category.list.map((skill) => (
                        <span key={skill} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-ink-secondary">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-ink-muted">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-brand-600">IME365</span>
              <span>·</span>
              <span>Verified Professional Portfolio</span>
            </div>
            <Link to="/" className="text-brand-600 hover:underline">
              Create your portfolio on IME365
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}

