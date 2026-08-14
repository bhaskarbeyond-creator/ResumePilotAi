import { sanitizeUrl } from './sanitizeHtml.js';

export const JOB_TRACKER_STATUSES = Object.freeze(['wishlist', 'applied', 'interview', 'offer', 'rejected']);

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
    };
}

export function validateTrackedJob(input) {
    const job = normalizeTrackedJob(input);
    const errors = {};
    if (!job.title) errors.title = 'Job title is required';
    if (!job.company) errors.company = 'Company is required';
    if (input?.url && !job.url) errors.url = 'Use a valid web address';
    if (job.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(job.deadline)) errors.deadline = 'Use a valid date';
    return { job, errors, valid: Object.keys(errors).length === 0 };
}

export function filterAndSortTrackedJobs(jobs, search = '') {
    const query = String(search || '').trim().toLocaleLowerCase();
    return [...(Array.isArray(jobs) ? jobs : [])]
        .filter((job) => !query || [job.title, job.company, job.location, job.notes]
            .some((value) => String(value || '').toLocaleLowerCase().includes(query)))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)
            || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
