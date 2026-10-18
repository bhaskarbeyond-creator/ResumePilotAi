/**
 * Pricing & Plans
 *
 * Enterprise-grade pricing page with monthly/annual billing toggle,
 * tiered plan cards (Free, Professional, Executive Pro, Enterprise),
 * complete feature comparison table, and billing FAQ.
 */

import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckoutModal } from './checkout-modal';
import { cn } from '@/lib/utils';
import {
  Check,
  X,
  Sparkles,
  Zap,
  Building2,
  Shield,
  HelpCircle,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';

interface PlanTier {
  id: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualPrice: number;
  popular?: boolean;
  ctaText: string;
  ctaVariant: 'primary' | 'secondary' | 'outline';
  features: string[];
  limitations?: string[];
}

const PLANS: PlanTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Essential tools for launching your next career move.',
    monthlyPrice: 0,
    annualPrice: 0,
    ctaText: 'Get Started Free',
    ctaVariant: 'outline',
    features: [
      '1 Active Resume & 1 Cover Letter',
      '5 Standard ATS Templates',
      'Basic ATS Score Check (1 scan/mo)',
      'PDF Download with watermark',
      'Community Support',
    ],
    limitations: [
      'No AI-driven bullet point writer',
      'No Mock Interview Simulator',
      'No DOCX export',
    ],
  },
  {
    id: 'pro',
    name: 'Professional',
    tagline: 'Ideal for active job seekers targeting mid to senior roles.',
    monthlyPrice: 19,
    annualPrice: 14,
    popular: true,
    ctaText: 'Start 7-Day Free Trial',
    ctaVariant: 'primary',
    features: [
      'Unlimited Resumes & Cover Letters',
      '51+ Premium ATS & Executive Templates',
      'Unlimited ATS Keyword Matching',
      'Full AI Writer (15,000 words/mo)',
      'Interactive AI Interview Coach (5 sessions/mo)',
      'High-Fidelity PDF & DOCX Exports',
      'Job Application Tracker & Chrome Extension',
      'Priority Email Support',
    ],
  },
  {
    id: 'executive',
    name: 'Executive Pro',
    tagline: 'For executives, leaders, and specialized high-earning professionals.',
    monthlyPrice: 39,
    annualPrice: 29,
    ctaText: 'Upgrade to Executive',
    ctaVariant: 'primary',
    features: [
      'Everything in Professional, plus:',
      'Unlimited AI Model Access (GPT-4o, Claude 3.5, Gemini 1.5 Pro)',
      'AI Executive Bio & LinkedIn Story Builder',
      'Unlimited AI Mock Interviews with Live Scoring',
      '1-on-1 Human Resume Review (1 review/quarter)',
      'Custom Domain Portfolio Builder',
      'Direct Recruiter Outreach Templates',
      '24/7 Dedicated Concierge Support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom solutions for universities, outplacement & recruiting agencies.',
    monthlyPrice: 99,
    annualPrice: 79,
    ctaText: 'Contact Sales',
    ctaVariant: 'secondary',
    features: [
      'Multi-Seat License & Team Admin Console',
      'Centralized Candidate Talent Pool',
      'Custom Branded Career & Resume Portals',
      'Enterprise SSO (SAML 2.0 / Okta / Azure AD)',
      'Custom AI Training & LLM Fine-Tuning',
      'SOC2 Type II & GDPR Compliance Reports',
      'Dedicated Account Manager & SLA Guarantee',
    ],
  },
];

interface ComparisonCategory {
  category: string;
  items: {
    name: string;
    starter: string | boolean;
    pro: string | boolean;
    executive: string | boolean;
    enterprise: string | boolean;
  }[];
}

