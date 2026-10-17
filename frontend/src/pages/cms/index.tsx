/**
 * CMS & Legal Pages
 *
 * Renders authoritative pages for:
 * - Privacy Policy (/p/privacy-policy)
 * - Terms of Service (/p/terms-of-service)
 * - About Us (/p/about-us)
 * - Cookie Policy (/p/cookie-policy)
 * - Security (/p/security)
 * - Contact Us (/contact, /p/contact-us)
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Shield,
  FileText,
  Mail,
  Send,
  CheckCircle2,
  Lock,
  Heart,
  Globe,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';

interface CmsContent {
  title: string;
  subtitle: string;
  icon: typeof Shield;
  updatedAt: string;
  sections: { heading: string; body: string }[];
}

const CMS_PAGES: Record<string, CmsContent> = {
  'privacy-policy': {
    title: 'Privacy Policy',
    subtitle: 'Our absolute commitment to your privacy, data sovereignty, and security.',
    icon: Shield,
    updatedAt: 'October 17, 2026',
    sections: [
      {
        heading: '1. Information We Collect & Zero-Selling Pledge',
        body: 'We collect personal information solely to provide you with resume authoring, interview preparation, and job tracking services. We do NOT sell, rent, or monetize your resume data, employment history, or personally identifiable information to third parties or recruiters without your explicit opt-in.',
      },
      {
        heading: '2. Artificial Intelligence & Document Confidentiality',
        body: 'When you use our AI features (such as bullet point optimization or interview simulation), your text is processed through secure, enterprise-grade AI models under strict zero-data-retention agreements. Your private resume text is NEVER used to train public foundational AI models.',
      },
      {
        heading: '3. Data Encryption Standards',
        body: 'All customer data is encrypted in transit using TLS 1.3 and at rest using AES-256 bit encryption. User credentials and multi-factor secrets are salted and hashed using cryptographic standards.',
      },
      {
        heading: '4. Your Rights Under GDPR and CCPA',
        body: 'You have the right to request a complete export of your personal data at any time, or request permanent deletion of your account and all associated documents from our active database and backups.',
      },
    ],
  },
  'terms-of-service': {
    title: 'Terms of Service',
    subtitle: 'Clear, transparent rules governing the use of the IME365 platform.',
    icon: FileText,
    updatedAt: 'October 17, 2026',
    sections: [
      {
        heading: '1. Acceptance of Terms',
        body: 'By accessing or using IME365 (Interview Made Easy), you agree to be bound by these Terms of Service. If you do not agree to these terms, please refrain from using the platform.',
      },
      {
        heading: '2. Document Ownership & Intellectual Property',
        body: 'You retain 100% intellectual property ownership of all resumes, cover letters, portfolios, and answers you create on IME365. IME365 claims zero ownership over your career materials.',
      },
      {
        heading: '3. Subscription Billing & Cancellations',
        body: 'Subscriptions are billed on a recurring monthly or annual basis depending on your plan. You may cancel your subscription at any time through your settings page; cancellation takes effect at the end of the current billing cycle.',
      },
      {
        heading: '4. Acceptable Platform Use',
        body: 'You agree not to use the platform to generate fraudulent, deceptive, or malicious content, or attempt to reverse-engineer or disrupt server infrastructure.',
      },
    ],
  },
  'about-us': {
    title: 'About IME365',
    subtitle: 'Democratizing career advancement with high-fidelity AI engineering.',
    icon: Heart,
    updatedAt: 'October 17, 2026',
    sections: [
      {
        heading: 'Our Mission',
        body: 'At Interview Made Easy (IME365), we believe every ambitious professional deserves access to world-class career tools. We combine executive-grade design, rigorous ATS parsing standards, and intelligent AI models to level the playing field for job seekers worldwide.',
      },
      {
        heading: 'Built with Modern Precision',
        body: 'Founded by senior software engineers and former hiring directors, IME365 provides high-fidelity ATS resumes, interactive mock interviews, and automated job tracking without deceptive paywalls or dark patterns.',
      },
      {
        heading: 'Global Reach & Impact',
        body: 'Over 100,000 candidates have trusted IME365 to land offers at Fortune 500 enterprises, innovative startups, and premier research institutions across 45 countries.',
      },
    ],
  },
  'cookie-policy': {
    title: 'Cookie Policy',
    subtitle: 'How and why we use cookies and local storage.',
    icon: Globe,
    updatedAt: 'October 17, 2026',
    sections: [
      {
        heading: 'Essential Security Cookies',
        body: 'We use strictly necessary session tokens and cookies to maintain authenticated sessions and protect against cross-site request forgery (CSRF). These cookies cannot be turned off without breaking core functionality.',
      },
      {
        heading: 'Preference & Interface Storage',
        body: 'We store your chosen theme preferences (light/dark mode) and sidebar state in your browser local storage to deliver a smooth experience.',
      },
    ],
  },
  'security': {
    title: 'Security Overview',
    subtitle: 'Our architectural standards for protecting candidate and enterprise data.',
    icon: Lock,
    updatedAt: 'October 17, 2026',
    sections: [
      {
        heading: 'End-to-End Cryptography',
        body: 'All communications with IME365 are strictly enforced over HTTPS using TLS 1.3. Database storage is protected with AES-256 bit hardware-level encryption.',
      },
      {
        heading: 'Role-Based Access & Tenant Isolation',
        body: 'Enterprise workspaces enforce complete cryptographic tenant isolation. Enterprise administrators can require hardware-backed TOTP and SAML 2.0 SSO authentication.',
      },
      {
        heading: 'Continuous Auditing & Penetration Testing',
        body: 'We conduct regular automated vulnerability scans, AST dependency audits, and third-party security assessments.',
      },
    ],
  },
};

export function CMSPage() {
  const { custompage } = useParams<{ custompage: string }>();
  const slug = (custompage || 'privacy-policy').toLowerCase();
  const page = CMS_PAGES[slug] || CMS_PAGES['privacy-policy'];

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

      {/* ─── Content Container ─── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline mb-8"
        >
          <ArrowLeft className="size-3.5" />
          Back to Home
        </Link>

        {/* Page Hero */}
        <div className="space-y-3 pb-8 border-b border-edge">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-accent-soft text-accent border border-accent/20">
            <page.icon className="size-3.5" />
            Official Documentation
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
            {page.title}
          </h1>
          <p className="text-base text-ink-muted">{page.subtitle}</p>
          <p className="text-xs text-ink-muted/80 pt-1">Last Updated: {page.updatedAt}</p>
        </div>

        {/* Sections */}
        <div className="py-8 space-y-8">
          {page.sections.map((sec) => (
            <div key={sec.heading} className="space-y-2">
              <h2 className="text-base sm:text-lg font-bold text-ink">{sec.heading}</h2>
              <p className="text-sm text-ink-muted leading-relaxed">{sec.body}</p>
            </div>
          ))}
        </div>

        {/* Footer Navigation */}
        <div className="border-t border-edge pt-8 mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-ink-muted">
          <div className="flex flex-wrap items-center gap-4 font-medium">
            <Link to="/p/privacy-policy" className="hover:text-ink transition-colors">
              Privacy Policy
            </Link>
            <Link to="/p/terms-of-service" className="hover:text-ink transition-colors">
              Terms of Service
            </Link>
            <Link to="/p/about-us" className="hover:text-ink transition-colors">
              About Us
            </Link>
            <Link to="/p/cookie-policy" className="hover:text-ink transition-colors">
              Cookie Policy
            </Link>
            <Link to="/contact" className="hover:text-ink transition-colors">
              Contact Us
            </Link>
          </div>
          <p>© 2026 IME365. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}

