import { apiClient, normalizeError, type ApiError } from '@/lib/api-client';

export const SUPPORTED_INTERVIEW_DURATIONS = [15, 30, 45, 60] as const;
export type InterviewDurationMinutes = (typeof SUPPORTED_INTERVIEW_DURATIONS)[number];

export interface InterviewSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startIso: string | null;
  endIso: string | null;
  durationMinutes: number;
  timezone: string;
  status: 'AVAILABLE' | 'BOOKED';
  isBooked: boolean;
  bookedApplicationId: string | null;
  bookedCandidateName: string | null;
  sortEpochMs: number;
}

export interface CreateInterviewSlotInput {
  date: string;
  startTime: string;
  endTime: string;
  duration: InterviewDurationMinutes;
  timezone?: string;
}

export interface BookInterviewSlotResult {
  slot: InterviewSlot | null;
  applicationId: string;
  notificationState: 'SENT' | 'QUEUED' | 'NONE';
  confirmationMessage: string;
}

export const BOOKED_SLOT_DELETE_TOOLTIP = 'Cannot delete an already booked interview.';
export const SLOT_BOOKING_CONFLICT_MESSAGE =
  'This slot was just booked by another candidate. Please select another time.';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asCleanString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function resolveLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getTodayLocalIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseHhMmToMinutes(hhMm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhMm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function computeSlotEndTime(
  startTime: string,
  duration: InterviewDurationMinutes,
): string | null {
  const startMinutes = parseHhMmToMinutes(startTime);
  if (startMinutes === null) return null;
  const totalEnd = startMinutes + duration;
  if (totalEnd >= 24 * 60) return null;
  const endHours = Math.floor(totalEnd / 60);
  const endMins = totalEnd % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
}

export function validateInterviewSlotInput(
  input: CreateInterviewSlotInput,
  referenceToday = getTodayLocalIsoDate(),
): string | null {
  const dateTrimmed = input.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTrimmed)) {
    return 'Select a valid interview date (YYYY-MM-DD).';
  }
  if (dateTrimmed < referenceToday) {
    return 'Interview slots cannot be created on past dates.';
  }

  if (!(SUPPORTED_INTERVIEW_DURATIONS as readonly number[]).includes(input.duration)) {
    return 'Select a supported slot duration: 15, 30, 45, or 60 minutes.';
  }

  const startMins = parseHhMmToMinutes(input.startTime);
  if (startMins === null) {
    return 'Enter a valid start time (HH:MM).';
  }

  const endMins = parseHhMmToMinutes(input.endTime);
  if (endMins === null) {
    return 'Enter a valid end time (HH:MM).';
  }

  if (endMins <= startMins) {
    return 'End time must be after the start time.';
  }

  const diff = endMins - startMins;
  if (diff !== input.duration) {
    return `End time must match the selected ${input.duration}-minute duration (${computeSlotEndTime(input.startTime, input.duration) ?? 'within the same day'}).`;
  }

  return null;
}

export function formatSlotDateLabel(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return dateStr;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIdx < 0 || monthIdx > 11) return dateStr;
  return `${String(day).padStart(2, '0')} ${MONTHS_SHORT[monthIdx]} ${year}`;
}

function extractDateAndTime(
  rawDate: string | null,
  rawStart: string | null,
  rawEnd: string | null,
): {
  date: string;
  startTime: string;
  endTime: string;
  startIso: string | null;
  endIso: string | null;
  derivedDuration: number | null;
  sortEpochMs: number;
} {
  let date = rawDate ?? '';
  let startTime = rawStart ?? '';
  let endTime = rawEnd ?? '';
  let startIso: string | null = null;
  let endIso: string | null = null;

  if (rawStart && rawStart.includes('T')) {
    const parsedStart = new Date(rawStart);
    if (!Number.isNaN(parsedStart.getTime())) {
      startIso = parsedStart.toISOString();
      if (!date) date = startIso.slice(0, 10);
      startTime = startIso.slice(11, 16);
    }
  } else if (rawStart && /^\d{2}:\d{2}:\d{2}$/.test(rawStart)) {
    startTime = rawStart.slice(0, 5);
  }

  if (rawEnd && rawEnd.includes('T')) {
    const parsedEnd = new Date(rawEnd);
    if (!Number.isNaN(parsedEnd.getTime())) {
      endIso = parsedEnd.toISOString();
      endTime = endIso.slice(11, 16);
    }
  } else if (rawEnd && /^\d{2}:\d{2}:\d{2}$/.test(rawEnd)) {
    endTime = rawEnd.slice(0, 5);
  }

  const startMins = parseHhMmToMinutes(startTime);
  const endMins = parseHhMmToMinutes(endTime);
  const derivedDuration =
    startMins !== null && endMins !== null && endMins > startMins ? endMins - startMins : null;

  let sortEpochMs = 0;
  if (startIso) {
    sortEpochMs = Date.parse(startIso) || 0;
  } else if (date && startTime) {
    sortEpochMs = Date.parse(`${date}T${startTime}:00Z`) || 0;
  }

  return {
    date,
    startTime,
    endTime,
    startIso,
    endIso,
    derivedDuration,
    sortEpochMs,
  };
}

