import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiBriefcase, FiCheckCircle, FiCompass, FiShield } from 'react-icons/fi';
import { FaBuilding } from 'react-icons/fa';
import AddCompanyModal from '../Dashboard/EmployerDashboard/AddCompanyModal';
import { EmployerPageHeader } from './EmployerStates';

/**
 * First-time recruiter experience.
 *
 * A recruiter with zero jobs and zero company profiles must never see a 404, a
 * blank table, or a misleading empty dashboard. This screen explains the two
 * setup steps and drives the existing AddCompanyModal and job posting flow, so
 * onboarding writes through the same authoritative endpoints the rest of the
 * portal uses.
 */
const ONBOARDING_STEPS = [
    {
        icon: FaBuilding,
        title: 'Register your company profile',
        body: 'Verify the organisation that will appear on every job posting and in the candidate job search experience.',
    },
    {
        icon: FiBriefcase,
        title: 'Post your first role',
        body: 'Create a requisition, define the pipeline stages, and start receiving real candidate applications.',
    },
    {
        icon: FiShield,
        title: 'Review and shortlist',
        body: 'Move candidates through the ATS pipeline, message shortlisted applicants, and track funnel status.',
    },
];


const EmployerOnboarding = ({ isEmployer, hasCompanies, showToast }) => {
    const navigate = useNavigate();
    const [companyModalOpen, setCompanyModalOpen] = useState(false);

    return (
        <div className="employerOnboardingCard">
            <EmployerPageHeader
                eyebrow="Getting started"
                title="Welcome to IME365 Hiring"
                description={hasCompanies
                    ? 'Your company profile is registered. Post your first role to start receiving candidates.'
                    : 'Set up your company profile, then post your first role. It takes about two minutes.'}
            />

            {isEmployer === false && (
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
                    <FiCompass className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                    <p className="text-sm text-amber-900">
                        Your account is not yet approved as an employer. You can still register a company profile — a platform
                        administrator reviews new employers before postings go live.
                    </p>
                </div>
            )}

            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {ONBOARDING_STEPS.map((step, index) => {
                    const Icon = step.icon;
                    return (
                        <li key={step.title} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                                <Icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Step {index + 1}</p>
                            <h2 className="mt-1 text-sm font-extrabold text-slate-900">{step.title}</h2>
                            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{step.body}</p>
                        </li>
                    );
                })}
            </ol>


            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <FiCheckCircle className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-sm font-extrabold text-slate-900">
                            {hasCompanies ? 'Company profile is ready' : 'No company profile yet'}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-600">
                            {hasCompanies
                                ? 'Post a role to open your first requisition.'
                                : 'Company details are required before you can post a job.'}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {hasCompanies ? (
                        <button
                            type="button"
                            onClick={() => navigate('/employer/jobs')}
                            className="cuba-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold"
                        >
                            <FiBriefcase className="h-4 w-4" aria-hidden="true" />
                            Register Company &amp; Post First Job
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setCompanyModalOpen(true)}
                                className="cuba-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold"
                            >
                                <FaBuilding className="h-4 w-4" aria-hidden="true" />
                                Register Company Profile
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/employer/jobs')}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 cuba-focusable"
                            >
                                Register Company &amp; Post First Job
                                <FiArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <AddCompanyModal
                isOpen={companyModalOpen}
                onClose={() => setCompanyModalOpen(false)}
                showToast={showToast}
            />
        </div>
    );
};

export default EmployerOnboarding;
