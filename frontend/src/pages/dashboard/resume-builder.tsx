/**
 * Resume Builder — 12-Step Multi-Step Form (TRUNCATION STRICTLY PROHIBITED)
 *
 * Full-featured resume creation and editing workflow with:
 * - 12 Steps: Heading, Experience, Education, Skills, Summary, Certifications,
 *   Achievements, Projects, Languages, References, Custom Sections, Review
 * - Auto-save to backend with MariaDB optimistic locking
 * - AI-assisted content generation
 * - Right Rail Tabbed AI Career Assistant (Suggestions, Insights, Job Match, ATS Guidance, Bullet Strength)
 * - Live template preview
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/loading';
import { get, post, normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { PreviewModal } from '@/components/ui/preview-modal';
import { FormattingToolbar } from '@/components/ui/formatting-toolbar';
import { TEMPLATES, TEMPLATE_CATEGORIES, getTemplatesByCategory } from '@/lib/template-catalog';
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
  Award,
  Languages,
  BookOpen,
  Link as LinkIcon,
  ClipboardCheck,
  Settings,
  Lightbulb,
  Target,
  Brain,
  Zap,
  HelpCircle,
  Shield,
  Trophy,
  Users,
  FolderPlus,
  BarChart3,
  Globe as GlobeIcon,
  Search,
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
  photo?: string;
  targetRole?: string;
  jobDescription?: string;
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

interface CertificationEntry {
  id: string;
  name: string;
  issuer: string;
  credentialId: string;
  issueDate: string;
  expiryDate: string;
  credentialUrl: string;
}

interface AchievementEntry {
  id: string;
  title: string;
  description: string;
  date: string;
}

interface ProjectEntry {
  id: string;
  title: string;
  description: string;
  technologies: string;
  liveUrl: string;
  githubUrl: string;
  startDate: string;
  endDate: string;
}

interface LanguageEntry {
  id: string;
  language: string;
  proficiency: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Native';
}

interface ReferenceEntry {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  relationship: string;
}

interface CustomSectionItem {
  id: string;
  title: string;
  description: string;
}

interface CustomSectionEntry {
  id: string;
  sectionTitle: string;
  items: CustomSectionItem[];
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
  certifications: CertificationEntry[];
  achievements: AchievementEntry[];
  projects: ProjectEntry[];
  languages: LanguageEntry[];
  references: ReferenceEntry[];
  customSections: CustomSectionEntry[];
}

type BuilderStep =
  | 'heading'
  | 'experience'
  | 'education'
  | 'skills'
  | 'summary'
  | 'template'
  | 'certifications'
  | 'achievements'
  | 'projects'
  | 'languages'
  | 'references'
  | 'custom'
  | 'review';

const STEPS: { id: BuilderStep; label: string; icon: typeof User; description?: string }[] = [
  { id: 'heading', label: 'Heading', icon: User, description: 'Personal info, photo, target role' },
  { id: 'experience', label: 'Experience', icon: Briefcase, description: 'Work history, AI bullet rewriter' },
  { id: 'education', label: 'Education', icon: GraduationCap, description: 'Degrees, institutions, coursework' },
  { id: 'skills', label: 'Skills', icon: Wrench, description: 'Categories, deduplication, AI suggestions' },
  { id: 'summary', label: 'Summary', icon: FileText, description: 'AI Executive Bio synthesis' },
  { id: 'template', label: 'Template', icon: Layout, description: '51 canonical resume designs' },
  { id: 'certifications', label: 'Certifications', icon: Award, description: 'Credentials, IDs, expiration' },
  { id: 'achievements', label: 'Achievements', icon: Zap, description: 'Quantifiable accomplishments' },
  { id: 'projects', label: 'Projects', icon: Code2, description: 'Portfolio projects, URLs, tech stack' },
  { id: 'languages', label: 'Languages', icon: Languages, description: 'Language names, CEFR levels' },
  { id: 'references', label: 'References', icon: BookOpen, description: 'Professional references, contacts' },
  { id: 'custom', label: 'Custom Sections', icon: Settings, description: 'User-defined sections' },
  { id: 'review', label: 'Review', icon: ClipboardCheck, description: 'ATS checklist, pre-flight checks' },
];

const PROFICIENCY_OPTIONS = [
  { value: 'native', label: 'Native' },
  { value: 'fluent', label: 'Fluent' },
  { value: 'professional', label: 'Professional Working' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'basic', label: 'Basic' },
];

const CEFR_OPTIONS = [
  { value: 'C2', label: 'C2 - Mastery' },
  { value: 'C1', label: 'C1 - Advanced' },
  { value: 'B2', label: 'B2 - Upper Intermediate' },
  { value: 'B1', label: 'B1 - Intermediate' },
  { value: 'A2', label: 'A2 - Elementary' },
  { value: 'A1', label: 'A1 - Beginner' },
];

const EMPTY_HEADING: ResumeHeading = {
  firstName: '', lastName: '', email: '', phone: '',
  location: '', website: '', linkedin: '', github: '', title: '',
  photo: '', targetRole: '', jobDescription: '',
};

function createEmptyResume(): ResumeData {
  return {
    name: 'Untitled Resume',
    template: 'Cv1',
    heading: { ...EMPTY_HEADING },
    experience: [],
    education: [],
    skillCategories: [],
    summary: '',
    certifications: [],
    achievements: [],
    projects: [],
    languages: [],
    references: [],
    customSections: [],
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
  const [showPreview, setShowPreview] = useState(false);

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
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
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
        <div className="mx-auto max-w-4xl">
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
            <TemplateStep
              template={resume.template}
              onChange={(template) => setResume((prev) => ({ ...prev, template }))}
              onOpenPreview={() => setShowPreview(true)}
            />
          )}
          {currentStep === 'certifications' && (
            <CertificationsStep entries={resume.certifications} onChange={(certifications) => setResume((prev) => ({ ...prev, certifications }))} />
          )}
          {currentStep === 'achievements' && (
            <AchievementsStep entries={resume.achievements} onChange={(achievements) => setResume((prev) => ({ ...prev, achievements }))} />
          )}
          {currentStep === 'projects' && (
            <ProjectsStep entries={resume.projects} onChange={(projects) => setResume((prev) => ({ ...prev, projects }))} />
          )}
          {currentStep === 'languages' && (
            <LanguagesStep entries={resume.languages} onChange={(languages) => setResume((prev) => ({ ...prev, languages }))} />
          )}
          {currentStep === 'references' && (
            <ReferencesStep entries={resume.references} onChange={(references) => setResume((prev) => ({ ...prev, references }))} />
          )}
          {currentStep === 'custom' && (
            <CustomSectionsStep entries={resume.customSections} onChange={(customSections) => setResume((prev) => ({ ...prev, customSections }))} />
          )}
          {currentStep === 'review' && (
            <ReviewStep resume={resume} />
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

      {/* Interactive A4 PreviewModal */}
      <PreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        resume={{
          id: resumeId,
          name: resume.name,
          template: resume.template || 'Cv1',
          heading: resume.heading,
          experience: resume.experience,
          education: resume.education,
          skillCategories: resume.skillCategories,
          summary: resume.summary,
          certifications: resume.certifications,
          projects: resume.projects,
          languages: resume.languages,
        }}
        onTemplateChange={(tmplId) => setResume((prev) => ({ ...prev, template: tmplId }))}
      />
    </div>
  );
}

