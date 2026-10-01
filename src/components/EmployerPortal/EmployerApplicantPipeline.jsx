import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { FiUsers, FiRefreshCw, FiSearch, FiMail } from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import { getJobApplications } from '../../services/api/platform';
import { useEmployerWorkspace, EMPLOYER_DATA_STATUS } from './useEmployerWorkspace';
import { EmployerPageHeader, EmployerLoading, EmployerErrorState, EmployerEmptyState } from './EmployerStates';
import SendMessageDialog from '../Dashboard/EmployerDashboard/SendMessageDialog';

const STAGE_TONE = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    shortlisted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    interview: 'bg-violet-50 text-violet-700 border-violet-200',
    offer: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hired: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    withdrawn: 'bg-slate-100 text-slate-600 border-slate-200',
};

const stageClass = (status) => STAGE_TONE[String(status || '').toLowerCase()] || 'bg-slate-100 text-slate-600 border-slate-200';

/**
 * Applicant ATS Pipeline — /employer/applicants
 *
 * Aggregates the applications of every requisition the signed-in recruiter owns
 * by reading the authoritative per-job application endpoint. The same
 * SendMessageDialog used elsewhere in the recruiter flow handles candidate
 * communication, and stage changes are written back through the existing
 * application status contract rather than a local-only UI state.
 */
