import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCheckCircle, FiClock, FiMapPin, FiArrowRight, FiAlertTriangle } from 'react-icons/fi';
import { FaBuilding } from 'react-icons/fa';
import { AuthContext } from '../../context/AuthContext';
import { useEmployerWorkspace, EMPLOYER_DATA_STATUS } from './useEmployerWorkspace';
import { EmployerPageHeader, EmployerLoading, EmployerErrorState, EmployerEmptyState } from './EmployerStates';

const VERIFICATION_LABEL = {
    verified: 'Verified',
    approved: 'Approved',
    pending: 'Pending review',
    rejected: 'Rejected',
};

/**
 * Hiring Preferences — /employer/settings
 *
 * Recruiter defaults are derived from the company records the recruiter already
 * owns through the authoritative /api/employer/companies endpoint. Nothing here
 * is invented: an account with no company profile is sent to register one
 * instead of showing placeholder preferences.
 */
const EmployerHiringPreferences = ({ showToast }) => {
    const user = useContext(AuthContext);
    const { status, error, companies, reload } = useEmployerWorkspace(user?.uid);
    const [notice, setNotice] = useState(null);

    useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(null), 4000);
        return () => clearTimeout(timer);
    }, [notice]);

    const defaultCompany = useMemo(() => companies[0] || null, [companies]);

    if (status === EMPLOYER_DATA_STATUS.LOADING || status === EMPLOYER_DATA_STATUS.IDLE) {
        return <EmployerLoading label="Loading your hiring preferences…" />;
    }

    if (status === EMPLOYER_DATA_STATUS.ERROR) {
        return <EmployerErrorState error={error} onRetry={() => reload().catch(() => {})} title="We could not load your hiring preferences" />;
    }

    if (!defaultCompany) {
        return (
            <div>
                <EmployerPageHeader
                    eyebrow="Brand & Settings"
                    title="Hiring Preferences"
                    description="Default company and location details applied to new requisitions."
                />
                <EmployerEmptyState
                    icon={<FaBuilding className="h-5 w-5" aria-hidden="true" />}
                    title="No company profile yet"
                    description="Register a company profile first — your hiring defaults are derived from the companies you own."
                    action={(
                        <Link
                            to="/employer/company"
                            className="cuba-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold"
                        >
                            <FaBuilding className="h-4 w-4" aria-hidden="true" />
                            Register Company Profile
                            <FiArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    )}
                />
            </div>
        );
    }


    const verification = String(defaultCompany.verificationStatus || 'pending').toLowerCase();
    const isVerified = verification === 'verified' || verification === 'approved';

    return (
        <div>
            <EmployerPageHeader
                eyebrow="Brand & Settings"
                title="Hiring Preferences"
                description="Default company and location details applied to new requisitions."
            />

            {notice && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900" role="status">
                    <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{notice}</span>
                </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="employer-default-company">
                <h2 id="employer-default-company" className="text-sm font-extrabold text-slate-900">Default hiring company</h2>
                <p className="mt-1 text-xs text-slate-500">
                    Applied automatically when you create a new requisition. Manage the full registry on the company screen.
                </p>
                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Company</dt>
                        <dd className="mt-1 text-sm font-bold text-slate-900">{defaultCompany.name}</dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Industry</dt>
                        <dd className="mt-1 text-sm font-bold text-slate-900">{defaultCompany.industry}</dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                            <FiMapPin className="h-3.5 w-3.5" aria-hidden="true" />Location
                        </dt>
                        <dd className="mt-1 text-sm font-bold text-slate-900">{defaultCompany.location}</dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                            {isVerified
                                ? <FiCheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                : <FiClock className="h-3.5 w-3.5" aria-hidden="true" />}
                            Verification
                        </dt>
                        <dd className="mt-1 text-sm font-bold text-slate-900">{VERIFICATION_LABEL[verification] || verification}</dd>
                    </div>
                </dl>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Link
                        to="/employer/company"
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 cuba-focusable"
                    >
                        <FaBuilding className="h-4 w-4" aria-hidden="true" />
                        Manage company registry
                    </Link>
                    <button
                        type="button"
                        onClick={() => setNotice('New requisitions use the company and location shown above. Job-level overrides remain available per posting.')}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 cuba-focusable"
                    >
                        How defaults are applied
                    </button>
                </div>
            </section>
        </div>
    );
};

export default EmployerHiringPreferences;
