import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  BOOKED_SLOT_DELETE_TOOLTIP,
  type InterviewDurationMinutes,
  type InterviewSlot,
  SLOT_BOOKING_CONFLICT_MESSAGE,
  SUPPORTED_INTERVIEW_DURATIONS,
  bookEmployerInterviewSlot,
  computeSlotEndTime,
  deleteEmployerInterviewSlot,
  fetchEmployerInterviewSlots,
  formatSlotDateLabel,
  getTodayLocalIsoDate,
  isSlotConflictError,
  isSlotTimeoutError,
  normalizeError,
  validateInterviewSlotInput,
} from '@/lib/employer-interviews';

function localTimeToUtcIso(date: string, time: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !timeMatch) throw new Error('Enter a valid local date and time.');
  const [year, month, day, hour, minute] = [...match.slice(1), ...timeMatch.slice(1)].map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let candidate = desiredUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    candidate += desiredUtc - renderedAsUtc;
  }
  const result = new Date(candidate);
  const parts = Object.fromEntries(formatter.formatToParts(result).map((part) => [part.type, part.value]));
  if (Number(parts.year) !== year || Number(parts.month) !== month || Number(parts.day) !== day || Number(parts.hour) !== hour || Number(parts.minute) !== minute) {
    throw new Error('That local time does not exist in the selected time zone because of a daylight-saving transition.');
  }
  return result.toISOString();
}

export interface EmployerInterviewSlotPanelProps {
  applicationId?: string | null;
  candidateName?: string | null;
  onBookingConfirmed?: (slot: InterviewSlot | null) => void;
}

