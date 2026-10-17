/**
 * Features Showcase Page
 *
 * Comprehensive feature showcase detailing:
 * - 51+ ATS-Compliant Resume Templates
 * - Multi-Model AI Studio & STAR Optimizer
 * - Real-Time AI Interview Coach & Simulator
 * - Application Pipeline Tracker
 * - Online Portfolio Builder
 * - High-Fidelity PDF & DOCX Export Pipeline
 */

import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Sparkles,
  MessageSquare,
  BarChart3,
  Globe,
  Download,
  Shield,
  ArrowRight,
  Zap,
  CheckCircle2,
} from 'lucide-react';

const FEATURES_LIST = [
  {
    icon: FileText,
    tag: 'Resume Architecture',
    title: '51+ ATS-Compliant Templates',
    description:
      'Engineered in strict accordance with modern Applicant Tracking System (ATS) parsing specifications. Clean typographic hierarchy, semantic headings, and zero table distortion ensure 100% parse rates across Workday, Taleo, Greenhouse, and Lever.',
    highlights: [
      '51+ curated executive, modern, and technical layouts',
      'Dual-column and single-column responsive formats',
      'Instant color palette and typography customizers',
      'Real-time live document preview',
    ],
  },
  {
    icon: Sparkles,
    tag: 'Artificial Intelligence',
    title: 'AI STAR Bullet Optimizer & Bio Studio',
    description:
      'Turn routine job duties into high-impact, metric-driven achievement statements using the STAR (Situation, Task, Action, Result) framework. Equipped with anti-cliché algorithms and semantic keyword matching tailored to your target roles.',
    highlights: [
      'Multi-provider LLM orchestration (Llama 3.2, Nemotron, GPT-4o)',
      'Job description keyword extraction and gap analysis',
      'Executive bio and LinkedIn headline generation',
      'Contextual experience synthesis and deduplication',
    ],
  },
  {
    icon: MessageSquare,
    tag: 'Interview Prep',
    title: 'Interactive AI Mock Interview Coach',
    description:
      'Simulate high-stakes behavioral, technical, and executive interview loops. Receive instant, actionable feedback on answer structure, metric specificity, and areas of improvement before speaking to real recruiters.',
    highlights: [
      'Role-tailored question banks across 20+ industries',
      'STAR and CAR framework answer grading',
      'Real-time speech-to-text and simulated voice loops',
      'Comprehensive performance scoring cards',
    ],
  },
  {
    icon: BarChart3,
    tag: 'ATS Intelligence',
    title: 'Instant ATS Compatibility Scoring',
    description:
      'Upload any resume and compare it against your dream job description. Our semantic NLP engine scores keyword density, section structure, contact readability, and provides a clear checklist of what to fix to beat the filter.',
    highlights: [
      'Overall 0-100 ATS readiness score',
      'Missing required vs preferred keywords breakdown',
      'Section-by-section health analysis',
      'One-click auto-apply suggestions',
    ],
  },
  {
    icon: Globe,
    tag: 'Digital Presence',
    title: 'One-Click Personal Portfolio Builder',
    description:
      'Showcase your projects, technical skills, and career achievements with a responsive online portfolio website. Custom subdomain, rich project previews, live links, and theme personalization included.',
    highlights: [
      'Published instantly at ime365.com/p/yourname',
      'Project showcase with GitHub and live demo links',
      'Categorized technical skill competency badges',
      'Mobile-optimized responsive layouts',
    ],
  },
  {
    icon: Download,
    tag: 'Export Pipeline',
    title: 'High-Fidelity PDF & DOCX Export',
    description:
      'Export pixel-perfect PDF documents and fully editable Microsoft Word (.docx) files. Built with custom document compilers to prevent line wrapping anomalies or page break cutoffs.',
    highlights: [
      'Clean vector typography rendering',
      'Pure Microsoft Word .docx native XML formatting',
      'Multi-page pagination balance engine',
      'No watermarks on paid tiers',
    ],
  },
];

export function FeaturesPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* ─── Top Header ─── */}
      <header className="border-b border-edge/60 bg-surface/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-lg text-ink">
            <div className="size-8 rounded-lg bg-accent text-white flex items-center justify-center font-extrabold text-sm shadow-sm">
              IME
            </div>
            <span>Interview Made Easy</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/pricing" className="text-sm font-medium text-ink-muted hover:text-ink transition-colors">
              Pricing
            </Link>
            <Link to="/login" className="text-sm font-medium text-ink-muted hover:text-ink transition-colors">
              Sign In
            </Link>
            <Button size="sm" asChild>
              <Link to="/login?tab=register">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Hero Section ─── */}
      <section className="py-16 md:py-24 px-4 sm:px-6 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-accent-soft text-accent border border-accent/20 mb-6">
          <Zap className="size-3.5" />
          The Complete Career Acceleration Suite
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-ink">
          Every Tool You Need to Land Your Next Dream Offer
        </h1>
        <p className="mt-4 text-base sm:text-lg text-ink-muted max-w-2xl mx-auto">
          Explore the architecture, intelligent features, and enterprise-grade tools that power IME365.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button size="lg" asChild className="font-semibold shadow-md">
            <Link to="/login?tab=register">
              Start Free Trial
              <ArrowRight className="size-4 ml-2" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/pricing">View Plans</Link>
          </Button>
        </div>
      </section>

      {/* ─── Deep Dive Features Grid ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {FEATURES_LIST.map((feat) => {
            const Icon = feat.icon;
            return (
              <Card key={feat.title} className="border-edge shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6 sm:p-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="size-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                      <Icon className="size-5" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-accent bg-accent/10 px-2.5 py-0.5 rounded">
                      {feat.tag}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-ink">{feat.title}</h2>
                  <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">{feat.description}</p>

                  <div className="border-t border-edge pt-4 space-y-2">
                    {feat.highlights.map((h) => (
                      <div key={h} className="flex items-center gap-2 text-xs text-ink">
                        <CheckCircle2 className="size-3.5 text-accent shrink-0" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="py-16 bg-accent text-white text-center px-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold">Build a Resume Recruiters Can't Ignore</h2>
          <p className="text-sm text-white/80 max-w-xl mx-auto">
            Experience the difference of an ATS-compliant, AI-accelerated resume builder today.
          </p>
          <div className="pt-2">
            <Button size="lg" variant="secondary" className="font-bold shadow-lg" asChild>
              <Link to="/login?tab=register">
                Get Started Free
                <ArrowRight className="size-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
