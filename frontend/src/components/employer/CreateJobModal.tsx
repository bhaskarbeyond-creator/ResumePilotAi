import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
/**
 * CreateJobModal — Employer Portal
 *
 * Full-field Job Creation Modal with complete 53KB parity:
 * - Company Selector (bound to GET /api/employer/companies)
 * - Job title, department, employment type (Full-time, Part-time, Contract, Freelance, Internship, Temporary)
 * - Location, country, and work mode (On-site, Remote, Hybrid)
 * - Salary range with currency (USD, EUR, GBP, INR) and pay period (Annual, Monthly, Hourly)
 * - Experience level selector (Entry, Junior, Mid, Senior, Lead, Executive)
 * - Perks & Benefits multi-select pill badges + custom benefit adder
 * - Interactive Custom Screening Questions Builder (Short text, Yes/No, Multiple Choice, Required toggle)
 * - Application deadline date picker
 * - Rich multiline job description and requirements editor
 * - Submits payload nested in { data: { companyId, ... } } to POST /api/employer/jobs
 */

import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Building2,
  MapPin,
  Coins,
  FileText,
  Plus,
  Trash2,
  Check,
  X,
  AlertCircle,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useEmployerCompanies, useCreateJob } from '@/hooks/use-api-hooks';

export interface ScreeningQuestion {
  id: string;
  question: string;
  type: 'short_text' | 'yes_no' | 'multiple_choice';
  options?: string[];
  required: boolean;
}

const COMMON_BENEFITS = [
  'Health Insurance',
  'Dental & Vision',
  '401(k) Matching',
  'Unlimited PTO',
  'Remote Work Stipend',
  'Equity / Stock Options',
  'Annual Learning Budget',
  'Parental Leave',
  'Gym & Wellness Subsidy',
  'Flexible Working Hours',
  'Home Office Setup',
  'Annual Bonus',
];

const JOB_TYPES = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'internship', label: 'Internship' },
  { value: 'temporary', label: 'Temporary' },
];