const COMPARISON: ComparisonCategory[] = [
  {
    category: 'Resume & Documents',
    items: [
      { name: 'Active Resumes', starter: '1', pro: 'Unlimited', executive: 'Unlimited', enterprise: 'Unlimited' },
      { name: 'Resume Templates', starter: '5', pro: '51+ Premium', executive: '51+ Premium', enterprise: 'Custom + All 51' },
      { name: 'Export Formats', starter: 'PDF', pro: 'PDF + DOCX + TXT', executive: 'PDF + DOCX + Vector', enterprise: 'All + White-label' },
      { name: 'Cover Letter Builder', starter: '1 letter', pro: 'Unlimited', executive: 'Unlimited', enterprise: 'Unlimited' },
      { name: 'Online Portfolio Site', starter: false, pro: 'Subdomain', executive: 'Custom Domain', enterprise: 'Custom Domain + SSO' },
    ],
  },
  {
    category: 'AI Intelligence & ATS',
    items: [
      { name: 'ATS Compatibility Scans', starter: '1 / month', pro: 'Unlimited', executive: 'Unlimited Real-Time', enterprise: 'Unlimited API' },
      { name: 'AI Generation Words', starter: '500 words', pro: '15,000 / mo', executive: 'Unlimited', enterprise: 'Custom Quota' },
      { name: 'AI Models Available', starter: 'Standard', pro: 'Llama 3.2 + Nemotron', executive: 'NVIDIA + GPT-4o + Claude', enterprise: 'Custom Dedicated' },
      { name: 'Mock Interview Simulator', starter: false, pro: '5 sessions / mo', executive: 'Unlimited Voice & Text', enterprise: 'Custom Question Banks' },
      { name: 'Candidate-Job Keyword Matching', starter: 'Basic', pro: 'Advanced NLP', executive: 'Executive Semantic Matrix', enterprise: 'Enterprise AST Match' },
    ],
  },
  {
    category: 'Security & Enterprise',
    items: [
      { name: 'Two-Factor Authentication (TOTP)', starter: true, pro: true, executive: true, enterprise: true },
      { name: 'Team RBAC Roles', starter: false, pro: false, executive: false, enterprise: true },
      { name: 'SSO / SAML 2.0', starter: false, pro: false, executive: false, enterprise: true },
      { name: 'Audit Logs & Governance', starter: false, pro: false, executive: false, enterprise: true },
      { name: 'Dedicated Support', starter: 'Community', pro: 'Email (<24h)', executive: 'Concierge (<2h)', enterprise: 'Dedicated CSM + 99.9% SLA' },
    ],
  },
];

const FAQS = [
  {
    q: 'Can I cancel or switch my plan at any time?',
    a: 'Yes, absolutely. You can upgrade, downgrade, or cancel your subscription at any time directly from your account settings. If you cancel, you will continue to have access to your paid features until the end of your current billing cycle.',
  },
  {
    q: 'How does the 7-day free trial work?',
    a: 'When you select the Professional plan, you get 7 days of full, unrestricted access to all premium features, templates, ATS scans, and AI tools. You can cancel anytime before day 7 and you will not be charged.',
  },
  {
    q: 'Are my resumes and private data secure?',
    a: 'We take privacy and security with supreme seriousness. All resumes and user documents are encrypted at rest with AES-256 and in transit via TLS 1.3. We never sell your data or train public AI models on your private documents.',
  },
  {
    q: 'What formats can I download my resume in?',
    a: 'Free users can download high-resolution PDF files. Professional and Executive users can download ATS-optimized PDF and Microsoft Word (.docx) documents formatted with clean vector typography and zero table distortion.',
  },
  {
    q: 'Do you offer team or educational discounts?',
    a: 'Yes! We offer 50% discounts for verified students, educators, and non-profits, as well as customized multi-seat volume licensing for universities and bootcamps. Contact our sales team for details.',
  },
];