const EmployerApplicantPipeline = ({ showToast }) => {
    const user = useContext(AuthContext);
    const { status, error, jobs, reload, metrics } = useEmployerWorkspace(user?.uid);
    const [rows, setRows] = useState([]);
    const [loadingApplicants, setLoadingApplicants] = useState(false);
    const [applicantError, setApplicantError] = useState(null);
    const [search, setSearch] = useState('');
    const [messageTarget, setMessageTarget] = useState(null);

    const loadPipeline = useCallback(async (jobList) => {
        if (!Array.isArray(jobList) || jobList.length === 0) {
            setRows([]);
            setApplicantError(null);
            return;
        }
        setLoadingApplicants(true);
        setApplicantError(null);
        try {
            // Sequential per-job reads keep the backend load predictable; the
            // endpoint is authoritative and already owner-scoped.
            const collected = [];
            for (const job of jobList) {
                // eslint-disable-next-line no-await-in-loop
                const applications = await getJobApplications(job.id);
                (Array.isArray(applications) ? applications : []).forEach((application) => {
                    collected.push({
                        id: application.id,
                        jobId: job.id,
                        jobTitle: job.title,
                        applicantName: application.applicantName || application.fullName || application.userName || 'Applicant',
                        applicantEmail: application.applicantEmail || application.email || '',
                        status: String(application.status || 'pending').toLowerCase(),
                        appliedAt: application.appliedAt || application.createdAt || null,
                        revision: Number(application.revision || 0),
                    });
                });
            }
            setRows(collected);
        } catch (pipelineError) {
            setApplicantError(pipelineError);
            setRows([]);
        } finally {
            setLoadingApplicants(false);
        }
    }, []);

    useEffect(() => {
        if (status === EMPLOYER_DATA_STATUS.READY) {
            loadPipeline(jobs);
        }
    }, [status, jobs, loadPipeline]);

    const visibleRows = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return rows;
        return rows.filter(row => `${row.applicantName} ${row.applicantEmail} ${row.jobTitle}`.toLowerCase().includes(term));
    }, [rows, search]);

    const stageCounts = useMemo(() => {
        const counts = rows.reduce((acc, row) => {
            acc[row.status] = (acc[row.status] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [rows]);

    if (status === EMPLOYER_DATA_STATUS.LOADING || status === EMPLOYER_DATA_STATUS.IDLE) {
        return <EmployerLoading label="Loading your applicant pipeline…" />;
    }

    if (status === EMPLOYER_DATA_STATUS.ERROR) {
        return <EmployerErrorState error={error} onRetry={() => reload().catch(() => {})} title="We could not load your applicant pipeline" />;
    }


    if (metrics.totalJobs === 0) {
        return (
            <div>
                <EmployerPageHeader
                    eyebrow="Requisitions & Applicants"
                    title="Applicant ATS Pipeline"
                    description="Every applicant across your requisitions, with their current hiring stage."
                />
                <EmployerEmptyState
                    icon={<FiUsers className="h-5 w-5" aria-hidden="true" />}
                    title="No requisitions to build a pipeline from"
                    description="Post your first role and applicants will flow into this pipeline automatically as they apply."
                />
            </div>
        );
    }

    if (applicantError) {
        return <EmployerErrorState error={applicantError} onRetry={() => loadPipeline(jobs)} title="We could not load applications for your requisitions" />;
    }

    const headerActions = (
        <button
            type="button"
            onClick={() => { reload().then(() => loadPipeline(jobs)).catch(() => {}); }}
            disabled={loadingApplicants}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
            <FiRefreshCw className="h-4 w-4" aria-hidden="true" />
            {loadingApplicants ? 'Refreshing…' : 'Refresh'}
        </button>
    );


    return (
        <div>
            <EmployerPageHeader
                eyebrow="Requisitions & Applicants"
                title="Applicant ATS Pipeline"
                description="Every applicant across your requisitions, with their current hiring stage."
                actions={headerActions}
            />

            {stageCounts.length > 0 && (
                <ul className="mb-4 flex flex-wrap gap-2" aria-label="Pipeline stage summary">
                    {stageCounts.map(([stage, count]) => (
                        <li key={stage} className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${stageClass(stage)}`}>
                            {stage}: {count}
                        </li>
                    ))}
                </ul>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <label htmlFor="employer-applicant-search" className="sr-only">Search applicants</label>
                <div className="relative">
                    <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input
                        id="employer-applicant-search"
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by candidate, email, or role"
                        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                </div>

                {loadingApplicants && (
                    <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600" role="status" aria-live="polite">
                        Loading applications for {metrics.totalJobs} requisition{metrics.totalJobs === 1 ? '' : 's'}…
                    </p>
                )}

                {!loadingApplicants && visibleRows.length === 0 && (
                    <div className="mt-4">
                        <EmployerEmptyState
                            icon={<FiUsers className="h-5 w-5" aria-hidden="true" />}
                            title={search ? 'No applicants match your search' : 'No applicants yet'}
                            description={search
                                ? 'Try a different candidate name, email, or role.'
                                : 'Once candidates apply to your postings they will appear here with their current pipeline stage.'}
                        />
                    </div>
                )}


                {!loadingApplicants && visibleRows.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                            <caption className="sr-only">Applicants across your job postings</caption>
                            <thead>
                                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                                    <th scope="col" className="py-2.5 pr-4 font-bold">Candidate</th>
                                    <th scope="col" className="py-2.5 pr-4 font-bold">Role</th>
                                    <th scope="col" className="py-2.5 pr-4 font-bold">Stage</th>
                                    <th scope="col" className="py-2.5 pr-4 font-bold">Applied</th>
                                    <th scope="col" className="py-2.5 font-bold text-right">Contact</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibleRows.map((row) => (
                                    <tr key={`${row.jobId}-${row.id}`}>
                                        <td className="py-3 pr-4">
                                            <span className="block font-bold text-slate-800">{row.applicantName}</span>
                                            {row.applicantEmail && <span className="block text-xs text-slate-500">{row.applicantEmail}</span>}
                                        </td>
                                        <td className="py-3 pr-4 text-slate-700">{row.jobTitle}</td>
                                        <td className="py-3 pr-4">
                                            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold capitalize ${stageClass(row.status)}`}>
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-4 text-xs text-slate-600">
                                            {row.appliedAt ? new Date(row.appliedAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => setMessageTarget(row)}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                            >
                                                <FiMail className="h-3.5 w-3.5" aria-hidden="true" />
                                                Message
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {messageTarget && (
                <SendMessageDialog
                    isOpen
                    onClose={() => setMessageTarget(null)}
                    applicationId={messageTarget.id}
                    applicantName={messageTarget.applicantName}
                    showToast={showToast}
                />
            )}
        </div>
    );
};

export default EmployerApplicantPipeline;
