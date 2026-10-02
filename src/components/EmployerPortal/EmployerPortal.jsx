import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { FiMenu } from 'react-icons/fi';
import DashboardToast from '../Dashboard/DashboardToast/DashboardToast';
import EmployerSidebar from './EmployerSidebar';
import Spinner from '../Spinner/Spinner';
import { isCubaShellEnabled } from '../cuba/cubaShellFlag';
import './EmployerPortal.scss';

// Phase 5 (§49): the Cuba recruiter console. Lazily loaded, so the default
// legacy chrome never downloads it. Kept behind a lazy boundary here rather
// than in main.jsx so the canonical `/employer/*` route element is untouched.
const EmployerPortalCuba = lazy(() => import('./EmployerPortalCuba'));

// Recruiter capability is mounted under /employer only. Candidate-only asset
// builders (resume, cover letter, portfolio) are intentionally absent here and
// continue to serve the candidate portal through their /dashboard routes.
const EmployerOverview = lazy(() => import('./EmployerOverview'));
const EmployerJobPostings = lazy(() => import('./EmployerJobPostings'));
const EmployerApplicantPipeline = lazy(() => import('./EmployerApplicantPipeline'));
const EmployerCompanyProfile = lazy(() => import('./EmployerCompanyProfile'));
const EmployerHiringPreferences = lazy(() => import('./EmployerHiringPreferences'));
const EmployerCandidateMessages = lazy(() => import('./EmployerCandidateMessages'));

const TOAST_VISIBLE_MS = 5000;

const EmployerPortal = () => {
    const [toast, setToast] = useState({
        isShowed: false,
        type: '',
        title: '',
        text: '',
    });
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [cubaChrome, setCubaChrome] = useState(() => isCubaShellEnabled());

    useEffect(() => {
        setCubaChrome(isCubaShellEnabled());
    }, []);

    // Every employer child receives a real function here, so no descendant can
    // ever call an undefined showToast.
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
            setToast(previous => ({ ...previous, isShowed: false }));
        }, TOAST_VISIBLE_MS);
        return () => clearTimeout(timer);
    }, [toast.isShowed]);

    // Escape closes the mobile drawer so keyboard users are never trapped.
    useEffect(() => {
        if (!mobileMenuOpen) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setMobileMenuOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mobileMenuOpen]);

    const handleSidebarToggle = useCallback(() => {
        setSidebarCollapsed(prev => !prev);
    }, []);

    const closeMobileMenu = useCallback(() => {
        setMobileMenuOpen(false);
    }, []);

    // Rollout switch (§49). Default OFF, so every existing recruiter keeps the
    // shell that already passed the four-portal architecture gates. The Cuba
    // console mounts the identical child routes, so no recruiter capability is
    // conditional on this flag.
    if (cubaChrome) {
        return (
            <div data-testid="employer-portal-shell" data-shell-variant="cuba">
                <Suspense fallback={<div className="min-h-screen bg-cuba-canvas" aria-busy="true" />}>
                    <EmployerPortalCuba />
                </Suspense>
            </div>
        );
    }

    return (
        <div className="employerShell" data-testid="employer-portal-shell">
            <DashboardToast
                isShowed={toast.isShowed}
                type={toast.type}
                title={toast.title}
                text={toast.text}
            />

            <a
                href="#employer-content"
                className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900 focus:shadow"
            >
                Skip to content
            </a>

            <header className="employerMobileHeader">
                <button
                    type="button"
                    onClick={() => setMobileMenuOpen(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    aria-label="Open hiring navigation"
                    aria-expanded={mobileMenuOpen}
                >
                    <FiMenu className="h-5 w-5" aria-hidden="true" />
                </button>
                <span className="flex-1 truncate text-sm font-bold text-slate-800">Hiring Portal</span>
            </header>

            <EmployerSidebar
                sidebarCollapsed={sidebarCollapsed}
                onSidebarToggle={handleSidebarToggle}
                mobileMenuOpen={mobileMenuOpen}
                onCloseMobile={closeMobileMenu}
            />

            <div className="employerContent">
                <main id="employer-content" className="employerMain" tabIndex={-1}>
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
                </main>
            </div>
        </div>
    );
};

export default EmployerPortal;
