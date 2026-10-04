import { sanitizeUrl } from './sanitizeHtml.js';

export const JOB_TRACKER_STATUSES = Object.freeze(['wishlist', 'applied', 'interview', 'offer', 'rejected']);

export const WORK_MODES = Object.freeze(['Remote', 'Hybrid', 'On-site']);
export const INTERVIEW_ROUNDS = Object.freeze([
    'Recruiter Screen', 'Technical', 'System Design', 'Behavioral', 'Hiring Manager',
]);
export const INTERVIEW_FORMATS = Object.freeze(['Video', 'In-Person', 'Phone']);

/**
 * DIR-020 Kanban column metadata.
 *
 * The persisted `status` enum stays load-bearing (wishlist | applied | interview |
 * offer | rejected) and is shared with cross-module analytics, so these are
 * PRESENTATION labels only. Per the Lead's architectural ruling the fifth column
 * is presented as "Archived" while binding to the canonical `rejected` enum.
 */
export const JOB_TRACKER_STAGES = Object.freeze([
    Object.freeze({
        id: 'wishlist', label: 'Wishlist', short: 'Saved',
        hint: 'Jobs found on the board or externally, awaiting application.',
    }),
    Object.freeze({
        id: 'applied', label: 'Applied', short: 'Applied',
        hint: 'Submitted applications, awaiting company review.',
    }),
    Object.freeze({
        id: 'interview', label: 'Interviewing', short: 'Interview',
        hint: 'Active interviews, phone screens and coding tests.',
    }),
    Object.freeze({
        id: 'offer', label: 'Offer Received', short: 'Offer',
        hint: 'Formal offers with compensation details.',
    }),
    Object.freeze({
        id: 'rejected', label: 'Archived', short: 'Archived',
        hint: 'Declined or closed applications.',
    }),
]);

const STAGE_INDEX = new Map(JOB_TRACKER_STAGES.map((stage, index) => [stage.id, index]));

/** Returns the Kanban stage descriptor for a status, defaulting to Wishlist. */
export function stageForStatus(status) {
    const index = STAGE_INDEX.get(status);
    return JOB_TRACKER_STAGES[index === undefined ? 0 : index];
}

/** The next stage in the pipeline, or null when already in the last column. */
export function nextStage(status) {
    const index = STAGE_INDEX.get(status);
    if (index === undefined) return null;
    return JOB_TRACKER_STAGES[index + 1] || null;
}

const text = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export function normalizeTrackedJob(input = {}) {
    const status = JOB_TRACKER_STATUSES.includes(input.status) ? input.status : 'wishlist';
    return {
        title: text(input.title, 160),
        company: text(input.company, 160),
        location: text(input.location, 160),
        url: input.url ? sanitizeUrl(input.url) : '',
        notes: text(input.notes, 4000),
        deadline: text(input.deadline, 10),
        status,
        order: Number.isFinite(Number(input.order)) ? Math.max(0, Math.floor(Number(input.order))) : 0,
        // DIR-020 executive card anatomy. Empty-string defaults (never undefined)
        // so the shape stays stable for controlled inputs and round-trips cleanly.
        salary: text(input.salary, 100),
        dateApplied: text(input.dateApplied, 32),
        contactPerson: text(input.contactPerson, 255),
        contactEmail: text(input.contactEmail, 255),
        workMode: WORK_MODES.includes(input.workMode) ? input.workMode : 'Remote',
        interviewRound: INTERVIEW_ROUNDS.includes(input.interviewRound) ? input.interviewRound : '',
        interviewAt: normalizeInterviewAtValue(input.interviewAt),
        interviewFormat: INTERVIEW_FORMATS.includes(input.interviewFormat) ? input.interviewFormat : '',
        interviewLink: input.interviewLink ? sanitizeUrl(input.interviewLink) : '',
    };
}

/**
 * Coerces the shapes an interview timestamp can arrive in (MariaDB DateTime,
 * ISO string, or a `datetime-local` control value) into the canonical
 * `YYYY-MM-DDTHH:mm` string the datetime control needs.
 */
export function normalizeInterviewAtValue(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(String(value).trim());
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function validateTrackedJob(input) {
    const job = normalizeTrackedJob(input);
    const errors = {};
    if (!job.title) errors.title = 'Job title is required';
    if (!job.company) errors.company = 'Company is required';
    if (input?.url && !job.url) errors.url = 'Use a valid web address';
    if (job.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(job.deadline)) errors.deadline = 'Use a valid date';
    if (input?.interviewLink && !job.interviewLink) errors.interviewLink = 'Use a valid meeting link';
    if (job.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.contactEmail)) {
        errors.contactEmail = 'Use a valid email address';
    }
    return { job, errors, valid: Object.keys(errors).length === 0 };
}

export function filterAndSortTrackedJobs(jobs, search = '') {
    const query = String(search || '').trim().toLocaleLowerCase();
    return [...(Array.isArray(jobs) ? jobs : [])]
        .filter((job) => !query || [
            job.title, job.company, job.location, job.notes, job.salary,
            job.contactPerson, job.contactEmail, job.interviewRound,
        ].some((value) => String(value || '').toLocaleLowerCase().includes(query)))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)
            || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

