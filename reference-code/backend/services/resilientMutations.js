'use strict';

/**
 * MariaDB CAS mutations for remaining Super Admin / employer entities.
 *
 * HTTP → this service → MariaDB repository. No alternate data-plane path exists.
 */

const crypto = require('crypto');
const { createMutationId, canonicalizeRecord } = require('../database/canonical');

function fail(code, status, message) {
    const err = new Error(message || code);
    err.code = code;
    err.status = status;
    return err;
}

function nowIso() {
    return new Date().toISOString();
}

function nextId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function repoFor(repo) {
    return repo || require('../repositories').getRepository();
}

async function casWrite({
    _repo, get, save, id, expectedRevision, patch, createIfMissing = false,
}) {
    const current = await get(id);
    if (!current && !createIfMissing) throw fail('NOT_FOUND', 404, 'Record not found.');
    const currentRev = Number(current?.revision || 0);
    if (expectedRevision !== undefined && expectedRevision !== null && Number(expectedRevision) !== currentRev) {
        throw fail('CAS_CONFLICT', 409, 'This record changed after the page loaded. Refresh before saving.');
    }
    const revision = currentRev + 1;
    const next = {
        ...(current || {}),
        ...patch,
        id,
        revision,
        updatedAt: nowIso(),
        mutationId: createMutationId('mut'),
    };
    if (!current) next.createdAt = nowIso();
    const saved = await save(id, next);
    return { ...next, ...saved, revision };
}

async function audit(repo, payload) {
    if (typeof repo.recordSecurityAuditLog === 'function') {
        await repo.recordSecurityAuditLog(payload);
    }
}

async function notify(repo, uid, eventId, data) {
    if (!uid || typeof repo.saveNotification !== 'function') return;
    await repo.saveNotification(uid, eventId, {
        eventId,
        state: 'NOTIFICATION_CREATED',
        deliveryState: 'NOT_REQUESTED',
        read: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        ...data,
    });
}

function eventId(...parts) {
    return crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
}

// ——— Companies ———

async function createCompany({ repo, employerId, data, actorUid, requestId }) {
    const r = repoFor(repo);
    const id = nextId('co');
    const record = {
        ...data,
        id,
        employerId,
        status: 'pending',
        featured: false,
        revision: 1,
        stats: { totalJobs: 0, activeJobs: 0, expiredJobs: 0, totalApplications: 0, lastJobPosted: null },
        createdAt: nowIso(),
        updatedAt: nowIso(),
    };
    await r.saveCompany(id, record);
    await audit(r, { action: 'EMPLOYER_COMPANY_CREATED', actorUid, companyId: id, revision: 1, requestId });
    return { companyId: id, status: 'pending', revision: 1 };
}

async function updateCompany({ repo, companyId, employerId, expectedRevision, data, actorUid, requestId }) {
    const r = repoFor(repo);
    const saved = await casWrite({
        repo: r,
        get: (id) => r.getCompany(id),
        save: (id, rec) => r.saveCompany(id, rec),
        id: companyId,
        expectedRevision,
        patch: { ...data, status: 'pending', featured: false, employerId },
    });
    if (employerId && saved.employerId && saved.employerId !== employerId) {
        throw fail('NOT_FOUND', 404, 'Company not found.');
    }
    await audit(r, { action: 'EMPLOYER_COMPANY_EDITED', actorUid, companyId, revision: saved.revision, requestId });
    return { status: 'pending', featured: false, revision: saved.revision };
}

async function deleteCompany({ repo, companyId, employerId, expectedRevision, actorUid, requestId, requireNoJobs = true }) {
    const r = repoFor(repo);
    const current = await r.getCompany(companyId);
    if (!current || (employerId && current.employerId !== employerId && current.owner_id !== employerId)) {
        throw fail('NOT_FOUND', 404, 'Company not found.');
    }
    if (Number(current.revision || 0) !== Number(expectedRevision)) {
        throw fail('CAS_CONFLICT', 409, 'This company changed after the dashboard loaded. Refresh before deleting.');
    }
    if (requireNoJobs && typeof r.getJobs === 'function') {
        const jobs = await r.getJobs({ employerId: current.employerId || employerId, limit: 50 });
        const related = (jobs || []).filter((j) => j.companyId === companyId || j.company_id === companyId);
        if (related.length) throw fail('COMPANY_HAS_JOBS', 409, 'Delete or archive this company’s jobs before deleting the company.');
    }
    await r.deleteCompany(companyId);
    await audit(r, { action: 'EMPLOYER_COMPANY_DELETED', actorUid, companyId, revision: expectedRevision, requestId });
    return { success: true };
}

