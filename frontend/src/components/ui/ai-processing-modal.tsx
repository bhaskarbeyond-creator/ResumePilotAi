import React, { useEffect, useState, useMemo } from 'react';
import {
  Sparkles,
  UserCheck,
  Target,
  Cpu,
  CheckCircle2,
  X,
  Clock,
  Lightbulb,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export type AiModalKind = 'summary' | 'interview' | 'cover-letter' | 'general';

interface Stage {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STAGES_BY_KIND: Record<AiModalKind, Stage[]> = {
  summary: [
    {
      title: 'Context & Profile Extraction',
      desc: 'Parsing verified career achievements, technical skills, and role history.',
      icon: UserCheck,
    },
    {
      title: 'ATS Guideline Calibration',
      desc: 'Calibrating character bounds (320-440 chars) and keyword density.',
      icon: Target,
    },
    {
      title: 'Executive Synthesis & Framing',
      desc: 'Formulating authoritative resume voice with active domain verbs.',
      icon: Cpu,
    },
    {
      title: 'Grammar & Impact Polish',
      desc: 'Stripping first-person pronouns, clichés, and robotic filler.',
      icon: Sparkles,
    },
    {
      title: 'Grounding & Verification Lock',
      desc: 'Validating citations against source evidence with zero fabrication.',
      icon: ShieldCheck,
    },
  ],
  interview: [
    {
      title: 'Synthesizing Candidate Profile & Evidence',
      desc: 'Parsing verified career achievements, technical skills & past roles without hallucination.',
      icon: UserCheck,
    },
    {
      title: 'Mapping Target Role Competencies',
      desc: 'Aligning industry frameworks, core competencies & domain responsibilities.',
      icon: Target,
    },
    {
      title: 'Formulating Practical Scenario Challenges',
      desc: 'Designing real-world problem solving, troubleshooting & architecture questions.',
      icon: Cpu,
    },
    {
      title: 'Calibrating Question Difficulty & Depth',
      desc: 'Calibrating Bloom taxonomy and scenario complexity for senior-level rigor.',
      icon: Sparkles,
    },
    {
      title: 'Assembling CBT Shell & Rubrics',
      desc: 'Verifying answer distractors, scoring criteria & STAR-method evaluation hints.',
      icon: ShieldCheck,
    },
  ],
  'cover-letter': [
    {
      title: 'Job Requirements & Context Extraction',
      desc: 'Analyzing job description requirements and organization expectations.',
      icon: Target,
    },
    {
      title: 'Signature Strength Alignment',
      desc: 'Mapping top candidate career wins directly to high-priority requirements.',
      icon: UserCheck,
    },
    {
      title: 'Strategic Narrative Crafting',
      desc: 'Composing compelling opening hook and value-focused body paragraphs.',
      icon: FileText,
    },
    {
      title: 'Executive Tone & Impact Tuning',
      desc: 'Polishing persuasive phrasing and professional alignment.',
      icon: Sparkles,
    },
    {
      title: 'Final Quality & Grounding Review',
      desc: 'Verifying that every claim maps to authentic verified candidate facts.',
      icon: ShieldCheck,
    },
  ],
  general: [
    {
      title: 'Initializing Request Context',
      desc: 'Parsing parameters and validating input constraints.',
      icon: UserCheck,
    },
    {
      title: 'Routing to High-Performance Model',
      desc: 'Selecting optimized provider model with lowest latency.',
      icon: Cpu,
    },
    {
      title: 'Synthesizing Response',
      desc: 'Applying domain rules and structural formatting.',
      icon: Sparkles,
    },
    {
      title: 'Refining Output',
      desc: 'Validating against quality rubrics and ATS compliance.',
      icon: Target,
    },
    {
      title: 'Finalizing Delivery',
      desc: 'Ensuring zero token leakage and data integrity.',
      icon: ShieldCheck,
    },
  ],
};

const PRO_TIPS: string[] = [
  'Use the STAR method (Situation, Task, Action, Result) to frame career achievements.',
  'ATS algorithms reward summaries between 320–440 characters with natural keyword density.',
  'Focus on measurable business impact, cost savings, and operational velocity in your experience.',
  'Removing first-person pronouns (I, my, me) elevates executive tone across all application documents.',
  'Grounding each bullet point in verified facts drastically outperforms generic buzzwords.',
];

export interface AiProcessingModalProps {
  isOpen: boolean;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  kind?: AiModalKind;
}

export function AiProcessingModal({
  isOpen,
  onCancel,
  title,
  subtitle,
  kind = 'summary',
}: AiProcessingModalProps) {
  const [seconds, setSeconds] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  const stages = STAGES_BY_KIND[kind] || STAGES_BY_KIND.general;

  // Reset timer on open
  useEffect(() => {
    if (!isOpen) {
      setSeconds(0);
      setTipIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Rotate tips every 4.5 seconds
  useEffect(() => {
    if (!isOpen) return;
    const tipTimer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % PRO_TIPS.length);
    }, 4500);
    return () => clearInterval(tipTimer);
  }, [isOpen]);

  // Handle ESC key for cancellation
  useEffect(() => {
    if (!isOpen || !onCancel) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // Stage calculation
  const stageIndex = useMemo(() => {
    if (seconds < 3) return 0;
    if (seconds < 7) return 1;
    if (seconds < 12) return 2;
    if (seconds < 18) return 3;
    return 4;
  }, [seconds]);

  // Smooth asymptotic progress calculation (approaches 95%)
  const progressPct = useMemo(() => {
    if (seconds <= 0) return 12;
    if (seconds < 4) return Math.min(30, 12 + seconds * 4.5);
    if (seconds < 10) return Math.min(60, 30 + (seconds - 4) * 5);
    if (seconds < 18) return Math.min(84, 60 + (seconds - 10) * 3);
    return Math.min(94, 84 + (seconds - 18) * 0.8);
  }, [seconds]);

  if (!isOpen) return null;

  const currentStage = stages[stageIndex] || stages[0];
  const StageIcon = currentStage.icon;

  const modalTitle =
    title ||
    (kind === 'summary'
      ? 'Executive AI Bio Studio'
      : kind === 'interview'
        ? 'AI Interview Blueprint Engine'
        : kind === 'cover-letter'
          ? 'AI Cover Letter Architect'
          : 'AI Generation in Progress');

  const modalSubtitle =
    subtitle || 'Synthesizing verified facts into high-impact, ATS-optimized content';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-modal-title"
      aria-describedby="ai-modal-desc"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-border/80 bg-surface p-6 sm:p-8 shadow-2xl shadow-indigo-950/20 text-ink">
        {/* Cuba Ambient Glow Orbs */}
        <div
          className="absolute -top-24 -left-24 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-purple-500/15 blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        {/* Top Header */}
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-lg shadow-brand-500/25">
              <Sparkles className="size-6 animate-pulse" />
            </div>
            <div>
              <h3 id="ai-modal-title" className="text-lg font-bold text-ink tracking-tight">
                {modalTitle}
              </h3>
              <p id="ai-modal-desc" className="text-xs text-ink-muted">
                {modalSubtitle}
              </p>
            </div>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1.5 text-ink-muted hover:bg-neutral-100 hover:text-ink transition-colors cursor-pointer"
              aria-label="Cancel AI generation"
              title="Cancel (Esc)"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Active Stage Banner */}
        <div className="relative mt-6 rounded-2xl border border-brand-200/80 bg-brand-50/50 p-4 transition-all duration-300">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
              <StageIcon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                  Stage {stageIndex + 1} of {stages.length}
                </span>
                <span className="flex items-center gap-1 text-xs font-mono text-ink-muted">
                  <Clock className="size-3" />
                  {Math.floor(seconds / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(seconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <p className="mt-1 text-sm font-bold text-ink">{currentStage.title}</p>
              <p className="mt-0.5 text-xs text-ink-muted leading-relaxed">{currentStage.desc}</p>
            </div>
          </div>
        </div>

        {/* 5-Stage Step Indicators */}
        <div className="mt-4 flex items-center justify-between gap-1.5 px-1">
          {stages.map((stg, idx) => {
            const isCompleted = idx < stageIndex;
            const isCurrent = idx === stageIndex;
            return (
              <div key={stg.title} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={`h-1.5 w-full rounded-full transition-all duration-500 ${
                    isCompleted
                      ? 'bg-brand-600'
                      : isCurrent
                        ? 'bg-gradient-to-r from-brand-600 to-indigo-400 animate-pulse'
                        : 'bg-neutral-200 dark:bg-neutral-800'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Smooth Progress Bar with Percentage */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
            <span className="font-medium text-ink-secondary">Progress</span>
            <span className="font-mono font-semibold text-brand-600">
              {Math.round(progressPct)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Rotating Career Pro-Tips */}
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-border/60 bg-canvas/60 p-3 text-xs leading-relaxed text-ink-muted">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-ink">Pro-Tip: </span>
            <span className="transition-opacity duration-300">{PRO_TIPS[tipIndex]}</span>
          </div>
        </div>

        {/* Footer Actions */}
        {onCancel && (
          <div className="mt-6 flex items-center justify-between pt-2 border-t border-border/50">
            <span className="text-[11px] text-ink-muted">
              Press <kbd className="px-1.5 py-0.5 rounded border border-border bg-surface text-[10px] font-mono shadow-2xs">Esc</kbd> to cancel
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-xs text-ink-muted hover:text-ink cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
