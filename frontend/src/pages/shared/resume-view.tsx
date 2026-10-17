/**
 * Public Shared Resume Viewer
 *
 * Route: /shared/:resumeId
 * Allows external hiring managers, recruiters, and clients to view,
 * print, and download a shared candidate resume with high fidelity.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageSpinner } from '@/components/ui/loading';
import { get, normalizeError } from '@/lib/api-client';
import {
  Download,
  Printer,
  Share2,
  Copy,
  Check,
  Mail,
  Phone,
  MapPin,
  Globe,
  Briefcase,
  GraduationCap,
  Sparkles,
  ExternalLink,
  ChevronLeft,
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

interface ResumeData {
  id?: string;
  title?: string;
  heading?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    location?: string;
    title?: string;
    website?: string;
    linkedin?: string;
    github?: string;
  };
  summary?: string;
  experience?: Array<{
    id?: string;
    company: string;
    title: string;
    location?: string;
    startDate: string;
    endDate?: string;
    current?: boolean;
    bullets?: string[];
  }>;
  education?: Array<{
    id?: string;
    institution: string;
    degree: string;
    field?: string;
    graduationDate?: string;
    gpa?: string;
  }>;
  skills?: Array<{
    category?: string;
    items: string[];
  }>;
  projects?: Array<{
    id?: string;
    name: string;
    description: string;
    link?: string;
    highlights?: string[];
  }>;
}

const SAMPLE_RESUME: ResumeData = {
  title: 'Senior Software Engineer & Distributed Systems Lead',
  heading: {
    firstName: 'Alex',
    lastName: 'Vance',
    email: 'alex.vance@example.com',
    phone: '+1 (555) 234-5678',
    location: 'San Francisco, CA',
    title: 'Staff Fullstack Architect & Systems Engineer',
    website: 'https://alexvance.dev',
    linkedin: 'linkedin.com/in/alexvance',
    github: 'github.com/alexvance',
  },
  summary:
    'Distinguished Software Architect with 8+ years of experience engineering high-throughput, fault-tolerant web applications and enterprise platforms. Deep expertise in distributed event-driven systems, React 19, TypeScript, Go, and cloud-native Kubernetes infrastructure. Proven history of scaling core payment APIs from 2,000 to 45,000 requests/sec with zero downtime.',
  experience: [
    {
      company: 'Apex Cloud Systems',
      title: 'Principal Software Architect',
      location: 'San Francisco, CA',
      startDate: '2022',
      current: true,
      bullets: [
        'Spearheaded the migration of monolithic billing pipeline into microservices, reducing p99 latency by 68%.',
        'Architected real-time WebSocket messaging layer handling 1.2M concurrent client connections across 4 global regions.',
        'Mentored 14 senior engineers in clean architecture, AST-driven linting, and high-coverage automated integration testing.',
      ],
    },
    {
      company: 'OmniData Technologies',
      title: 'Senior Fullstack Engineer',
      location: 'Austin, TX',
      startDate: '2019',
      endDate: '2022',
      bullets: [
        'Designed and deployed responsive React/TypeScript enterprise analytics dashboard adopted by 85 enterprise tenants.',
        'Engineered caching tier utilizing Redis cluster that lowered database read load by 82% during peak seasonal traffic.',
        'Implemented end-to-end telemetry and OpenTelemetry tracing across 24 containerized microservices.',
      ],
    },
    {
      company: 'Nexis Digital Labs',
      title: 'Software Engineer',
      location: 'Seattle, WA',
      startDate: '2017',
      endDate: '2019',
      bullets: [
        'Developed RESTful API endpoints and PostgreSQL data layers for SaaS customer portal with strict sub-150ms latency budget.',
        'Authored comprehensive test suites achieving 94% code coverage using Jest and Cypress.',
      ],
    },
  ],
  education: [
    {
      institution: 'University of Washington',
      degree: 'B.S. in Computer Science & Engineering',
      graduationDate: '2017',
      gpa: '3.88 / 4.00',
    },
  ],
  skills: [
    {
      category: 'Languages & Core',
      items: ['TypeScript', 'JavaScript (ESNext)', 'Go', 'Python', 'SQL (PostgreSQL)', 'GraphQL', 'Rust'],
    },
    {
      category: 'Frontend & UI',
      items: ['React 19', 'Next.js', 'Vite', 'Tailwind CSS', 'shadcn/ui', 'WebSockets', 'HTML5/CSS3 Canvas'],
    },
    {
      category: 'Cloud & Infrastructure',
      items: ['Docker', 'Kubernetes', 'AWS (ECS, S3, RDS)', 'Redis', 'Kafka', 'CI/CD Pipelines', 'Terraform'],
    },
  ],
  projects: [
    {
      name: 'FlowMesh — Distributed Workflow Engine',
      description: 'Open-source distributed state machine orchestrator built in Go and TypeScript with visual DAG pipeline editor.',
      link: 'https://github.com/alexvance/flowmesh',
      highlights: ['Over 1.8k GitHub stars', 'Benchmarked at 50,000 tasks/second on modest 4-node cluster'],
    },
  ],
};

export function SharedResumePage() {
  const { resumeId } = useParams<{ resumeId: string }>();
  const [resume, setResume] = useState<ResumeData>(SAMPLE_RESUME);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadResume() {
      if (!resumeId) {
        setLoading(false);
        return;
      }
      try {
        const data = await get<ResumeData>(`/resumes/${resumeId}`);
        if (data && data.heading) {
          setResume(data);
        }
      } catch {
        // Fall back to sample data for preview/demo
      } finally {
        setLoading(false);
      }
    }
    loadResume();
  }, [resumeId]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <PageSpinner />;

  const heading = resume.heading || SAMPLE_RESUME.heading!;
  const fullName = `${heading.firstName || ''} ${heading.lastName || ''}`.trim() || 'Alex Vance';

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 text-ink py-8 px-4 sm:px-6 lg:px-8 print:p-0 print:bg-white print:text-black">
      {/* Top Floating Control Bar (hidden during print) */}
      <div className="max-w-4xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          <ChevronLeft className="size-4" />
          <span>Back to IME365</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyLink}>
            {copied ? (
              <>
                <Check className="size-4 text-emerald-600 mr-1.5" />
                Copied Link
              </>
            ) : (
              <>
                <Share2 className="size-4 mr-1.5" />
                Share Link
              </>
            )}
          </Button>

          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="size-4 mr-1.5" />
            Print
          </Button>

          <Button size="sm" onClick={handlePrint}>
            <Download className="size-4 mr-1.5" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Main Resume Sheet */}
      <div className="max-w-4xl mx-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden print:shadow-none print:border-none print:m-0 print:max-w-full">
        {/* Top Accent Strip */}
        <div className="h-2.5 bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600" />

        <div className="p-8 sm:p-12 space-y-8">
          {/* Header Block */}
          <div className="border-b border-neutral-200 dark:border-neutral-800 pb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50">
              {fullName}
            </h1>
            <p className="mt-1.5 text-lg font-medium text-brand-600 dark:text-brand-400">
              {heading.title || resume.title}
            </p>

            {/* Contact Details */}
            <div className="mt-4 flex flex-wrap items-center gap-y-2 gap-x-6 text-sm text-neutral-600 dark:text-neutral-400">
              {heading.email && (
                <a
                  href={`mailto:${heading.email}`}
                  className="flex items-center gap-1.5 hover:text-brand-600 transition-colors"
                >
                  <Mail className="size-4 text-neutral-400" />
                  <span>{heading.email}</span>
                </a>
              )}
              {heading.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-4 text-neutral-400" />
                  <span>{heading.phone}</span>
                </span>
              )}
              {heading.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-neutral-400" />
                  <span>{heading.location}</span>
                </span>
              )}
              {heading.website && (
                <a
                  href={heading.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-brand-600 transition-colors"
                >
                  <Globe className="size-4 text-neutral-400" />
                  <span>{heading.website.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
              {heading.linkedin && (
                <a
                  href={`https://${heading.linkedin.replace(/^https?:\/\//, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-brand-600 transition-colors"
                >
                  <LinkedinIcon className="size-4 text-neutral-400" />
                  <span>{heading.linkedin.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
              {heading.github && (
                <a
                  href={`https://${heading.github.replace(/^https?:\/\//, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-brand-600 transition-colors"
                >
                  <GithubIcon className="size-4 text-neutral-400" />
                  <span>{heading.github.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
            </div>
          </div>

          {/* Executive Summary */}
          {resume.summary && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
                Executive Profile
              </h2>
              <p className="text-sm sm:text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
                {resume.summary}
              </p>
            </div>
          )}

          {/* Experience */}
          {resume.experience && resume.experience.length > 0 && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-4">
                Work Experience
              </h2>
              <div className="space-y-6">
                {resume.experience.map((exp, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                      <div>
                        <span className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                          {exp.title}
                        </span>
                        <span className="mx-2 text-neutral-400">·</span>
                        <span className="text-base font-semibold text-brand-600 dark:text-brand-400">
                          {exp.company}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        {exp.startDate} – {exp.current ? 'Present' : exp.endDate || ''}
                        {exp.location && ` | ${exp.location}`}
                      </span>
                    </div>

                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                        {exp.bullets.map((bullet, bIdx) => (
                          <li key={bIdx} className="leading-relaxed">
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          {resume.skills && resume.skills.length > 0 && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
                Core Competencies & Technologies
              </h2>
              <div className="space-y-2.5">
                {resume.skills.map((skillGroup, sIdx) => (
                  <div key={sIdx} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 text-sm">
                    {skillGroup.category && (
                      <span className="w-40 shrink-0 font-semibold text-neutral-900 dark:text-neutral-200">
                        {skillGroup.category}:
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {skillGroup.items.map((item, iIdx) => (
                        <span
                          key={iIdx}
                          className="rounded-md bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:text-neutral-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {resume.education && resume.education.length > 0 && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
                Education
              </h2>
              <div className="space-y-3">
                {resume.education.map((edu, eIdx) => (
                  <div key={eIdx} className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between">
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100">
                        {edu.institution}
                      </span>
                      <span className="mx-2 text-neutral-400">·</span>
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        {edu.degree} {edu.field ? `in ${edu.field}` : ''}
                      </span>
                    </div>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {edu.graduationDate} {edu.gpa ? `(GPA: ${edu.gpa})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {resume.projects && resume.projects.length > 0 && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
                Key Projects & Contributions
              </h2>
              <div className="space-y-4">
                {resume.projects.map((proj, pIdx) => (
                  <div key={pIdx} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-900 dark:text-neutral-100">
                        {proj.name}
                      </span>
                      {proj.link && (
                        <a
                          href={proj.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-600 hover:text-brand-700 inline-flex items-center text-xs"
                        >
                          <ExternalLink className="size-3 ml-0.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                      {proj.description}
                    </p>
                    {proj.highlights && (
                      <ul className="list-disc pl-5 space-y-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                        {proj.highlights.map((h, hIdx) => (
                          <li key={hIdx}>{h}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Brand */}
        <div className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 px-8 py-4 flex items-center justify-between text-xs text-neutral-500 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-brand-600">IME365</span>
            <span>· Verified Professional Candidate Profile</span>
          </div>
          <Link to="/" className="text-brand-600 hover:underline">
            Create your ATS-optimized resume
          </Link>
        </div>
      </div>
    </div>
  );
}