async function moderateCompany({ repo, companyId, expectedStatus, expectedFeatured, patch, actorUid, requestId }) {
    const r = repoFor(repo);
    const current = await r.getCompany(companyId);
    if (!current) throw fail('NOT_FOUND', 404, 'Company not found.');
    if (expectedStatus !== undefined && String(current.status || 'pending') !== String(expectedStatus)) {
        throw fail('ADMIN_TARGET_CHANGED', 409, 'This company changed after the page loaded. Refresh before changing it.');
    }
    if (expectedFeatured !== undefined && Boolean(current.featured) !== Boolean(expectedFeatured)) {
        throw fail('ADMIN_TARGET_CHANGED', 409, 'This company changed after the page loaded. Refresh before changing it.');
    }
    const revision = Number(current.revision || 0) + 1;
    const next = { ...current, ...patch, revision, updatedAt: nowIso() };
    await r.saveCompany(companyId, next);
    if (patch.status && current.employerId) {
        await notify(r, current.employerId, eventId('company_status', companyId, String(revision)), {
            type: 'company_status_update',
            title: 'Company review updated',
            message: `${String(current.name || 'Company').slice(0, 160)} is now ${patch.status}.`,
            data: { companyId, status: patch.status },
        });
    }
    await audit(r, {
        action: patch.status ? 'COMPANY_STATUS_UPDATED' : 'COMPANY_FEATURED_UPDATED',
        actorUid, companyId, requestId, ...patch,
    });
    return { status: next.status, featured: Boolean(next.featured), revision };
}

// ——— Jobs ———

async function createJob({ repo, employerId, company, data, actorUid, requestId }) {
    const r = repoFor(repo);
    const id = nextId('job');
    const record = {
        ...data,
        id,
        employerId,
        companyId: company.id,
        company: company.name,
        status: 'pending',
        revision: 1,
        applicationsCount: 0,
        viewsCount: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
    };
    await r.saveJob(id, record);
    await audit(r, { action: 'EMPLOYER_JOB_CREATED', actorUid, jobId: id, companyId: company.id, revision: 1, requestId });
    return { jobId: id, status: 'pending', revision: 1 };
}

async function updateJob({ repo, jobId, employerId, expectedRevision, patch, actorUid, requestId, action }) {
    const r = repoFor(repo);
    const current = await r.getJob(jobId);
    if (!current || (employerId && current.employerId !== employerId && current.employer_id !== employerId)) {
        throw fail('NOT_FOUND', 404, 'Job not found.');
    }
    if (Number(current.revision || 0) !== Number(expectedRevision)) {
        throw fail('CAS_CONFLICT', 409, 'This job changed after the dashboard loaded. Refresh before saving.');
    }
    const revision = Number(current.revision || 0) + 1;
    const next = { ...current, ...patch, revision, updatedAt: nowIso() };
    await r.saveJob(jobId, next);
    await audit(r, { action: action || 'EMPLOYER_JOB_EDITED', actorUid, jobId, revision, requestId });
    return { ...patch, revision };
}

async function deleteJob({ repo, jobId, employerId, expectedRevision, actorUid, requestId, requireNoApplications = true }) {
    const r = repoFor(repo);
    const current = await r.getJob(jobId);
    if (!current || (employerId && current.employerId !== employerId && current.employer_id !== employerId)) {
        throw fail('NOT_FOUND', 404, 'Job not found.');
    }
    if (expectedRevision !== undefined && expectedRevision !== null && Number(current.revision || 0) !== Number(expectedRevision)) {
        throw fail('CAS_CONFLICT', 409, 'This job changed after the dashboard loaded. Refresh before deleting.');
    }
    if (requireNoApplications && typeof r.getApplications === 'function') {
        const apps = await r.getApplications({ jobId });
        if (apps && apps.length) throw fail('JOB_HAS_APPLICATIONS', 409, 'This job has applications and cannot be deleted. Pause it instead.');
    }
    const currentOwnerId = current.employerId || current.employer_id;
    const deleted = await r.deleteJob(jobId, currentOwnerId);
    if (!deleted) throw fail('NOT_FOUND', 404, 'Job not found.');
    await audit(r, { action: 'JOB_DELETED', actorUid, jobId, previousStatus: current.status, requestId });
    return { success: true };
}

