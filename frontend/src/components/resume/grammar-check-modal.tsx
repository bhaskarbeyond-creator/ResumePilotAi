/**
 * GrammarCheckModal Component
 *
 * Multilingual grammar, spelling, punctuation, and clarity checker:
 * - Powered by POST /api/check-grammar
 * - Highlights specific errors with original -> suggestion diffs
 * - 1-Click "Apply All Suggestions" or individual replacement
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
import {
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  Check,
  Languages,
  ArrowRight,
} from 'lucide-react';
import { checkGrammar, type GrammarCorrection } from '@/lib/ai-content';
import { cn } from '@/lib/utils';

export interface GrammarCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  text: string;
  onApplyCorrectedText: (newText: string) => void;
}

export function GrammarCheckModal({
  isOpen,
  onClose,
  text,
  onApplyCorrectedText,
}: GrammarCheckModalProps) {
  const [selectedLang, setSelectedLang] = useState('en');
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [corrections, setCorrections] = useState<GrammarCorrection[]>([]);
  const [overallSuggestion, setOverallSuggestion] = useState('');
  const [currentText, setCurrentText] = useState(text || '');

  const handleOpenSync = () => {
    setCurrentText(text || '');
    setChecked(false);
    setCorrections([]);
    setOverallSuggestion('');
  };

  const runCheck = async () => {
    if (!currentText.trim()) return;
    try {
      setLoading(true);
      const result = await checkGrammar(currentText, selectedLang);
      setCorrections(result.corrections || []);
      setOverallSuggestion(result.overallSuggestion || (result.hasErrors ? 'Review the highlighted suggestions below.' : 'No errors found! Text looks sharp and polished.'));
      setChecked(true);
    } catch (err) {
      console.error('[Grammar check error]', err);
      setOverallSuggestion('Grammar service could not complete the review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const applySingleCorrection = (correction: GrammarCorrection) => {
    const updated = currentText.replace(correction.original, correction.suggestion);
    setCurrentText(updated);
    setCorrections((prev) => prev.filter((c) => c !== correction));
  };

  const applyAll = () => {
    let updated = currentText;
    for (const c of corrections) {
      updated = updated.replace(c.original, c.suggestion);
    }
    setCurrentText(updated);
    setCorrections([]);
    onApplyCorrectedText(updated);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); else handleOpenSync(); }}>
      <DialogContent className="max-w-2xl bg-surface/95 backdrop-blur-xl border-border shadow-2xl rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b border-border/80 bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-200 shadow-2xs">
              <Sparkles className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-ink">AI Copy & Grammar Review</DialogTitle>
              <DialogDescription className="text-xs text-ink-muted mt-0.5">
                Scan for grammar, spelling, punctuation, and copy clarity without altering your factual statements.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Language Selector */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <Languages className="size-3.5 text-ink-muted" />
              <span>Language:</span>
            </label>
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="text-xs rounded-lg border border-border bg-surface px-2.5 py-1 text-ink focus:outline-none"
            >
              <option value="en">English (US/UK)</option>
              <option value="es">Spanish (Español)</option>
              <option value="fr">French (Français)</option>
              <option value="de">German (Deutsch)</option>
              <option value="it">Italian (Italiano)</option>
              <option value="pt">Portuguese (Português)</option>
              <option value="nl">Dutch (Nederlands)</option>
            </select>
          </div>

          {!checked && !loading && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-3">
              <p className="text-xs text-ink-muted leading-relaxed">
                Click <strong>"Run Grammar Scan"</strong> to analyze your text with the Copy Editor AI.
              </p>
              <Button
                onClick={runCheck}
                className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-5"
              >
                <Sparkles className="size-4" />
                <span>Run Grammar Scan</span>
              </Button>
            </div>
          )}

          {loading && (
            <div className="p-8 text-center space-y-2">
              <Loader2 className="size-6 animate-spin text-brand-600 mx-auto" />
              <p className="text-xs font-semibold text-ink">Analyzing text for grammar, typos, and clarity…</p>
            </div>
          )}

          {checked && (
            <div className="space-y-4">
              <div className={cn(
                'rounded-xl border p-3.5 text-xs flex items-start gap-2.5',
                corrections.length === 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              )}>
                {corrections.length === 0 ? (
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold">{corrections.length === 0 ? 'Everything looks great!' : `${corrections.length} correction${corrections.length > 1 ? 's' : ''} suggested`}</p>
                  <p className="mt-0.5 leading-relaxed text-[11px] opacity-90">{overallSuggestion}</p>
                </div>
              </div>

              {corrections.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-ink">Suggested Corrections:</span>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {corrections.map((item, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-border bg-surface p-3 text-xs space-y-1.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="uppercase text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                            {item.type}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applySingleCorrection(item)}
                            className="h-6 text-[10px] gap-1 px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          >
                            <Check className="size-3" /> Apply
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-ink">
                          <span className="line-through text-rose-600 font-mono bg-rose-50 px-1.5 py-0.5 rounded text-[11px]">{item.original}</span>
                          <ArrowRight className="size-3 text-ink-muted" />
                          <span className="text-emerald-700 font-bold font-mono bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">{item.suggestion}</span>
                        </div>
                        <p className="text-[11px] text-ink-muted">{item.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border bg-neutral-50/50 flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>

          {checked && corrections.length > 0 && (
            <Button
              onClick={applyAll}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4"
            >
              <Check className="size-4" />
              <span>Accept All ({corrections.length})</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
