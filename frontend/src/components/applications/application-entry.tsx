/** A real submitted application, its employer lifecycle, and candidate-owned actions. */
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ChevronDown, CircleSlash, Columns3, Eye, Info, ListPlus, MapPin, Send, Trash2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { lifecycleStatusFor, statusLabel, type Application, type ApplicationLifecycle } from '@/lib/applications';
import { applicationName, appliedDate, coverLetterText, updatedDate } from '@/lib/application-display';
import { stageLabel, type TrackedJob } from '@/lib/job-tracker';

export const detailsButtonId = (application: Pick<Application, 'id'>) => `application-details-toggle-${application.id}`;
export const withdrawButtonId = (application: Pick<Application, 'id'>) => `application-withdraw-${application.id}`;
export const trackControlId = (application: Pick<Application, 'id'>) => `application-track-${application.id}`;
export function trackerHref(job: TrackedJob): string {
  return `/dashboard/job-tracker?${new URLSearchParams({ view: 'board', q: job.title }).toString()}`;
}
const STATUS_TONE: Record<ApplicationLifecycle, { className: string; Icon: LucideIcon }> = {
  APPLIED: { className: 'border-border bg-canvas-soft text-ink-secondary', Icon: Send },
  REVIEWING: { className: 'border-info-100 bg-info-50 text-info-700', Icon: Eye },
  INTERVIEW_SCHEDULED: { className: 'border-info-100 bg-info-50 text-info-700', Icon: CalendarClock },
  OFFERED: { className: 'border-success-100 bg-success-50 text-success-700', Icon: CheckCircle2 },
  REJECTED: { className: 'border-border bg-canvas-soft text-ink-secondary', Icon: CircleSlash },
  UNKNOWN: { className: 'border-warning-100 bg-warning-50 text-warning-700', Icon: Info },
};
export function StatusBadge({ status }: { status: string }) {
  const lifecycle = lifecycleStatusFor(status);
  const tone = STATUS_TONE[lifecycle];
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', tone.className)}>
      <tone.Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span><span className="sr-only">Status: </span>{statusLabel(status)}</span>
    </span>
  );
}
interface ApplicationEntryProps {
  application: Application;
  expanded: boolean;
  onToggleDetails: (application: Application) => void;
  tracked: TrackedJob | undefined;
  tracking: boolean;
  onTrack: (application: Application) => void;
  onWithdraw: (application: Application) => void;
  resumeText: string;
}
export function ApplicationEntry({ application, expanded, onToggleDetails, tracked, tracking, onTrack, onWithdraw, resumeText }: ApplicationEntryProps) {
  const titleId = `application-${application.id}-title`;
  const detailsId = `application-${application.id}-details`;
  const { title, company, location, listed } = application.job;
  const name = applicationName(application);
  const applied = appliedDate(application), updated = updatedDate(application);
  const letter = coverLetterText(application.coverLetter);
  const trackable = Boolean(title.trim() && company.trim());
  return (
    <article aria-labelledby={titleId} className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <h3 id={titleId} className="break-words text-base font-semibold leading-snug text-ink">{title || 'Job details unavailable'}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-secondary">
            {company && <span className="break-words">{company}</span>}
            {location && <span className="flex min-w-0 items-center gap-1 break-words"><MapPin className="size-3.5 shrink-0" aria-hidden="true" />{location}</span>}
          </p>
        </div>
        <StatusBadge status={application.status} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
        {applied && <time dateTime={applied.dateTime}>{applied.label}</time>}
        {updated && <time dateTime={updated.dateTime}>{updated.label}</time>}
        {!listed && <span className="font-medium text-ink-secondary">Not currently listed on the job board</span>}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button id={detailsButtonId(application)} variant="outline" size="sm" aria-expanded={expanded} aria-controls={detailsId}
          aria-label={`${expanded ? 'Hide details' : 'Details'} for ${name}`} onClick={() => onToggleDetails(application)}>
          <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} aria-hidden="true" /> {expanded ? 'Hide details' : 'Details'}
        </Button>
        {trackable && (tracked ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button asChild variant="outline" size="sm">
              <Link id={trackControlId(application)} to={trackerHref(tracked)} aria-label={`Open in Job Tracker: ${name}`}>
                <Columns3 aria-hidden="true" /> Open in Job Tracker
              </Link>
            </Button>
            <span className="text-xs text-ink-muted">Tracked · {stageLabel(tracked.status)}</span>
          </span>
        ) : (
          <Button id={trackControlId(application)} variant="outline" size="sm" aria-label={`Track application: ${name}`}
            disabled={tracking} aria-busy={tracking || undefined} onClick={() => onTrack(application)}>
            <ListPlus aria-hidden="true" /> {tracking ? 'Tracking…' : 'Track Application'}
          </Button>
        ))}
        <Button id={withdrawButtonId(application)} variant="ghost" size="sm" className="text-error-700 hover:bg-error-50 hover:text-error-700"
          aria-label={`Withdraw application for ${name}`} onClick={() => onWithdraw(application)}>
          <Trash2 aria-hidden="true" /> Withdraw
        </Button>
      </div>
      <div id={detailsId} hidden={!expanded} className="mt-3 border-t border-border pt-3">
        {expanded && <>
          <h4 className="text-sm font-semibold text-ink">What you sent</h4>
          <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-ink-muted">Name</dt><dd className="min-w-0 break-words text-ink">{application.applicantName || 'Not recorded'}</dd>
            <dt className="text-ink-muted">Email</dt><dd className="min-w-0 break-words text-ink">{application.applicantEmail || 'Not recorded'}</dd>
            <dt className="text-ink-muted">Phone</dt><dd className="min-w-0 break-words text-ink">{application.applicantPhone || 'Not recorded'}</dd>
            <dt className="text-ink-muted">Resume</dt><dd className="min-w-0 break-words text-ink">{resumeText}</dd>
            <dt className="text-ink-muted">Application ID</dt><dd className="break-all text-ink">{application.id}</dd>
            {application.jobId && <><dt className="text-ink-muted">Job ID</dt><dd className="break-all text-ink">{application.jobId}</dd></>}
            <dt className="text-ink-muted">Employer status</dt><dd className="break-words text-ink">{application.status || 'Not provided'}</dd>
          </dl>
          <h5 className="mt-3 text-sm font-semibold text-ink">Cover letter</h5>
          {letter ? <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-canvas-soft p-3 text-sm text-ink">{letter}</p>
            : <p className="mt-1 text-sm text-ink-muted">No cover letter was recorded.</p>}
        </>}
      </div>
    </article>
  );
}