async function moderateJob({ repo, jobId, expectedStatus, expectedFeatured, patch, actorUid, requestId }) {
    const r = repoFor(repo);
    const current = await r.getJob(jobId);
    if (!current) throw fail('NOT_FOUND', 404, 'Job not found.');
    if (expectedStatus !== undefined && String(current.status || 'pending') !== String(expectedStatus)) {
        throw fail('ADMIN_TARGET_CHANGED', 409, 'This job changed after the page loaded. Refresh before changing it.');
    }
    if (expectedFeatured !== undefined && Boolean(current.isFeatured) !== Boolean(expectedFeatured)) {
        throw fail('ADMIN_TARGET_CHANGED', 409, 'This job changed after the page loaded. Refresh before changing it.');
    }
    const revision = Number(current.revision || 0) + 1;
    const next = { ...current, ...patch, revision, updatedAt: nowIso() };
    await r.saveJob(jobId, next);
    if (patch.status && current.employerId) {
        await notify(r, current.employerId, eventId('job_status', jobId, String(revision)), {
            type: 'job_status_update',
            title: 'Job status updated',
            message: `Your job posting “${String(current.title || 'Job').slice(0, 160)}” is now ${patch.status}.`,
            data: { jobId, status: patch.status },
        });
    }
    await audit(r, {
        action: patch.status ? 'JOB_STATUS_UPDATED' : 'JOB_FEATURED_UPDATED',
        actorUid, jobId, requestId, ...patch,
    });
    return { status: next.status, isFeatured: Boolean(next.isFeatured), revision };
}

// ——— Applications ———

async function createApplication({ repo, applicationId, job, user, payload, actorUid, requestId }) {
    const r = repoFor(repo);
    const existing = typeof r.getApplication === 'function'
        ? await r.getApplication(applicationId)
        : (await r.getApplications({ jobId: job.id, applicantId: user.uid })).find((a) => a.id === applicationId);
    if (existing) throw fail('ALREADY_APPLIED', 409, 'You have already applied to this job.');
    const record = {
        ...payload,
        id: applicationId,
        jobId: job.id,
        userId: user.uid,
        applicantId: user.uid,
        employerId: job.employerId,
        status: 'pending',
        revision: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        appliedAt: nowIso(),
    };
    await r.saveApplication(applicationId, record);
    await r.saveJob(job.id, {
        ...job,
        applicationsCount: Number(job.applicationsCount || job.applicants_count || 0) + 1,
        revision: Number(job.revision || 0) + 1,
        updatedAt: nowIso(),
    });
    const submittedEventId = eventId('job_application_submitted', applicationId);
    await notify(r, user.uid, submittedEventId, {
        type: 'job_application',
        title: 'Application submitted',
        message: `Your application for ${job.title || 'Job'} at ${job.company || 'Company'} was submitted.`,
        data: { jobId: job.id, applicationId },
    });
    if (job.employerId) {
        await notify(r, job.employerId, submittedEventId, {
            type: 'job_application_received',
            title: 'New job application',
            message: `${payload.fullName || payload.applicantName} applied for ${job.title || 'Job'}.`,
            data: { jobId: job.id, applicationId },
        });
    }
    await audit(r, { action: 'JOB_APPLICATION_SUBMITTED', actorUid, jobId: job.id, applicationId, requestId });
    return { applicationId, revision: 1 };
}