/** Company monogram used by the executive card avatar (max 2 initials). */
export function companyMonogram(company) {
    const words = String(company || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * DIR-020 AC-2: human-readable relative timestamp ("Applied 3 days ago").
 * Falls back to an absolute date beyond a month so the label never lies.
 */
export function relativeTimeLabel(value, { prefix = 'Applied' } = {}) {
    const date = value instanceof Date ? value : (value ? new Date(String(value)) : null);
    if (!date || Number.isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    const days = Math.floor(diffMs / 86_400_000);
    if (diffMs < 60_000) return `${prefix} just now`;
    if (diffMs < 3_600_000) {
        const minutes = Math.max(1, Math.floor(diffMs / 60_000));
        return `${prefix} ${minutes} min ago`;
    }
    if (diffMs < 86_400_000) {
        const hours = Math.max(1, Math.floor(diffMs / 3_600_000));
        return `${prefix} ${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    if (days <= 30) return `${prefix} ${days} day${days === 1 ? '' : 's'} ago`;
    return `${prefix} on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/** True when an interview is scheduled within the next 48 hours. */
export function isUpcomingInterview(value, reference = Date.now()) {
    if (!value) return false;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return false;
    const delta = date.getTime() - reference;
    return delta > -3_600_000 && delta < 172_800_000;
}

/**
 * DIR-020 AC-6: the pipeline analytics ribbon.
 *
 * "Active" deliberately excludes the Archived column so the headline number
 * reflects live opportunities rather than lifetime volume. The interview rate is
 * measured only against applications actually submitted (Applied + Interviewing +
 * Offer); counting wishlist entries would inflate it into a meaningless number.
 */
export function summarizePipeline(jobs) {
    const list = Array.isArray(jobs) ? jobs : [];
    const counts = Object.fromEntries(JOB_TRACKER_STAGES.map((stage) => [stage.id, 0]));
    for (const job of list) {
        if (Object.prototype.hasOwnProperty.call(counts, job?.status)) counts[job.status] += 1;
    }
    const submitted = counts.applied + counts.interview + counts.offer;
    const active = counts.wishlist + counts.applied + counts.interview + counts.offer;
    const interviewRate = submitted > 0 ? Math.round(((counts.interview + counts.offer) / submitted) * 100) : 0;
    return {
        total: list.length,
        active,
        counts,
        submitted,
        interviewRate,
        pendingResponses: counts.applied,
        offerCount: counts.offer,
        archivedCount: counts.rejected,
    };
}

/** Escapes a value for an RFC 5545 TEXT property (backslash, semicolon, comma, newline). */
function escapeIcsText(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

/** Folds an RFC 5545 content line to the 75-octet limit without splitting UTF-8. */
function foldIcsLine(line) {
    if (line.length <= 74) return line;
    const parts = [];
    let current = '';
    for (const char of line) {
        if (current.length + char.length > 73) {
            parts.push(current);
            current = ` ${char}`;
        } else {
            current += char;
        }
    }
    if (current) parts.push(current);
    return parts.join('\r\n');
}

/** UTC timestamp form required by RFC 5545 (YYYYMMDDTHHMMSSZ). */
function icsTimestamp(value) {
    const date = value instanceof Date ? value : new Date(String(value));
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
        + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/**
 * DIR-020 AC-5: builds a standards-compliant RFC 5545 iCalendar invite that
 * Google Calendar, Outlook and Apple Calendar all accept.
 *
 * DTSTAMP is derived from the scheduled interview itself rather than `Date.now()`,
 * so exporting the same interview twice yields byte-identical output instead of
 * churning the DTSTAMP on every click.
 */
export function buildInterviewIcs(job) {
    if (!job?.interviewAt) return '';
    const start = job.interviewAt instanceof Date ? job.interviewAt : new Date(String(job.interviewAt));
    if (Number.isNaN(start.getTime())) return '';
    // Interviews are scheduled on the hour/half hour; default to a 60 minute slot.
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const uidSeed = `${job.id || job.company || 'interview'}-${start.getTime()}`;
    const summary = job.interviewRound
        ? `${job.interviewRound} - ${job.title || 'Interview'}`
        : `Interview - ${job.title || 'Role'}`;
    const description = [
        `Company: ${job.company || 'Not specified'}`,
        job.location ? `Location: ${job.location}` : '',
        job.contactPerson ? `Contact: ${job.contactPerson}` : '',
        job.interviewFormat ? `Format: ${job.interviewFormat}` : '',
        job.url ? `Job link: ${job.url}` : '',
    ].filter(Boolean).join('\n');

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//IME365//Job Tracker Interview//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(uidSeed)}@ime365`,
        `DTSTAMP:${icsTimestamp(start)}`,
        `DTSTART:${icsTimestamp(start)}`,
        `DTEND:${icsTimestamp(end)}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        `LOCATION:${escapeIcsText(job.interviewLink || job.location || '')}`,
        ...(job.interviewLink ? [`URL:${escapeIcsText(job.interviewLink)}`] : []),
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** Deterministic, filesystem-safe .ics filename for a scheduled interview. */
export function interviewIcsFilename(job) {
    const slug = String(job?.title || 'interview')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'interview';
    const stamp = normalizeInterviewAtValue(job?.interviewAt).replace(/[-:T]/g, '');
    return `${slug}-${stamp || 'unscheduled'}.ics`;
}