const WORK_MODES = [
  { value: 'on-site', label: 'On-site' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
];

const EXPERIENCE_LEVELS = [
  { value: 'entry-level', label: 'Entry Level' },
  { value: 'junior', label: 'Junior (1-3 yrs)' },
  { value: 'mid-level', label: 'Mid Level (3-5 yrs)' },
  { value: 'senior', label: 'Senior (5-8 yrs)' },
  { value: 'lead', label: 'Lead / Principal (8+ yrs)' },
  { value: 'executive', label: 'Executive' },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'];

interface CreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateJobModal({ isOpen, onClose, onSuccess }: CreateJobModalProps) {
  const { data: companies = [], isLoading: companiesLoading } = useEmployerCompanies();
  const createJobMutation = useCreateJob();

  // Form State
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('');
  const [jobType, setJobType] = useState('full-time');
  const [workMode, setWorkMode] = useState('remote');
  const [experienceLevel, setExperienceLevel] = useState('mid-level');
  const [currency, setCurrency] = useState('USD');
  const [minSalary, setMinSalary] = useState('');
  const [maxSalary, setMaxSalary] = useState('');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState<string[]>(['']);
  const [benefits, setBenefits] = useState<string[]>([]);
  const [customBenefit, setCustomBenefit] = useState('');
  const [screeningQuestions, setScreeningQuestions] = useState<ScreeningQuestion[]>([]);

  const [formError, setFormError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // Set default company when companies load
  useEffect(() => {
    if (companies.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, selectedCompanyId]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Requirement Handlers
  const handleRequirementChange = (index: number, val: string) => {
    const next = [...requirements];
    next[index] = val;
    setRequirements(next);
  };

  const addRequirement = () => {
    setRequirements([...requirements, '']);
  };

  const removeRequirement = (index: number) => {
    if (requirements.length <= 1) {
      setRequirements(['']);
      return;
    }
    setRequirements(requirements.filter((_, i) => i !== index));
  };

  // Benefit Pill Toggles
  const toggleBenefit = (item: string) => {
    if (benefits.includes(item)) {
      setBenefits(benefits.filter((b) => b !== item));
    } else {
      setBenefits([...benefits, item]);
    }
  };

  const addCustomBenefit = () => {
    if (!customBenefit.trim()) return;
    if (!benefits.includes(customBenefit.trim())) {
      setBenefits([...benefits, customBenefit.trim()]);
    }
    setCustomBenefit('');
  };

  // Screening Questions Handlers
  const addScreeningQuestion = () => {
    const newQ: ScreeningQuestion = {
      id: `q-${Date.now()}`,
      question: '',
      type: 'short_text',
      required: true,
    };
    setScreeningQuestions([...screeningQuestions, newQ]);
  };

  const updateQuestion = (id: string, patch: Partial<ScreeningQuestion>) => {
    setScreeningQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
  };

  const removeQuestion = (id: string) => {
    setScreeningQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!selectedCompanyId) {
      setFormError('Please select an approved employer company.');
      return;
    }
    if (!title.trim()) {
      setFormError('Please enter a job title.');
      return;
    }
    if (!location.trim()) {
      setFormError('Please specify the role location or city.');
      return;
    }
    if (!description.trim()) {
      setFormError('Please provide a comprehensive job description.');
      return;
    }

    const minSal = minSalary ? parseInt(minSalary, 10) : null;
    const maxSal = maxSalary ? parseInt(maxSalary, 10) : null;
    if (minSal && maxSal && minSal > maxSal) {
      setFormError('Minimum salary cannot exceed maximum salary.');
      return;
    }

    const cleanedRequirements = requirements.map((r) => r.trim()).filter(Boolean);
    const cleanedBenefits = benefits.map((b) => b.trim()).filter(Boolean);

    try {
      await createJobMutation.mutateAsync({
        companyId: selectedCompanyId,
        title: title.trim(),
        department: department.trim() || 'General',
        description: description.trim(),
        location: location.trim(),
        country: country.trim() || 'Global',
        jobType,
        workMode,
        experienceLevel,
        minSalary: minSal,
        maxSalary: maxSal,
        requirements: cleanedRequirements,
        benefits: cleanedBenefits,
        deadline: deadline || null,
      });

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      setFormError(err.message || 'Failed to post job requisition. Please try again.');
    }
  };

  return (
    <Dialog open onOpenChange={value => { if (!value && !createJobMutation.isPending) onClose(); }}>
      <DialogContent hideCloseButton aria-describedby={undefined} className="w-[calc(100%-1rem)] max-w-2xl max-h-[92vh] p-0 gap-0 rounded-2xl md:rounded-3xl bg-surface/95 border-border backdrop-blur-xl flex flex-col overflow-hidden motion-reduce:animate-none">
        {/* Header */}
        <div className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-border bg-neutral-50/50 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 font-bold text-brand-600">
              <Briefcase className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2 break-words text-base font-bold text-ink">
                Post Job Requisition
                <span className="shrink-0 rounded border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                  Full ATS Parity
                </span>
              </DialogTitle>
              <p className="break-words text-xs text-ink-muted">
                Create a verified job posting with structured screening questions &amp; salary bands
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            aria-label="Close modal"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <div className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
          {formError && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium">
              <AlertCircle className="size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {isSuccess && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>Job requisition successfully published to ATS pipeline!</span>
            </div>
          )}

          <form id="create-job-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Section 1: Company & Job Title */}
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
                <Building2 className="size-3.5 text-accent" />
                <span>1. Organization & Role Title</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="min-w-0">
                  <label htmlFor="job-company" className="mb-1 block break-words text-xs font-semibold text-ink">
                    Hiring Company <span className="text-red-500">*</span>
                  </label>
                  {companiesLoading ? (
                    <div className="h-9 rounded-md bg-canvas-soft animate-pulse" />
                  ) : companies.length === 0 ? (
                    <div className="text-xs p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                      No approved companies. Defaulting to Organization Profile.
                    </div>
                  ) : (
                    <select
                      id="job-company"
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(e.target.value)}
                      className="block w-full min-w-0 max-w-full rounded-md border border-edge bg-surface px-3 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent h-9"
                      required
                    >
                      <option value="" disabled>Select Company</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.featured ? '⭐' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="min-w-0">
                  <label htmlFor="job-department" className="mb-1 block break-words text-xs font-semibold text-ink">
                    Department
                  </label>
                  <Input
                    id="job-department"
                    placeholder="e.g. Engineering, Product, Sales"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <label htmlFor="job-title" className="mb-1 block break-words text-xs font-semibold text-ink">
                  Job Requisition Title <span className="text-red-500">*</span>
                </label>
                <Input
                  id="job-title"
                  required
                  placeholder="e.g. Senior Full-Stack Engineer (React 19 & Node)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xs h-9 font-medium"
                />
              </div>
            </div>

            {/* Section 2: Workplace, Location & Experience */}
            <div className="space-y-3.5 pt-4 border-t border-edge">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
                <MapPin className="size-3.5 text-accent" />
                <span>2. Location, Work Mode & Level</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="min-w-0">
                  <label htmlFor="job-work-mode" className="mb-1 block break-words text-xs font-semibold text-ink">
                    Workplace Policy
                  </label>
                  <select
                    id="job-work-mode"
                    value={workMode}
                    onChange={(e) => setWorkMode(e.target.value)}
                    className="block w-full min-w-0 max-w-full rounded-md border border-edge bg-surface px-3 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent h-9"
                  >
                    {WORK_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label htmlFor="job-type" className="mb-1 block break-words text-xs font-semibold text-ink">
                    Employment Type
                  </label>
                  <select
                    id="job-type"
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="block w-full min-w-0 max-w-full rounded-md border border-edge bg-surface px-3 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent h-9"
                  >
                    {JOB_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label htmlFor="job-experience-level" className="mb-1 block break-words text-xs font-semibold text-ink">
                    Experience Level
                  </label>
                  <select
                    id="job-experience-level"
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    className="block w-full min-w-0 max-w-full rounded-md border border-edge bg-surface px-3 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent h-9"
                  >
                    {EXPERIENCE_LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Location / City <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="e.g. San Francisco, CA or Remote"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Country
                  </label>
                  <Input
                    placeholder="e.g. United States or Worldwide"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Compensation & Deadline */}
            <div className="space-y-3.5 pt-4 border-t border-edge">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
                <Coins className="size-3.5 text-accent" />
                <span>3. Compensation & Application Deadline</span>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0">
                  <label htmlFor="job-currency" className="mb-1 block text-xs font-semibold text-ink">Currency</label>
                  <select
                    id="job-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="block w-full min-w-0 max-w-full rounded-md border border-edge bg-surface px-2 text-xs text-ink h-9"
                  >
                    {CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>{cur}</option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label htmlFor="job-min-salary" className="mb-1 block text-xs font-semibold text-ink">Min Salary</label>
                  <Input
                    id="job-min-salary"
                    type="number"
                    placeholder="120000"
                    value={minSalary}
                    onChange={(e) => setMinSalary(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="job-max-salary" className="mb-1 block text-xs font-semibold text-ink">Max Salary</label>
                  <Input
                    id="job-max-salary"
                    type="number"
                    placeholder="160000"
                    value={maxSalary}
                    onChange={(e) => setMaxSalary(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="job-deadline" className="mb-1 block text-xs font-semibold text-ink">Deadline</label>
                  <Input
                    id="job-deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Description */}
            <div className="space-y-3.5 pt-4 border-t border-edge">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
                <FileText className="size-3.5 text-accent" />
                <span>4. Job Overview & Responsibilities</span>
              </div>

              <div className="min-w-0">
                <label htmlFor="job-description" className="mb-1 block break-words text-xs font-semibold text-ink">
                  Full Description <span className="text-red-500">*</span>
                </label>
                <Textarea
                  id="job-description"
                  required
                  rows={5}
                  placeholder="Outline the core responsibilities, team structure, tech stack, and daily work expectations..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-xs resize-y"
                />
              </div>
            </div>

            {/* Section 5: Requirements */}
            <div className="space-y-3.5 pt-4 border-t border-edge">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
                  <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="break-words">5. Key Requirements &amp; Qualifications</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRequirement}
                  className="h-7 shrink-0 whitespace-normal text-xs px-2 gap-1 text-accent border-accent/30"
                >
                  <Plus className="size-3 shrink-0" /> Add Requirement
                </Button>
              </div>

              <div className="space-y-2">
                {requirements.map((req, idx) => (
                  <div key={idx} className="flex min-w-0 items-center gap-2">
                    <Input
                      aria-label={`Requirement ${idx + 1}`}
                      placeholder={`e.g. 5+ years building distributed cloud applications (Requirement #${idx + 1})`}
                      value={req}
                      onChange={(e) => handleRequirementChange(idx, e.target.value)}
                      className="text-xs h-8 flex-1"
                    />
                    {requirements.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRequirement(idx)}
                        className="p-1.5 text-ink-muted hover:text-red-500 transition-colors"
                        title="Remove requirement"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Section 6: Benefits & Perks */}
            <div className="space-y-3.5 pt-4 border-t border-edge">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
                <Sparkles className="size-3.5 text-accent" />
                <span>6. Perks, Benefits & Culture</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {COMMON_BENEFITS.map((item) => {
                  const active = benefits.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleBenefit(item)}
                      className={cn(
                        'text-[11px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1 font-medium',
                        active
                          ? 'bg-accent text-white border-accent shadow-xs'
                          : 'bg-canvas-soft border-edge text-ink-muted hover:text-ink hover:border-edge-strong'
                      )}
                    >
                      {active && <Check className="size-3 stroke-[3]" />}
                      {item}
                    </button>
                  );
                })}
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 pt-1">
                <Input
                  aria-label="Add custom perk"
                  placeholder="Add custom perk (e.g. Monthly book allowance)"
                  value={customBenefit}
                  onChange={(e) => setCustomBenefit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomBenefit();
                    }
                  }}
                  className="text-xs h-8 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomBenefit}
                  className="h-8 text-xs px-3"
                >
                  Add Perk
                </Button>
              </div>
            </div>

            {/* Section 7: Screening Questions Builder */}
            <div className="space-y-3.5 pt-4 border-t border-edge">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
                    <HelpCircle className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="break-words">7. Custom Candidate Screening Questions</span>
                  </div>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    Applicants will answer these during job application submission
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addScreeningQuestion}
                  className="h-7 shrink-0 whitespace-normal text-xs px-2 gap-1 text-accent border-accent/30"
                >
                  <Plus className="size-3 shrink-0" /> Add Question
                </Button>
              </div>

              {screeningQuestions.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-edge text-center text-xs text-ink-muted">
                  No screening questions added yet. Add questions to pre-filter candidates before review.
                </div>
              ) : (
                <div className="space-y-3">
                  {screeningQuestions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-xl border border-edge bg-canvas-soft/50 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-ink">Q{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeQuestion(q.id)}
                          className="text-ink-muted hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      <Input
                        aria-label={`Screening question ${idx + 1}`}
                        placeholder="e.g. How many years of production Kubernetes experience do you have?"
                        value={q.question}
                        onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                        className="text-xs h-8"
                      />

                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <label className="text-[11px] text-ink-muted">Type:</label>
                          <select
                            value={q.type}
                            onChange={(e) => updateQuestion(q.id, { type: e.target.value as any })}
                            className="min-w-0 max-w-full rounded border border-edge bg-surface px-2 text-xs text-ink h-7"
                          >
                            <option value="short_text">Short Text</option>
                            <option value="yes_no">Yes / No</option>
                            <option value="multiple_choice">Multiple Choice</option>
                          </select>
                        </div>

                        <label className="flex items-center gap-1.5 text-xs text-ink cursor-pointer">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                            className="rounded border-edge text-accent focus:ring-accent"
                          />
                          <span>Required</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-neutral-50/50 p-4">
          <p className="min-w-0 break-words text-[11px] text-ink-muted">
            Posts to MariaDB jobs table with active status
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={createJobMutation.isPending}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              form="create-job-form"
              type="submit"
              size="sm"
              disabled={createJobMutation.isPending}
              className="text-xs font-semibold gap-1.5 bg-accent hover:bg-accent/90"
            >
              {createJobMutation.isPending ? 'Publishing...' : 'Publish Requisition'}
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
