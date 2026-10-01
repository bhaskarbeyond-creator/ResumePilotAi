import { useCallback, useEffect, useState } from 'react';
import { getEmployerJobs, getEmployerCompanies, checkIsEmployer } from '../../services/api/platform';

/**
 * Single authoritative read for the recruiter workspace.
 *
 * Every value shown by the employer portal originates from the MariaDB-backed
 * `/api/employer/*` endpoints through the existing platform API client. No
 * metric, company, or applicant is synthesised in the browser: an empty or
 * failed read resolves to an explicit state the shell renders as onboarding or
 * an error, never as a fabricated success.
 */
export const EMPLOYER_DATA_STATUS = {
    IDLE: 'idle',
    LOADING: 'loading',
    READY: 'ready',
    EMPTY: 'empty',
    ERROR: 'error',
};

const normalizeJob = (job) => {
    const applications = Array.isArray(job?.applications) ? job.applications : [];
    return {
        id: job?.id || job?.jobId || '',
        title: job?.title || 'Untitled role',
        company: job?.company || job?.companyName || '—',
        location: job?.location || '—',
        workMode: job?.workMode || 'On-site',
        jobType: job?.jobType || 'Full-time',
        status: String(job?.status || 'unknown').toLowerCase(),
        description: job?.description || '',
        createdAt: job?.createdAt || job?.postedAt || null,
        applicationCount: Number.isFinite(Number(job?.applicationCount))
            ? Number(job.applicationCount)
            : applications.length,
        applications,
    };
};

const normalizeCompany = (company) => ({
    id: company?.id || company?.companyId || '',
    name: company?.name || company?.companyName || 'Untitled company',
    industry: company?.industry || '—',
    location: company?.location || '—',
    website: company?.website || '',
    description: company?.description || '',
    verificationStatus: String(company?.verificationStatus || company?.status || 'pending').toLowerCase(),
    revision: Number(company?.revision || 0),
});

export function useEmployerWorkspace(userId) {
    const [state, setState] = useState({
        status: EMPLOYER_DATA_STATUS.IDLE,
        error: null,
        isEmployer: null,
        jobs: [],
        companies: [],
        loadedAt: null,
    });

    const load = useCallback(async () => {
        setState(previous => ({ ...previous, status: EMPLOYER_DATA_STATUS.LOADING, error: null }));
        try {
            // The employer endpoints are owner-scoped server-side, so no user id
            // is sent from the browser; the bearer token is the only identity input.
            const [jobs, companies, employer] = await Promise.all([
                getEmployerJobs(),
                getEmployerCompanies(),
                checkIsEmployer(userId),
            ]);

            const normalizedJobs = (Array.isArray(jobs) ? jobs : []).map(normalizeJob);
            const normalizedCompanies = (Array.isArray(companies) ? companies : []).map(normalizeCompany);
            const hasAnyRecord = normalizedJobs.length > 0 || normalizedCompanies.length > 0;

            setState({
                status: hasAnyRecord ? EMPLOYER_DATA_STATUS.READY : EMPLOYER_DATA_STATUS.EMPTY,
                error: null,
                isEmployer: Boolean(employer),
                jobs: normalizedJobs,
                companies: normalizedCompanies,
                loadedAt: Date.now(),
            });
            return { jobs: normalizedJobs, companies: normalizedCompanies, isEmployer: Boolean(employer) };
        } catch (error) {
            setState(previous => ({
                ...previous,
                status: EMPLOYER_DATA_STATUS.ERROR,
                error,
                isEmployer: previous.isEmployer,
            }));
            throw error;
        }
    }, [userId]);

    useEffect(() => {
        load().catch(() => { /* surfaced through status === 'error' */ });
    }, [load]);

    // Funnel counts are derived from the same job records the pipeline renders,
    // so the overview can never disagree with the ATS table below it.
    const metrics = {
        activeJobs: state.jobs.filter(job => job.status === 'active' || job.status === 'open' || job.status === 'published').length,
        totalJobs: state.jobs.length,
        totalApplications: state.jobs.reduce((sum, job) => sum + job.applicationCount, 0),
        totalCompanies: state.companies.length,
        verifiedCompanies: state.companies.filter(company => company.verificationStatus === 'verified' || company.verificationStatus === 'approved').length,
    };

    return { ...state, metrics, reload: load };
}

export default useEmployerWorkspace;