async function updateApplicationStatus({
    repo, applicationId, employerId, status, notes, expectedStatus, expectedRevision, actorUid, requestId, notification,
}) {
    const r = repoFor(repo);
    const current = typeof r.getApplication === 'function'
        ? await r.getApplication(applicationId)
        : (await r.getApplications({})).find((a) => a.id === applicationId);
    if (!current) throw fail('NOT_FOUND', 404, 'Application not found.');
    const job = await r.getJob(current.jobId);
    if (!job || (employerId && job.employerId !== employerId && job.employer_id !== employerId)) {
        throw fail('NOT_FOUND', 404, 'Application not found.');
    }
    const currentStatus = String(current.status || 'pending');
    const currentRevision = Number(current.revision || 0);
    if ((expectedStatus && expectedStatus !== currentStatus) || Number(expectedRevision) !== currentRevision) {
        throw fail('APPLICATION_CHANGED', 409, 'This application changed after the list loaded. Refresh before updating it.');
    }
    const revision = currentRevision + 1;
    await r.saveApplication(applicationId, {
        ...current,
        status,
        employerNotes: notes,
        revision,
        statusUpdatedAt: nowIso(),
        updatedAt: nowIso(),
    });
    if (current.userId || current.applicant_id) {
        await notify(r, current.userId || current.applicant_id, eventId('job_application_status', applicationId, String(revision)), {
            ...(notification || {}),
            data: { jobId: current.jobId, applicationId, status },
        });
    }
    await audit(r, {
        action: 'JOB_APPLICATION_STATUS_UPDATED', actorUid, applicationId, jobId: current.jobId,
        previousStatus: currentStatus, status, revision, requestId,
    });
    return { status, revision };
}

// ——— Generic CMS documents plus explicit relational-domain adapters ———

function docApi(r, entityType) {
    const specialized = {
        custom_pages: ['getCustomPageById', 'saveCustomPage', 'deleteCustomPage', 'getCustomPages'],
        trusted_by: ['getTrustedById', 'saveTrustedBy', 'deleteTrustedBy', 'getTrustedBy'],
        reviews: ['getReview', 'saveReview', 'deleteReview', 'getReviews'],
        blog: ['getBlogPostById', 'saveBlogPost', 'deleteBlogPost', 'getBlogPosts'],
    }[entityType];
    return {
        get: async (id) => {
            if (specialized?.[0] && typeof r[specialized[0]] === 'function') return r[specialized[0]](id);
            if (typeof r.getDocument === 'function') return r.getDocument(entityType, id);
            return null;
        },
        save: async (id, data) => {
            if (specialized?.[1] && typeof r[specialized[1]] === 'function') return r[specialized[1]](id, data);
            if (typeof r.saveDocument === 'function') return r.saveDocument(entityType, id, data);
            throw fail('METHOD_NOT_IMPLEMENTED', 501, `No adapter for ${entityType}`);
        },
        remove: async (id, expectedRevision) => {
            if (specialized?.[2] && typeof r[specialized[2]] === 'function') return r[specialized[2]](id, expectedRevision);
            if (typeof r.deleteDocument === 'function') return r.deleteDocument(entityType, id, expectedRevision);
            throw fail('METHOD_NOT_IMPLEMENTED', 501, `No adapter for ${entityType}`);
        },
        list: async (opts) => {
            if (specialized?.[3] && typeof r[specialized[3]] === 'function') return r[specialized[3]](opts);
            if (typeof r.listDocuments === 'function') return r.listDocuments(entityType, opts);
            return [];
        },
    };
}

async function createDocument({ repo, entityType, id, data, actorUid, requestId, action }) {
    const r = repoFor(repo);
    const api = docApi(r, entityType);
    const docId = id || nextId(entityType.replace(/[^a-z]/gi, '').slice(0, 8) || 'doc');
    const record = { ...data, id: docId, revision: 1, createdAt: nowIso(), updatedAt: nowIso() };
    await api.save(docId, record);
    await audit(r, { action: action || `${entityType.toUpperCase()}_CREATED`, actorUid, resourceId: docId, revision: 1, requestId });
    return { id: docId, revision: 1, ...record };
}

async function updateDocument({ repo, entityType, id, expectedRevision, patch, actorUid, requestId, action }) {
    const r = repoFor(repo);
    const api = docApi(r, entityType);
    const saved = await casWrite({
        repo: r,
        get: (docId) => api.get(docId),
        save: (docId, rec) => api.save(docId, rec),
        id,
        expectedRevision,
        patch,
        createIfMissing: Number(expectedRevision) === 0,
    });
    await audit(r, { action: action || `${entityType.toUpperCase()}_UPDATED`, actorUid, resourceId: id, revision: saved.revision, requestId });
    return saved;
}

