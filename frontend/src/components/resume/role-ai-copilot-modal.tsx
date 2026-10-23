/**
 * RoleAiCopilotModal Component
 *
 * Dedicated AI Role Copilot Modal for Work Experience & Achievements:
 * Consolidates all Work History AI workflows into one unified, enterprise-grade copilot:
 * 1. ✨ Polish Writing (Grammar, clarity, conciseness, active tone)
 * 2. 📈 Quantify Impact (Identifies missing metrics and prompts for candidate facts)
 * 3. 🎯 Tailor to Target Role / JD (Aligns verified work with target job requirements)
 * 4. ❓ Help Me Write (Interactive questionnaire for sparse or blank notes)
 *
 * - Tone selector: Balanced, Concise, Technical, Executive, Results-Focused, Leadership
 * - Calls POST /api/generate-content { operation: 'generate-work-description' }
 * - Provides interactive selection of generated bullets
 * - 1-Click insertion into the candidate's active work experience entry
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Sparkles,
  Check,
  Plus,
  Loader2,
  AlertCircle,
  Briefcase,
  TrendingUp,
  Target,
  HelpCircle,
  Zap,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { AI_TONES, runContentOperation, type AiTone } from '@/lib/ai-content';
import { cn } from '@/lib/utils';

export type CopilotMode = 'polish' | 'quantify' | 'tailor' | 'interview';

export interface RoleAiCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: string;
  company: string;
  existingDescription?: string;
  targetRole?: string;
  targetJobDescription?: string;
  initialMode?: CopilotMode;
  onApplyBullets: (insertedBullets: string) => void;
}

interface GuidedQuestion {
  id: string;
  label: string;
  placeholder: string;
}

export function RoleAiCopilotModal({
  isOpen,
  onClose,
  position,
  company,
  existingDescription = '',
  targetRole = '',
  targetJobDescription = '',
  initialMode = 'polish',
  onApplyBullets,
}: RoleAiCopilotModalProps) {
  const [activeMode, setActiveMode] = useState<CopilotMode>(initialMode);
  const [roleTitle, setRoleTitle] = useState(position || '');
  const [orgName, setOrgName] = useState(company || '');
  const [targetJobRole, setTargetJobRole] = useState(targetRole || '');
  const [jobDescription, setJobDescription] = useState(targetJobDescription || '');
  const [roughNotes, setRoughNotes] = useState(existingDescription || '');
  const [selectedTone, setSelectedTone] = useState<AiTone>('metrics');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [generatedBullets, setGeneratedBullets] = useState<Array<{ text: string; selected: boolean }>>([]);

  // Interview / Guided Questions state
  const [answers, setAnswers] = useState<Record<string, string>>({
    q1: '',
    q2: '',
    q3: '',
  });

  // Quantify metrics prompt state
  const [metricFacts, setMetricFacts] = useState({
    teamOrScale: '',
    percentageGain: '',
    budgetOrRevenue: '',
  });

  // Dynamic role-specific questions for Mode 4
  const questions: GuidedQuestion[] = [
    {
      id: 'q1',
      label: `What primary systems, deliverables, or projects did you lead as ${roleTitle || 'in this role'}?`,
      placeholder: 'e.g. Led architecture redesign of payment gateway, migrated databases to cloud',
    },
    {
      id: 'q2',
      label: 'What measurable outcomes, latency reductions, or revenue impacts did you achieve?',
      placeholder: 'e.g. Reduced checkout latency by 35%, saved 12 hours weekly through automation',
    },
    {
      id: 'q3',
      label: 'What technical stack, tools, or methodologies did you utilize?',
      placeholder: 'e.g. React, TypeScript, Go, PostgreSQL, Docker, Agile/Scrum',
    },
  ];

  useEffect(() => {
    if (isOpen) {
      setRoleTitle(position || '');
      setOrgName(company || '');
      setTargetJobRole(targetRole || '');
      setJobDescription(targetJobDescription || '');
      setRoughNotes(existingDescription || '');
      setErrorMessage('');
      setGeneratedBullets([]);

      // Automatically default to interview / help-me-write if existing description is empty
      const isBlank = !existingDescription.trim();
      if (isBlank && initialMode === 'polish') {
        setActiveMode('interview');
      } else {
        setActiveMode(initialMode || 'polish');
      }
    }
  }, [isOpen, position, company, existingDescription, targetRole, targetJobDescription, initialMode]);

  const handleGenerate = async () => {
    if (!roleTitle.trim()) {
      setErrorMessage('Please enter a position / role title.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      let synthesizedNotes = '';

      if (activeMode === 'interview') {
        const parts = [
          answers.q1 ? `Key Projects/Deliverables: ${answers.q1}` : '',
          answers.q2 ? `Measurable Results & Outcomes: ${answers.q2}` : '',
          answers.q3 ? `Technologies & Methods: ${answers.q3}` : '',
          roughNotes ? `Additional Notes: ${roughNotes}` : '',
        ].filter(Boolean);
        synthesizedNotes = parts.join('\n') || `Delivered key projects as ${roleTitle} at ${orgName || 'company'}.`;
      } else if (activeMode === 'quantify') {
        const metrics = [
          metricFacts.teamOrScale ? `Team/Scale: ${metricFacts.teamOrScale}` : '',
          metricFacts.percentageGain ? `Efficiency/Improvement: ${metricFacts.percentageGain}` : '',
          metricFacts.budgetOrRevenue ? `Volume/Budget: ${metricFacts.budgetOrRevenue}` : '',
          roughNotes ? `Context: ${roughNotes}` : existingDescription,
        ].filter(Boolean);
        synthesizedNotes = metrics.join('\n') || roughNotes || existingDescription;
      } else if (activeMode === 'tailor') {
        const tailorContext = [
          `Target Position: ${targetJobRole || roleTitle}`,
          jobDescription ? `Target Job Requirements:\n${jobDescription}` : '',
          `Candidate Experience:\n${roughNotes || existingDescription || `Role as ${roleTitle} at ${orgName}`}`,
        ].filter(Boolean);
        synthesizedNotes = tailorContext.join('\n\n');
      } else {
        // Polish writing
        synthesizedNotes = roughNotes.trim() || existingDescription.trim() || `Delivered key projects as ${roleTitle} at ${orgName || 'company'}.`;
      }

      const outcome = await runContentOperation('generate-work-description', {
        jobTitle: roleTitle.trim(),
        employer: orgName.trim(),
        notes: synthesizedNotes,
        existingText: existingDescription.trim() || synthesizedNotes,
        targetRole: targetJobRole.trim() || roleTitle.trim(),
        targetJobDescription: jobDescription.trim(),
        mode: activeMode,
        tone: selectedTone,
      });

      if (outcome.kind === 'suggestions' && outcome.suggestions.length > 0) {
        setGeneratedBullets(
          outcome.suggestions.map((b) => ({
            text: b.replace(/^[•*\-\s]+/, ''),
            selected: true,
          }))
        );
      } else if (outcome.kind === 'questions') {
        setErrorMessage(`More context needed: ${outcome.questions.join(' ')}`);
      } else if ('message' in outcome) {
        setErrorMessage(outcome.message);
      } else {
        setErrorMessage('Could not generate bullet suggestions. Please add more details or rough notes.');
      }
    } catch (err: unknown) {
      console.error('[Role Copilot Error]', err);
      const errObj = err as { message?: string };
      setErrorMessage(errObj.message || 'AI bullet generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const toggleBullet = (index: number) => {
    setGeneratedBullets((prev) =>
      prev.map((b, i) => (i === index ? { ...b, selected: !b.selected } : b))
    );
  };

  const selectAllBullets = (select: boolean) => {
    setGeneratedBullets((prev) => prev.map((b) => ({ ...b, selected: select })));
  };

  const handleInsert = () => {
    const selected = generatedBullets.filter((b) => b.selected).map((b) => `• ${b.text}`);
    if (selected.length === 0) {
      setErrorMessage('Please select at least one bullet point to insert.');
      return;
    }

    const formattedInsert = selected.join('\n');
    onApplyBullets(formattedInsert);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-2xl bg-surface/95 backdrop-blur-xl border-border shadow-2xl rounded-2xl sm:rounded-3xl p-0 overflow-hidden"
        data-testid="role-ai-copilot-modal"
      >
        {/* Header */}
        <DialogHeader className="p-5 sm:p-6 border-b border-border/80 bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-brand-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Zap className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                <span>AI Role Copilot</span>
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                  ATS Calibrated
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-ink-muted mt-0.5">
                Generate quantifiable, high-impact bullet points tailored to your specific position and organization.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* 4 Copilot Modes Switcher */}
        <div className="px-5 py-2.5 bg-neutral-100/70 border-b border-border grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveMode('polish')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
              activeMode === 'polish'
                ? 'bg-white text-brand-700 shadow-2xs border border-border'
                : 'text-ink-muted hover:text-ink hover:bg-white/60'
            )}
          >
            <Sparkles className="size-3.5 text-purple-600" />
            <span>Polish Writing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('quantify')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
              activeMode === 'quantify'
                ? 'bg-white text-brand-700 shadow-2xs border border-border'
                : 'text-ink-muted hover:text-ink hover:bg-white/60'
            )}
          >
            <TrendingUp className="size-3.5 text-emerald-600" />
            <span>Quantify Impact</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('tailor')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
              activeMode === 'tailor'
                ? 'bg-white text-brand-700 shadow-2xs border border-border'
                : 'text-ink-muted hover:text-ink hover:bg-white/60'
            )}
          >
            <Target className="size-3.5 text-blue-600" />
            <span>Tailor to JD</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('interview')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer',
              activeMode === 'interview'
                ? 'bg-white text-brand-700 shadow-2xs border border-border'
                : 'text-ink-muted hover:text-ink hover:bg-white/60'
            )}
          >
            <HelpCircle className="size-3.5 text-amber-600" />
            <span>Help Me Write</span>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Target Role & Org Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Position / Role Title *</label>
              <Input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g. Senior Full-Stack Engineer"
                className="text-xs font-medium bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Company / Organization</label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="text-xs font-medium bg-white"
              />
            </div>
          </div>

          {/* Mode 1: Polish Writing */}
          {activeMode === 'polish' && (
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">
                Your Rough Notes or Existing Bullets to Polish
              </label>
              <Textarea
                rows={3}
                value={roughNotes}
                onChange={(e) => setRoughNotes(e.target.value)}
                placeholder="Paste or write your experience notes here. AI will upgrade verbs, flow, and professional tone..."
                className="text-xs leading-relaxed bg-white"
              />
              <p className="text-[11px] text-ink-muted mt-1">
                AI will transform these rough facts into professional, active-voice resume bullets.
              </p>
            </div>
          )}

          {/* Mode 2: Quantify Impact */}
          {activeMode === 'quantify' && (
            <div className="space-y-3 p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/40">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                <TrendingUp className="size-4 text-emerald-600" />
                <span>Inject Measurable Facts (Metrics & Scale)</span>
              </div>
              <p className="text-[11px] text-emerald-800">
                Resumes with numbers score 40% higher on ATS screens. Provide approximate figures below:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-emerald-950 block mb-0.5">Team / User Scale</label>
                  <Input
                    value={metricFacts.teamOrScale}
                    onChange={(e) => setMetricFacts({ ...metricFacts, teamOrScale: e.target.value })}
                    placeholder="e.g. 8 engineers, 50k users"
                    className="text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-emerald-950 block mb-0.5">% Improvement / Gain</label>
                  <Input
                    value={metricFacts.percentageGain}
                    onChange={(e) => setMetricFacts({ ...metricFacts, percentageGain: e.target.value })}
                    placeholder="e.g. 35% latency drop"
                    className="text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-emerald-950 block mb-0.5">Budget / Volume</label>
                  <Input
                    value={metricFacts.budgetOrRevenue}
                    onChange={(e) => setMetricFacts({ ...metricFacts, budgetOrRevenue: e.target.value })}
                    placeholder="e.g. $1.2M pipeline, 100 req/s"
                    className="text-xs bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mode 3: Tailor to Target Job Description */}
          {activeMode === 'tailor' && (
            <div className="space-y-3 p-3.5 rounded-xl border border-blue-200/80 bg-blue-50/40">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                <Target className="size-4 text-blue-600" />
                <span>Target Job Description Alignment</span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-blue-950 block mb-0.5">Target Job Title</label>
                <Input
                  value={targetJobRole}
                  onChange={(e) => setTargetJobRole(e.target.value)}
                  placeholder="e.g. Staff Distributed Systems Engineer"
                  className="text-xs bg-white mb-2"
                />
                <label className="text-[10px] font-bold text-blue-950 block mb-0.5">Paste Key Job Requirements (Optional)</label>
                <Textarea
                  rows={2}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste 2-3 lines of requirements from the target job posting to align keywords..."
                  className="text-xs bg-white"
                />
              </div>
            </div>
          )}

          {/* Mode 4: Help Me Write (Interactive Questions) */}
          {activeMode === 'interview' && (
            <div className="space-y-3 p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/40">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                <HelpCircle className="size-4 text-amber-600" />
                <span>3 Guided Questions for {roleTitle || 'Your Position'}</span>
              </div>
              <p className="text-[11px] text-amber-800">
                Answer briefly in your own words. AI will turn these answers into verified resume bullets.
              </p>
              <div className="space-y-2.5">
                {questions.map((q) => (
                  <div key={q.id}>
                    <label className="text-[11px] font-semibold text-amber-950 block mb-1">{q.label}</label>
                    <Input
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      placeholder={q.placeholder}
                      className="text-xs bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tone Selector */}
          <div>
            <label className="text-xs font-semibold text-ink block mb-1.5">Writing Tone & Cadence</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AI_TONES.map((tone) => (
                <button
                  key={tone.value}
                  type="button"
                  onClick={() => setSelectedTone(tone.value)}
                  className={cn(
                    'p-2 rounded-xl border text-left transition-all text-xs cursor-pointer',
                    selectedTone === tone.value
                      ? 'border-brand-500 bg-brand-50/70 text-brand-950 font-semibold shadow-2xs'
                      : 'border-border/80 bg-neutral-50/40 text-ink-secondary hover:bg-neutral-50'
                  )}
                >
                  <div className="font-bold text-[11px] text-ink">{tone.label}</div>
                  <div className="text-[10px] text-ink-muted truncate">{tone.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2 text-rose-800 text-xs">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Generated Bullets List */}
          {generatedBullets.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink">Suggested Bullets ({generatedBullets.length})</span>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => selectAllBullets(true)}
                    className="text-brand-600 font-bold hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-border">|</span>
                  <button
                    type="button"
                    onClick={() => selectAllBullets(false)}
                    className="text-ink-muted font-medium hover:underline cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {generatedBullets.map((bullet, idx) => (
                  <div
                    key={idx}
                    onClick={() => toggleBullet(idx)}
                    className={cn(
                      'p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5',
                      bullet.selected
                        ? 'border-brand-300 bg-brand-50/50 text-brand-950 shadow-2xs font-medium'
                        : 'border-border bg-surface text-ink-muted opacity-60 hover:opacity-90'
                    )}
                  >
                    <div
                      className={cn(
                        'size-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                        bullet.selected ? 'bg-brand-600 border-brand-600 text-white' : 'border-border bg-white'
                      )}
                    >
                      {bullet.selected && <Check className="size-3" />}
                    </div>
                    <p className="leading-relaxed flex-1">{bullet.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-border bg-neutral-50/70 flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleGenerate}
              disabled={loading}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-semibold cursor-pointer"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-brand-600" />}
              <span>{generatedBullets.length > 0 ? 'Regenerate' : 'Generate Bullets'}</span>
            </Button>

            {generatedBullets.length > 0 && (
              <Button
                onClick={handleInsert}
                className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4 cursor-pointer"
              >
                <Plus className="size-4" />
                <span>Insert Selected ({generatedBullets.filter((b) => b.selected).length})</span>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
