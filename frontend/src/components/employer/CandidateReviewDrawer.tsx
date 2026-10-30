/**
 * CandidateReviewDrawer — Employer Portal
 *
 * Slide-out candidate evaluation drawer:
 * - Real candidate metadata from GET /api/jobs/:jobId/applications
 * - Live candidate resume preview via GET /api/employer/jobs/:jobId/applications/:applicationId/resume
 * - Server-backed recruiter evaluation and interview scheduling
 * - Relational recruiter rating, hiring notes and stage recommendation
 * - Status transition state machine (pending -> interview|accepted|rejected, etc.)
 * - Optimistic concurrency locking via PATCH /api/job-applications/:applicationId/status
 * - Confirmation dialogs for Rejections and Offers
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mail,
  Phone,
  Calendar,
  FileText,
  Star,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  Save,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Printer,
  Send,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { normalizeResumeToDocument } from '@/lib/resume-view-model';
import { tryGetTemplateMeta } from '@/lib/template-catalog';
import { SmartResumeDocument } from '@/components/resume/smart-resume-document';
import { EmployerInterviewSlotPanel } from '@/components/employer/EmployerInterviewSlotPanel';
import { apiClient, get, post } from '@/lib/api-client';
import {
  useApplicationResume,
  useUpdateApplicationStatus,
  type JobApplication,
} from '@/hooks/use-api-hooks';

interface CandidateReviewDrawerProps {
  jobId: string;
  application: JobApplication | null;
  onClose: () => void;
  onStatusUpdated?: () => void;
}

export function CandidateReviewDrawer({
  jobId,
  application,
  onClose,
  onStatusUpdated,
}: CandidateReviewDrawerProps) {
  const { data: resumeData, isLoading: resumeLoading } = useApplicationResume(
    jobId,
    application?.id || null
  );
  const updateStatusMutation = useUpdateApplicationStatus();

  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(0);
  const [recommendation, setRecommendation] = useState('');
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationSaving, setEvaluationSaving] = useState(false);
  const [evaluationError, setEvaluationError] = useState('');
  const [evaluationSaved, setEvaluationSaved] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    targetStatus: string;
    title: string;
    description: string;
  } | null>(null);
  const [rejectionFeedback, setRejectionFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const [documentOpen, setDocumentOpen] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  // The drawer is a custom (non-Radix) modal: it must move focus inside on open
  // so keyboard users are not left behind on the underlying pipeline table.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!application) return;
    previousFocus.current = (document.activeElement as HTMLElement | null) ?? null;
    panelRef.current?.focus();
    return () => { previousFocus.current?.focus?.(); };
  }, [application]);

  // Direct Message Modal State
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  // Sync internal state when application changes
  useEffect(() => {
    if (application) {
      setNotes('');
      setRating(0);
      setRecommendation('');
      setEvaluationError('');
      setEvaluationSaved(false);
      setRejectionFeedback('');
      setActionError('');
      setSavedSuccess(false);
      setConfirmModal(null);
      setMessageModalOpen(false);
      setMessageSuccess(false);
      setMessageError(null);
      setZoomLevel(100);
    }
  }, [application]);

  useEffect(() => {
    if (!application?.id) return;
    let current = true;
    setEvaluationLoading(true);
    setEvaluationError('');
    get<{ success: boolean; evaluation: { rating: number | null; notes: string; recommendation: string | null } | null }>(`/jobs-data/applications/${encodeURIComponent(application.id)}/evaluate`)
      .then((response) => {
        if (!current) return;
        if (response.evaluation) {
          setRating(Number(response.evaluation.rating) || 0);
          setNotes(response.evaluation.notes || '');
          setRecommendation(response.evaluation.recommendation || '');
        } else {
          setRating(0);
          setNotes('');
          setRecommendation('');
        }
      })
      .catch((error: unknown) => {
        if (current) setEvaluationError(error instanceof Error ? error.message : 'Saved evaluation could not be loaded.');
      })
      .finally(() => { if (current) setEvaluationLoading(false); });
    return () => { current = false; };
  }, [application?.id]);

  const handleSaveEvaluation = async () => {
    if (!application?.id || evaluationSaving) return;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !notes.trim() || !recommendation) {
      setEvaluationError('Provide a rating, hiring notes, and a stage recommendation before saving.');
      setEvaluationSaved(false);
      return;
    }
    setEvaluationSaving(true);
    setEvaluationError('');
    setEvaluationSaved(false);
    try {
      const response = await apiClient.put<{ success: boolean; evaluation: { rating: number; notes: string; recommendation: string } }>(`/jobs-data/applications/${encodeURIComponent(application.id)}/evaluate`, { rating, notes: notes.trim(), recommendation });
      if (!response.data?.success || !response.data.evaluation) throw new Error('The server did not confirm the saved evaluation.');
      setRating(response.data.evaluation.rating);
      setNotes(response.data.evaluation.notes);
      setRecommendation(response.data.evaluation.recommendation);
      setEvaluationSaved(true);
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : 'Evaluation could not be saved.');
    } finally {
      setEvaluationSaving(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Nested Radix dialogs (document viewer, message, confirm) close themselves
      // on Escape and mark the event handled. Bail out so a single Escape press
      // dismisses only the topmost layer instead of also tearing down the drawer.
      if (e.defaultPrevented) return;
      if (e.key === 'Escape' && application) {
        if (messageModalOpen) {
          setMessageModalOpen(false);
        } else if (confirmModal) {
          setConfirmModal(null);
        } else if (documentOpen) {
          setDocumentOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [application, onClose, messageModalOpen, confirmModal, documentOpen]);

  if (!application) return null;

  const currentStatus = application.status || 'pending';

  const applyMessageTemplate = (type: 'interview' | 'assessment' | 'inquiry') => {
    if (type === 'interview') {
      setMessageSubject(`Invitation to Interview: Next Steps with Our Team`);
      setMessageBody(
        `Hi ${application.applicantName},\n\nThank you for submitting your application. We were thoroughly impressed by your background and would love to schedule a 30-minute introductory conversation.\n\nPlease reply with your general availability over the next few business days.\n\nBest regards,\nHiring & Talent Acquisition Team`
      );
    } else if (type === 'assessment') {
      setMessageSubject(`Next Steps: Technical Skills Assessment`);
      setMessageBody(
        `Hi ${application.applicantName},\n\nAs part of our interview evaluation process, we would like to invite you to complete a brief skills exercise. Please review the attached instructions and submit your solution at your convenience.\n\nBest regards,\nEngineering Team`
      );
    } else if (type === 'inquiry') {
      setMessageSubject(`Follow-up Regarding Your Application & Timeline`);
      setMessageBody(
        `Hi ${application.applicantName},\n\nWe are actively reviewing candidate submissions for this role and wanted to check in regarding your current notice period and relocation or compensation preferences.\n\nLooking forward to hearing from you.\n\nWarm regards,\nRecruitment Team`
      );
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageSubject.trim() || !messageBody.trim() || messageSending) return;

    setMessageError(null);
    try {
      const candidateId = application.id || application.applicantId;
      const recipientEmail = application.applicantEmail || '';
      let res: any;
      try {
        res = await post(`/employer/candidates/${candidateId}/notify`, {
          candidateId,
          recipientEmail,
          to: recipientEmail,
          subject: messageSubject.trim(),
          message: messageBody.trim(),
          body: messageBody.trim(),
          template: 'custom_message',
        });
      } catch {
        res = await post('/notify/email', {
          candidateId,
          recipientEmail,
          to: recipientEmail,
          subject: messageSubject.trim(),
          message: messageBody.trim(),
          body: messageBody.trim(),
          recipientName: application.applicantName,
          jobId,
          applicationId: application.id,
          template: 'custom_message',
        });
      }

      if (res && res.error) {
        throw new Error(typeof res.error === 'string' ? res.error : 'Failed to deliver notification to candidate.');
      }

      setMessageSuccess(true);
      setTimeout(() => {
        setMessageSuccess(false);
        setMessageModalOpen(false);
        setMessageSubject('');
        setMessageBody('');
      }, 1500);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        (err instanceof Error ? err.message : 'Failed to send message. Please try again.');
      setMessageError(msg);
    } finally {
      setMessageSending(false);
    }
  };

  // Allowed transitions per backend state machine
  const getAvailableTransitions = () => {
    switch (currentStatus) {
      case 'pending':
        return [
          { status: 'interview', label: 'Move to Interview', tone: 'accent' },
          { status: 'accepted', label: 'Extend Offer', tone: 'emerald' },
          { status: 'rejected', label: 'Reject Applicant', tone: 'rose' },
        ];
      case 'interview':
        return [
          { status: 'accepted', label: 'Extend Offer', tone: 'emerald' },
          { status: 'rejected', label: 'Reject Candidate', tone: 'rose' },
          { status: 'pending', label: 'Move Back to Review', tone: 'neutral' },
        ];
      case 'accepted':
        return [
          { status: 'interview', label: 'Re-interview', tone: 'accent' },
          { status: 'rejected', label: 'Revoke / Reject', tone: 'rose' },
        ];
      case 'rejected':
        return [
          { status: 'pending', label: 'Reopen Application', tone: 'accent' },
          { status: 'interview', label: 'Move to Interview', tone: 'accent' },
        ];
      default:
        return [
          { status: 'interview', label: 'Move to Interview', tone: 'accent' },
          { status: 'accepted', label: 'Accept', tone: 'emerald' },
          { status: 'rejected', label: 'Reject', tone: 'rose' },
        ];
    }
  };

  const handleTransitionClick = (targetStatus: string) => {
    if (targetStatus === 'rejected') {
      setRejectionFeedback('');
      setConfirmModal({
        targetStatus: 'rejected',
        title: 'Confirm Candidate Rejection',
        description: `Are you sure you want to reject ${application.applicantName}? They will be notified accordingly.`,
      });
      return;
    }
    if (targetStatus === 'accepted') {
      setConfirmModal({
        targetStatus: 'accepted',
        title: 'Extend Formal Offer',
        description: `Ready to extend an offer to ${application.applicantName}? This advances them to the Hired stage.`,
      });
      return;
    }
    executeTransition(targetStatus);
  };

  const executeTransition = async (targetStatus: string) => {
    setActionError('');
    const combinedNotes = [
      rejectionFeedback.trim() ? `[Feedback: ${rejectionFeedback.trim()}]` : null,
      notes.trim() || null,
    ].filter(Boolean).join(' • ');
    if (combinedNotes.length > 1000) {
      setActionError('Keep the combined hiring notes and rejection feedback to 1,000 characters before changing the stage.');
      return;
    }
    try {
      await updateStatusMutation.mutateAsync({
        applicationId: application.id,
        status: targetStatus,
        notes: combinedNotes || undefined,
        expectedStatus: currentStatus,
        expectedRevision: application.revision,
      });
      setSavedSuccess(true);
      setConfirmModal(null);
      setTimeout(() => {
        setSavedSuccess(false);
        onStatusUpdated?.();
      }, 1000);
    } catch (err: any) {
      setActionError(err.message || 'Status transition failed.');
    }
  };

  const renderFullDocument = () => {
    if (!resumeData?.resume) {
      return <p className="p-8 text-center text-sm text-ink-muted">The candidate resume could not be loaded.</p>;
    }
    const normalized = normalizeResumeToDocument(resumeData.resume);
    const meta = tryGetTemplateMeta(normalized.template || 'Cv1');
    if (!meta || !meta.id.startsWith('Cv')) {
      return (
        <p className="p-8 text-center text-sm text-ink-muted">
          This resume uses a template this viewer cannot render.
        </p>
      );
    }
    return (
      <div
        className="mx-auto w-fit bg-white shadow-xl transition-transform duration-150"
        style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
        data-testid="employer-resume-document"
      >
        <SmartResumeDocument resume={normalized} meta={meta} />
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="candidate-drawer-name"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid="candidate-review-drawer"
        className="flex h-full w-full max-w-xl min-w-0 flex-col overflow-hidden border-l border-border bg-surface/95 shadow-2xl outline-none backdrop-blur-xl animate-in slide-in-from-right duration-300 motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-border bg-neutral-50/50 p-5 sm:p-6">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-lg font-extrabold text-brand-600">
              {application.applicantName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 id="candidate-drawer-name" className="min-w-0 break-words text-lg font-bold text-ink">
                  {application.applicantName}
                </h3>
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border',
                    currentStatus === 'accepted'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                      : currentStatus === 'interview'
                      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30'
                      : currentStatus === 'rejected'
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30'
                      : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                  )}
                >
                  {currentStatus}
                </span>
              </div>
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                {application.applicantEmail && (
                  <span className="flex items-center gap-1">
                    <Mail className="size-3 text-accent" />
                    {application.applicantEmail}
                  </span>
                )}
                {application.applicantPhone && (
                  <span className="flex items-center gap-1">
                    <Phone className="size-3 text-accent" />
                    {application.applicantPhone}
                  </span>
                )}
                {application.appliedAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3 text-ink-muted" />
                    {new Date(application.appliedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    applyMessageTemplate('interview');
                    setMessageModalOpen(true);
                  }}
                  className="h-7 text-xs px-2.5 gap-1.5 text-accent font-semibold"
                >
                  <MessageCircle className="size-3.5" />
                  Message Candidate
                </Button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            aria-label="Close candidate drawer"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* Action Error / Success Banners */}
        {actionError && (
          <div className="p-3 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
        {savedSuccess && (
          <div className="p-3 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>Application status updated successfully!</span>
          </div>
        )}

        {/* Content Body */}
        <div className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
          {/* Rating Assessment */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-ink">Recruiter Evaluation Score</label>
            {evaluationLoading && <p role="status" className="text-xs text-ink-muted">Loading saved evaluation…</p>}
            {evaluationError && <p role="alert" className="text-xs text-red-700">{evaluationError}</p>}
            <div className="flex items-center gap-1" role="group" aria-label="Recruiter evaluation score">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} of 5 stars`}
                  aria-pressed={star === rating}
                  onClick={() => setRating(star)}
                  className="p-1 text-amber-500 hover:scale-110 transition-transform"
                >
                  <Star
                    aria-hidden="true"
                    className={cn(
                      'size-5',
                      star <= rating ? 'fill-amber-500' : 'stroke-ink-muted fill-none'
                    )}
                  />
                </button>
              ))}
              <span className="text-xs font-semibold text-ink-muted ml-2">
                {rating ? `${rating} of 5 Stars` : 'Not rated'}
              </span>
            </div>
          </div>

          {/* Cover Letter Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <MessageSquare className="size-3.5 text-accent" />
              <span>Cover Letter / Pitch</span>
            </div>
            {application.coverLetter ? (
              <div className="p-3.5 rounded-xl border border-edge bg-canvas text-xs leading-relaxed text-ink whitespace-pre-wrap">
                {application.coverLetter}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-dashed border-edge text-center text-xs text-ink-muted">
                No custom cover letter provided with this submission.
              </div>
            )}
          </div>

          {/* Candidate Resume View / Preview */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <FileText className="size-3.5 text-accent" />
                <span>Verified Candidate Resume</span>
              </div>
              {application.resumeId && resumeData?.resume && (
                <button
                  type="button"
                  onClick={() => setDocumentOpen(true)}
                  className="text-[11px] text-accent hover:underline flex items-center gap-1 font-semibold"
                >
                  View Full Document <ExternalLink className="size-3" />
                </button>
              )}
            </div>

            {resumeLoading ? (
              <div className="p-6 rounded-xl border border-edge bg-canvas-soft animate-pulse flex items-center justify-center">
                <Clock className="size-4 animate-spin text-ink-muted mr-2" />
                <span className="text-xs text-ink-muted">Loading candidate resume details...</span>
              </div>
            ) : resumeData?.resume ? (
              <div className="p-4 rounded-xl border border-edge bg-surface space-y-3">
                <div className="flex items-center justify-between border-b border-edge pb-2">
                  <span className="text-xs font-bold text-ink">
                    {resumeData.resume.title || resumeData.resume.targetRole || 'Master Curriculum Vitae'}
                  </span>
                  <span className="text-[10px] text-ink-muted">
                    Updated {resumeData.resume.updatedAt ? new Date(resumeData.resume.updatedAt).toLocaleDateString() : 'Recently'}
                  </span>
                </div>
                {resumeData.resume.summary && (
                  <p className="text-xs text-ink-muted line-clamp-3">
                    {resumeData.resume.summary}
                  </p>
                )}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-[11px] text-ink-muted">
                    {resumeData.resume.skills?.length || 0} skills verified
                  </span>
                  {application.resumeId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 gap-1"
                      onClick={() => setDocumentOpen(true)}
                    >
                      Inspect Full Document
                      <ChevronRight className="size-3" />
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-edge bg-surface flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-ink">
                  <FileText className="size-4 text-accent" />
                  <span>Resume Document ({application.resumeId || 'Standard Profile'})</span>
                </div>
                {application.resumeId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setDocumentOpen(true)}
                    disabled={!resumeData?.resume}
                    title={resumeData?.resume ? 'View full document' : 'The candidate resume is still loading'}
                  >
                    View Document
                  </Button>
                ) : (
                  <span className="text-xs text-ink-muted">Direct Application</span>
                )}
              </div>
            )}
          </div>

          {/* Employer Interview Slot Manager & Candidate Booking Widget */}
          <EmployerInterviewSlotPanel
            applicationId={application.id}
            candidateName={application.applicantName}
            onBookingConfirmed={() => {
              onStatusUpdated?.();
            }}
          />

          {/* Internal Notes */}
          <div className="space-y-2">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <label htmlFor="candidate-internal-notes" className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink">
                <span>Hiring Team Notes</span>
                <span className="text-[10px] text-ink-muted font-normal">
                  (Internal only)
                </span>
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => executeTransition(currentStatus)}
                disabled={updateStatusMutation.isPending}
                className="h-6 text-[11px] px-2 text-accent"
              >
                <Save className="size-3 mr-1" /> Save Notes
              </Button>
            </div>
            <Textarea
              id="candidate-internal-notes"
              rows={3}
              maxLength={1000}
              placeholder="Record interviewer impressions, compensation discussions, or follow-up milestones..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs resize-y"
            />
            <div className="space-y-1.5">
              <label htmlFor="evaluation-recommendation" className="text-xs font-semibold text-ink">Stage recommendation</label>
              <select id="evaluation-recommendation" value={recommendation} onChange={(event) => setRecommendation(event.target.value)} className="h-9 w-full rounded-lg border border-edge bg-canvas-soft px-3 text-xs text-ink">
                <option value="">Select recommendation</option><option value="STRONG_YES">Strong yes — move to offer</option><option value="YES">Yes — advance</option><option value="NEUTRAL">Neutral — hold</option><option value="NO">No — do not advance</option><option value="STRONG_NO">Strong no — reject</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void handleSaveEvaluation()} disabled={evaluationSaving || evaluationLoading} aria-busy={evaluationSaving}>
                <Save className="size-3 mr-1" />{evaluationSaving ? 'Saving evaluation…' : 'Save Evaluation'}
              </Button>
              {evaluationSaved && <span role="status" className="text-xs text-emerald-700">Evaluation saved.</span>}
            </div>
          </div>
        </div>

        {/* Stage Transition Footer Actions */}
        <div className="min-w-0 shrink-0 space-y-2 border-t border-border bg-neutral-50/60 p-4">
          <p className="break-words text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Advance Candidate Stage
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {getAvailableTransitions().map((action) => {
              const variant = action.tone === 'rose' ? 'destructive' : action.tone === 'emerald' ? 'primary' : 'outline';
              return (
                <Button
                  key={action.status}
                  size="sm"
                  variant={variant}
                  disabled={updateStatusMutation.isPending}
                  onClick={() => handleTransitionClick(action.status)}
                  className={cn(
                    'min-w-0 whitespace-normal text-xs font-semibold',
                    action.tone === 'emerald' && 'bg-emerald-700 hover:bg-emerald-800 text-white',
                    action.tone === 'accent' && 'bg-accent hover:bg-accent/90 text-white'
                  )}
                >
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Authorized full-document viewer with Zoom, Print, and Fit controls */}
      <Dialog open={documentOpen} onOpenChange={setDocumentOpen}>
        <DialogContent
          data-testid="candidate-document-viewer"
          className="flex h-[94vh] max-h-[94vh] w-[calc(100%-2rem)] max-w-5xl flex-col overflow-hidden rounded-2xl p-0 md:rounded-3xl"
        >
          <DialogHeader className="flex flex-col items-start justify-between gap-3 border-b border-edge px-5 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <DialogTitle className="text-sm font-bold text-ink">
                {resumeData?.resume?.title || `${application.applicantName}'s Resume`}
              </DialogTitle>
              <DialogDescription className="text-xs text-ink-muted">
                Authorized recruiter preview. Verified against platform credentials.
              </DialogDescription>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:mr-6">
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-surface border border-edge rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 25))}
                  className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas"
                  title="Zoom Out"
                >
                  <ZoomOut className="size-3.5" />
                </button>
                <span className="px-1.5 font-mono text-[11px] font-bold text-ink min-w-[42px] text-center">
                  {zoomLevel}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(200, z + 25))}
                  className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas"
                  title="Zoom In"
                >
                  <ZoomIn className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(100)}
                  className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas"
                  title="Reset Zoom to 100%"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </div>

              {/* Print Action */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="h-8 text-xs px-2.5 gap-1.5"
                title="Print document"
              >
                <Printer className="size-3.5" />
                Print
              </Button>
            </div>
          </DialogHeader>
          <div className="flex min-h-0 min-w-0 flex-1 justify-center overflow-auto bg-neutral-200/80 p-4 sm:p-6">
            {renderFullDocument()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Direct Candidate Messaging Modal */}
      {messageModalOpen && (
        <Dialog open={!!messageModalOpen} onOpenChange={value => { if (!value) setMessageModalOpen(false); }}>
          <DialogContent hideCloseButton aria-label="Direct Message Candidate" aria-describedby={undefined} className="w-[calc(100%-2rem)] max-w-lg p-0 gap-0 rounded-2xl md:rounded-3xl bg-surface/95 border-border backdrop-blur-xl flex flex-col max-h-[92vh] overflow-hidden motion-reduce:animate-none">
            <DialogTitle className="sr-only">Direct Message Candidate</DialogTitle>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-border bg-neutral-50/50 p-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600">
                  <Mail className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h4 id="direct-message-title" className="break-words text-sm font-bold text-ink">
                    Direct Message Candidate
                  </h4>
                  <p className="break-words text-[11px] text-ink-muted">
                    To: {application.applicantName} ({application.applicantEmail})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMessageModalOpen(false)}
                disabled={messageSending}
                aria-label="Close message dialog"
                className="shrink-0 rounded-lg p-1 text-ink-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            {messageSuccess ? (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="size-10 text-emerald-600 mx-auto animate-bounce" />
                <h5 className="text-sm font-bold text-ink">Message Dispatched!</h5>
                <p className="text-xs text-ink-muted">
                  Your communication has been transmitted to {application.applicantName}.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
                {messageError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-2">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>{messageError}</span>
                  </div>
                )}
                {/* Template Chips */}
                <div className="space-y-1.5">
                  <label className="font-bold text-ink block">Quick Message Templates</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyMessageTemplate('interview')}
                      className="px-2.5 py-1 rounded-lg border border-edge bg-canvas-soft hover:bg-accent-soft text-ink font-medium"
                    >
                      Interview Invitation
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMessageTemplate('assessment')}
                      className="px-2.5 py-1 rounded-lg border border-edge bg-canvas-soft hover:bg-accent-soft text-ink font-medium"
                    >
                      Technical Exercise
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMessageTemplate('inquiry')}
                      className="px-2.5 py-1 rounded-lg border border-edge bg-canvas-soft hover:bg-accent-soft text-ink font-medium"
                    >
                      Timeline & Compensation
                    </button>
                  </div>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <label htmlFor="candidate-message-subject" className="font-bold text-ink block">Subject Line</label>
                  <Input
                    required
                    value={messageSubject}
                    onChange={(e) => setMessageSubject(e.target.value)}
                    placeholder="e.g. Invitation to Interview: Next Steps"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="min-w-0 space-y-1.5">
                  <label htmlFor="candidate-message-body" className="font-bold text-ink block">Message Body</label>
                  <Textarea
                    required
                    rows={6}
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder="Compose message to candidate..."
                    className="text-xs resize-y"
                  />
                </div>

                {messageError && (
                  <div className="p-2.5 mb-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium flex items-center gap-2">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>{messageError}</span>
                  </div>
                )}
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMessageModalOpen(false)}
                    disabled={messageSending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={messageSending} className="min-w-0 whitespace-normal gap-1.5">
                    <Send className="size-3.5 shrink-0" />
                    {messageSending ? 'Transmitting…' : 'Send Direct Message'}
                  </Button>
                </div>
              </form>
            )}
          </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <Dialog open={!!confirmModal} onOpenChange={value => { if (!value) setConfirmModal(null); }}>
          <DialogContent hideCloseButton aria-label="Confirm Candidate Status Change" aria-describedby={undefined} className="w-[calc(100%-2rem)] max-w-md p-0 gap-0 rounded-2xl md:rounded-3xl bg-surface/95 border-border backdrop-blur-xl flex flex-col max-h-[92vh] overflow-hidden motion-reduce:animate-none">
            <DialogTitle className="sr-only">Confirm Candidate Status Change</DialogTitle>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={cn(
                  'size-10 rounded-xl flex items-center justify-center shrink-0',
                  confirmModal.targetStatus === 'rejected'
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                )}
              >
                {confirmModal.targetStatus === 'rejected' ? (
                  <AlertTriangle className="size-5" />
                ) : (
                  <CheckCircle2 className="size-5" />
                )}
              </div>
              <div className="min-w-0">
                <h4 className="break-words text-sm font-bold text-ink">{confirmModal.title}</h4>
                <p className="mt-1 break-words text-xs leading-relaxed text-ink-muted">
                  {confirmModal.description}
                </p>
              </div>
            </div>

            {/* Optional Rejection Feedback Field */}
            {confirmModal.targetStatus === 'rejected' && (
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-bold text-ink block">
                  Constructive Feedback Note (Optional)
                </label>
                <Textarea
                  rows={3}
                  value={rejectionFeedback}
                  onChange={(e) => setRejectionFeedback(e.target.value)}
                  placeholder="Record constructive feedback for the candidate or future consideration..."
                  className="text-xs resize-y"
                />
              </div>
            )}

            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmModal(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant={confirmModal.targetStatus === 'rejected' ? 'destructive' : 'primary'}
                onClick={() => executeTransition(confirmModal.targetStatus)}
                disabled={updateStatusMutation.isPending}
                className="min-w-0 whitespace-normal text-xs font-semibold"
              >
                {updateStatusMutation.isPending ? 'Updating...' : 'Confirm Action'}
              </Button>
            </div>
          </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

