/**
 * ResumeImportModal Component
 *
 * Provides full resume import and AI parsing capabilities:
 * - Tab 1: File Upload (PDF, DOCX, DOC, RTF, TXT) with drag-and-drop
 * - Tab 2: Direct Text Paste (for LinkedIn profiles or copied resume text)
 * - Real-time client-side text extraction + POST /api/parse-resume
 * - Maps parsed fields directly into ResumeData
 */

import { useState, useCallback, useRef, type DragEvent } from 'react';
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
import {
  UploadCloud,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ClipboardPaste,
  ArrowRight,
} from 'lucide-react';
import { extractFileText, parseResumeDocument, type ParsedResumeData } from '@/lib/ai-content';
import { cn } from '@/lib/utils';

export interface ResumeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (parsed: ParsedResumeData) => void;
}

export function ResumeImportModal({ isOpen, onClose, onImportComplete }: ResumeImportModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [status, setStatus] = useState<'idle' | 'extracting' | 'parsing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [parsedData, setParsedData] = useState<ParsedResumeData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStatus('idle');
    setFile(null);
    setPastedText('');
    setErrorMessage('');
    setParsedData(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDrag = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const executeParsing = async (rawText: string) => {
    try {
      setStatus('parsing');
      setErrorMessage('');
      const response = await parseResumeDocument(rawText);
      const data = response.data || {};
      setParsedData(data);
      setStatus('success');
    } catch (err: unknown) {
      console.error('[Resume Parser Error]', err);
      setStatus('error');
      const errObj = err as { message?: string };
      setErrorMessage(errObj.message || 'AI parsing could not extract structured details. Please try another file or paste text.');
    }
  };

  const handleStartImport = async () => {
    if (activeTab === 'upload') {
      if (!file) {
        setErrorMessage('Please select a file to import.');
        return;
      }
      try {
        setStatus('extracting');
        setErrorMessage('');
        const text = await extractFileText(file);
        if (!text || text.trim().length < 20) {
          throw new Error('Could not extract readable text from this document. Please copy & paste your resume text in the "Paste Text" tab.');
        }
        await executeParsing(text);
      } catch (err: unknown) {
        console.error('[Extraction Error]', err);
        setStatus('error');
        const errObj = err as { message?: string };
        setErrorMessage(errObj.message || 'Failed to extract text from file.');
      }
    } else {
      if (!pastedText.trim() || pastedText.trim().length < 20) {
        setErrorMessage('Please paste at least 20 characters of resume content.');
        return;
      }
      await executeParsing(pastedText);
    }
  };

  const handleApply = () => {
    if (parsedData) {
      onImportComplete(parsedData);
      handleClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col bg-surface/95 backdrop-blur-xl border-border shadow-2xl rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-6 border-b border-border/80 bg-neutral-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-200 shadow-2xs shrink-0">
              <Sparkles className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-ink">Import & Auto-Fill Resume</DialogTitle>
              <DialogDescription className="text-xs text-ink-muted mt-0.5">
                Upload your existing resume or paste your text. AI will parse contact, work history, education & skills.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 flex-1 overflow-y-auto">
          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <button
              type="button"
              onClick={() => { setActiveTab('upload'); setErrorMessage(''); }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activeTab === 'upload'
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-neutral-100'
              )}
            >
              <UploadCloud className="size-3.5" />
              <span>Upload Document</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('paste'); setErrorMessage(''); }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activeTab === 'paste'
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-neutral-100'
              )}
            >
              <ClipboardPaste className="size-3.5" />
              <span>Paste Text Directly</span>
            </button>
          </div>

          {/* Tab 1: Upload */}
          {activeTab === 'upload' && status !== 'success' && (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3',
                dragActive
                  ? 'border-brand-500 bg-brand-50/50 scale-[0.99]'
                  : 'border-border/80 bg-neutral-50/40 hover:bg-neutral-50/80 hover:border-brand-300'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf,.doc,.txt,.rtf"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="size-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-200 shadow-2xs">
                <UploadCloud className="size-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-ink">
                  {file ? file.name : 'Choose a file or drag & drop here'}
                </p>
                <p className="text-xs text-ink-muted">
                  Supported formats: DOCX, PDF, TXT, RTF up to 10MB
                </p>
              </div>
              {file && (
                <div className="flex items-center gap-2 px-3 py-1 bg-brand-50 rounded-full text-brand-700 text-xs font-semibold mt-1">
                  <FileText className="size-3.5" />
                  <span>{(file.size / 1024).toFixed(1)} KB</span>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Paste */}
          {activeTab === 'paste' && status !== 'success' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink flex items-center justify-between">
                <span>Paste Full Resume Text</span>
                <span className="text-[11px] text-ink-muted">{pastedText.length} characters</span>
              </label>
              <Textarea
                rows={8}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste your resume, CV, or LinkedIn profile text here..."
                className="text-xs leading-relaxed resize-y font-mono"
              />
            </div>
          )}

          {/* Status Indicators */}
          {(status === 'extracting' || status === 'parsing') && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-brand-700 text-xs font-bold">
                <Loader2 className="size-4 animate-spin" />
                <span>
                  {status === 'extracting' ? 'Extracting document text…' : 'AI parsing contact info, experience & skills…'}
                </span>
              </div>
              <p className="text-[11px] text-brand-600/90">
                Grounding extraction strictly in your document facts. No fabricated claims.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 flex items-start gap-2.5 text-rose-800 text-xs">
              <AlertCircle className="size-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Extraction notice</p>
                <p className="text-rose-700 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success Preview */}
          {status === 'success' && parsedData && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span>Resume Extracted Successfully!</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs text-emerald-950">
                  <div className="bg-white/80 rounded-lg p-2 border border-emerald-100">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Candidate</span>
                    <span className="font-semibold">{parsedData.firstname} {parsedData.lastname || '—'}</span>
                  </div>
                  <div className="bg-white/80 rounded-lg p-2 border border-emerald-100">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Role</span>
                    <span className="font-semibold truncate block">{parsedData.occupation || '—'}</span>
                  </div>
                  <div className="bg-white/80 rounded-lg p-2 border border-emerald-100">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Experience</span>
                    <span className="font-semibold">{parsedData.employments?.length || 0} positions</span>
                  </div>
                  <div className="bg-white/80 rounded-lg p-2 border border-emerald-100">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Education</span>
                    <span className="font-semibold">{parsedData.educations?.length || 0} entries</span>
                  </div>
                  <div className="bg-white/80 rounded-lg p-2 border border-emerald-100 sm:col-span-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Skills Detected</span>
                    <span className="font-semibold">{parsedData.skills?.length || 0} technical skills</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-ink-muted">
                Click <strong>"Apply to Resume"</strong> to auto-fill the 12-step builder with these extracted details. You can review and edit every field.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border bg-neutral-50/50 flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs">
            Cancel
          </Button>

          {status === 'success' ? (
            <Button
              onClick={handleApply}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5"
            >
              <span>Apply to Resume</span>
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={handleStartImport}
              disabled={status === 'extracting' || status === 'parsing'}
              className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-5"
            >
              {status === 'extracting' || status === 'parsing' ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Processing…</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  <span>Parse with AI</span>
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
