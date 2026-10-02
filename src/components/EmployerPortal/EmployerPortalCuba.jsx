import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardToast from '../Dashboard/DashboardToast/DashboardToast';
import CubaPortalShell from '../cuba/CubaPortalShell';
import { EMPLOYER_PORTAL_NAVIGATION } from '../cuba/portalNavigation';
import Spinner from '../Spinner/Spinner';

/**
 * Cuba recruiter console — Phase 5 wrapper for `/employer/*`.
 *
 * SCOPE, stated precisely:
 *   This wraps the recruiter console in the shared Cuba chrome. It mounts the
 *   SAME child components the existing `EmployerPortal` mounts, and preserves the
 *   exact same `showToast` contract, so all existing recruiter capability —
 *   job postings, applicant ATS pipeline, candidate messages, company profile,
 *   hiring preferences, the AddCompanyModal / EditJobModal / JobApplicationsModal
 *   dialogs — continues to work unchanged (§47).
 *
 *   Nothing is reimplemented: the children own their data, their `/api/employer/*`
 *   reads, their mutations and their states. No metric is recomputed here, so the
 *   overview can never disagree with the pipeline below it.
 *
 *   The default `/employer/*` route still mounts `EmployerPortal`. This variant
 *   is reached only when the `ime365_cuba_shell_v2` flag is on, so recruiter
 *   behaviour is preserved for every existing user (§49).
 */
const EmployerOverview = lazy(() => import('./EmployerOverview'));
const EmployerJobPostings = lazy(() => import('./EmployerJobPostings'));
const EmployerApplicantPipeline = lazy(() => import('./EmployerApplicantPipeline'));
const EmployerCompanyProfile = lazy(() => import('./EmployerCompanyProfile'));
const EmployerHiringPreferences = lazy(() => import('./EmployerHiringPreferences'));
const EmployerCandidateMessages = lazy(() => import('./EmployerCandidateMessages'));

const TOAST_VISIBLE_MS = 5000;

const NAV = EMPLOYER_PORTAL_NAVIGATION.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, href: item.to })),
}));

const EmployerPortalCuba = () => {
    const [toast, setToast] = useState({ isShowed: false, type: '', title: '', text: '' });

    // Same contract as EmployerPortal: every child receives a real function, so
    // no descendant can ever call an undefined showToast.
    const showToast = useCallback((type, title, text) => {
        setToast({
            isShowed: true,
            type: String(type || 'info'),
            title: String(title || ''),
            text: String(text || ''),
        });
    }, []);

    useEffect(() => {
        if (!toast.isShowed) return undefined;
        const timer = setTimeout(() => {
            setToast((previous) => ({ ...previous, isShowed: false }));
        }, TOAST_VISIBLE_MS);
        return () => clearTimeout(timer);
    }, [toast.isShowed]);

    return (
        <CubaPortalShell
            persona="Recruiter & Hiring"
            title="Recruiter Overview"
            navigation={NAV}
            user={{ name: 'Recruiter' }}
        >
            <DashboardToast
                isShowed={toast.isShowed}
                type={toast.type}
                title={toast.title}
                text={toast.text}
            />
            <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}>
                <Routes>
                    <Route index element={<EmployerOverview showToast={showToast} />} />
                    <Route path="jobs" element={<EmployerJobPostings showToast={showToast} />} />
                    <Route path="applicants" element={<EmployerApplicantPipeline showToast={showToast} />} />
                    <Route path="company" element={<EmployerCompanyProfile showToast={showToast} />} />
                    <Route path="messages" element={<EmployerCandidateMessages showToast={showToast} />} />
                    <Route path="settings" element={<EmployerHiringPreferences showToast={showToast} />} />
                    <Route path="*" element={<Navigate to="/employer" replace />} />
                </Routes>
            </Suspense>
        </CubaPortalShell>
    );
};

export default EmployerPortalCuba;
