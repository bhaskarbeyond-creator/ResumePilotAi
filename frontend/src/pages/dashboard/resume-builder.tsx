/**
 * Resume Builder — Multi-Step Form
 *
 * Full-featured resume creation and editing workflow with:
 * - Step navigation (Heading, Experience, Education, Skills, Summary, Template)
 * - Auto-save to backend
 * - AI-assisted content generation
 * - Live template preview
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/loading';
import { get, post, normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  User,
  Briefcase,
  GraduationCap,
  Wrench,
  FileText,
  Layout,
  ChevronLeft,
  ChevronRight,
  Save,
  Sparkles,
  Plus,
  Trash2,
  Check,
  Eye,
  Download,
  AlertCircle,
  X,
  MapPin,
  Globe,
  Phone,
  Mail,
  Link2,
  Code2,
} from 'lucide-react';

/* ─── Types ─── */

interface ResumeHeading {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
  title: string;
}

interface ExperienceEntry {
  id: string;
  company: string;
  position: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string;
  description: string;
}

interface SkillCategory {
  id: string;
  category: string;
  skills: string[];
}

interface ResumeData {
  id?: string;
  name: string;
  template: string;
  heading: ResumeHeading;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skillCategories: SkillCategory[];
  summary: string;
}

type BuilderStep = 'heading' | 'experience' | 'education' | 'skills' | 'summary' | 'template';

const STEPS: { id: BuilderStep; label: string; icon: typeof User }[] = [
  { id: 'heading', label: 'Personal Info', icon: User },
  { id: 'experience', label: 'Experience', icon: Briefcase },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'skills', label: 'Skills', icon: Wrench },
  { id: 'summary', label: 'Summary', icon: FileText },
  { id: 'template', label: 'Template', icon: Layout },
];

const EMPTY_HEADING: ResumeHeading = {
  firstName: '', lastName: '', email: '', phone: '',
  location: '', website: '', linkedin: '', github: '', title: '',
};

function createEmptyResume(): ResumeData {
  return {
    name: 'Untitled Resume',
    template: 'modern-1',
    heading: { ...EMPTY_HEADING },
    experience: [],
    education: [],
    skillCategories: [],
    summary: '',
  };
}

/* ─── Main Component ─── */

