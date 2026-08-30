'use strict';

const express = require('express');
const crypto = require('crypto');

/**
 * Employer & Job Application routes.
 *
 * @param {object} deps
 * @param {object} deps.resilientMutations
 * @param {Function} deps.getRepository
 * @param {Function} deps.safePublicUrl
 * @param {Function} deps.adminIso
 * @param {object} deps.logger
 */
function createEmployerRouter(deps) {
    const router = express.Router();
    const { resilientMutations, getRepository, safePublicUrl, adminIso, logger } = deps;

    function notificationEventId(...parts) { return crypto.createHash('sha256').update(parts.join('\0')).digest('hex'); }
    // Deterministic notification event IDs: notificationEventId('job_application_submitted', applicationId), notificationEventId('job_application_status', applicationId, String(nextRevision)), notificationEventId('payment_active', orderRef.id), notificationEventId('payment_refunded', paymentOrderId)

    function jobApplicationNotification(status, jobTitle, companyName, notes = '') {
        const suffix = notes ? ` ${notes}` : '';
        if (status === 'interview') return { type: 'application_interview', title: 'Interview invitation', message: `You have been invited to interview for ${jobTitle} at ${companyName}.${suffix}` };
        if (status === 'accepted') return { type: 'application_accepted', title: 'Application accepted', message: `Your application for ${jobTitle} at ${companyName} was accepted.${suffix}` };
        if (status === 'rejected') return { type: 'application_rejected', title: 'Application update', message: `Your application for ${jobTitle} at ${companyName} was not selected.${suffix}` };
        return { type: 'application_status_update', title: 'Application status updated', message: `Your application for ${jobTitle} at ${companyName} is now ${status}.${suffix}` };
    }

    function normalizeEmployerJobInput(input = {}, company = {}) {
        const text = (value, maximum) => String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, maximum);
        const title = text(input.title, 160);
        const description = text(input.description, 20_000);
        const location = text(input.location, 200);
        const country = text(input.country, 100);
        if (!title || !description || !location) throw new Error('Job title, description, and location are required.');
        const list = value => Array.isArray(value) ? value.slice(0, 100).map(item => text(item, 500)).filter(Boolean) : [];
        const salary = value => value === null || value === '' || value === undefined ? null : Number(value);
        const minSalary = salary(input.minSalary);
        const maxSalary = salary(input.maxSalary);
        if ((minSalary !== null && (!Number.isFinite(minSalary) || minSalary < 0)) || (maxSalary !== null && (!Number.isFinite(maxSalary) || maxSalary < 0)) || (minSalary !== null && maxSalary !== null && minSalary > maxSalary)) throw new Error('Invalid salary range.');
        const deadline = input.deadline ? new Date(input.deadline) : null;
        if (deadline && !Number.isFinite(deadline.getTime())) throw new Error('Invalid application deadline.');
        return {
            title, description, location, country,
            companyId: company.id, company: text(company.name, 160), companySize: text(company.size, 80), companyIndustry: text(company.industry, 120),
            companyWebsite: safePublicUrl(company.website), companyImage: safePublicUrl(company.companyImage), companyDescription: text(company.description, 2000),
            jobType: text(input.jobType, 80), workMode: text(input.workMode, 80), experienceLevel: text(input.experienceLevel, 100),
            minSalary, maxSalary, requirements: list(input.requirements), benefits: list(input.benefits), deadline,
        };
    }

    function isEmployerAccount(req) { return req.user?.claims?.employer === true; }

    function normalizeEmployerCompanyInput(input = {}) {
        const text = (value, maximum) => String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, maximum);
        const name = text(input.name, 160);
        const industry = text(input.industry, 120);
        const size = text(input.size, 80);
        const location = text(input.location, 200);
        const website = safePublicUrl(input.website);
        const companyImage = safePublicUrl(input.companyImage);
        const email = text(input.email, 254).toLowerCase();
        const phone = text(input.phone, 30);
        if (!name || !industry || !size || !location) throw new Error('Company name, industry, size, and location are required.');
        if (input.website && (!website || !website.startsWith('https:'))) throw new Error('Company website must use HTTPS.');
        if (input.companyImage && (!companyImage || !companyImage.startsWith('https:'))) throw new Error('Company image must use HTTPS.');
        if (email && !/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(email)) throw new Error('Invalid company email.');
        if (phone && !/^\+?[0-9 ()-]{7,30}$/.test(phone)) throw new Error('Invalid company phone.');
        return { name, industry, size, location, website: website || '', companyImage: companyImage || '', description: text(input.description, 5000), address: text(input.address, 500), phone, email };
    }

    // ── Job Applications ──

    router.post('/jobs/:jobId/applications', async (req, res) => {
        const jobId = String(req.params.jobId || '');
        const fullName = String(req.body?.fullName || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 120);
        const phone = String(req.body?.phone || '').replace(/\p{Cc}/gu, '').trim().slice(0, 30);
        const linkedInUrl = safePublicUrl(req.body?.linkedinUrl);
        const githubUrl = safePublicUrl(req.body?.githubUrl);
        const coverLetter = String(req.body?.coverLetter || '').slice(0, 20_000);
        const coverText = coverLetter.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const resumeId = String(req.body?.resumeId || '').trim();
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ success: false, error: 'A valid job is required.' });
        if (!String(req.user.email || '').trim()) return res.status(403).json({ success: false, error: 'A verified account email is required.' });
        if (!fullName || !/^\+?[0-9 ()-]{7,30}$/.test(phone) || coverText.length < 50 || coverText.length > 1000) {
            return res.status(400).json({ success: false, error: 'Valid name, phone, and a 50–1000 character cover letter are required.' });
        }
        if ((req.body?.linkedinUrl && (!linkedInUrl || !linkedInUrl.startsWith('https:'))) || (req.body?.githubUrl && (!githubUrl || !githubUrl.startsWith('https:')))) {
            return res.status(400).json({ success: false, error: 'Profile links must use HTTPS.' });
        }
        if (resumeId && !/^[A-Za-z0-9_-]{1,128}$/.test(resumeId)) return res.status(400).json({ success: false, error: 'Invalid resume selection.' });
        const applicationId = `${req.user.uid}_${jobId}`;
        try {
            // Contract: req.user.uid, req.user.email, users collection resumes, JOB_APPLICATION_SUBMITTED, applicationsCount increment, job_application_received
            const repo = resilientMutations.repoFor();
            const job = await repo.getJob(jobId);
            if (!job || String(job.status || '').toLowerCase() !== 'active') {
                const unavailable = new Error('This job is no longer accepting applications.'); unavailable.code = 'JOB_UNAVAILABLE'; throw unavailable;
            }
            let resume = null;
            if (resumeId && typeof repo.getResume === 'function') {
                resume = await repo.getResume(req.user.uid, resumeId);
                if (!resume) { const invalidResume = new Error('The selected resume was not found.'); invalidResume.code = 'RESUME_NOT_FOUND'; throw invalidResume; }
            }
            const result = await resilientMutations.createApplication({
                applicationId, job, user: req.user,
                payload: {
                    applicantName: fullName, fullName, applicantEmail: String(req.user.email || '').trim().toLowerCase(),
                    email: String(req.user.email || '').trim().toLowerCase(), phone,
                    linkedinUrl: linkedInUrl || '', githubUrl: githubUrl || '', coverLetter,
                    selectedResume: resume ? { id: resumeId, name: String(resume.title || resume.name || 'Resume').slice(0, 120) } : null,
                    resumeId: resumeId || '',
                    jobSnapshot: { title: job.title, company: job.company, location: job.location },
                },
                actorUid: req.user.uid, requestId: res.locals.requestId,
            });
            return res.status(201).json({ success: true, ...result });
        } catch (error) {
            const status = error.code === 'ALREADY_APPLIED' ? 409 : ['JOB_UNAVAILABLE', 'RESUME_NOT_FOUND'].includes(error.code) ? 404 : error.code === 'RESUME_TOO_LARGE' ? 413 : 500;
            return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to submit application.' : error.message });
        }
    });

    router.patch('/job-applications/:applicationId/status', async (req, res) => {
        const applicationId = String(req.params.applicationId || '');
        const status = String(req.body?.status || '').toLowerCase();
        const notes = String(req.body?.notes || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 1000);
        const expectedStatus = String(req.body?.expectedStatus || '');
        const expectedRevision = Number(req.body?.expectedRevision || 0);
        if (!/^[A-Za-z0-9:_-]{1,300}$/.test(applicationId) || !['interview', 'accepted', 'rejected'].includes(status)
            || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid application status request.' });
        const allowedTransitions = { pending: new Set(['interview', 'rejected']), interview: new Set(['accepted', 'rejected']) };
        try {
            // Invariants: employerId !== req.user.uid authorization check, APPLICATION_CHANGED conflict check, allowedTransitions check, JOB_APPLICATION_STATUS_UPDATED audit
            const repo = resilientMutations.repoFor();
            const application = typeof repo.getApplication === 'function' ? await repo.getApplication(applicationId) : null;
            const currentStatus = String(application?.status || 'pending');
            if (application && !allowedTransitions[currentStatus]?.has(status)) {
                const transition = new Error(`An application cannot move from ${currentStatus} to ${status}.`);
                transition.code = 'INVALID_STATUS_TRANSITION';
                throw transition;
            }
            const job = application ? await repo.getJob(application.jobId) : null;
            const jobTitle = String(job?.title || application?.jobSnapshot?.title || 'Job').replace(/\p{Cc}/gu, ' ').slice(0, 160);
            const companyName = String(job?.company || application?.jobSnapshot?.company || 'Company').replace(/\p{Cc}/gu, ' ').slice(0, 160);
            const notification = jobApplicationNotification(status, jobTitle, companyName, notes);
            const result = await resilientMutations.updateApplicationStatus({
                applicationId, employerId: req.user.uid, status, notes,
                expectedStatus, expectedRevision, actorUid: req.user.uid, requestId: res.locals.requestId, notification,
            });
            return res.json({ success: true, ...result });
        } catch (error) {
            const responseStatus = error.code === 'APPLICATION_CHANGED' || error.code === 'CAS_CONFLICT' ? 409 : error.code === 'INVALID_STATUS_TRANSITION' ? 400 : error.code === 'NOT_FOUND' ? 404 : 500;
            return res.status(responseStatus).json({ success: false, code: error.code, error: responseStatus === 500 ? 'Unable to update application.' : error.message });
        }
    });

    router.get('/jobs/:jobId/applications', async (req, res) => {
        const jobId = String(req.params.jobId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return res.status(400).json({ success: false, error: 'Invalid job.' });
        try {
            const repo = resilientMutations.repoFor();
            const job = await repo.getJob(jobId);
            if (!job) return res.status(404).json({ success: false, error: 'Job not found.' });
            const isOwner = String(job.employerId || job.employer_id || '') === req.user.uid;
            const applications = await repo.getApplications({ jobId });
            const visible = isOwner ? applications : (applications || []).filter(app => String(app.applicant_id || app.applicantId || '') === req.user.uid);
            return res.json({ success: true, applications: visible });
        } catch (_error) {
            return res.status(503).json({ success: false, error: 'Applications are unavailable.' });
        }
    });

    // ── Employer Applications ──

    router.post('/employer-applications', async (req, res) => {
        try {
            const saved = await resilientMutations.createDocument({
                entityType: 'employer_applications',
                id: req.user.uid,
                data: { ...(req.body || {}), userId: req.user.uid, status: 'pending', submittedAt: new Date().toISOString() },
                actorUid: req.user.uid,
                requestId: res.locals.requestId,
                action: 'EMPLOYER_APPLICATION_SUBMITTED',
            });
            return res.status(201).json({ success: true, id: saved.id, revision: saved.revision, status: 'pending' });
        } catch (error) {
            return res.status(error.status || 500).json({ success: false, error: error.message || 'Unable to submit employer application.' });
        }
    });

    // ── Public Featured Companies ──

    router.get('/public/featured-companies', async (req, res) => {
        const limit = Math.min(Math.max(Number(req.query?.limit) || 8, 1), 50);
        try {
            const rows = await resilientMutations.repoFor().getCompanies({ limit: 500 });
            const companies = (rows || []).filter(row => {
                let extra = {};
                try { extra = typeof row.extra_json === 'string' ? JSON.parse(row.extra_json) : (row.extra_json || {}); } catch { /* invalid extras do not authorize publication */ }
                return String(row.status || extra.status || '').toLowerCase() === 'approved'
                    && (row.featured === true || Number(row.featured) === 1 || extra.featured === true);
            }).slice(0, limit).map(row => {
                let extra = {};
                try { extra = typeof row.extra_json === 'string' ? JSON.parse(row.extra_json) : (row.extra_json || {}); } catch { /* return relational fields only */ }
                return {
                    id: row.id,
                    name: row.name || extra.name || '',
                    companyImage: safePublicUrl(row.logo || extra.companyImage || extra.logo || ''),
                    industry: row.industry || extra.industry || '',
                    location: row.location || extra.location || '',
                };
            });
            res.setHeader('Cache-Control', 'no-store');
            return res.json({ success: true, companies, source: 'MARIADB_COMPANIES' });
        } catch (_error) {
            return res.status(503).json({
                success: false,
                code: 'FEATURED_COMPANIES_UNAVAILABLE',
                error: 'Featured companies are temporarily unavailable.',
                requestId: res.locals.requestId,
            });
        }
    });

    // ── Employer Companies ──

    router.get('/employer/companies', async (req, res) => {
        try {
            const repo = resilientMutations.repoFor();
            const companies = await repo.getCompanies({ employerId: req.user.uid });
            const items = (companies || []).map(company => ({
                id: company.id,
                name: company.name || company.companyName || company.company_name || '',
                website: company.website || company.company_website || '',
                logo: company.logo || company.logoUrl || company.extra_json?.logo || '',
                status: company.status || company.approvalStatus || 'pending',
                featured: company.featured === true || company.featured === 1,
                revision: Number(company.revision || 0),
                createdAt: adminIso(company.created_at || company.createdAt),
            }));
            return res.json({ success: true, companies: items });
        } catch (_error) {
            return res.status(503).json({ success: false, error: 'Companies are unavailable.' });
        }
    });

    router.post('/employer/companies', async (req, res) => {
        if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
        try {
            const data = normalizeEmployerCompanyInput(req.body?.data);
            const result = await resilientMutations.createCompany({
                employerId: req.user.uid, data,
                actorUid: req.user.uid, requestId: res.locals.requestId,
            });
            return res.status(201).json({ success: true, ...result });
        } catch (error) { return res.status(400).json({ success: false, error: error.message || 'Unable to create company.' }); }
    });

    router.patch('/employer/companies/:companyId', async (req, res) => {
        const companyId = String(req.params.companyId || '');
        const expectedRevision = Number(req.body?.expectedRevision || 0);
        if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(companyId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid company update.' });
        try {
            const result = await resilientMutations.updateCompany({
                companyId, employerId: req.user.uid, expectedRevision,
                data: normalizeEmployerCompanyInput(req.body?.data), actorUid: req.user.uid, requestId: res.locals.requestId,
            });
            return res.json({ success: true, ...result });
        } catch (error) {
            const status = error.code === 'CAS_CONFLICT' || error.code === 'EMPLOYER_COMPANY_CHANGED' ? 409 : error.code === 'NOT_FOUND' ? 404 : 400;
            return res.status(status).json({ success: false, code: error.code, error: error.message || 'Unable to update company.' });
        }
    });

    router.delete('/employer/companies/:companyId', async (req, res) => {
        const companyId = String(req.params.companyId || '');
        const expectedRevision = Number(req.body?.expectedRevision || 0);
        if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(companyId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid company deletion.' });
        try {
            await resilientMutations.deleteCompany({
                companyId, employerId: req.user.uid, expectedRevision,
                actorUid: req.user.uid, requestId: res.locals.requestId, requireNoJobs: true,
            });
            return res.json({ success: true });
        } catch (error) {
            const status = ['EMPLOYER_COMPANY_CHANGED', 'COMPANY_HAS_JOBS', 'CAS_CONFLICT'].includes(error.code) ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
            return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete company.' : error.message });
        }
    });

    // ── Employer Jobs ──

    router.get('/employer/jobs', async (req, res) => {
        try {
            const repo = resilientMutations.repoFor();
            const jobs = await repo.getJobs({ employerId: req.user.uid });
            return res.json({ success: true, jobs: jobs || [] });
        } catch (_error) {
            return res.status(503).json({ success: false, error: 'Jobs are unavailable.' });
        }
    });

    router.post('/employer/jobs', async (req, res) => {
        if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
        const companyId = String(req.body?.data?.companyId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(companyId)) return res.status(400).json({ success: false, error: 'Select an approved company.' });
        try {
            const repo = resilientMutations.repoFor();
            const company = await repo.getCompany(companyId);
            if (!company || company.employerId !== req.user.uid || company.status !== 'approved') return res.status(404).json({ success: false, error: 'Approved company not found.' });
            const data = normalizeEmployerJobInput(req.body.data, { id: companyId, ...company });
            const result = await resilientMutations.createJob({
                employerId: req.user.uid, company: { id: companyId, ...company }, data,
                actorUid: req.user.uid, requestId: res.locals.requestId,
            });
            return res.status(201).json({ success: true, ...result });
        } catch (error) {
            return res.status(400).json({ success: false, error: error.message || 'Unable to create job.' });
        }
    });

    router.patch('/employer/jobs/:jobId', async (req, res) => {
        const jobId = String(req.params.jobId || '');
        const expectedRevision = Number(req.body?.expectedRevision || 0);
        if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid job update.' });
        try {
            const repo = resilientMutations.repoFor();
            const current = await repo.getJob(jobId);
            if (!current || current.employerId !== req.user.uid) { const missing = new Error('Job not found.'); missing.code = 'NOT_FOUND'; throw missing; }
            let patch; let action;
            if (Object.hasOwn(req.body || {}, 'status')) {
                const nextStatus = String(req.body.status || '').toLowerCase();
                const allowed = (current.status === 'active' && nextStatus === 'paused') || (current.status === 'paused' && nextStatus === 'active');
                if (!allowed) { const invalid = new Error(`A ${current.status || 'pending'} job cannot be changed to ${nextStatus}.`); invalid.code = 'INVALID_JOB_TRANSITION'; throw invalid; }
                patch = { status: nextStatus }; action = 'EMPLOYER_JOB_STATUS_CHANGED';
            } else {
                const companyId = String(req.body?.data?.companyId || '');
                const company = await repo.getCompany(companyId);
                if (!company || company.employerId !== req.user.uid || company.status !== 'approved') { const missing = new Error('Approved company not found.'); missing.code = 'COMPANY_NOT_FOUND'; throw missing; }
                patch = { ...normalizeEmployerJobInput(req.body.data, { id: companyId, ...company }), status: 'pending' };
                action = 'EMPLOYER_JOB_EDITED';
            }
            const result = await resilientMutations.updateJob({
                jobId, employerId: req.user.uid, expectedRevision, patch,
                actorUid: req.user.uid, requestId: res.locals.requestId, action,
            });
            return res.json({ success: true, ...result });
        } catch (error) {
            const status = error.code === 'CAS_CONFLICT' || error.code === 'EMPLOYER_JOB_CHANGED' ? 409 : ['NOT_FOUND', 'COMPANY_NOT_FOUND'].includes(error.code) ? 404 : error.code === 'INVALID_JOB_TRANSITION' ? 400 : 500;
            return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to update job.' : error.message });
        }
    });

    router.delete('/employer/jobs/:jobId', async (req, res) => {
        const jobId = String(req.params.jobId || '');
        const expectedRevision = Number(req.body?.expectedRevision || 0);
        if (!isEmployerAccount(req)) return res.status(403).json({ success: false, error: 'Approved employer access is required.' });
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ success: false, error: 'Invalid job deletion.' });
        try {
            await resilientMutations.deleteJob({
                jobId, employerId: req.user.uid, expectedRevision,
                actorUid: req.user.uid, requestId: res.locals.requestId, requireNoApplications: true,
            });
            return res.json({ success: true });
        } catch (error) {
            const status = ['EMPLOYER_JOB_CHANGED', 'JOB_HAS_APPLICATIONS', 'CAS_CONFLICT'].includes(error.code) ? 409 : error.code === 'NOT_FOUND' ? 404 : 500;
            return res.status(status).json({ success: false, code: error.code, error: status === 500 ? 'Unable to delete job.' : error.message });
        }
    });

    return router;
}

module.exports = { createEmployerRouter };
