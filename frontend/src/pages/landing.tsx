/**
 * Landing Page
 *
 * Public-facing homepage for IME365 — Interview Made Easy.
 *
 * DISC-008 accessibility hardening:
 *  - a keyboard "Skip to main content" link that becomes visible on focus and
 *    moves focus to the single <main> landmark (tabIndex -1),
 *  - all page content inside that one main landmark; header and footer stay
 *    outside it, and each navigation region has its own accessible name,
 *  - measured contrast: body copy uses ink-secondary (#515562, 7.05:1 on the
 *    canvas) and muted labels ink-muted (#636878, 5.27:1); the hero/CTA copy on
 *    the brand gradient uses brand-100 (#dbe4ff, 6.68:1 on brand-700 and 8.28:1
 *    on brand-800) instead of the 4.48:1 brand-200; rating stars use
 *    warning-700 (4.84:1 on white) instead of 2.15:1 warning-500,
 *  - explicit focus-visible rings on every interactive control, and
 *  - fluid layout with min-w-0/break-words so nothing overflows from 375px up.
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
  Zap,
  Shield,
  Globe,
} from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: 'Professional Resume Builder',
    description: 'Build your resume with 100 professionally designed templates that keep the structure clean for Applicant Tracking Systems.',
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

/**
 * Product capabilities, not invented usage statistics: every item below is a
 * feature that exists in this application. No sign-up counts, ratings or pass
 * rates are claimed because nothing measures them.
 */
const platformStats = [
  { value: '100', label: 'Resume templates' },
  { value: 'ATS', label: 'Keyword gap analysis' },
  { value: 'AI', label: 'Drafts from your own text' },
  { value: 'PDF', label: 'Print-ready export' },
];

/**
 * A description of the workflow the product actually implements, instead of
 * fabricated customer testimonials and star ratings.
 */
const workflow = [
  {
    step: '1',
    title: 'Build your resume',
    text: 'Start from a template, import your details and keep the content in your own workspace.',
  },
  {
    step: '2',
    title: 'Check it against a real job',
    text: 'Paste a job description to see which keywords and sections are missing before you apply.',
  },
  {
    step: '3',
    title: 'Apply and track it',
    text: 'Apply from a job listing, keep a cover letter beside it and follow every application in one tracker.',
  },
];

const NAV_LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Jobs', href: '/jobs' },
  { label: 'Contact', href: '/contact' },
];

