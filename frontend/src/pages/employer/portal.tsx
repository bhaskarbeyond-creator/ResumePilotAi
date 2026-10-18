/**
 * Employer Portal
 *
 * Recruitment hub for hiring managers and recruiters:
 * - Real-time pipeline metrics (Active Jobs, Candidates, In-Interview, Hired)
 * - Job posting creator with ATS keyword requirements and salary range
 * - Candidate review pipeline with ATS match scores, stages, and quick resume drawer
 * NOTE: Candidate-related hooks removed per DIR-002 (phantom endpoints /api/employer/candidates)
 * Mock data used until backend contract is finalized.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Users,
  Briefcase,
  UserCheck,
  TrendingUp,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  ChevronRight,
  Sparkles,
  FileText,
  Mail,
  MapPin,
  DollarSign,
  X,
  AlertCircle,
} from 'lucide-react';
import { useJobs, useCreateJob, type JobListing } from '@/hooks/use-api-hooks';

const PIPELINE_STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Archived'] as const;

// Mock Candidate data (replaces phantom /api/employer/candidates endpoint)
interface Candidate {
  id: string;
  name: string;
  email: string;
  role: string;
  appliedDate: string;
  atsScore: number;
  stage: 'Applied' | 'Screening' | 'Interview' | 'Offer' | 'Archived';
  experienceYears: number;
  topSkills: string[];
}

const MOCK_CANDIDATES: Candidate[] = [
  {
    id: 'cand-1',
    name: 'Sarah Chen',
    email: 'sarah.chen@email.com',
    role: 'Senior Backend Engineer',
    appliedDate: '2026-10-15',
    atsScore: 94,
    stage: 'Interview',
    experienceYears: 7,
    topSkills: ['Go', 'Kubernetes', 'PostgreSQL', 'gRPC', 'Redis'],
  },
  {
    id: 'cand-2',
    name: 'Marcus Johnson',
    email: 'marcus.j@email.com',
    role: 'Full Stack Developer',
    appliedDate: '2026-10-14',
    atsScore: 87,
    stage: 'Screening',
    experienceYears: 5,
    topSkills: ['React', 'TypeScript', 'Node.js', 'AWS', 'GraphQL'],
  },
  {
    id: 'cand-3',
    name: 'Priya Sharma',
    email: 'priya.s@email.com',
    role: 'DevOps Engineer',
    appliedDate: '2026-10-13',
    atsScore: 91,
    stage: 'Interview',
    experienceYears: 6,
    topSkills: ['Terraform', 'Kubernetes', 'CI/CD', 'Prometheus', 'Python'],
  },
  {
    id: 'cand-4',
    name: 'David Park',
    email: 'david.park@email.com',
    role: 'Frontend Architect',
    appliedDate: '2026-10-12',
    atsScore: 89,
    stage: 'Offer',
    experienceYears: 8,
    topSkills: ['React 19', 'Next.js', 'Tailwind', 'WebGL', 'TypeScript'],
  },
  {
    id: 'cand-5',
    name: 'Elena Rodriguez',
    email: 'elena.r@email.com',
    role: 'ML Engineer',
    appliedDate: '2026-10-11',
    atsScore: 82,
    stage: 'Applied',
    experienceYears: 4,
    topSkills: ['Python', 'PyTorch', 'MLOps', 'Kubeflow', 'Docker'],
  },
];

export function EmployerPortalPage() {
  const { data: jobs = [], isLoading: jobsLoading, error: jobsError } = useJobs();
  const createJobMutation = useCreateJob();

  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [activeTab, setActiveTab] = useState<'candidates' | 'jobs'>('candidates');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  // New Job Form State
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDept, setNewJobDept] = useState('');
  const [newJobLocation, setNewJobLocation] = useState('');
  const [newJobSalary, setNewJobSalary] = useState('');

  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobTitle.trim()) return;

    createJobMutation.mutate({
      title: newJobTitle,
      department: newJobDept || 'Engineering',
      location: newJobLocation || 'Remote',
      type: 'Full-time',
      salary: newJobSalary || '$140k - $170k',
      status: 'active',
    });

    setShowNewJobModal(false);
    setNewJobTitle('');
    setNewJobDept('');
    setNewJobLocation('');
    setNewJobSalary('');
  };

  const advanceCandidateStage = (_id: string, newStage: Candidate['stage']) => {
    setSelectedCandidate((prev) => prev ? { ...prev, stage: newStage } : null);
  };

  const filteredCandidates = MOCK_CANDIDATES.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.topSkills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Use filteredCandidates for display counts
  const displayCandidates = filteredCandidates;

  const isLoading = jobsLoading || candidatesLoading;
  const hasError = jobsError;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-edge pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
            <Briefcase className="size-6 text-accent" />
            Employer & Recruiter Hub
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Manage your open requisitions, review ATS-ranked candidates, and streamline interview loops.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            onClick={() => setShowNewJobModal(true)}
            className="text-xs font-semibold gap-1.5"
            disabled={createJobMutation.isPending}
          >
            <Plus className="size-3.5" />
            Post New Job Requisition
          </Button>
        </div>
      </div>

      {/* ─── Error State ─── */}
      {hasError && (
        <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700" role="alert">
          <AlertCircle className="size-4 shrink-0" />
          Failed to load data. Please check your connection and try again.
        </div>
      )}

      {/* ─── High-Level Hiring Metrics ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-edge shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
              <Briefcase className="size-5" />
            </div>
            <div>
              <p className="text-xs text-ink-muted">Active Requisitions</p>
              <p className="text-xl font-bold text-ink">{isLoading ? '—' : jobs.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-edge shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-xs text-ink-muted">Total Applicants</p>
              <p className="text-xl font-bold text-ink">
                {isLoading ? '—' : displayCandidates.length + jobs.reduce((sum, j) => sum + j.applicantCount, 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-edge shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-xs text-ink-muted">In Interview Loops</p>
              <p className="text-xl font-bold text-ink">
                {isLoading ? '—' : displayCandidates.filter((c) => c.stage === 'Interview' || c.stage === 'Screening').length}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-edge shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <UserCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs text-ink-muted">Offers Extended</p>
              <p className="text-xl font-bold text-ink">
                {isLoading ? '—' : displayCandidates.filter((c) => c.stage === 'Offer').length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex items-center gap-4 border-b border-edge">
        <button
          type="button"
          onClick={() => setActiveTab('candidates')}
          className={cn(
            'pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5',
            activeTab === 'candidates'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          <Users className="size-3.5" />
          Candidate Pipeline ({isLoading ? '—' : displayCandidates.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('jobs')}
          className={cn(
            'pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5',
            activeTab === 'jobs'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          <Briefcase className="size-3.5" />
          Job Requisitions ({isLoading ? '—' : jobs.length})
        </button>
      </div>

      {/* ─── TAB 1: Candidates Pipeline ─── */}
      {activeTab === 'candidates' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative max-w-sm w-full">
              <Search className="size-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search candidates by name, role, skill..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>
            <span className="text-xs text-ink-muted">
              Ranked by AI ATS Compatibility Match
            </span>
          </div>

          {isLoading ? (
            <div className="border border-edge rounded-xl bg-surface overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-edge bg-canvas-soft/70">
                    <th className="p-3.5 font-semibold text-ink">Candidate</th>
                    <th className="p-3.5 font-semibold text-ink">Role</th>
                    <th className="p-3.5 font-semibold text-ink text-center">ATS Match</th>
                    <th className="p-3.5 font-semibold text-ink">Stage</th>
                    <th className="p-3.5 font-semibold text-ink">Skills Highlight</th>
                    <th className="p-3.5 font-semibold text-ink text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-edge/60">
                      <td className="p-3.5"><div className="h-4 bg-neutral-200 rounded w-3/4 animate-pulse" /></td>
                      <td className="p-3.5"><div className="h-4 bg-neutral-200 rounded w-1/2 animate-pulse" /></td>
                      <td className="p-3.5 text-center"><div className="h-4 bg-neutral-200 rounded w-1/3 animate-pulse mx-auto" /></td>
                      <td className="p-3.5"><div className="h-4 bg-neutral-200 rounded w-1/3 animate-pulse" /></td>
                      <td className="p-3.5"><div className="h-4 bg-neutral-200 rounded w-1/2 animate-pulse" /></td>
                      <td className="p-3.5 text-right"><div className="h-4 bg-neutral-200 rounded w-1/4 animate-pulse ml-auto" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="border border-edge rounded-xl bg-surface p-8 text-center">
              <Users className="size-12 text-ink-muted mx-auto mb-3" />
              <p className="text-sm text-ink-muted">
                {searchQuery ? 'No candidates match your search.' : 'No candidates found. Post a job requisition to start receiving applications.'}
              </p>
            </div>
          ) : (
            <div className="border border-edge rounded-xl bg-surface overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-edge bg-canvas-soft/70">
                    <th className="p-3.5 font-semibold text-ink">Candidate</th>
                    <th className="p-3.5 font-semibold text-ink">Role</th>
                    <th className="p-3.5 font-semibold text-ink text-center">ATS Match</th>
                    <th className="p-3.5 font-semibold text-ink">Stage</th>
                    <th className="p-3.5 font-semibold text-ink">Skills Highlight</th>
                    <th className="p-3.5 font-semibold text-ink text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge/60">
                  {filteredCandidates.map((cand) => (
                    <tr
                      key={cand.id}
                      className="hover:bg-canvas-soft/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedCandidate(cand)}
                    >
                      <td className="p-3.5">
                        <div className="font-bold text-ink">{cand.name}</div>
                        <div className="text-[11px] text-ink-muted">{cand.email}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-medium text-ink">{cand.role}</div>
                        <div className="text-[10px] text-ink-muted">{cand.experienceYears}y exp • {cand.appliedDate}</div>
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border',
                            cand.atsScore >= 90
                              ? 'bg-emerald-700/25 text-emerald-800 dark:text-emerald-200 border-emerald-700/40'
                              : cand.atsScore >= 80
                              ? 'bg-blue-700/25 text-blue-800 dark:text-blue-200 border-blue-700/40'
                              : 'bg-amber-700/25 text-amber-800 dark:text-amber-200 border-amber-700/40'
                          )}
                        >
                          {cand.atsScore}%
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-canvas-soft border border-edge text-ink">
                          {cand.stage}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {cand.topSkills.slice(0, 3).map((s) => (
                            <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-canvas border border-edge text-ink-muted">
                              {s}
                            </span>
                          ))}
                          {cand.topSkills.length > 3 && (
                            <span className="text-[10px] text-ink-muted">+{cand.topSkills.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2 gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCandidate(cand);
                          }}
                        >
                          Review
                          <ChevronRight className="size-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: Jobs Requisitions ─── */}
      {activeTab === 'jobs' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="border-edge shadow-sm animate-pulse">
                  <CardHeader className="pb-3">
                    <div className="h-4 bg-neutral-200 rounded w-1/4 mb-2 animate-pulse" />
                    <div className="h-5 bg-neutral-200 rounded w-3/4 animate-pulse" />
                    <div className="h-4 bg-neutral-200 rounded w-1/2 animate-pulse mt-2" />
                    <div className="h-4 bg-neutral-200 rounded w-1/3 animate-pulse mt-1" />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="h-4 bg-neutral-200 rounded w-1/3 animate-pulse mt-3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="border border-edge rounded-xl bg-surface p-8 text-center">
              <Briefcase className="size-12 text-ink-muted mx-auto mb-3" />
              <p className="text-sm text-ink-muted">No job requisitions posted yet.</p>
              <Button
                size="sm"
                onClick={() => setShowNewJobModal(true)}
                className="mt-3 text-xs font-semibold gap-1.5"
              >
                <Plus className="size-3.5" />
                Post New Job Requisition
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {jobs.map((job) => (
                <Card key={job.id} className="border-edge shadow-sm flex flex-col justify-between">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent-soft px-2 py-0.5 rounded">
                        {job.department}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 capitalize">
                        ● {job.status}
                      </span>
                    </div>
                    <CardTitle className="text-sm font-bold text-ink">{job.title}</CardTitle>
                    <CardDescription className="text-xs flex items-center gap-3 pt-1 text-ink-muted">
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" /> {job.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="size-3" /> {job.salary}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="border-t border-edge pt-3 flex items-center justify-between text-xs">
                      <span className="text-ink-muted">
                        <strong className="text-ink font-semibold">{job.applicantCount}</strong> Applicants
                      </span>
                      <span className="text-[11px] text-ink-muted">{job.postedAt}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Candidate Review Drawer Modal ─── */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="candidate-review-title">
          <div className="bg-surface border border-edge rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-6 relative animate-in fade-in zoom-in-95">
            <button
              type="button"
              onClick={() => setSelectedCandidate(null)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
              aria-label="Close candidate review"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-start gap-4">
              <div className="size-12 rounded-full bg-accent/10 text-accent font-bold text-lg flex items-center justify-center shrink-0">
                {selectedCandidate.name.charAt(0)}
              </div>
              <div>
                <h3 id="candidate-review-title" className="text-lg font-bold text-ink">{selectedCandidate.name}</h3>
                <p className="text-xs text-accent font-medium">{selectedCandidate.role}</p>
                <p className="text-xs text-ink-muted mt-0.5">{selectedCandidate.email} • {selectedCandidate.experienceYears} Years Exp</p>
              </div>
            </div>

            {/* ATS Match Meter */}
            <div className="p-4 rounded-xl bg-canvas-soft border border-edge flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-accent" />
                  ATS Match Score
                </p>
                <p className="text-[11px] text-ink-muted">Semantic alignment with job description</p>
              </div>
              <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {selectedCandidate.atsScore}%
              </span>
            </div>

            {/* Skills */}
            <div>
              <p className="text-xs font-semibold text-ink mb-2">Verified Technical Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedCandidate.topSkills.map((s) => (
                  <span key={s} className="px-2.5 py-1 rounded text-xs bg-surface border border-edge text-ink font-medium">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Move Pipeline Stage */}
            <div className="space-y-2 pt-2 border-t border-edge">
              <p className="text-xs font-semibold text-ink">Update Hiring Stage</p>
              <div className="grid grid-cols-3 gap-2">
                {PIPELINE_STAGES.map((stg) => (
                  <button
                    key={stg}
                    type="button"
                    onClick={() => advanceCandidateStage(selectedCandidate.id, stg)}
                    disabled={false}
                    className={cn(
                      'py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all',
                      selectedCandidate.stage === stg
                        ? 'border-accent bg-accent text-white font-bold'
                        : 'border-edge hover:border-edge-strong bg-canvas text-ink-muted hover:text-ink'
                    )}
                  >
                    {stg}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedCandidate(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Post New Job Modal ─── */}
      {showNewJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="new-job-title">
          <div className="bg-surface border border-edge rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 relative animate-in fade-in zoom-in-95">
            <button
              type="button"
              onClick={() => setShowNewJobModal(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
              aria-label="Close new job modal"
            >
              <X className="size-5" />
            </button>

            <div>
              <h3 id="new-job-title" className="text-base font-bold text-ink">Post New Job Requisition</h3>
              <p className="text-xs text-ink-muted">Create an open role to begin receiving ATS-ranked resumes.</p>
            </div>

            <form onSubmit={handleCreateJob} className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Job Title</label>
                <Input
                  required
                  placeholder="e.g. Senior Backend Engineer"
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Department</label>
                  <Input
                    placeholder="e.g. Engineering"
                    value={newJobDept}
                    onChange={(e) => setNewJobDept(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Location</label>
                  <Input
                    placeholder="e.g. Remote (US)"
                    value={newJobLocation}
                    onChange={(e) => setNewJobLocation(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Salary Range</label>
                <Input
                  placeholder="e.g. $150,000 - $180,000"
                  value={newJobSalary}
                  onChange={(e) => setNewJobSalary(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewJobModal(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="text-xs font-semibold" disabled={createJobMutation.isPending}>
                  {createJobMutation.isPending ? 'Publishing...' : 'Publish Job'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}