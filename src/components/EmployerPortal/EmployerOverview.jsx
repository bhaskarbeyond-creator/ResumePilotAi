import React, { useContext, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiBriefcase, FiUsers, FiLayers, FiShield, FiArrowRight, FiZap, FiTrendingUp } from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import { useEmployerWorkspace, EMPLOYER_DATA_STATUS } from './useEmployerWorkspace';
import { EmployerPageHeader, EmployerLoading, EmployerErrorState, EmployerStatCard } from './EmployerStates';
import EmployerOnboarding from './EmployerOnboarding';

/**
 * Recruiter Overview — /employer
 *
 * Metrics are read from the same authoritative employer records that back the
 * job postings and applicant pipeline screens. A brand new recruiter with no
 * jobs and no company profile is routed to a real onboarding experience instead
 * of a 404, blank table, or a misreporting dashboard.
 */
const EmployerOverview = ({ showToast }) => {
    const user = useContext(AuthContext);
    const { status, error, jobs, companies, metrics, reload, isEmployer } = useEmployerWorkspace(user?.uid);
    const [refreshing, setRefreshing] = useState(false);

    const needsOnboarding = status === EMPLOYER_DATA_STATUS.EMPTY;
    const hasCompanies = companies.length > 0;

    const funnel = useMemo(() => {
        const byStatus = jobs.reduce((acc, job) => {
            acc[job.status] = (acc[job.status] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
    }, [jobs]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await reload();
            showToast('success', 'Workspace refreshed', 'Your hiring metrics are up to date.');
        } catch (refreshError) {
            showToast('error', 'Refresh failed', refreshError?.message || 'Please try again.');
        } finally {
            setRefreshing(false);
        }
    };

    if (status === EMPLOYER_DATA_STATUS.LOADING || status === EMPLOYER_DATA_STATUS.IDLE) {
        return <EmployerLoading label="Loading your hiring overview…" />;
    }

    if (status === EMPLOYER_DATA_STATUS.ERROR) {
        return <EmployerErrorState error={error} onRetry={handleRefresh} />;
    }

    if (needsOnboarding) {
        return <EmployerOnboarding isEmployer={isEmployer} hasCompanies={hasCompanies} showToast={showToast} />;
    }


    return (
        <div>
            <EmployerPageHeader
                eyebrow="Hiring Command"
                title="Recruiter Overview"
                description="Live requisition, applicant, and funnel status for your hiring workspace."
                actions={
                    <>
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                            <FiTrendingUp className="h-4 w-4" aria-hidden="true" />
                            {refreshing ? 'Refreshing…' : 'Refresh'}
                        </button>
                        <Link
                            to="/employer/jobs"
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                        >
                            <FiBriefcase className="h-4 w-4" aria-hidden="true" />
                            Manage job postings
                        </Link>
                    </>
                }
            />

            <section aria-label="Hiring metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 sm:gap-5">
                <EmployerStatCard
                    icon={<FiBriefcase className="h-5 w-5" aria-hidden="true" />}
                    label="Active jobs"
                    value={metrics.activeJobs}
                    hint={`${metrics.totalJobs} total requisitions`}
                    trend={metrics.totalJobs > 0 ? `${metrics.activeJobs} active` : null}
                    tone="indigo"
                />
                <EmployerStatCard
                    icon={<FiUsers className="h-5 w-5" aria-hidden="true" />}
                    label="Candidates"
                    value={metrics.totalApplications}
                    hint="Across all requisitions"
                    trend={metrics.totalApplications > 0 ? `${metrics.totalApplications} total` : null}
                    tone="emerald"
                />
                <EmployerStatCard
                    icon={<FiLayers className="h-5 w-5" aria-hidden="true" />}
                    label="Companies"
                    value={metrics.totalCompanies}
                    hint={`${metrics.verifiedCompanies} verified`}
                    trend={metrics.totalCompanies > 0 ? `${metrics.verifiedCompanies} verified` : null}
                    tone="amber"
                />
                <EmployerStatCard
                    icon={<FiShield className="h-5 w-5" aria-hidden="true" />}
                    label="Funnel stages"
                    value={funnel.length}
                    hint="Distinct pipeline states"
                    trend={funnel.length > 0 ? `${funnel.length} stages` : null}
                    tone="slate"
                />
            </section>

            <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 lg:col-span-2">
                    <h2 className="text-sm font-extrabold text-slate-900">Recent requisitions</h2>
                    <p className="mt-1 text-xs text-slate-500">Newest first, straight from your employer job records.</p>
                    <ul className="mt-4 divide-y divide-slate-100">
                        {jobs.slice(0, 5).map((job) => (
                            <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold text-slate-800">{job.title}</span>
                                    <span className="block truncate text-xs text-slate-500">{job.company} · {job.location}</span>
                                </span>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold capitalize text-slate-600">{job.status}</span>
                                <span className="w-24 text-right text-xs font-bold text-slate-700">{job.applicationCount} applicant{job.applicationCount === 1 ? '' : 's'}</span>
                            </li>
                        ))}
                    </ul>
                    {jobs.length === 0 && (
                        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No requisitions are visible to your account yet.</p>
                    )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                    <h2 className="text-sm font-extrabold text-slate-900">Quick actions</h2>
                    <ul className="mt-4 space-y-2">
                        <li>
                            <Link to="/employer/jobs" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                <span className="flex items-center gap-2"><FiBriefcase className="h-4 w-4" aria-hidden="true" />Post a new role</span>
                                <FiArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                            </Link>
                        </li>
                        <li>
                            <Link to="/employer/applicants" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                <span className="flex items-center gap-2"><FiUsers className="h-4 w-4" aria-hidden="true" />Review applicants</span>
                                <FiArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                            </Link>
                        </li>
                        <li>
                            <Link to="/employer/company" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                                <span className="flex items-center gap-2"><FiLayers className="h-4 w-4" aria-hidden="true" />Company profile</span>
                                <FiArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                            </Link>
                        </li>
                    </ul>
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-900">
                        <FiZap className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Shared talent pools, team seats, and AI quota governance live in the organization workspace.
                    </p>
                </div>
            </section>
        </div>
    );
};

export default EmployerOverview;
