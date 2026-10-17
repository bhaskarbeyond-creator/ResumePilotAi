/**
 * Landing Page
 *
 * Public-facing homepage for IME365 — Interview Made Easy.
 * Enterprise-grade design with hero, features, social proof, and CTA.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import {
  FileText,
  BarChart3,
  Briefcase,
  GraduationCap,
  Sparkles,
  Award,
  CheckCircle2,
  ArrowRight,
  Star,
  Zap,
  Shield,
  Globe,
} from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: 'Professional Resume Builder',
    description: 'Create stunning resumes with 51+ professionally designed templates. ATS-optimized and ready to impress.',
  },
  {
    icon: BarChart3,
    title: 'ATS Score Analysis',
    description: 'Get instant feedback on how your resume performs against Applicant Tracking Systems used by top employers.',
  },
  {
    icon: GraduationCap,
    title: 'AI Interview Coach',
    description: 'Practice interviews with our AI-powered coach. Get real-time feedback and improve your performance.',
  },
  {
    icon: Briefcase,
    title: 'Smart Job Portal',
    description: 'Discover matching opportunities, track applications, and manage your job search from one dashboard.',
  },
  {
    icon: Sparkles,
    title: 'AI-Powered Writing',
    description: 'Let AI help you craft compelling summaries, work descriptions, and cover letters tailored to each role.',
  },
  {
    icon: Award,
    title: 'Portfolio Builder',
    description: 'Showcase your work with a professional portfolio. Share a public link with recruiters and hiring managers.',
  },
];

const stats = [
  { value: '50K+', label: 'Resumes Created' },
  { value: '51', label: 'Resume Templates' },
  { value: '95%', label: 'ATS Pass Rate' },
  { value: '4.9', label: 'User Rating' },
];

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-canvas">
      {/* Navigation */}
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border/60 bg-surface/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Primary navigation">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600 font-bold text-white text-sm shadow-sm">
              IM
            </div>
            <span className="text-lg font-bold text-ink tracking-tight">IME365</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <Link to="/features" className="text-sm font-medium text-ink-secondary hover:text-ink transition-colors no-underline">Features</Link>
            <Link to="/pricing" className="text-sm font-medium text-ink-secondary hover:text-ink transition-colors no-underline">Pricing</Link>
            <Link to="/blog" className="text-sm font-medium text-ink-secondary hover:text-ink transition-colors no-underline">Blog</Link>
            <Link to="/jobs" className="text-sm font-medium text-ink-secondary hover:text-ink transition-colors no-underline">Jobs</Link>
            <Link to="/contact" className="text-sm font-medium text-ink-secondary hover:text-ink transition-colors no-underline">Contact</Link>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <Button asChild>
                <Link to="/dashboard">Go to Dashboard <ArrowRight className="size-4" /></Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                  <Link to="/login">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link to="/login">Get Started Free <ArrowRight className="size-4" /></Link>
                </Button>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-brand-100/50 blur-3xl" />
          <div className="absolute right-0 top-1/3 h-[400px] w-[600px] rounded-full bg-info-100/30 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700">
              <Zap className="size-4" />
              AI-Powered Career Platform
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl lg:text-6xl text-balance">
              Build Your Career with{' '}
              <span className="bg-gradient-to-r from-brand-600 to-info-600 bg-clip-text text-transparent">
                Confidence
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-secondary leading-relaxed">
              Create professional resumes, ace your interviews, and land your dream job.
              Powered by AI and trusted by thousands of professionals worldwide.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="xl" asChild>
                <Link to={user ? '/dashboard' : '/login'}>
                  {user ? 'Open Dashboard' : 'Start Building Free'}
                  <ArrowRight className="size-5" />
                </Link>
              </Button>
              <Button variant="outline" size="xl" asChild>
                <Link to="/features">
                  See All Features
                </Link>
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-1.5 text-sm text-ink-muted">
                <CheckCircle2 className="size-4 text-success-500" />
                No credit card required
              </div>
              <div className="flex items-center gap-1.5 text-sm text-ink-muted">
                <Shield className="size-4 text-success-500" />
                Enterprise security
              </div>
              <div className="flex items-center gap-1.5 text-sm text-ink-muted">
                <Globe className="size-4 text-success-500" />
                Used in 50+ countries
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-ink lg:text-4xl">{stat.value}</div>
                <div className="mt-1 text-sm text-ink-muted">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Everything you need to succeed
            </h2>
            <p className="mt-4 text-lg text-ink-secondary">
              A comprehensive platform that helps you at every stage of your career journey.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group rounded-2xl border border-border bg-surface p-6 transition-all duration-300 hover:border-brand-200 hover:shadow-lg"
                >
                  <div className="mb-4 inline-flex rounded-xl bg-brand-50 p-3 transition-colors group-hover:bg-brand-100">
                    <Icon className="size-6 text-brand-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-ink">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="border-t border-border bg-surface py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-ink">
              Loved by professionals
            </h2>
            <p className="mt-4 text-lg text-ink-secondary">
              Join thousands of professionals who have accelerated their careers with IME365.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { name: 'Sarah K.', role: 'Software Engineer', text: 'The AI interview coach helped me prepare for my dream job. I felt so much more confident going into the interview.' },
              { name: 'Michael R.', role: 'Product Manager', text: 'Built a professional resume in minutes. The ATS scoring feature helped me understand what recruiters look for.' },
              { name: 'Priya S.', role: 'UX Designer', text: 'The portfolio builder and resume templates are stunning. I received more callbacks after switching to IME365.' },
            ].map((testimonial) => (
              <div key={testimonial.name} className="rounded-2xl border border-border p-6">
                <div className="flex gap-1 text-warning-500">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className="size-4 fill-current" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-ink-secondary">"{testimonial.text}"</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {testimonial.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">{testimonial.name}</div>
                    <div className="text-xs text-ink-muted">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-8 py-16 text-center shadow-2xl sm:px-16">
            <div className="absolute left-0 top-0 -z-0 h-full w-full">
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl font-bold text-white sm:text-4xl">Ready to advance your career?</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">
                Join thousands of professionals using IME365 to build better resumes, prepare for interviews, and land their dream jobs.
              </p>
              <div className="mt-8">
                <Button
                  size="xl"
                  variant="secondary"
                  className="bg-white text-brand-700 hover:bg-brand-50"
                  asChild
                >
                  <Link to={user ? '/dashboard' : '/login'}>
                    {user ? 'Go to Dashboard' : 'Get Started — It\'s Free'}
                    <ArrowRight className="size-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <Link to="/" className="flex items-center gap-2 no-underline">
                <div className="flex size-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white text-sm">
                  IM
                </div>
                <span className="font-bold text-ink">IME365</span>
              </Link>
              <p className="mt-3 text-sm text-ink-muted">
                AI-powered career platform helping professionals build resumes, prepare for interviews, and find jobs.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-ink text-sm">Product</h4>
              <ul className="mt-3 space-y-2">
                {['Features', 'Pricing', 'Templates', 'Blog'].map((item) => (
                  <li key={item}>
                    <Link to={`/${item.toLowerCase()}`} className="text-sm text-ink-muted hover:text-ink transition-colors no-underline">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-ink text-sm">Resources</h4>
              <ul className="mt-3 space-y-2">
                {[
                  { label: 'Jobs', href: '/jobs' },
                  { label: 'Contact', href: '/contact' },
                  { label: 'Portfolios', href: '/portfolios' },
                ].map((item) => (
                  <li key={item.label}>
                    <Link to={item.href} className="text-sm text-ink-muted hover:text-ink transition-colors no-underline">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-ink text-sm">Legal</h4>
              <ul className="mt-3 space-y-2">
                {[
                  { label: 'Privacy Policy', href: '/p/privacy-policy' },
                  { label: 'Terms of Service', href: '/p/terms-of-service' },
                  { label: 'Cookie Policy', href: '/p/cookie-policy' },
                ].map((item) => (
                  <li key={item.label}>
                    <Link to={item.href} className="text-sm text-ink-muted hover:text-ink transition-colors no-underline">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-border pt-6 text-center text-xs text-ink-muted">
            © {new Date().getFullYear()} IME365 — Interview Made Easy. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