const linkFocus = 'rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-brand-500 focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-700 focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-brand-500"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border/60 bg-surface/80 backdrop-blur-xl">
        <nav
          className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"
          aria-label="Main navigation"
        >
          <Link to="/" className={`flex min-w-0 items-center gap-2.5 no-underline ${linkFocus}`} aria-label="IME365 home">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">
              IM
            </span>
            <span className="truncate text-lg font-bold tracking-tight text-ink">IME365</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`text-sm font-medium text-ink-secondary no-underline transition-colors hover:text-ink ${linkFocus}`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {user ? (
              <Button asChild>
                <Link to="/dashboard">Go to Dashboard <ArrowRight aria-hidden="true" className="size-4" /></Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                  <Link to="/login">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link to="/login">Get Started Free <ArrowRight aria-hidden="true" className="size-4" /></Link>
                </Button>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="relative overflow-hidden focus:outline-none">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-brand-100/50 blur-3xl" />
          <div className="absolute right-0 top-1/3 h-[400px] w-[600px] rounded-full bg-info-100/30 blur-3xl" />
        </div>

        {/* Hero */}
        <section aria-labelledby="hero-heading" className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700">
              <Zap aria-hidden="true" className="size-4" />
              AI-Powered Career Platform
            </p>

            <h1 id="hero-heading" className="text-balance text-4xl font-extrabold tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Build Your Career with{' '}
              <span className="text-brand-600">Confidence</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-secondary">
              Build a resume, check it against a real job description, prepare for the interview
              and track every application from one dashboard.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="xl" asChild>
                <Link to={user ? '/dashboard' : '/login'}>
                  {user ? 'Open Dashboard' : 'Start Building Free'}
                  <ArrowRight aria-hidden="true" className="size-5" />
                </Link>
              </Button>
              <Button variant="outline" size="xl" asChild>
                <Link to="/features">See All Features</Link>
              </Button>
            </div>

            <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
              {[
                { icon: CheckCircle2, label: 'Deterministic ATS checks' },
                { icon: Shield, label: 'Your content stays yours' },
                { icon: Globe, label: 'Every application tracked' },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-1.5 text-sm text-ink-secondary">
                  <item.icon aria-hidden="true" className="size-4 text-success-700" />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Platform statistics */}
        <section className="border-y border-border bg-surface" aria-labelledby="stats-heading">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <h2 id="stats-heading" className="sr-only">What the platform gives you</h2>
            <dl className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {platformStats.map((stat) => (
                <div key={stat.label} className="min-w-0 text-center">
                  <dd className="text-3xl font-bold text-ink lg:text-4xl">{stat.value}</dd>
                  <dt className="mt-1 break-words text-sm text-ink-secondary">{stat.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 lg:py-28" aria-labelledby="features-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="features-heading" className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                Everything you need to succeed
              </h2>
              <p className="mt-4 text-lg text-ink-secondary">
                A comprehensive platform that helps you at every stage of your career journey.
              </p>
            </div>

            <ul className="mt-16 grid list-none gap-8 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <li key={feature.title} className="min-w-0">
                  <article className="h-full rounded-2xl border border-border bg-surface p-6 transition-shadow hover:border-brand-200 hover:shadow-lg">
                    <div aria-hidden="true" className="mb-4 inline-flex rounded-xl bg-brand-50 p-3">
                      <feature.icon className="size-6 text-brand-700" />
                    </div>
                    <h3 className="break-words text-lg font-semibold text-ink">{feature.title}</h3>
                    <p className="mt-2 break-words text-sm leading-relaxed text-ink-secondary">{feature.description}</p>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border bg-surface py-20" aria-labelledby="workflow-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="workflow-heading" className="text-3xl font-bold tracking-tight text-ink">
                How it works
              </h2>
              <p className="mt-4 text-lg text-ink-secondary">
                Three steps from a blank page to an application you can follow up on.
              </p>
            </div>

            <ol className="mt-12 grid list-none gap-6 md:grid-cols-3">
              {workflow.map((item) => (
                <li key={item.step} className="min-w-0">
                  <article className="h-full rounded-2xl border border-border p-6">
                    <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                      {item.step}
                    </span>
                    <h3 className="mt-4 break-words text-lg font-semibold text-ink">{item.title}</h3>
                    <p className="mt-2 break-words text-sm leading-relaxed text-ink-secondary">{item.text}</p>
                  </article>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Call to action */}
        <section className="py-20" aria-labelledby="cta-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-16 text-center shadow-2xl sm:px-16">
              <div className="absolute inset-0" aria-hidden="true">
                <div className="absolute -right-20 -top-20 size-64 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 size-64 rounded-full bg-white/5 blur-3xl" />
              </div>
              <div className="relative z-10">
                <h2 id="cta-heading" className="text-3xl font-bold text-white sm:text-4xl">Ready to advance your career?</h2>
                <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">
                  Build the resume, check it against the job you want, and keep the application in your tracker.
                </p>
                <div className="mt-8">
                  <Button
                    size="xl"
                    variant="secondary"
                    className="bg-white text-brand-800 hover:bg-brand-50"
                    asChild
                  >
                    <Link to={user ? '/dashboard' : '/login'}>
                      {user ? 'Go to Dashboard' : "Get Started — It's Free"}
                      <ArrowRight aria-hidden="true" className="size-5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface" role="contentinfo">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="min-w-0">
              <Link to="/" className={`flex items-center gap-2 no-underline ${linkFocus}`} aria-label="IME365 home">
                <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">IM</span>
                <span className="font-bold text-ink">IME365</span>
              </Link>
              <p className="mt-3 break-words text-sm text-ink-secondary">
                AI-powered career platform helping professionals build resumes, prepare for interviews, and find jobs.
              </p>
            </div>

            <nav aria-label="Footer product navigation">
              <h2 className="text-sm font-semibold text-ink">Product</h2>
              <ul className="mt-3 space-y-2">
                {[
                  { label: 'Features', href: '/features' },
                  { label: 'Pricing', href: '/pricing' },
                  { label: 'Templates', href: '/templates' },
                  { label: 'Blog', href: '/blog' },
                ].map((item) => (
                  <li key={item.label}>
                    <Link to={item.href} className={`text-sm text-ink-secondary no-underline transition-colors hover:text-ink ${linkFocus}`}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Footer resource navigation">
              <h2 className="text-sm font-semibold text-ink">Resources</h2>
              <ul className="mt-3 space-y-2">
                {[
                  { label: 'Jobs', href: '/jobs' },
                  { label: 'Contact', href: '/contact' },
                  { label: 'Portfolios', href: '/portfolios' },
                ].map((item) => (
                  <li key={item.label}>
                    <Link to={item.href} className={`text-sm text-ink-secondary no-underline transition-colors hover:text-ink ${linkFocus}`}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Footer legal navigation">
              <h2 className="text-sm font-semibold text-ink">Legal</h2>
              <ul className="mt-3 space-y-2">
                {[
                  { label: 'Privacy Policy', href: '/p/privacy-policy' },
                  { label: 'Terms of Service', href: '/p/terms-of-service' },
                  { label: 'Cookie Policy', href: '/p/cookie-policy' },
                ].map((item) => (
                  <li key={item.label}>
                    <Link to={item.href} className={`text-sm text-ink-secondary no-underline transition-colors hover:text-ink ${linkFocus}`}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <p className="mt-10 border-t border-border pt-6 text-center text-xs text-ink-secondary">
            © {new Date().getFullYear()} IME365 — Interview Made Easy. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
