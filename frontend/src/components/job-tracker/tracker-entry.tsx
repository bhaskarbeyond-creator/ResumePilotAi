/**
 * One tracked job: everything the candidate stored, a stage control, and an
 * actions menu (Radix, so it opens in a portal and is never clipped by the
 * board). The same entry is used in the board and the list.
 */
import type { DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, CalendarClock, ExternalLink, FileText, MapPin, MoreVertical, Pencil, Trash2, UserRound, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { nextStage, TRACKER_STAGES, type TrackedJob, type TrackerStatus } from '@/lib/job-tracker';
import { deadlineInfo, interviewInfo, progressDate } from '@/lib/job-tracker-display';

export const actionsTriggerId = (job: TrackedJob) => `tracker-actions-${job.id}`;
export const stageSelectId = (job: TrackedJob) => `tracker-stage-${job.id}`;
export const advanceButtonId = (job: TrackedJob) => `tracker-advance-${job.id}`;

export function coverLetterHref(job: TrackedJob): string {
  const query = new URLSearchParams({ role: job.title, company: job.company });
  return `/dashboard/cover-letters?${query.toString()}`;
}

const itemClass = 'gap-2 px-2.5 py-2 text-sm text-ink focus:bg-neutral-100 focus:text-ink data-[highlighted]:bg-neutral-100 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted';

interface TrackerEntryProps {
  job: TrackedJob;
  moving: boolean;
  onMove: (job: TrackedJob, status: TrackerStatus, via?: 'stage' | 'advance') => void;
  onEdit: (job: TrackedJob, focus?: 'interview') => void;
  onDelete: (job: TrackedJob) => void;
  onExportInterview: (job: TrackedJob) => void;
  /** Board only: lets a pointer user drag the card to another stage column. */
  onDragStart?: (job: TrackedJob, event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
}

export function TrackerEntry({ job, moving, onMove, onEdit, onDelete, onExportInterview, onDragStart, onDragEnd, dragging }: TrackerEntryProps) {
  const titleId = `tracker-job-${job.id}-title`;
  const progress = progressDate(job);
  const deadline = deadlineInfo(job);
  const interview = interviewInfo(job);
  // "Remote · Remote" reads as a mistake: show the work mode only when it adds something.
  const place = [job.location, job.workMode]
    .filter((value, index, all) => value && all.findIndex((other) => other.toLocaleLowerCase() === value.toLocaleLowerCase()) === index)
    .join(' · ');
  const interviewKind = [job.interviewRound, job.interviewFormat].filter(Boolean).join(' · ');
  const next = nextStage(job.status);

  return (
    <article
      aria-labelledby={titleId}
      draggable={onDragStart ? true : undefined}
      onDragStart={onDragStart ? (event) => onDragStart(job, event) : undefined}
      onDragEnd={onDragEnd}
      className={cn('min-w-0 rounded-xl border border-border bg-surface p-4 shadow-xs', onDragStart && 'cursor-grab active:cursor-grabbing', dragging && 'opacity-60')}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-sm font-semibold leading-snug text-ink break-words">{job.title}</h3>
          <p className="mt-0.5 text-sm text-ink-secondary break-words">{job.company}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button id={actionsTriggerId(job)} variant="ghost" size="icon-sm" className="-mr-1 -mt-1 shrink-0" aria-label={`Actions for ${job.title} at ${job.company}`}>
              <MoreVertical aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem className={itemClass} onSelect={() => onEdit(job)}>
              <Pencil aria-hidden="true" /> Edit details
            </DropdownMenuItem>
            <DropdownMenuItem className={itemClass} onSelect={() => onEdit(job, 'interview')}>
              <CalendarClock aria-hidden="true" /> {job.interviewAt ? 'Change interview' : 'Schedule interview'}
            </DropdownMenuItem>
            {interview && (
              <DropdownMenuItem className={itemClass} onSelect={() => onExportInterview(job)}>
                <CalendarClock aria-hidden="true" /> Add interview to calendar (.ics)
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className={itemClass} asChild>
              <Link to={coverLetterHref(job)}><FileText aria-hidden="true" /> Write a cover letter</Link>
            </DropdownMenuItem>
            {job.url && (
              <DropdownMenuItem className={itemClass} asChild>
                <a href={job.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" /> Open job posting<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="my-1 h-px bg-border" />
            <DropdownMenuItem className={cn(itemClass, 'text-error-700 focus:text-error-700 [&_svg]:text-error-600')} onSelect={() => onDelete(job)}>
              <Trash2 aria-hidden="true" /> Remove from tracker…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {(place || job.salary) && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-secondary">
          {place && <li className="flex min-w-0 items-center gap-1 break-words"><MapPin className="size-3.5 shrink-0" aria-hidden="true" />{place}</li>}
          {job.salary && <li className="flex min-w-0 items-center gap-1 break-words"><Briefcase className="size-3.5 shrink-0" aria-hidden="true" />{job.salary}</li>}
        </ul>
      )}

      {(progress || deadline) && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          {progress && <time dateTime={progress.dateTime}>{progress.label}</time>}
          {deadline && (
            <span className={cn(deadline.passed && 'font-medium text-warning-700')}>
              <time dateTime={deadline.dateTime}>{deadline.label}</time>{deadline.passed && ' (date passed)'}
            </span>
          )}
        </p>
      )}

      {interview && (
        <div className="mt-3 rounded-lg border border-warning-100 bg-warning-50 px-3 py-2 text-xs text-warning-700">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-medium">
            <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
            <span>Interview</span>
            {interview.upcoming && <span className="rounded-full bg-warning-100 px-1.5 py-0.5 text-[11px] font-semibold">Upcoming</span>}
          </p>
          <p className="mt-1 break-words">
            {interviewKind && <span>{interviewKind} · </span>}
            <time dateTime={interview.dateTime}>{interview.label}</time>
          </p>
          {job.interviewLink && (
            <a href={job.interviewLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-4 hover:underline">
              <Video className="size-3.5" aria-hidden="true" /> Join the meeting<span className="sr-only"> for {job.title} at {job.company} (opens in a new tab)</span>
            </a>
          )}
        </div>
      )}

      {(job.contactPerson || job.contactEmail) && (
        <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-ink-secondary">
          <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
          <span>Contact:</span>
          {job.contactPerson && <span className="break-words">{job.contactPerson}</span>}
          {job.contactEmail && <a href={`mailto:${job.contactEmail}`} className="break-all text-brand-700 underline-offset-4 hover:underline">{job.contactEmail}</a>}
        </p>
      )}

      {job.notes && (
        <details className="group mt-2 text-xs">
          <summary className="cursor-pointer select-none font-medium text-ink-secondary hover:text-ink">Notes</summary>
          <p className="mt-1 whitespace-pre-line break-words text-ink">{job.notes}</p>
        </details>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <label htmlFor={stageSelectId(job)} className="shrink-0 text-xs font-medium text-ink-muted">
          Stage<span className="sr-only"> for {job.title} at {job.company}</span>
        </label>
        <select
          id={stageSelectId(job)}
          value={job.status}
          aria-busy={moving || undefined}
          onChange={(event) => onMove(job, event.target.value as TrackerStatus)}
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
        >
          {TRACKER_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
        </select>
        {next && (
          <Button
            id={advanceButtonId(job)}
            type="button"
            variant="outline"
            size="icon-sm"
            className="shrink-0 aria-disabled:cursor-wait aria-disabled:opacity-60"
            onClick={() => onMove(job, next.id, 'advance')}
            aria-disabled={moving || undefined}
            aria-label={`Move to ${next.label}: ${job.title} at ${job.company}`}
            title={`Move to ${next.label}`}
          >
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </article>
  );
}
