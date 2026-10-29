/** Tracker card with native pointer drag affordance and equivalent keyboard controls. */
import type { DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, CalendarClock, Download, ExternalLink, GripVertical, MapPin, MoreVertical, Pencil, Trash2, UserRound, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { nextStage, stageLabel, TRACKER_STAGES, type TrackedJob, type TrackerStatus } from '@/lib/job-tracker';
import { deadlineInfo, interviewCalendarFile, interviewInfo, progressDate } from '@/lib/job-tracker-display';

export const actionsTriggerId = (job: Pick<TrackedJob, 'id'>) => `tracker-actions-${job.id}`;
export const stageSelectId = (job: Pick<TrackedJob, 'id'>) => `tracker-stage-${job.id}`;
export const advanceButtonId = (job: Pick<TrackedJob, 'id'>) => `tracker-advance-${job.id}`;
export const dragHandleId = (job: Pick<TrackedJob, 'id'>) => `tracker-drag-${job.id}`;
export function coverLetterHref(job: TrackedJob): string {
  return `/dashboard/cover-letters?${new URLSearchParams({ role: job.title, company: job.company }).toString()}`;
}
const itemClass = 'gap-2 px-2.5 py-2 text-sm text-ink focus:bg-neutral-100 focus:text-ink data-[highlighted]:bg-neutral-100 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted';
interface TrackerEntryProps {
  job: TrackedJob;
  moving: boolean;
  onMove: (job: TrackedJob, status: TrackerStatus, via?: 'stage' | 'advance') => void;
  onEdit: (job: TrackedJob, focus?: 'interview') => void;
  onDelete: (job: TrackedJob) => void;
  onExportInterview: (job: TrackedJob) => void;
  onDragStart?: (job: TrackedJob, event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
}
export function TrackerEntry({ job, moving, onMove, onEdit, onDelete, onExportInterview, onDragStart, onDragEnd, dragging }: TrackerEntryProps) {
  const titleId = `tracker-job-${job.id}-title`;
  const progress = progressDate(job), deadline = deadlineInfo(job), interview = interviewInfo(job);
  const calendar = interviewCalendarFile(job);
  const place = [job.location, job.workMode].filter((value, index, all) => value && all.findIndex((other) => other.toLocaleLowerCase() === value.toLocaleLowerCase()) === index).join(' · ');
  const interviewKind = [job.interviewRound, job.interviewFormat].filter(Boolean).join(' · ');
  const next = nextStage(job.status);
  const name = `${job.title} at ${job.company}`;
  return (
    <article aria-labelledby={titleId} data-tracker-id={job.id} data-stage={job.status}
      className={cn('min-w-0 rounded-xl border border-border bg-surface p-4 shadow-xs', dragging && 'opacity-60 ring-2 ring-brand-500')}>
      <div className="flex items-start gap-2">
        {onDragStart && <button type="button" id={dragHandleId(job)} draggable={!moving} disabled={moving}
          aria-label={`Drag ${name} to another stage; or use the Stage selector`} title="Drag to another stage. Keyboard: use Stage or Advance."
          onDragStart={(event) => onDragStart(job, event)} onDragEnd={onDragEnd}
          className="-ml-2 mt-0.5 shrink-0 cursor-grab rounded p-1 text-ink-muted hover:bg-canvas-soft focus-visible:outline-2 focus-visible:outline-brand-500 active:cursor-grabbing disabled:cursor-wait">
          <GripVertical className="size-4" aria-hidden="true" />
        </button>}
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="break-words text-sm font-semibold leading-snug text-ink">{job.title}</h3>
          <p className="mt-0.5 break-words text-sm text-ink-secondary">{job.company}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button id={actionsTriggerId(job)} variant="ghost" size="icon-sm" disabled={moving} className="-mr-1 -mt-1 shrink-0" aria-label={`Actions for ${name}`}>
              <MoreVertical aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem className={itemClass} onSelect={() => onEdit(job)}><Pencil aria-hidden="true" /> Edit details</DropdownMenuItem>
            <DropdownMenuItem className={itemClass} onSelect={() => onEdit(job, 'interview')}><CalendarClock aria-hidden="true" /> {job.interviewAt ? 'Change interview' : 'Schedule interview'}</DropdownMenuItem>
            <DropdownMenuItem className={itemClass} disabled={!calendar} onSelect={() => onExportInterview(job)}><Download aria-hidden="true" /> Download calendar (.ics)</DropdownMenuItem>
            <DropdownMenuItem className={itemClass} asChild><Link to={coverLetterHref(job)}>Write a cover letter</Link></DropdownMenuItem>
            {job.url && <DropdownMenuItem className={itemClass} asChild><a href={job.url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" /> Open job posting<span className="sr-only"> (opens in a new tab)</span></a></DropdownMenuItem>}
            <DropdownMenuSeparator className="my-1 h-px bg-border" />
            <DropdownMenuItem className={cn(itemClass, 'text-error-700 focus:text-error-700')} onSelect={() => onDelete(job)}><Trash2 aria-hidden="true" /> Remove from tracker…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {(place || job.salary) && <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-secondary">
        {place && <li className="flex min-w-0 items-center gap-1 break-words"><MapPin className="size-3.5 shrink-0" aria-hidden="true" />{place}</li>}
        {job.salary && <li className="flex min-w-0 items-center gap-1 break-words"><Briefcase className="size-3.5 shrink-0" aria-hidden="true" />{job.salary}</li>}
      </ul>}
      {(progress || deadline) && <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
        {progress && <time dateTime={progress.dateTime}>{progress.label}</time>}
        {deadline && <span className={cn(deadline.passed && 'font-medium text-warning-700')}><time dateTime={deadline.dateTime}>{deadline.label}</time>{deadline.passed && ' (date passed)'}</span>}
      </p>}
      {interview && <div className="mt-3 rounded-lg border border-warning-100 bg-warning-50 px-3 py-2 text-xs text-warning-700">
        <p className="flex flex-wrap items-center gap-1.5 font-medium"><CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />Interview{interview.upcoming && <span className="rounded-full bg-warning-100 px-1.5 py-0.5 text-[11px] font-semibold">Upcoming</span>}</p>
        <p className="mt-1 break-words">{interviewKind && <span>{interviewKind} · </span>}<time dateTime={interview.dateTime}>{interview.label}</time></p>
        {job.interviewLink && <a href={job.interviewLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-4 hover:underline"><Video className="size-3.5" aria-hidden="true" />Join meeting<span className="sr-only"> for {name} (opens in a new tab)</span></a>}
        <Button type="button" variant="outline" size="xs" className="mt-2" disabled={!calendar || moving} onClick={() => onExportInterview(job)} aria-label={`Download interview calendar for ${name}`}><Download aria-hidden="true" /> Calendar (.ics)</Button>
      </div>}
      {(job.contactPerson || job.contactEmail) && <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-ink-secondary">
        <UserRound className="size-3.5 shrink-0" aria-hidden="true" /><span>Contact:</span>
        {job.contactPerson && <span className="break-words">{job.contactPerson}</span>}
        {job.contactEmail && <a href={`mailto:${job.contactEmail}`} className="break-all text-brand-700 underline-offset-4 hover:underline">{job.contactEmail}</a>}
      </p>}
      {job.notes && <details className="group mt-2 text-xs"><summary className="cursor-pointer select-none font-medium text-ink-secondary hover:text-ink">Notes</summary><p className="mt-1 whitespace-pre-line break-words text-ink">{job.notes}</p></details>}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <label htmlFor={stageSelectId(job)} className="shrink-0 text-xs font-medium text-ink-muted">Stage<span className="sr-only"> for {name}</span></label>
        <select id={stageSelectId(job)} value={job.status} disabled={moving} aria-busy={moving || undefined}
          onChange={(event) => onMove(job, event.target.value as TrackerStatus)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 disabled:cursor-wait">
          {TRACKER_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
        </select>
        <Button id={advanceButtonId(job)} type="button" variant="outline" size="sm" className="shrink-0"
          disabled={moving || !next} onClick={() => { if (next) onMove(job, next, 'advance'); }}
          aria-label={next ? `Advance ${name} to ${stageLabel(next)}` : `No next stage for ${name}`}
          title={next ? `Advance to ${stageLabel(next)}` : 'Terminal stage: use Stage to make an explicit change'}>
          <ArrowRight aria-hidden="true" /> Advance
        </Button>
      </div>
    </article>
  );
}