export function normalizeInterviewSlot(raw: unknown): InterviewSlot | null {
  if (!isRecord(raw)) return null;
  const id = asCleanString(raw.id ?? raw.slotId ?? raw.slot_id);
  if (!id) return null;

  const rawDate = asCleanString(raw.date ?? raw.slotDate ?? raw.slot_date);
  const rawStart = asCleanString(raw.startTime ?? raw.start_time ?? raw.startsAt ?? raw.starts_at);
  const rawEnd = asCleanString(raw.endTime ?? raw.end_time ?? raw.endsAt ?? raw.ends_at);

  const extracted = extractDateAndTime(rawDate, rawStart, rawEnd);
  if (!extracted.date || !extracted.startTime) return null;

  const explicitDuration = asPositiveNumber(
    raw.duration ?? raw.durationMinutes ?? raw.duration_minutes,
  );
  const durationMinutes = explicitDuration ?? extracted.derivedDuration ?? 30;
  const endTime =
    extracted.endTime ||
    computeSlotEndTime(
      extracted.startTime,
      (SUPPORTED_INTERVIEW_DURATIONS.includes(durationMinutes as InterviewDurationMinutes)
        ? durationMinutes
        : 30) as InterviewDurationMinutes,
    ) ||
    extracted.startTime;

  const bookedApplicationId = asCleanString(
    raw.bookedApplicationId ??
      raw.booked_application_id ??
      raw.applicationId ??
      raw.application_id,
  );
  const rawStatus = (asCleanString(raw.status) ?? '').toUpperCase();
  const isBooked =
    raw.isBooked === true ||
    raw.is_booked === true ||
    raw.booked === true ||
    rawStatus === 'BOOKED' ||
    Boolean(bookedApplicationId);

  return {
    id,
    date: extracted.date,
    startTime: extracted.startTime,
    endTime,
    startIso: extracted.startIso,
    endIso: extracted.endIso,
    durationMinutes,
    timezone: asCleanString(raw.timezone ?? raw.timeZone ?? raw.tz) ?? resolveLocalTimezone(),
    status: isBooked ? 'BOOKED' : 'AVAILABLE',
    isBooked,
    bookedApplicationId,
    bookedCandidateName: asCleanString(
      raw.bookedCandidateName ?? raw.candidateName ?? raw.applicantName,
    ),
    sortEpochMs: extracted.sortEpochMs,
  };
}

export async function fetchEmployerInterviewSlots(
  signal?: AbortSignal,
): Promise<InterviewSlot[]> {
  const response = await apiClient.get<unknown>('/employer/interviews/slots', { signal });
  const data = response.data;
  const rawList = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.slots)
      ? data.slots
      : isRecord(data) && Array.isArray(data.items)
        ? data.items
        : isRecord(data) && Array.isArray(data.data)
          ? data.data
          : null;

  if (!rawList) {
    throw new Error('Unexpected interview slots response from server.');
  }

  return rawList
    .map(normalizeInterviewSlot)
    .filter((slot): slot is InterviewSlot => slot !== null)
    .sort((a, b) => a.sortEpochMs - b.sortEpochMs);
}

export async function createEmployerInterviewSlot(
  input: CreateInterviewSlotInput,
): Promise<InterviewSlot | null> {
  const validationError = validateInterviewSlotInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const timezone = input.timezone || resolveLocalTimezone();
  const response = await apiClient.post<unknown>('/employer/interviews/slots', {
    date: input.date.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    duration: input.duration,
    durationMinutes: input.duration,
    timezone,
  });

  if (isRecord(response.data)) {
    const candidate = response.data.slot ?? response.data;
    return normalizeInterviewSlot(candidate);
  }
  return null;
}

export async function deleteEmployerInterviewSlot(slotId: string): Promise<void> {
  await apiClient.delete(`/employer/interviews/slots/${encodeURIComponent(slotId)}`);
}

export async function bookEmployerInterviewSlot(
  slotId: string,
  applicationId: string,
): Promise<BookInterviewSlotResult> {
  const cleanAppId = applicationId.trim();
  if (!cleanAppId) {
    throw new Error('A valid candidate application ID is required to book an interview slot.');
  }

  const response = await apiClient.post<unknown>(
    `/employer/interviews/slots/${encodeURIComponent(slotId)}/book`,
    { applicationId: cleanAppId },
  );

  const payload = isRecord(response.data) ? response.data : {};
  const slotObj = normalizeInterviewSlot(payload.slot ?? payload);

  const rawDispatch = String(
    payload.notificationStatus ??
      payload.calendarInviteStatus ??
      payload.invitationStatus ??
      payload.emailStatus ??
      payload.outboxState ??
      '',
  )
    .trim()
    .toUpperCase();

  let notificationState: 'SENT' | 'QUEUED' | 'NONE' = 'NONE';
  let confirmationMessage = 'Interview scheduled.';

  if (rawDispatch === 'SENT' || rawDispatch === 'DELIVERED') {
    notificationState = 'SENT';
    confirmationMessage = 'Interview scheduled. Calendar invitation sent.';
  } else if (
    rawDispatch === 'QUEUED' ||
    rawDispatch === 'PENDING' ||
    rawDispatch === 'NOTIFICATION_QUEUED'
  ) {
    notificationState = 'QUEUED';
    confirmationMessage = 'Interview scheduled. Calendar invitation queued.';
  }

  return {
    slot: slotObj,
    applicationId: cleanAppId,
    notificationState,
    confirmationMessage,
  };
}

export function isSlotConflictError(error: ApiError): boolean {
  return error.status === 409;
}

export function isSlotTimeoutError(error: ApiError): boolean {
  return (
    error.code === 'ECONNABORTED' ||
    error.status === 504 ||
    /timeout|timed out/i.test(error.message)
  );
}

export { normalizeError };