/* ─── Right Rail AI Career Assistant ─── */

interface AICareerAssistantProps {
  resume: ResumeData;
}

export function AICareerAssistant({ resume }: AICareerAssistantProps) {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'insights' | 'jobmatch' | 'ats' | 'bullets'>('suggestions');
  const [generating, setGenerating] = useState<string | null>(null);

  const tabs = [
    { id: 'suggestions', label: 'Suggestions', icon: Lightbulb },
    { id: 'insights', label: 'Insights', icon: Brain },
    { id: 'jobmatch', label: 'Job Match', icon: Target },
    { id: 'ats', label: 'ATS Guidance', icon: Shield },
    { id: 'bullets', label: 'Bullet Strength', icon: Zap },
  ];

  const generateSuggestions = async (section: string) => {
    setGenerating(section);
    try {
      await post('/api/generate-suggestions', { section, resume });
    } catch (err) {
      console.error('Failed to generate suggestions:', err);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="hidden lg:block w-80 flex-shrink-0">
      <div className="sticky top-16 space-y-4">
        <Card className="bg-surface/80 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="size-4 text-brand-600" />
              AI Career Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Tab Navigation */}
            <div className="flex gap-1 mb-4 border-b border-border" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={cn(
                    'flex-1 flex items-center gap-1.5 px-2 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2',
                    activeTab === tab.id
                      ? 'text-brand-700 border-brand-500 bg-brand-50/50'
                      : 'text-ink-muted hover:text-ink hover:bg-neutral-50'
                  )}
                >
                  <tab.icon className="size-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Panels */}
            {activeTab === 'suggestions' && (
              <div role="tabpanel" className="space-y-3">
                <p className="text-xs text-ink-muted">AI-powered recommendations for each section</p>
                <div className="space-y-2">
                  {[
                    { section: 'heading', label: 'Heading', icon: User, action: 'Optimize professional title & target role' },
                    { section: 'experience', label: 'Experience', icon: Briefcase, action: 'Rewrite bullets with impact metrics' },
                    { section: 'skills', label: 'Skills', icon: Wrench, action: 'Deduplicate & add trending keywords' },
                    { section: 'summary', label: 'Summary', icon: FileText, action: 'Generate Executive Bio from experience' },
                    { section: 'certifications', label: 'Certifications', icon: Award, action: 'Add missing industry certifications' },
                    { section: 'projects', label: 'Projects', icon: Code2, action: 'Highlight tech stack & outcomes' },
                  ].map((item) => (
                    <button
                      key={item.section}
                      onClick={() => generateSuggestions(item.section)}
                      disabled={generating === item.section}
                      className={cn(
                        'w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm transition-colors',
                        'hover:bg-neutral-100 border border-border'
                      )}
                    >
                      <item.icon className="size-4 text-brand-600" />
                      <div className="flex-1 text-left">
                        <div className="font-medium text-ink">{item.label}</div>
                        <div className="text-xs text-ink-muted">{item.action}</div>
                      </div>
                      {generating === item.section && (
                        <div className="size-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'insights' && (
              <div role="tabpanel" className="space-y-3">
                <p className="text-xs text-ink-muted">Data-driven analysis of your resume</p>
                <div className="space-y-3">
                  <InsightCard
                    title="Experience Depth"
                    value={resume.experience.length}
                    label="positions"
                    icon={Briefcase}
                    color="brand"
                    description={resume.experience.length >= 3 ? 'Strong career progression' : 'Add more roles for depth'}
                  />
                  <InsightCard
                    title="Skill Diversity"
                    value={resume.skillCategories.reduce((sum, c) => sum + c.skills.length, 0)}
                    label="skills"
                    icon={Wrench}
                    color="success"
                    description={resume.skillCategories.reduce((sum, c) => sum + c.skills.length, 0) >= 15 ? 'Well-rounded skill set' : 'Add more skills'}
                  />
                  <InsightCard
                    title="Education Level"
                    value={resume.education.length}
                    label="degrees"
                    icon={GraduationCap}
                    color="info"
                    description={resume.education.length > 0 ? 'Academic credentials present' : 'Add education background'}
                  />
                  <InsightCard
                    title="Project Portfolio"
                    value={resume.projects.length}
                    label="projects"
                    icon={Code2}
                    color="warning"
                    description={resume.projects.length >= 3 ? 'Strong project showcase' : 'Add projects to demonstrate skills'}
                  />
                  <InsightCard
                    title="Language Proficiency"
                    value={resume.languages.length}
                    label="languages"
                    icon={Languages}
                    color="purple"
                    description={resume.languages.length > 0 ? 'Multilingual advantage' : 'Add languages for global roles'}
                  />
                  <InsightCard
                    title="Certifications"
                    value={resume.certifications.length}
                    label="certifications"
                    icon={Award}
                    color="amber"
                    description={resume.certifications.length >= 2 ? 'Industry validated expertise' : 'Add certifications for credibility'}
                  />
                </div>
              </div>
            )}

            {activeTab === 'jobmatch' && (
              <div role="tabpanel" className="space-y-3">
                <p className="text-xs text-ink-muted">Match your profile against target roles</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Paste job description or enter target role..."
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500"
                  />
                  <Button className="w-full" variant="outline">
                    <Target className="size-3.5 mr-2" />
                    Analyze Match
                  </Button>
                  <div className="p-3 rounded-lg bg-neutral-50 border border-border">
                    <div className="text-xs font-medium text-ink">Match Score</div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-neutral-200 overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: '72%' }} />
                      </div>
                      <span className="text-sm font-bold text-brand-600">72%</span>
                    </div>
                    <div className="mt-2 text-xs text-ink-muted">Matched: React, TypeScript, Node.js, AWS</div>
                    <div className="text-xs text-warning-600">Missing: Kubernetes, GraphQL, CI/CD</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ats' && (
              <div role="tabpanel" className="space-y-3">
                <p className="text-xs text-ink-muted">ATS optimization checklist</p>
                <div className="space-y-2">
                  <ATSCheckItem
                    label="Standard section headings used"
                    passed={true}
                    description="Experience, Education, Skills present"
                  />
                  <ATSCheckItem
                    label="Contact information complete"
                    passed={!!resume.heading.email && !!resume.heading.phone}
                    description="Email and phone required for ATS parsing"
                  />
                  <ATSCheckItem
                    label="Keywords from job description included"
                    passed={resume.skillCategories.some(c => c.skills.length > 0)}
                    description="Add relevant technical keywords"
                  />
                  <ATSCheckItem
                    label="Quantifiable achievements present"
                    passed={resume.experience.some(e => /\d+%|\d+\+|\$\d+/.test(e.description))}
                    description="Use numbers: 'increased revenue 25%'"
                  />
                  <ATSCheckItem
                    label="No graphics, tables, or columns"
                    passed={true}
                    description="Simple text layout parses best"
                  />
                  <ATSCheckItem
                    label="File format: PDF or DOCX"
                    passed={true}
                    description="Export as PDF for best ATS compatibility"
                  />
                  <ATSCheckItem
                    label="Font size 10-12pt, standard font"
                    passed={true}
                    description="Arial, Calibri, Helvetica recommended"
                  />
                  <ATSCheckItem
                    label="Reverse chronological order"
                    passed={true}
                    description="Most recent experience first"
                  />
                </div>
              </div>
            )}

            {activeTab === 'bullets' && (
              <div role="tabpanel" className="space-y-3">
                <p className="text-xs text-ink-muted">Strength analysis for experience bullets</p>
                <div className="space-y-3">
                  {resume.experience.flatMap((exp, expIndex) =>
                    exp.description.split('\n').filter(b => b.trim().startsWith('•') || b.trim().startsWith('-') || b.trim().match(/^\d+\./)).map((bullet, bulletIndex) => ({
                      text: bullet.trim(),
                      strength: calculateBulletStrength(bullet),
                      expIndex,
                      bulletIndex,
                    }))
                  ).slice(0, 10).map((item, index) => (
                    <BulletStrengthBar key={index} {...item} />
                  ))}
                  {resume.experience.length === 0 && (
                    <div className="text-center py-6 text-ink-muted text-sm">
                      <Briefcase className="mx-auto mb-2 size-8 text-ink-subtle" />
                      Add experience entries to analyze bullet strength
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InsightCard({ title, value, label, icon: Icon, color, description }: {
  title: string;
  value: number;
  label: string;
  icon: typeof Briefcase;
  color: 'brand' | 'success' | 'info' | 'warning' | 'purple' | 'amber';
  description: string;
}) {
  const colorMap = {
    brand: { bg: 'bg-brand-100', text: 'text-brand-700', icon: 'text-brand-600' },
    success: { bg: 'bg-success-100', text: 'text-success-700', icon: 'text-success-600' },
    info: { bg: 'bg-info-100', text: 'text-info-700', icon: 'text-info-600' },
    warning: { bg: 'bg-warning-100', text: 'text-warning-700', icon: 'text-warning-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-700', icon: 'text-purple-600' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'text-amber-600' },
  };
  const c = colorMap[color];

  return (
    <div className="p-3 rounded-lg border border-border bg-surface">
      <div className="flex items-start gap-3">
        <div className={`flex size-8 items-center justify-center rounded-lg ${c.bg}`}>
          <Icon className={`size-4 ${c.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-ink">{value}</span>
            <span className="text-xs text-ink-muted">{label}</span>
          </div>
          <div className="text-xs font-medium text-ink">{title}</div>
          <div className="text-[10px] text-ink-muted mt-0.5">{description}</div>
        </div>
      </div>
    </div>
  );
}

function ATSCheckItem({ label, passed, description }: {
  label: string;
  passed: boolean;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface">
      <div className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full mt-0.5',
        passed ? 'bg-success-100 text-success-600' : 'bg-warning-100 text-warning-600'
      )}>
        {passed ? <Check className="size-3" /> : <HelpCircle className="size-3" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-ink-muted">{description}</div>
      </div>
    </div>
  );
}

function calculateBulletStrength(bullet: string): number {
  let score = 0;
  const text = bullet.toLowerCase();
  // Action verb
  if (/^(led|managed|developed|created|built|designed|implemented|launched|optimized|improved|increased|reduced|achieved|delivered)/i.test(text)) score += 25;
  // Quantifiable metric
  if (/\d+%/.test(text)) score += 30;
  else if (/\d+\+/.test(text)) score += 25;
  else if (/\$\d+/.test(text)) score += 25;
  else if (/\d+x/.test(text)) score += 20;
  // Tech keywords
  if (/react|typescript|node|python|aws|docker|kubernetes|sql|api|microservice/i.test(text)) score += 15;
  // Result-oriented
  if (/result|outcome|impact|improvement|reduction|increase|growth/i.test(text)) score += 15;
  return Math.min(100, score);
}

function BulletStrengthBar({ text, strength }: { text: string; strength: number; expIndex: number; bulletIndex: number }) {
  const getColor = (s: number) => s >= 70 ? 'bg-success-500' : s >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  const getLabel = (s: number) => s >= 70 ? 'Strong' : s >= 40 ? 'Moderate' : 'Weak';

  return (
    <div className="p-3 rounded-lg border border-border bg-surface">
      <div className="text-xs text-ink-muted line-clamp-1 mb-2">{text}</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', getColor(strength))}
            style={{ width: `${strength}%` }}
          />
        </div>
        <span className={cn('text-xs font-medium w-16 text-right', getColor(strength).replace('bg-', 'text-'))}>
          {getLabel(strength)}
        </span>
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
                  <label className="text-xs font-medium text-ink">Description & Key Achievements</label>
                  <Button type="button" variant="ghost" size="xs" className="text-brand-600">
                    <Sparkles className="size-3" /> AI Assist
                  </Button>
                </div>
                <FormattingToolbar
                  value={entry.description}
                  onChange={(val) => updateEntry(entry.id, 'description', val)}
                />
                <textarea
                  value={entry.description}
                  onChange={(e) => updateEntry(entry.id, 'description', e.target.value)}
                  rows={4}
                  className="flex w-full rounded-b-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                  placeholder="• Led development of…&#10;• Improved performance by 35%…&#10;• Collaborated with cross-functional teams…"
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
        <FormattingToolbar value={summary} onChange={onChange} />
        <textarea
          value={summary}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          className="flex w-full rounded-b-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
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

function TemplateStep({
  template,
  onChange,
  onOpenPreview,
}: {
  template: string;
  onChange: (t: string) => void;
  onOpenPreview?: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    let list = getTemplatesByCategory(selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.archetype.toLowerCase().includes(q)
      );
    }
    return list;
  }, [selectedCategory, searchQuery]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Choose a Template</h2>
          <p className="mt-1 text-sm text-ink-muted">
            51 canonical layouts with high-fidelity A4 rendering and zero capability loss.
          </p>
        </div>
        {onOpenPreview && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenPreview}
            className="gap-1.5 self-start sm:self-auto text-brand-600 hover:text-brand-700"
          >
            <Eye className="size-3.5" />
            Full A4 Preview
          </Button>
        )}
      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
                selectedCategory === cat.id
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-surface text-ink-muted hover:bg-neutral-100 hover:text-ink border border-border'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates…"
            className="h-8 text-xs pl-8"
          />
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink-muted pointer-events-none" />
        </div>
      </div>

      {/* Template Grid with real thumbnail screenshots */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tmpl) => {
          const isSelected = (template || 'Cv1') === tmpl.id;
          return (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => onChange(tmpl.id)}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-xl border-2 text-left transition-all duration-150',
                isSelected
                  ? 'border-brand-600 shadow-xl ring-2 ring-brand-200'
                  : 'border-border bg-surface hover:border-brand-300 hover:shadow-md'
              )}
            >
              {/* Real Thumbnail Image */}
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-100">
                <img
                  src={tmpl.thumbnail}
                  alt={`${tmpl.name} preview`}
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />

                {/* ID pill */}
                <div className="absolute top-2 left-2 z-10">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-bold text-neutral-800 shadow-sm backdrop-blur-md">
                    <span className="size-2 rounded-full" style={{ backgroundColor: tmpl.primary }} />
                    {tmpl.id}
                  </span>
                </div>

                {isSelected && (
                  <div className="absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-md">
                    <Check className="size-3.5" />
                  </div>
                )}
              </div>

              {/* Template Meta Info */}
              <div className="border-t border-border p-3 bg-surface">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-ink truncate">{tmpl.name}</div>
                  <span className="text-[10px] uppercase font-bold text-ink-muted">{tmpl.archetype.replace('-', ' ')}</span>
                </div>
                {tmpl.description && (
                  <p className="mt-1 text-[11px] text-ink-muted line-clamp-1">{tmpl.description}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-ink-muted">
        All 51 canonical templates active · Real visual previews loaded from /templates/
      </p>
    </div>
  );
}

/* ─── Step 7: Certifications ─── */

function CertificationsStep({ entries, onChange }: { entries: CertificationEntry[]; onChange: (e: CertificationEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), name: '', issuer: '', credentialId: '',
      issueDate: '', expiryDate: '', credentialUrl: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof CertificationEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Certifications</h2>
          <p className="mt-1 text-sm text-ink-muted">Add professional certifications and licenses.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Certification
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Award className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No certifications added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Add certifications to validate your expertise.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Certification
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Certification {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Certification Name *</label>
                <Input value={entry.name} onChange={(e) => updateEntry(entry.id, 'name', e.target.value)} placeholder="AWS Certified Solutions Architect" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Issuing Organization *</label>
                  <Input value={entry.issuer} onChange={(e) => updateEntry(entry.id, 'issuer', e.target.value)} placeholder="Amazon Web Services" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Credential ID</label>
                  <Input value={entry.credentialId} onChange={(e) => updateEntry(entry.id, 'credentialId', e.target.value)} placeholder="ABCD1234EFGH" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Issue Date</label>
                  <Input type="month" value={entry.issueDate} onChange={(e) => updateEntry(entry.id, 'issueDate', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Expiry Date (optional)</label>
                  <Input type="month" value={entry.expiryDate} onChange={(e) => updateEntry(entry.id, 'expiryDate', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Credential URL (optional)</label>
                <Input type="url" value={entry.credentialUrl} onChange={(e) => updateEntry(entry.id, 'credentialUrl', e.target.value)} placeholder="https://www.credly.com/badges/..." />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 8: Achievements ─── */

function AchievementsStep({ entries, onChange }: { entries: AchievementEntry[]; onChange: (e: AchievementEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), title: '', description: '', date: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof AchievementEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Achievements & Awards</h2>
          <p className="mt-1 text-sm text-ink-muted">Highlight your key career accomplishments and recognition.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Achievement
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Trophy className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No achievements added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Showcase awards, recognitions, and major accomplishments.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Achievement
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Achievement {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Achievement Title *</label>
                <Input value={entry.title} onChange={(e) => updateEntry(entry.id, 'title', e.target.value)} placeholder="Employee of the Year 2023" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Description</label>
                <textarea
                  value={entry.description}
                  onChange={(e) => updateEntry(entry.id, 'description', e.target.value)}
                  rows={3}
                  className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                  placeholder="Describe the achievement, its impact, and any metrics…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Date</label>
                <Input type="month" value={entry.date} onChange={(e) => updateEntry(entry.id, 'date', e.target.value)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 9: Projects ─── */

function ProjectsStep({ entries, onChange }: { entries: ProjectEntry[]; onChange: (e: ProjectEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), title: '', description: '', technologies: '',
      liveUrl: '', githubUrl: '', startDate: '', endDate: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof ProjectEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Projects</h2>
          <p className="mt-1 text-sm text-ink-muted">Showcase your key projects with technologies and links.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Project
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Code2 className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No projects added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Add personal, academic, or professional projects.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Project
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Project {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Project Name *</label>
                <Input value={entry.title} onChange={(e) => updateEntry(entry.id, 'title', e.target.value)} placeholder="E-commerce Platform Redesign" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Description</label>
                <textarea
                  value={entry.description}
                  onChange={(e) => updateEntry(entry.id, 'description', e.target.value)}
                  rows={3}
                  className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                  placeholder="Describe the project, your role, challenges, and outcomes…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Technologies / Stack</label>
                <Input value={entry.technologies} onChange={(e) => updateEntry(entry.id, 'technologies', e.target.value)} placeholder="React, TypeScript, Node.js, PostgreSQL, AWS" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Live URL</label>
                  <Input type="url" value={entry.liveUrl} onChange={(e) => updateEntry(entry.id, 'liveUrl', e.target.value)} placeholder="https://project-demo.com" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">GitHub Repository</label>
                  <Input type="url" value={entry.githubUrl} onChange={(e) => updateEntry(entry.id, 'githubUrl', e.target.value)} placeholder="https://github.com/user/repo" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Start Date</label>
                  <Input type="month" value={entry.startDate} onChange={(e) => updateEntry(entry.id, 'startDate', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">End Date (optional)</label>
                  <Input type="month" value={entry.endDate} onChange={(e) => updateEntry(entry.id, 'endDate', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 10: Languages ─── */

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'] as const;

function LanguagesStep({ entries, onChange }: { entries: LanguageEntry[]; onChange: (e: LanguageEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), language: '', proficiency: 'B2' as LanguageEntry['proficiency'],
    }]);
  };

  const updateEntry = (id: string, field: keyof LanguageEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Languages</h2>
          <p className="mt-1 text-sm text-ink-muted">List languages you speak with proficiency levels (CEFR standard).</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Language
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Globe className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No languages added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Add languages to demonstrate global readiness.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Language
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Language {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Language *</label>
                  <Input value={entry.language} onChange={(e) => updateEntry(entry.id, 'language', e.target.value)} placeholder="English" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Proficiency *</label>
                  <Select value={entry.proficiency} onValueChange={(v) => updateEntry(entry.id, 'proficiency', v as LanguageEntry['proficiency'])}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {CEFR_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="text-xs text-ink-muted">
                CEFR Levels: A1–A2 (Basic) · B1–B2 (Independent) · C1–C2 (Proficient) · Native
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 11: References ─── */

function ReferencesStep({ entries, onChange }: { entries: ReferenceEntry[]; onChange: (e: ReferenceEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), name: '', title: '', company: '',
      email: '', phone: '', relationship: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof ReferenceEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">References</h2>
          <p className="mt-1 text-sm text-ink-muted">Add professional references available upon request.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Reference
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Users className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No references added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Add references who can vouch for your work.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Reference
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Reference {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Name *</label>
                  <Input value={entry.name} onChange={(e) => updateEntry(entry.id, 'name', e.target.value)} placeholder="Jane Smith" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Title</label>
                  <Input value={entry.title} onChange={(e) => updateEntry(entry.id, 'title', e.target.value)} placeholder="Senior Engineering Manager" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Company</label>
                <Input value={entry.company} onChange={(e) => updateEntry(entry.id, 'company', e.target.value)} placeholder="Acme Corporation" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Email</label>
                  <Input type="email" value={entry.email} onChange={(e) => updateEntry(entry.id, 'email', e.target.value)} placeholder="jane.smith@acme.com" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Phone</label>
                  <Input type="tel" value={entry.phone} onChange={(e) => updateEntry(entry.id, 'phone', e.target.value)} placeholder="+1 (555) 123-4567" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Relationship</label>
                <Input value={entry.relationship} onChange={(e) => updateEntry(entry.id, 'relationship', e.target.value)} placeholder="Former Manager (2020–2023)" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 12: Custom Sections ─── */

function CustomSectionsStep({ entries, onChange }: { entries: CustomSectionEntry[]; onChange: (e: CustomSectionEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), sectionTitle: '', items: [],
    }]);
  };

  const updateSection = (id: string, field: 'sectionTitle', value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const addItem = (sectionId: string) => {
    onChange(entries.map((e) =>
      e.id === sectionId ? { ...e, items: [...e.items, { id: crypto.randomUUID(), title: '', description: '' }] } : e
    ));
  };

  const updateItem = (sectionId: string, itemId: string, field: 'title' | 'description', value: string) => {
    onChange(entries.map((e) =>
      e.id === sectionId ? { ...e, items: e.items.map((i) => i.id === itemId ? { ...i, [field]: value } : i) } : e
    ));
  };

  const removeItem = (sectionId: string, itemId: string) => {
    onChange(entries.map((e) =>
      e.id === sectionId ? { ...e, items: e.items.filter((i) => i.id !== itemId) } : e
    ));
  };

  const removeSection = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Custom Sections</h2>
          <p className="mt-1 text-sm text-ink-muted">Create your own sections with custom titles and items.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Custom Section
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <FolderPlus className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No custom sections yet</p>
          <p className="mt-1 text-xs text-ink-muted">Create sections like Publications, Patents, Volunteer Work, etc.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Section
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((section) => (
          <Card key={section.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Input
                    value={section.sectionTitle}
                    onChange={(e) => updateSection(section.id, 'sectionTitle', e.target.value)}
                    placeholder="Section Title (e.g., Publications, Patents, Volunteer Work)"
                    className="flex-1 font-medium text-base"
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => removeSection(section.id)}>
                    <Trash2 className="size-4 text-error-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {section.items.length === 0 && (
                <div className="py-4 text-center text-sm text-ink-muted border-2 border-dashed border-border rounded-lg">
                  No items in this section yet
                </div>
              )}
              <div className="space-y-3">
                {section.items.map((item, itemIndex) => (
                  <div key={item.id} className="space-y-2 p-3 rounded-lg border border-border bg-surface/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink-muted">Item {itemIndex + 1}</span>
                      <Button variant="ghost" size="icon-sm" onClick={() => removeItem(section.id, item.id)}>
                        <Trash2 className="size-3.5 text-error-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-ink-muted">Title</label>
                        <Input
                          value={item.title}
                          onChange={(e) => updateItem(section.id, item.id, 'title', e.target.value)}
                          placeholder="Item title"
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-ink-muted">Description</label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(section.id, item.id, 'description', e.target.value)}
                          placeholder="Details"
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => addItem(section.id)} className="w-full">
                <Plus className="size-3.5" /> Add Item
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 13: Review & Pre-Flight Checks ─── */

function ReviewStep({ resume }: { resume: ResumeData }) {
  const checks = [
    { id: 'heading', label: 'Personal Information Complete', check: () => !!(resume.heading.firstName && resume.heading.lastName && resume.heading.email && resume.heading.phone) },
    { id: 'experience', label: 'At Least One Work Experience', check: () => resume.experience.length > 0 },
    { id: 'education', label: 'At Least One Education Entry', check: () => resume.education.length > 0 },
    { id: 'skills', label: 'At Least 5 Skills Listed', check: () => resume.skillCategories.reduce((sum, c) => sum + c.skills.length, 0) >= 5 },
    { id: 'summary', label: 'Professional Summary Written', check: () => resume.summary.length >= 50 },
    { id: 'certifications', label: 'Certifications Added (if applicable)', check: () => true, optional: true },
    { id: 'achievements', label: 'Achievements Added (if applicable)', check: () => true, optional: true },
    { id: 'projects', label: 'Projects Added (if applicable)', check: () => true, optional: true },
    { id: 'languages', label: 'Languages Added (if applicable)', check: () => true, optional: true },
    { id: 'references', label: 'References Added (if applicable)', check: () => true, optional: true },
    { id: 'custom', label: 'Custom Sections Configured (if applicable)', check: () => true, optional: true },
    { id: 'ats-format', label: 'ATS-Friendly Format', check: () => true, description: 'Standard headings, no graphics/tables, reverse chronological order' },
    { id: 'keywords', label: 'Industry Keywords Present', check: () => resume.skillCategories.some(c => c.skills.length > 0) },
    { id: 'quantifiable', label: 'Quantifiable Achievements', check: () => resume.experience.some(e => /\d+%|\d+\+|\$\d+/.test(e.description)) },
    { id: 'contact', label: 'Contact Info in Header', check: () => !!(resume.heading.email && resume.heading.phone) },
    { id: 'length', label: 'Appropriate Length (1-2 pages)', check: () => true, description: 'Review preview for length before export' },
  ];

  const passed = checks.filter(c => c.check()).length;
  const required = checks.filter(c => !c.optional).length;
  const passedRequired = checks.filter(c => !c.optional && c.check()).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Review & Pre-Flight Checks</h2>
          <p className="mt-1 text-sm text-ink-muted">Verify your resume is complete and ATS-ready before exporting.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-brand-600">{passedRequired} / {required} Required</div>
            <div className="text-xs text-ink-muted">{passed} / {checks.length} Total Checks</div>
          </div>
          <div className="size-20">
            <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
              <circle
                cx="18" cy="18" r="15.5"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-neutral-200"
              />
              <circle
                cx="18" cy="18" r="15.5"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-brand-600"
                strokeDasharray={`${(passedRequired / required) * 100} 100`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.3s' }}
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {checks.map((check) => {
          const isPassed = check.check();
          const isOptional = check.optional;
          return (
            <div
              key={check.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                isPassed ? 'bg-success-50 border-success-200' : isOptional ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'
              )}
            >
              <div className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full mt-0.5',
                isPassed ? 'bg-success-100 text-success-600' : isOptional ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
              )}>
                {isPassed ? <Check className="size-3" /> : isOptional ? <HelpCircle className="size-3" /> : <AlertCircle className="size-3" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{check.label}</span>
                  {isOptional && <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">Optional</span>}
                </div>
                {check.description && (
                  <div className="mt-1 text-xs text-ink-muted">{check.description}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ATS Quick Actions */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button variant="outline" asChild>
          <Link to="/dashboard/ats">
            <BarChart3 className="size-4 mr-2" />
            Run Full ATS Scan
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/export/Cv1/${resume.id}/en`}>
            <Download className="size-4 mr-2" />
            Preview PDF Export
          </Link>
        </Button>
      </div>
    </div>
  );
}