export function EmployerInterviewSlotPanel({
  applicationId = null,
  candidateName = null,
  onBookingConfirmed,
}: EmployerInterviewSlotPanelProps) {
  const dateFieldId = useId();
  const startFieldId = useId();
  const durationFieldId = useId();
  const endFieldId = useId();
  const bookedDeleteHintId = useId();

  const localTimezone = useMemo(() => 'UTC', []);

  // Slot list state (`GET /api/employer/interviews/slots`)
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create slot form state (`POST /api/employer/interviews/slots`)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [slotDate, setSlotDate] = useState(() => getTodayLocalIsoDate());
  const [slotStart, setSlotStart] = useState('10:00');
  const [slotDuration, setSlotDuration] = useState<InterviewDurationMinutes>(30);
  const [slotEnd, setSlotEnd] = useState('10:30');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Delete slot state (`DELETE /api/employer/interviews/slots/:id`)
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<InterviewSlot | null>(null);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);

  // Candidate booking state (`POST /api/employer/interviews/slots/:id/book`)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [bookingInFlight, setBookingInFlight] = useState(false);
  const [calendarDownloadId, setCalendarDownloadId] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const loadSlots = useCallback(async (): Promise<InterviewSlot[] | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchEmployerInterviewSlots(controller.signal);
      if (controller.signal.aborted) return null;
      setSlots(list);
      setHasLoadedOnce(true);
      return list;
    } catch (err) {
      if (controller.signal.aborted) return null;
      setLoadError(normalizeError(err).message);
      return null;
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSlots();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadSlots]);

  // Keep selectedSlotId pointing only at an available slot
  useEffect(() => {
    if (!selectedSlotId) return;
    const match = slots.find((s) => s.id === selectedSlotId);
    if (!match || match.isBooked) {
      setSelectedSlotId(null);
    }
  }, [slots, selectedSlotId]);

  const handleStartChange = (nextStart: string) => {
    setSlotStart(nextStart);
    setCreateError(null);
    const computedEnd = computeSlotEndTime(nextStart, slotDuration);
    if (computedEnd) {
      setSlotEnd(computedEnd);
    }
  };

  const handleDurationChange = (nextDuration: InterviewDurationMinutes) => {
    setSlotDuration(nextDuration);
    setCreateError(null);
    const computedEnd = computeSlotEndTime(slotStart, nextDuration);
    if (computedEnd) {
      setSlotEnd(computedEnd);
    }
  };

  const handleCreateSlot = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating) return;

    const validationError = validateInterviewSlotInput({
      date: slotDate,
      startTime: slotStart,
      endTime: slotEnd,
      duration: slotDuration,
      timezone: localTimezone,
    });
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setCreating(true);
    setCreateError(null);
    setActionBanner(null);

    try {
      const zonedStart = localTimeToUtcIso(slotDate, slotStart, localTimezone);
      const zonedEnd = localTimeToUtcIso(slotDate, slotEnd, localTimezone);
      const created = await apiClient.post<{ success: boolean; slot: unknown }>('/employer/interviews/slots', {
        startTime: zonedStart,
        endTime: zonedEnd,
        durationMinutes: slotDuration,
      });
      if (!created.data?.success || !created.data.slot) throw new Error('The server did not confirm slot creation.');
      setShowCreateForm(false);
      setActionBanner({
        tone: 'success',
        text: `Created ${slotDuration}-minute interview slot on ${formatSlotDateLabel(slotDate)} (${slotStart}–${slotEnd} ${localTimezone}).`,
      });
      await loadSlots();
    } catch (err) {
      setCreateError(normalizeError(err).message);
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteSlot || deletingSlotId) return;
    const target = confirmDeleteSlot;
    setDeletingSlotId(target.id);
    setActionBanner(null);

    try {
      await deleteEmployerInterviewSlot(target.id);
      setConfirmDeleteSlot(null);
      setActionBanner({
        tone: 'success',
        text: `Removed unbooked slot on ${formatSlotDateLabel(target.date)} (${target.startTime}–${target.endTime}).`,
      });
      await loadSlots();
    } catch (err) {
      const normalized = normalizeError(err);
      setConfirmDeleteSlot(null);
      if (isSlotConflictError(normalized)) {
        setActionBanner({
          tone: 'error',
          text: BOOKED_SLOT_DELETE_TOOLTIP,
        });
        await loadSlots();
      } else {
        setActionBanner({
          tone: 'error',
          text: normalized.message,
        });
      }
    } finally {
      setDeletingSlotId(null);
    }
  };

  const handleBookSelectedSlot = async () => {
    if (!applicationId || !selectedSlotId || bookingInFlight) return;
    const targetSlotId = selectedSlotId;
    setBookingInFlight(true);
    setActionBanner(null);

    try {
      const result = await bookEmployerInterviewSlot(targetSlotId, applicationId);
      setSelectedSlotId(null);
      setActionBanner({
        tone: 'success',
        text: result.confirmationMessage,
      });
      const refreshed = await loadSlots();
      const confirmedSlot =
        result.slot ?? refreshed?.find((s) => s.id === targetSlotId) ?? null;
      onBookingConfirmed?.(confirmedSlot);
    } catch (err) {
      const normalized = normalizeError(err);
      if (isSlotConflictError(normalized)) {
        setSelectedSlotId(null);
        setActionBanner({
          tone: 'error',
          text: SLOT_BOOKING_CONFLICT_MESSAGE,
        });
        await loadSlots();
      } else if (isSlotTimeoutError(normalized)) {
        // Refresh slot state first before retry so we never blindly duplicate a completed booking.
        const refreshed = await loadSlots();
        const bookedForCandidate = refreshed?.find(
          (s) => s.id === targetSlotId && s.bookedApplicationId === applicationId,
        );
        if (bookedForCandidate) {
          setSelectedSlotId(null);
          setActionBanner({
            tone: 'success',
            text: 'Interview scheduled (confirmed after refreshing slot state).',
          });
          onBookingConfirmed?.(bookedForCandidate);
        } else {
          setActionBanner({
            tone: 'warning',
            text: 'Booking request timed out. Slot availability has been refreshed—please review the updated list before retrying.',
          });
        }
      } else {
        setActionBanner({
          tone: 'error',
          text: normalized.message,
        });
      }
    } finally {
      setBookingInFlight(false);
    }
  };

  const downloadCalendar = async (slot: InterviewSlot) => {
    setCalendarDownloadId(slot.id);
    setActionBanner(null);
    try {
      const response = await apiClient.get(`/employer/interviews/slots/${encodeURIComponent(slot.id)}/calendar`, { responseType: 'blob' });
      const contentType = String(response.headers['content-type'] || '');
      if (!contentType.toLowerCase().includes('text/calendar')) throw new Error('The server returned an invalid calendar content type.');
      const blob = new Blob([response.data], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `interview-${slot.id}.ics`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setActionBanner({ tone: 'error', text: normalizeError(error).message || 'Calendar invite could not be downloaded.' });
    } finally {
      setCalendarDownloadId(null);
    }
  };

  const candidateBookedSlot = useMemo(() => {
    if (!applicationId) return null;
    return slots.find((s) => s.isBooked && s.bookedApplicationId === applicationId) ?? null;
  }, [slots, applicationId]);

  const hasAnyBookedSlots = useMemo(() => slots.some((s) => s.isBooked), [slots]);

  return (
    <section
      aria-label="Interview Slot Scheduling"
      className="rounded-2xl border border-edge bg-surface p-4 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink">
            <Calendar className="size-4 text-accent shrink-0" aria-hidden="true" />
            <span>
              {applicationId
                ? 'Interview Slot Booking & Availability'
                : 'Employer Interview Slot Manager'}
            </span>
          </h4>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Times shown with explicit zone ({localTimezone}).
            {candidateName ? ` Booking for ${candidateName}.` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={() => void loadSlots()}
            disabled={loading || bookingInFlight}
            aria-busy={loading}
          >
            <RefreshCw className={cn('size-3', loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showCreateForm ? 'secondary' : 'outline'}
            className="h-7 px-2.5 text-xs"
            onClick={() => {
              setCreateError(null);
              setShowCreateForm((prev) => !prev);
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {showCreateForm ? 'Close Form' : 'New Slot'}
          </Button>
        </div>
      </div>

      {/* Feedback Banner */}
      {actionBanner && (
        <div
          role={actionBanner.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={cn(
            'flex items-start justify-between gap-2 rounded-xl border p-3 text-xs font-medium',
            actionBanner.tone === 'success' &&
              'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
            actionBanner.tone === 'warning' &&
              'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
            actionBanner.tone === 'error' &&
              'border-error-200 bg-error-50 text-error-800 dark:border-error-900 dark:bg-error-950/50 dark:text-error-200',
          )}
        >
          <div className="flex items-start gap-2">
            {actionBanner.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{actionBanner.text}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => setActionBanner(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Existing Confirmed Booking Summary for Current Candidate */}
      {candidateBookedSlot && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Booked Slot: {formatSlotDateLabel(candidateBookedSlot.date)} ·{' '}
              {candidateBookedSlot.startTime}–{candidateBookedSlot.endTime} (
              {candidateBookedSlot.timezone})
            </span>
          </p>
        </div>
      )}

      {/* Create New Availability Slot Form */}
      {showCreateForm && (
        <form
          onSubmit={(e) => void handleCreateSlot(e)}
          noValidate
          className="space-y-3 rounded-xl border border-border bg-neutral-50/70 p-3.5 text-xs dark:bg-neutral-900/50"
        >
          <p className="font-semibold text-ink">Create Availability Slot</p>

          {createError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-error-200 bg-error-50 p-2.5 text-xs text-error-800"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{createError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={dateFieldId} className="mb-1 block font-medium text-ink">
                Date
              </label>
              <Input
                id={dateFieldId}
                type="date"
                min={getTodayLocalIsoDate()}
                value={slotDate}
                onChange={(e) => {
                  setSlotDate(e.target.value);
                  if (createError) setCreateError(null);
                }}
                disabled={creating}
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label htmlFor={durationFieldId} className="mb-1 block font-medium text-ink">
                Duration
              </label>
              <select
                id={durationFieldId}
                value={slotDuration}
                onChange={(e) =>
                  handleDurationChange(Number(e.target.value) as InterviewDurationMinutes)
                }
                disabled={creating}
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-xs text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                {SUPPORTED_INTERVIEW_DURATIONS.map((mins) => (
                  <option key={mins} value={mins}>
                    {mins} minutes ({mins}m)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={startFieldId} className="mb-1 block font-medium text-ink">
                Start Time ({localTimezone})
              </label>
              <Input
                id={startFieldId}
                type="time"
                value={slotStart}
                onChange={(e) => handleStartChange(e.target.value)}
                disabled={creating}
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label htmlFor={endFieldId} className="mb-1 block font-medium text-ink">
                End Time ({localTimezone})
              </label>
              <Input
                id={endFieldId}
                type="time"
                value={slotEnd}
                onChange={(e) => {
                  setSlotEnd(e.target.value);
                  if (createError) setCreateError(null);
                }}
                disabled={creating}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowCreateForm(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating} aria-busy={creating}>
              {creating ? 'Creating Slot…' : 'Save Availability Slot'}
            </Button>
          </div>
        </form>
      )}

      {/* Recoverable refresh failure */}
      {loadError && hasLoadedOnce && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-error-200 bg-error-50 p-3 text-xs text-error-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>Could not refresh interview slots: {loadError}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadSlots()}>
            Retry
          </Button>
        </div>
      )}

      {/* Chronological Slot List */}
      {loading && !hasLoadedOnce ? (
        <div className="space-y-2" role="status" aria-label="Loading interview slots">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : loadError && !hasLoadedOnce ? (
        <div
          role="alert"
          className="rounded-xl border border-error-200 bg-error-50 p-4 text-xs text-error-800 space-y-2.5"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Unable to load interview slots</p>
              <p className="mt-0.5">{loadError}</p>
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadSlots()}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs">
          <Clock className="mx-auto size-6 text-ink-muted" aria-hidden="true" />
          <p className="mt-1.5 font-semibold text-ink">No interview slots scheduled yet</p>
          <p className="mt-0.5 text-ink-muted">
            Add availability slots (15m, 30m, 45m, or 60m) to book candidate interviews.
          </p>
          {!showCreateForm && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Create First Slot
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {hasAnyBookedSlots && (
            <p id={bookedDeleteHintId} className="sr-only">
              {BOOKED_SLOT_DELETE_TOOLTIP}
            </p>
          )}

          <ul className="space-y-2" aria-label="Employer interview slots">
            {slots.map((slot) => {
              const isSelected = selectedSlotId === slot.id;
              const canSelectForBooking = Boolean(applicationId) && !slot.isBooked && slot.sortEpochMs > Date.now();

              return (
                <li
                  key={slot.id}
                  className={cn(
                    'flex flex-col gap-2.5 rounded-xl border p-3 text-xs sm:flex-row sm:items-center sm:justify-between transition-colors',
                    isSelected
                      ? 'border-brand-600 bg-brand-50/70 dark:bg-brand-950/30'
                      : slot.isBooked
                        ? 'border-border bg-neutral-50/80 dark:bg-neutral-900/40'
                        : 'border-border bg-surface hover:border-brand-400',
                  )}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {canSelectForBooking && (
                      <input
                        type="radio"
                        name={`select-interview-slot-${applicationId}`}
                        checked={isSelected}
                        disabled={bookingInFlight}
                        onChange={() => setSelectedSlotId(slot.id)}
                        aria-label={`Select slot on ${formatSlotDateLabel(slot.date)} from ${slot.startTime} to ${slot.endTime} ${slot.timezone}`}
                        className="mt-1 size-4 shrink-0 accent-brand-600"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-ink">
                          {formatSlotDateLabel(slot.date)} · {slot.startTime}–{slot.endTime}
                        </span>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted dark:bg-neutral-800">
                          {slot.durationMinutes}m · {slot.timezone}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {slot.isBooked ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                            <Lock className="size-3 shrink-0" aria-hidden="true" />
                            <span>
                              Booked
                              {slot.bookedCandidateName ? ` (${slot.bookedCandidateName})` : ''}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                            <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
                            <span>Available</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 shrink-0">
                    {slot.isBooked && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={calendarDownloadId === slot.id} aria-busy={calendarDownloadId === slot.id} onClick={() => void downloadCalendar(slot)}>{calendarDownloadId === slot.id ? 'Preparing…' : 'Calendar invite'}</Button>}
                    {canSelectForBooking && !isSelected && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        disabled={bookingInFlight}
                        onClick={() => setSelectedSlotId(slot.id)}
                      >
                        Select
                      </Button>
                    )}

                    {/* Booked slots cannot be deleted — disabled with required tooltip */}
                    <span
                      title={slot.isBooked ? BOOKED_SLOT_DELETE_TOOLTIP : 'Delete unbooked slot'}
                      className="inline-flex"
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={slot.isBooked || Boolean(deletingSlotId) || bookingInFlight}
                        aria-describedby={slot.isBooked ? bookedDeleteHintId : undefined}
                        aria-label={
                          slot.isBooked
                            ? `Delete slot ${formatSlotDateLabel(slot.date)} ${slot.startTime} (${BOOKED_SLOT_DELETE_TOOLTIP})`
                            : `Delete slot on ${formatSlotDateLabel(slot.date)} at ${slot.startTime}`
                        }
                        onClick={() => setConfirmDeleteSlot(slot)}
                        className="h-7 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:text-ink-muted"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Confirm Candidate Booking Action */}
          {applicationId && (
            <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[11px] text-ink-muted">
                {selectedSlotId
                  ? 'Confirm to reserve this interview slot for the candidate.'
                  : 'Select an available slot above to schedule this candidate.'}
              </span>
              <Button
                type="button"
                size="sm"
                disabled={!selectedSlotId || bookingInFlight}
                aria-busy={bookingInFlight}
                onClick={() => void handleBookSelectedSlot()}
              >
                {bookingInFlight ? 'Booking Interview…' : 'Confirm Interview Booking'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Delete Unbooked Slot Confirmation Dialog */}
      <Dialog
        open={Boolean(confirmDeleteSlot)}
        onOpenChange={(open) => {
          if (!open && !deletingSlotId) setConfirmDeleteSlot(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-ink">
              Delete Interview Slot?
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              {confirmDeleteSlot
                ? `Remove the unbooked ${confirmDeleteSlot.durationMinutes}-minute slot on ${formatSlotDateLabel(confirmDeleteSlot.date)} (${confirmDeleteSlot.startTime}–${confirmDeleteSlot.endTime} ${confirmDeleteSlot.timezone})?`
                : 'Remove this unbooked interview slot?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={Boolean(deletingSlotId)}
              onClick={() => setConfirmDeleteSlot(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={Boolean(deletingSlotId)}
              aria-busy={Boolean(deletingSlotId)}
              onClick={() => void handleConfirmDelete()}
            >
              {deletingSlotId ? 'Deleting…' : 'Delete Slot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export interface EmployerInterviewSlotManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmployerInterviewSlotManagerDialog({
  open,
  onOpenChange,
}: EmployerInterviewSlotManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-ink">
            <Calendar className="size-5 text-brand-600 shrink-0" aria-hidden="true" />
            <span>Manage Employer Interview Slots</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-muted">
            Create interview availability windows (15m, 30m, 45m, or 60m) and manage unbooked slots. Open any applicant in the Candidate Review Drawer to book them into an available slot.
          </DialogDescription>
        </DialogHeader>

        {open && <EmployerInterviewSlotPanel />}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