async function deleteDocument({ repo, entityType, id, expectedRevision, actorUid, requestId, action }) {
    const r = repoFor(repo);
    const api = docApi(r, entityType);
    const current = await api.get(id);
    if (!current) throw fail('NOT_FOUND', 404, 'Record not found.');
    if (expectedRevision !== undefined && expectedRevision !== null && Number(current.revision || 0) !== Number(expectedRevision)) {
        throw fail('CAS_CONFLICT', 409, 'This record changed after the page loaded. Refresh before deleting.');
    }
    await api.remove(id, Number(current.revision || expectedRevision));
    await audit(r, { action: action || `${entityType.toUpperCase()}_DELETED`, actorUid, resourceId: id, revision: Number(current.revision || expectedRevision), requestId });
    return { success: true };
}

async function moderateBlogPost({ repo, postId, nextStatus, expectedRevision, scheduledAt, actorUid, requestId }) {
    const r = repoFor(repo);
    const current = (await r.getBlogPosts({ publishedOnly: false, limit: 500 }) || []).find((post) => post.id === postId);
    const existing = current || (typeof r.getDocument === 'function' ? await r.getDocument('blog', postId) : null);
    if (!existing) throw fail('NOT_FOUND', 404, 'Post not found.');
    if (Number(existing.revision || 0) !== Number(expectedRevision)) {
        throw fail('BLOG_CONFLICT', 409, 'This post changed after moderation loaded. Refresh before continuing.');
    }
    const allowed = nextStatus === 'rejected' || ((nextStatus === 'approved' || nextStatus === 'scheduled') && ['draft', 'pending', 'rejected'].includes(existing.status));
    if (!allowed) throw fail('INVALID_BLOG_TRANSITION', 400, `A ${existing.status} post cannot transition to ${nextStatus}.`);
    const revision = Number(existing.revision || 0) + 1;
    const next = {
        ...existing,
        status: nextStatus,
        published: nextStatus === 'approved',
        revision,
        updatedAt: nowIso(),
        scheduledAt: nextStatus === 'scheduled' ? scheduledAt : null,
        publishedAt: nextStatus === 'approved' ? nowIso() : existing.publishedAt || null,
    };
    await r.saveBlogPost(postId, next);
    if (existing.authorUid || existing.author_id) {
        await notify(r, existing.authorUid || existing.author_id, eventId('blog_moderation', postId, String(revision)), {
            type: 'blog_moderation',
            title: nextStatus === 'approved' ? 'Blog post published' : nextStatus === 'scheduled' ? 'Blog post scheduled' : 'Blog post returned for revision',
            message: `“${String(existing.title || 'Post').slice(0, 160)}” is now ${nextStatus}.`,
            data: { postId, status: nextStatus, revision },
        });
    }
    await audit(r, { action: `CMS_BLOG_${nextStatus.toUpperCase()}`, actorUid, postId, revision, requestId });
    return { status: nextStatus, revision };
}

async function saveSettingDocument({ repo, category, expectedRevision, patch, actorUid, requestId, action }) {
    const r = repoFor(repo);
    const current = (await r.getSetting(category)) || {};
    const currentRev = Number(current.revision || 0);
    if (expectedRevision !== undefined && expectedRevision !== null && Number(expectedRevision) !== currentRev) {
        throw fail('ADMIN_TARGET_CHANGED', 409, 'This setting changed after the panel loaded. Refresh before saving.');
    }
    const revision = currentRev + 1;
    const next = { ...current, ...patch, revision, updatedAt: nowIso() };
    await r.saveSetting(category, next, revision);
    await audit(r, { action: action || 'SETTING_UPDATED', actorUid, category, revision, requestId });
    return { ...patch, revision };
}

module.exports = {
    fail,
    repoFor,
    casWrite,
    createCompany,
    updateCompany,
    deleteCompany,
    moderateCompany,
    createJob,
    updateJob,
    deleteJob,
    moderateJob,
    createApplication,
    updateApplicationStatus,
    createDocument,
    updateDocument,
    deleteDocument,
    moderateBlogPost,
    saveSettingDocument,
    audit,
    notify,
    eventId,
    nowIso,
    nextId,
    canonicalizeRecord,
};