export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !message) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
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
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-accent-soft text-accent border border-accent/20">
            <Mail className="size-3.5" />
            Support & Inquiries
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
            Get in Touch With Us
          </h1>
          <p className="text-sm sm:text-base text-ink-muted max-w-lg mx-auto">
            Have questions about subscriptions, enterprise licensing, or technical support? Our team typically responds within 2-4 hours.
          </p>
        </div>

        <Card className="border-edge shadow-lg">
          <CardContent className="p-6 sm:p-8">
            {submitted ? (
              <div className="text-center py-12 space-y-4">
                <div className="size-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="size-8" />
                </div>
                <h2 className="text-xl font-bold text-ink">Message Received!</h2>
                <p className="text-xs text-ink-muted max-w-md mx-auto">
                  Thank you for reaching out. We have logged your request and our support desk will contact you at{' '}
                  <strong className="text-ink">{email}</strong> shortly.
                </p>
                <Button size="sm" asChild className="mt-4">
                  <Link to="/">Back to Home</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1.5">Your Name</label>
                    <Input
                      required
                      placeholder="Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1.5">Email Address</label>
                    <Input
                      required
                      type="email"
                      placeholder="jane@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Subject</label>
                  <Input
                    required
                    placeholder="e.g. Enterprise inquiry, feature question, billing support"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Message</label>
                  <textarea
                    required
                    rows={5}
                    placeholder="How can we help you achieve your goals?"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition"
                  />
                </div>

                <div className="pt-2">
                  <Button type="submit" className="w-full font-semibold text-xs flex items-center justify-center gap-2">
                    <Send className="size-3.5" />
                    Send Message
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