export function PricingPage() {
  const [searchParams] = useSearchParams();
  const [annualBilling, setAnnualBilling] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState('pro');

  useEffect(() => {
    const planParam = searchParams.get('plan');
    const cycleParam = searchParams.get('cycle');
    const checkoutParam = searchParams.get('checkout');
    if (cycleParam === 'monthly') setAnnualBilling(false);
    if (cycleParam === 'annual') setAnnualBilling(true);
    if (planParam && ['starter', 'pro', 'executive', 'enterprise'].includes(planParam)) {
      if (planParam !== 'starter') {
        setSelectedPlanForCheckout(planParam);
        setCheckoutOpen(true);
      }
    } else if (
      checkoutParam === 'true' ||
      checkoutParam === '1' ||
      window.location.pathname.toLowerCase().includes('checkout')
    ) {
      setCheckoutOpen(true);
    }
  }, [searchParams]);

  const handleSelectPlan = (planId: string) => {
    if (planId === 'starter') {
      window.location.href = '/login?tab=register';
      return;
    }
    setSelectedPlanForCheckout(planId);
    setCheckoutOpen(true);
  };

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
          <Sparkles className="size-3.5" />
          Transparent, Fair Pricing for Every Stage of Your Career
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-ink">
          Invest in Your Next Career Breakthrough
        </h1>
        <p className="mt-4 text-base sm:text-lg text-ink-muted max-w-2xl mx-auto">
          From high-scoring ATS resumes to real-time AI interview simulations. Choose the plan designed to land you top-tier offers.
        </p>

        {/* ─── Billing Switch ─── */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <span className={cn('text-sm font-medium', !annualBilling ? 'text-ink font-semibold' : 'text-ink-muted')}>
            Monthly Billing
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={annualBilling}
            onClick={() => setAnnualBilling(!annualBilling)}
            className={cn(
              'relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
              annualBilling ? 'bg-accent' : 'bg-edge-strong'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block size-6 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                annualBilling ? 'translate-x-6' : 'translate-x-0'
              )}
            />
          </button>
          <div className="flex items-center gap-1.5">
            <span className={cn('text-sm font-medium', annualBilling ? 'text-ink font-semibold' : 'text-ink-muted')}>
              Annual Billing
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Save 25%
            </span>
          </div>
        </div>
      </section>

      {/* ─── Plan Cards ─── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {PLANS.map((plan) => {
            const price = annualBilling ? plan.annualPrice : plan.monthlyPrice;
            return (
              <Card
                key={plan.id}
                className={cn(
                  'flex flex-col relative transition-all duration-200 hover:shadow-lg',
                  plan.popular
                    ? 'border-accent shadow-md ring-2 ring-accent/20 bg-surface'
                    : 'border-edge bg-surface/60'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-accent text-white shadow-sm flex items-center gap-1">
                    <Zap className="size-3 fill-current" /> Most Popular
                  </div>
                )}

                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                  <p className="text-xs text-ink-muted mt-1 min-h-[32px]">{plan.tagline}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold tracking-tight">${price}</span>
                    <span className="text-xs font-medium text-ink-muted">
                      {price === 0 ? 'forever' : annualBilling ? '/ mo (billed yearly)' : '/ month'}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col justify-between pt-0">
                  <div className="space-y-4">
                    <div className="h-px bg-edge" />
                    <ul className="space-y-2.5 text-xs text-ink">
                      {plan.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2">
                          <Check className="size-3.5 text-accent shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                      {plan.limitations?.map((lim) => (
                        <li key={lim} className="flex items-start gap-2 text-ink-muted/60">
                          <X className="size-3.5 text-ink-muted/40 shrink-0 mt-0.5" />
                          <span>{lim}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-8 pt-4">
                    {plan.id === 'starter' ? (
                      <Button
                        variant={plan.ctaVariant}
                        className="w-full font-semibold text-xs"
                        asChild
                      >
                        <Link to="/login?tab=register">
                          {plan.ctaText}
                          <ArrowRight className="size-3.5 ml-1.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        variant={plan.ctaVariant}
                        className="w-full font-semibold text-xs"
                        onClick={() => handleSelectPlan(plan.id)}
                      >
                        {plan.ctaText}
                        <ArrowRight className="size-3.5 ml-1.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ─── Detailed Feature Comparison ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-edge">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-ink">
            Compare All Features Side-by-Side
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Detailed breakdown of what is included across each subscription tier.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-edge bg-surface shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-edge bg-canvas-soft/80">
                <th className="p-4 font-semibold text-ink w-1/3">Feature</th>
                <th className="p-4 font-semibold text-ink text-center">Starter</th>
                <th className="p-4 font-semibold text-accent text-center bg-accent-soft/30">Professional</th>
                <th className="p-4 font-semibold text-ink text-center">Executive</th>
                <th className="p-4 font-semibold text-ink text-center">Enterprise</th>
              </tr>
            </thead>
            {COMPARISON.map((category) => (
              <tbody key={category.category}>
                <tr className="bg-canvas-soft/40 border-b border-edge">
                  <td colSpan={5} className="p-3 font-bold text-ink uppercase tracking-wider text-[10px]">
                    {category.category}
                  </td>
                </tr>
                {category.items.map((row) => (
                  <tr key={row.name} className="border-b border-edge/60 hover:bg-canvas-soft/20 transition-colors">
                    <td className="p-3.5 font-medium text-ink">{row.name}</td>
                    <td className="p-3.5 text-center text-ink-muted">{renderCell(row.starter)}</td>
                    <td className="p-3.5 text-center font-medium text-ink bg-accent-soft/10">{renderCell(row.pro)}</td>
                    <td className="p-3.5 text-center text-ink">{renderCell(row.executive)}</td>
                    <td className="p-3.5 text-center text-ink">{renderCell(row.enterprise)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      {/* ─── Trust Badges ─── */}
      <section className="py-12 bg-canvas-soft/50 border-t border-b border-edge">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="flex flex-col items-center">
            <Shield className="size-8 text-accent mb-2" />
            <h3 className="font-bold text-sm text-ink">Enterprise-Grade Security</h3>
            <p className="text-xs text-ink-muted mt-1 max-w-xs">
              256-bit encryption, strict tenant isolation, and zero third-party data sharing.
            </p>
          </div>
          <div className="flex flex-col items-center">
            <Zap className="size-8 text-accent mb-2" />
            <h3 className="font-bold text-sm text-ink">7-Day Free Trial</h3>
            <p className="text-xs text-ink-muted mt-1 max-w-xs">
              Full access to Professional features with no strings attached. Cancel anytime.
            </p>
          </div>
          <div className="flex flex-col items-center">
            <Building2 className="size-8 text-accent mb-2" />
            <h3 className="font-bold text-sm text-ink">Trusted by 100,000+ Job Seekers</h3>
            <p className="text-xs text-ink-muted mt-1 max-w-xs">
              Engineers, executives, and specialists hired at Google, Amazon, Microsoft, and Meta.
            </p>
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <HelpCircle className="size-8 text-accent mx-auto mb-2" />
          <h2 className="text-2xl sm:text-3xl font-extrabold text-ink">
            Frequently Asked Questions
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Got questions? We're here to give you complete clarity.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={faq.q}
                className="border border-edge rounded-lg bg-surface overflow-hidden transition-all duration-150"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-4 text-left flex items-center justify-between gap-4 font-semibold text-sm text-ink hover:text-accent transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={cn('size-4 text-ink-muted shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-ink-muted leading-relaxed border-t border-edge/40 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Footer CTA ─── */}
      <section className="py-16 bg-accent text-white text-center px-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold">Ready to Land Your Dream Job?</h2>
          <p className="text-sm text-white/80 max-w-xl mx-auto">
            Join thousands of professionals crafting recruiter-winning resumes with IME365 today.
          </p>
          <div className="pt-2">
            <Button size="lg" variant="secondary" className="font-bold shadow-lg" asChild>
              <Link to="/login?tab=register">
                Start Building for Free
                <ArrowRight className="size-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Interactive Checkout Modal ─── */}
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        initialPlanId={selectedPlanForCheckout}
        initialBillingCycle={annualBilling ? 'annual' : 'monthly'}
      />
    </div>
  );
}

function renderCell(val: string | boolean) {
  if (typeof val === 'boolean') {
    return val ? (
      <Check className="size-4 text-accent mx-auto" />
    ) : (
      <X className="size-4 text-ink-muted/30 mx-auto" />
    );
  }
  return <span>{val}</span>;
}
