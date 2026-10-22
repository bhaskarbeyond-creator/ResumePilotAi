/**
 * RoleAiCopilotModal Component
 *
 * Dedicated AI Role Copilot Modal for Work Experience:
 * - Ingests Role / Position, Employer / Organization, and rough candidate notes
 * - Tone selector: Balanced, Concise, Technical, Executive, Metrics-focused, Leadership
 * - Calls POST /api/generate-content { operation: 'generate-work-description' }
 * - Provides interactive selection of generated bullets
 * - 1-Click insertion into the candidate's active work experience entry
 */

import { useState } from 'react';
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
  Layers,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { AI_TONES, runContentOperation, type AiTone } from '@/lib/ai-content';
import { cn } from '@/lib/utils';

export interface RoleAiCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: string;
  company: string;
  existingDescription?: string;
  onApplyBullets: (insertedBullets: string) => void;
}

export function RoleAiCopilotModal({
  isOpen,
  onClose,
  position,
  company,
  existingDescription = '',
  onApplyBullets,
}: RoleAiCopilotModalProps) {
  const [roleTitle, setRoleTitle] = useState(position || '');
  const [orgName, setOrgName] = useState(company || '');
  const [roughNotes, setRoughNotes] = useState('');
  const [selectedTone, setSelectedTone] = useState<AiTone>('metrics');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [generatedBullets, setGeneratedBullets] = useState<Array<{ text: string; selected: boolean }>>([]);

  const handleOpenSync = () => {
    setRoleTitle(position || '');
    setOrgName(company || '');
    setRoughNotes('');
    setErrorMessage('');
    setGeneratedBullets([]);
  };

  const handleGenerate = async () => {
    if (!roleTitle.trim()) {
      setErrorMessage('Please enter a job title/role.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      const notesPayload = roughNotes.trim() || existingDescription.trim() || `Delivered key projects as ${roleTitle} at ${orgName || 'company'}.`;
      const outcome = await runContentOperation('generate-work-description', {
        jobTitle: roleTitle.trim(),
        employer: orgName.trim(),
        notes: notesPayload,
        existingText: notesPayload,
        tone: selectedTone,
      });

      if (outcome.kind === 'suggestions' && outcome.suggestions.length > 0) {
        setGeneratedBullets(outcome.suggestions.map((b) => ({ text: b.replace(/^[•*\-\s]+/, ''), selected: true })));
      } else if (outcome.kind === 'questions') {
        setErrorMessage(`More context needed: ${outcome.questions.join(' ')}`);
      } else if ('message' in outcome) {
        setErrorMessage(outcome.message);
      } else {
        setErrorMessage('Could not generate bullet suggestions. Please add more rough notes.');
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); else handleOpenSync(); }}>
      <DialogContent className="max-w-2xl bg-surface/95 backdrop-blur-xl border-border shadow-2xl rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b border-border/80 bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-200 shadow-2xs">
              <Zap className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-ink">AI Role Copilot</DialogTitle>
              <DialogDescription className="text-xs text-ink-muted mt-0.5">
                Generate quantifiable, high-impact bullet points tailored to your specific position and organization.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Target Role & Org */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Position / Role Title *</label>
              <Input
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g. Senior Full-Stack Engineer"
                className="text-xs font-medium"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Company / Organization</label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Stripe, Acme Corp"
                className="text-xs font-medium"
              />
            </div>
          </div>

          {/* Rough Notes / Tasks */}
          <div>
            <label className="text-xs font-semibold text-ink block mb-1">
              Your Key Accomplishments / Rough Notes (Optional)
            </label>
            <Textarea
              rows={3}
              value={roughNotes}
              onChange={(e) => setRoughNotes(e.target.value)}
              placeholder="e.g. Led redesign of checkout page, worked with React and Go, reduced bounce rate, mentored 3 juniors"
              className="text-xs leading-relaxed"
            />
            <p className="text-[11px] text-ink-muted mt-1">
              AI will transform these rough facts into professional, metric-anchored resume bullets.
            </p>
          </div>

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
                    'p-2 rounded-xl border text-left transition-all text-xs',
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
                <span className="text-[11px] text-brand-600">Click to select/unselect before inserting</span>
              </div>
              <div className="space-y-2">
                {generatedBullets.map((bullet, idx) => (
                  <div
                    key={idx}
                    onClick={() => toggleBullet(idx)}
                    className={cn(
                      'p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5',
                      bullet.selected
                        ? 'border-brand-300 bg-brand-50/50 text-brand-950 shadow-2xs'
                        : 'border-border bg-surface text-ink-muted opacity-60'
                    )}
                  >
                    <div className={cn(
                      'size-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                      bullet.selected ? 'bg-brand-600 border-brand-600 text-white' : 'border-border bg-white'
                    )}>
                      {bullet.selected && <Check className="size-3" />}
                    </div>
                    <p className="leading-relaxed flex-1">{bullet.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border bg-neutral-50/50 flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleGenerate}
              disabled={loading}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-semibold"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-brand-600" />}
              <span>{generatedBullets.length > 0 ? 'Regenerate' : 'Generate Bullets'}</span>
            </Button>

            {generatedBullets.length > 0 && (
              <Button
                onClick={handleInsert}
                className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-4"
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