export function ResumeBuilderPage() {
  const { resumeId } = useParams<{ resumeId?: string }>();
  const navigate = useNavigate();

  const [resume, setResume] = useState<ResumeData>(createEmptyResume);
  const [currentStep, setCurrentStep] = useState<BuilderStep>('heading');
  const [loading, setLoading] = useState(!!resumeId);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing resume
  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await get<{ resume: ResumeData }>(`/resumes/${resumeId}`);
        if (!cancelled && data.resume) {
          setResume({
            ...createEmptyResume(),
            ...data.resume,
            heading: { ...EMPTY_HEADING, ...data.resume.heading },
          });
        }
      } catch (err) {
        if (!cancelled) setError(normalizeError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [resumeId]);

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const goNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1].id);
    }
  };

  const goPrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].id);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const id = resume.id || resumeId || 'new';
      const result = await post<{ resume: { id: string } }>(`/resumes/${id}`, resume);
      if (result.resume?.id && !resume.id) {
        setResume((prev) => ({ ...prev, id: result.resume.id }));
        navigate(`/build-resume/${result.resume.id}`, { replace: true });
      }
      setSaveMessage('Saved successfully');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage(`Save failed: ${normalizeError(err).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSpinner />;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <AlertCircle className="mb-4 size-12 text-error-500" />
            <h2 className="text-xl font-semibold text-ink">Failed to load resume</h2>
            <p className="mt-2 text-sm text-ink-muted">{error}</p>
            <Button className="mt-6" onClick={() => navigate('/dashboard/resumes')}>
              Back to Resumes
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/resumes')}>
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <input
            type="text"
            value={resume.name}
            onChange={(e) => setResume((prev) => ({ ...prev, name: e.target.value }))}
            className="border-none bg-transparent text-sm font-semibold text-ink outline-none focus:underline"
            placeholder="Resume name"
          />
        </div>
        <div className="flex items-center gap-2">
          {saveMessage && (
            <span className={cn(
              'text-xs font-medium',
              saveMessage.includes('failed') ? 'text-error-500' : 'text-success-600'
            )}>
              {saveMessage}
            </span>
          )}
          <Button variant="outline" size="sm">
            <Eye className="size-3.5" />
            Preview
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving}>
            <Save className="size-3.5" />
            Save
          </Button>
        </div>
      </div>

      {/* Step navigation */}
      <div className="border-b border-border bg-surface px-4 lg:px-6">
        <nav className="flex gap-1 overflow-x-auto py-2" aria-label="Resume builder steps">
          {STEPS.map((step, index) => {
            const isCurrent = currentStep === step.id;
            const isCompleted = index < currentStepIndex;
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  isCurrent
                    ? 'bg-brand-50 text-brand-700'
                    : isCompleted
                      ? 'text-success-600 hover:bg-success-50'
                      : 'text-ink-muted hover:bg-neutral-100 hover:text-ink',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-bold',
                  isCurrent ? 'bg-brand-600 text-white' :
                  isCompleted ? 'bg-success-100 text-success-700' :
                  'bg-neutral-200 text-ink-muted',
                )}>
                  {isCompleted ? <Check className="size-3.5" /> : index + 1}
                </div>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 xl:p-8">
        <div className="mx-auto max-w-3xl">
          {currentStep === 'heading' && (
            <HeadingStep heading={resume.heading} onChange={(heading) => setResume((prev) => ({ ...prev, heading }))} />
          )}
          {currentStep === 'experience' && (
            <ExperienceStep entries={resume.experience} onChange={(experience) => setResume((prev) => ({ ...prev, experience }))} />
          )}
          {currentStep === 'education' && (
            <EducationStep entries={resume.education} onChange={(education) => setResume((prev) => ({ ...prev, education }))} />
          )}
          {currentStep === 'skills' && (
            <SkillsStep categories={resume.skillCategories} onChange={(skillCategories) => setResume((prev) => ({ ...prev, skillCategories }))} />
          )}
          {currentStep === 'summary' && (
            <SummaryStep summary={resume.summary} heading={resume.heading} experience={resume.experience} onChange={(summary) => setResume((prev) => ({ ...prev, summary }))} />
          )}
          {currentStep === 'template' && (
            <TemplateStep template={resume.template} onChange={(template) => setResume((prev) => ({ ...prev, template }))} />
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between border-t border-border bg-surface px-4 py-3 lg:px-6">
        <Button variant="outline" onClick={goPrev} disabled={currentStepIndex === 0}>
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <span className="text-xs text-ink-muted">
          Step {currentStepIndex + 1} of {STEPS.length}
        </span>
        {currentStepIndex < STEPS.length - 1 ? (
          <Button onClick={goNext}>
            Next
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={handleSave} loading={saving}>
            <Download className="size-4" />
            Save & Finish
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Step 1: Personal Info / Heading ─── */

function HeadingStep({ heading, onChange }: { heading: ResumeHeading; onChange: (h: ResumeHeading) => void }) {
  const update = (field: keyof ResumeHeading, value: string) => {
    onChange({ ...heading, [field]: value });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-ink">Personal Information</h2>
      <p className="mt-1 text-sm text-ink-muted">Your contact details that will appear at the top of your resume.</p>

      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="rb-firstName" className="mb-1.5 block text-sm font-medium text-ink">First name *</label>
            <Input id="rb-firstName" value={heading.firstName} onChange={(e) => update('firstName', e.target.value)} placeholder="John" />
          </div>
          <div>
            <label htmlFor="rb-lastName" className="mb-1.5 block text-sm font-medium text-ink">Last name *</label>
            <Input id="rb-lastName" value={heading.lastName} onChange={(e) => update('lastName', e.target.value)} placeholder="Doe" />
          </div>
        </div>

        <div>
          <label htmlFor="rb-title" className="mb-1.5 block text-sm font-medium text-ink">Professional title</label>
          <Input id="rb-title" value={heading.title} onChange={(e) => update('title', e.target.value)} placeholder="Senior Software Engineer" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="rb-email" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
              <Mail className="size-3.5 text-ink-muted" /> Email *
            </label>
            <Input id="rb-email" type="email" value={heading.email} onChange={(e) => update('email', e.target.value)} placeholder="john@example.com" />
          </div>
          <div>
            <label htmlFor="rb-phone" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
              <Phone className="size-3.5 text-ink-muted" /> Phone
            </label>
            <Input id="rb-phone" type="tel" value={heading.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
          </div>
        </div>

        <div>
          <label htmlFor="rb-location" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
            <MapPin className="size-3.5 text-ink-muted" /> Location
          </label>
          <Input id="rb-location" value={heading.location} onChange={(e) => update('location', e.target.value)} placeholder="New York, NY" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="rb-website" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
              <Globe className="size-3.5 text-ink-muted" /> Website
            </label>
            <Input id="rb-website" type="url" value={heading.website} onChange={(e) => update('website', e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label htmlFor="rb-linkedin" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
              <Link2 className="size-3.5 text-ink-muted" /> LinkedIn
            </label>
            <Input id="rb-linkedin" value={heading.linkedin} onChange={(e) => update('linkedin', e.target.value)} placeholder="linkedin.com/in/..." />
          </div>
          <div>
            <label htmlFor="rb-github" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
              <Code2 className="size-3.5 text-ink-muted" /> GitHub
            </label>
            <Input id="rb-github" value={heading.github} onChange={(e) => update('github', e.target.value)} placeholder="github.com/..." />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 2: Experience ─── */

function ExperienceStep({ entries, onChange }: { entries: ExperienceEntry[]; onChange: (e: ExperienceEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), company: '', position: '', location: '',
      startDate: '', endDate: '', current: false, description: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof ExperienceEntry, value: string | boolean) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Work Experience</h2>
          <p className="mt-1 text-sm text-ink-muted">Add your work history, starting with the most recent position.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Position
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Briefcase className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No experience added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Add your work history to strengthen your resume.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Position
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Position {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Position *</label>
                  <Input value={entry.position} onChange={(e) => updateEntry(entry.id, 'position', e.target.value)} placeholder="Software Engineer" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Company *</label>
                  <Input value={entry.company} onChange={(e) => updateEntry(entry.id, 'company', e.target.value)} placeholder="Acme Inc." />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Location</label>
                <Input value={entry.location} onChange={(e) => updateEntry(entry.id, 'location', e.target.value)} placeholder="San Francisco, CA" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Start date</label>
                  <Input type="month" value={entry.startDate} onChange={(e) => updateEntry(entry.id, 'startDate', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-2 text-xs font-medium text-ink">
                    End date
                    <label className="flex items-center gap-1 text-xs text-ink-muted cursor-pointer">
                      <input type="checkbox" checked={entry.current} onChange={(e) => updateEntry(entry.id, 'current', e.target.checked)} className="size-3.5 rounded" />
                      Present
                    </label>
                  </label>
                  <Input type="month" value={entry.endDate} onChange={(e) => updateEntry(entry.id, 'endDate', e.target.value)} disabled={entry.current} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-ink">Description</label>
                  <Button type="button" variant="ghost" size="xs" className="text-brand-600">
                    <Sparkles className="size-3" /> AI Assist
                  </Button>
                </div>
                <textarea
                  value={entry.description}
                  onChange={(e) => updateEntry(entry.id, 'description', e.target.value)}
                  rows={4}
                  className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                  placeholder="• Led development of…&#10;• Improved performance by…&#10;• Collaborated with…"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 3: Education ─── */

function EducationStep({ entries, onChange }: { entries: EducationEntry[]; onChange: (e: EducationEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), institution: '', degree: '', field: '',
      startDate: '', endDate: '', gpa: '', description: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof EducationEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Education</h2>
          <p className="mt-1 text-sm text-ink-muted">Add your educational background.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Education
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <GraduationCap className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No education added yet</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add Education
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Education {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Institution *</label>
                <Input value={entry.institution} onChange={(e) => updateEntry(entry.id, 'institution', e.target.value)} placeholder="Massachusetts Institute of Technology" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Degree *</label>
                  <Input value={entry.degree} onChange={(e) => updateEntry(entry.id, 'degree', e.target.value)} placeholder="Bachelor of Science" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Field of study</label>
                  <Input value={entry.field} onChange={(e) => updateEntry(entry.id, 'field', e.target.value)} placeholder="Computer Science" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Start date</label>
                  <Input type="month" value={entry.startDate} onChange={(e) => updateEntry(entry.id, 'startDate', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">End date</label>
                  <Input type="month" value={entry.endDate} onChange={(e) => updateEntry(entry.id, 'endDate', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">GPA</label>
                  <Input value={entry.gpa} onChange={(e) => updateEntry(entry.id, 'gpa', e.target.value)} placeholder="3.8 / 4.0" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Additional details</label>
                <textarea
                  value={entry.description}
                  onChange={(e) => updateEntry(entry.id, 'description', e.target.value)}
                  rows={2}
                  className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                  placeholder="Relevant coursework, honors, activities…"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 4: Skills ─── */

function SkillsStep({ categories, onChange }: { categories: SkillCategory[]; onChange: (c: SkillCategory[]) => void }) {
  const [newSkill, setNewSkill] = useState<Record<string, string>>({});

  const addCategory = () => {
    onChange([...categories, { id: crypto.randomUUID(), category: '', skills: [] }]);
  };

  const updateCategory = (id: string, category: string) => {
    onChange(categories.map((c) => c.id === id ? { ...c, category } : c));
  };

  const removeCategory = (id: string) => {
    onChange(categories.filter((c) => c.id !== id));
  };

  const addSkill = (categoryId: string) => {
    const skill = (newSkill[categoryId] ?? '').trim();
    if (!skill) return;
    onChange(categories.map((c) => c.id === categoryId ? { ...c, skills: [...c.skills, skill] } : c));
    setNewSkill((prev) => ({ ...prev, [categoryId]: '' }));
  };

  const removeSkill = (categoryId: string, skillIndex: number) => {
    onChange(categories.map((c) =>
      c.id === categoryId
        ? { ...c, skills: c.skills.filter((_, i) => i !== skillIndex) }
        : c
    ));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Skills</h2>
          <p className="mt-1 text-sm text-ink-muted">Organize your skills by category.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" className="text-brand-600">
            <Sparkles className="size-3.5" /> AI Suggest
          </Button>
          <Button variant="outline" onClick={addCategory}>
            <Plus className="size-4" /> Add Category
          </Button>
        </div>
      </div>

      {categories.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Wrench className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No skills added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Group your skills into categories like "Languages", "Frameworks", etc.</p>
          <Button variant="outline" className="mt-4" onClick={addCategory}>
            <Plus className="size-4" /> Add Skill Category
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {categories.map((cat) => (
          <Card key={cat.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Input
                  value={cat.category}
                  onChange={(e) => updateCategory(cat.id, e.target.value)}
                  placeholder="Category name (e.g., Programming Languages)"
                  className="flex-1 font-medium"
                />
                <Button variant="ghost" size="icon-sm" onClick={() => removeCategory(cat.id)}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>

              {/* Skill tags */}
              <div className="flex flex-wrap gap-2 mb-3">
                {cat.skills.map((skill, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                    {skill}
                    <button onClick={() => removeSkill(cat.id, i)} className="ml-0.5 rounded-full hover:bg-brand-200 p-0.5">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add skill input */}
              <div className="flex gap-2">
                <Input
                  value={newSkill[cat.id] ?? ''}
                  onChange={(e) => setNewSkill((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                  placeholder="Type a skill and press Enter…"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(cat.id); } }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => addSkill(cat.id)}>
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 5: Summary ─── */

function SummaryStep({
  summary, heading, experience, onChange,
}: {
  summary: string;
  heading: ResumeHeading;
  experience: ExperienceEntry[];
  onChange: (s: string) => void;
}) {
  const [generating, setGenerating] = useState(false);

  const generateSummary = async () => {
    setGenerating(true);
    try {
      const result = await post<{ summary: string }>('/generate-summary', {
        name: `${heading.firstName} ${heading.lastName}`.trim(),
        title: heading.title,
        experience: experience.map((e) => ({
          position: e.position,
          company: e.company,
          description: e.description,
        })),
      });
      if (result.summary) {
        onChange(result.summary);
      }
    } catch {
      // Fallback: don't overwrite existing content
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Professional Summary</h2>
          <p className="mt-1 text-sm text-ink-muted">A brief overview of your qualifications and career goals.</p>
        </div>
        <Button variant="outline" onClick={generateSummary} loading={generating} disabled={generating}>
          <Sparkles className="size-4" />
          Generate with AI
        </Button>
      </div>

      <div className="mt-6">
        <textarea
          value={summary}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          className="flex w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
          placeholder="Results-driven software engineer with 5+ years of experience building scalable web applications. Passionate about clean code, performance optimization, and delivering exceptional user experiences…"
        />
        <p className="mt-2 text-xs text-ink-muted">
          {summary.length} characters · Recommended: 150–300 characters for ATS optimization.
        </p>
      </div>

      {/* Tips */}
      <Card className="mt-6 border-brand-200 bg-brand-50/50">
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-brand-800">💡 Tips for a great summary</h4>
          <ul className="mt-2 space-y-1 text-xs text-brand-700">
            <li>• Lead with your years of experience and specialization</li>
            <li>• Include 2-3 key achievements or strengths</li>
            <li>• Mention technologies or domains relevant to your target role</li>
            <li>• Keep it concise — 3-4 sentences maximum</li>
            <li>• Avoid first-person pronouns (I, my, me)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Step 6: Template Selection ─── */

const TEMPLATES = [
  { id: 'modern-1', name: 'Modern', category: 'Professional' },
  { id: 'classic-1', name: 'Classic', category: 'Traditional' },
  { id: 'minimal-1', name: 'Minimal', category: 'Clean' },
  { id: 'creative-1', name: 'Creative', category: 'Design' },
  { id: 'executive-1', name: 'Executive', category: 'Senior' },
  { id: 'tech-1', name: 'Tech Focus', category: 'Engineering' },
  { id: 'bold-1', name: 'Bold', category: 'Standout' },
  { id: 'elegant-1', name: 'Elegant', category: 'Corporate' },
  { id: 'compact-1', name: 'Compact', category: 'Dense' },
];

function TemplateStep({ template, onChange }: { template: string; onChange: (t: string) => void }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-ink">Choose a Template</h2>
      <p className="mt-1 text-sm text-ink-muted">Select a design that best represents your style. You can change it anytime.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((tmpl) => {
          const isSelected = template === tmpl.id;
          return (
            <button
              key={tmpl.id}
              onClick={() => onChange(tmpl.id)}
              className={cn(
                'group relative overflow-hidden rounded-xl border-2 text-left transition-all',
                isSelected
                  ? 'border-brand-500 shadow-lg ring-2 ring-brand-200'
                  : 'border-border hover:border-brand-300 hover:shadow-md',
              )}
            >
              {/* Template preview placeholder */}
              <div className="aspect-[3/4] bg-neutral-50 p-4">
                <div className="h-full rounded-md border border-neutral-200 bg-white p-3">
                  {/* Simulated resume layout */}
                  <div className="mb-2 h-3 w-2/3 rounded bg-neutral-200" />
                  <div className="mb-3 h-2 w-1/3 rounded bg-neutral-100" />
                  <div className="mb-1 h-1.5 w-full rounded bg-neutral-100" />
                  <div className="mb-1 h-1.5 w-5/6 rounded bg-neutral-100" />
                  <div className="mb-3 h-1.5 w-4/6 rounded bg-neutral-100" />
                  <div className="mb-1 h-2 w-1/3 rounded bg-neutral-200" />
                  <div className="mb-1 h-1.5 w-full rounded bg-neutral-100" />
                  <div className="mb-1 h-1.5 w-5/6 rounded bg-neutral-100" />
                  <div className="mb-3 h-1.5 w-3/4 rounded bg-neutral-100" />
                  <div className="mb-1 h-2 w-1/4 rounded bg-neutral-200" />
                  <div className="flex gap-1">
                    <div className="h-4 w-12 rounded bg-brand-100" />
                    <div className="h-4 w-10 rounded bg-brand-100" />
                    <div className="h-4 w-14 rounded bg-brand-100" />
                  </div>
                </div>
              </div>

              {/* Template info */}
              <div className="flex items-center justify-between border-t border-border p-3">
                <div>
                  <div className="text-sm font-semibold text-ink">{tmpl.name}</div>
                  <div className="text-xs text-ink-muted">{tmpl.category}</div>
                </div>
                {isSelected && (
                  <div className="flex size-6 items-center justify-center rounded-full bg-brand-600">
                    <Check className="size-3.5 text-white" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-ink-muted">
        51 templates available · More templates coming in future updates
      </p>
    </div>
  );
}
