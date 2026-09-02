import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Step Components
import HeadingStep from './steps/HeadingStep';
import WorkHistoryStep from './steps/WorkHistoryStep';
import EducationStep from './steps/EducationStep';
import SkillsStep from './steps/SkillsStep';
import LanguagesStep from './steps/LanguagesStep';
import SummaryStep from './steps/SummaryStep';
import ProjectsStep from './steps/ProjectsStep';
import CertificationsStep from './steps/CertificationsStep';
import AchievementsStep from './steps/AchievementsStep';
import ReferencesStep from './steps/ReferencesStep';
import CustomSectionsStep from './steps/CustomSectionsStep';
import ReviewStep from './steps/ReviewStep';

import TemplateRenderer from '../TemplateRenderer';
import { getTemplateMeta } from '../../utils/templateCatalog';

// Modal Components
import PreviewModal from './PreviewModal';
import TemplateSelectionModal from './TemplateSelectionModal';
import AtsScoreMeter from './AtsScoreMeter';
import ResumeImportModal from './ResumeImportModal';
import { calculateAtsScore } from '../../utils/atsScore';

// Import necessary modules for PDF export
import axios from 'axios';
import download from 'downloadjs';
import config from '../../conf/configuration';
import { getJsonById, IncrementDownloads, addOneToNumberOfDocumentsDownloaded, getProfileOfUser, getSystemSettings, getAccountInfo } from '../../services/api/platform';
import { resolveAtsScoreVisibility } from '../../utils/moduleFlags';
import { createResumeDraft, loadResumeDraft, saveResumeDraft, publishResume, unpublishResume, getResumePublication, writeResumeRecovery, readResumeRecovery, clearResumeRecovery } from '../../services/resumePersistence';
import { EMPTY_RESUME, DEFAULT_SECTION_ORDER, normalizeResumeData, buildCanonicalResumeDocument } from '../../utils/resumeData';
import { trackDownload, trackEvent, trackEngagement } from '../../utils/ga4';
import { toValidatedPdfBlob, pdfFileName } from '../../utils/pdfDownload';
import { executeDocxDownload } from '../../utils/docxDownload';

// Import logo
import logo from '../../assets/logo/logo.png';

// Import Toasts component for subscription notifications
import Toasts from '../Toasts/Toats';

// Import animation library for toast animations
import { evaluateDownloadAccess, parseSafeDate } from '../../utils/subscriptionUtils';
import { motion, AnimatePresence } from 'framer-motion';

// Import user membership functions and modals
import { getUserMembership } from '../../data/entitlements';
import { getSubscriptionStatus } from '../../services/api/platform';
import fire from '../../conf/fire';
import PremiumUpgradeModal from '../common/PremiumUpgradeModal';
import SubscriptionModal from '../Dashboard/DashboardSettings/SubscriptionModal';
import ShareModal from '../Dashboard/ShareModal/ShareModal';

const BuildResume = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation('common');
    const [showPreview, setShowPreview] = useState(false);
    const [showTemplateSelection, setShowTemplateSelection] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [isImportEnabled, setIsImportEnabled] = useState(false);
    const [isAtsEnabled, setIsAtsEnabled] = useState(null);
    const [isPublicSharingEnabled, setIsPublicSharingEnabled] = useState(true);
    const [currentTemplate, setCurrentTemplate] = useState('Cv1');
    const [isDownloading, setIsDownloading] = useState(false);
    const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadRetry, setLoadRetry] = useState(0);
    const [authChecked, setAuthChecked] = useState(false);
    const [isManualSaving, setIsManualSaving] = useState(false);
    const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

    // Mobile responsiveness and studio drawer states
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
    const [isFooterCompressed, setIsFooterCompressed] = useState(true);
    const [showAtsDrawer, setShowAtsDrawer] = useState(false);
    const [showDesktopSplitPreview, setShowDesktopSplitPreview] = useState(false);
    const [showAllStepsModal, setShowAllStepsModal] = useState(false);
    const stepRibbonRef = useRef(null);

    // Toast notification states
    const [isSuccessToastVisible, setIsSuccessToastVisible] = useState(false);
    const [isDownloadToastVisible, setIsDownloadToastVisible] = useState(false);
    const [isUpgradeToastVisible, setIsUpgradeToastVisible] = useState(false);

    // Premium upgrade modal and checkout resumption state
    const [showPremiumUpgradeModal, setShowPremiumUpgradeModal] = useState(false);
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
    const [pendingExportType, setPendingExportType] = useState(null);

    // User data state (similar to how other components handle it)
    const [userData, setUserData] = useState({
        user: null,
        membership: 'Basic', // Default to Basic
        subscriptionsStatus: null, // This will hold the global subscription status from /data/subscriptions
        membershipEnds: null,
    });

    const [resumeData, setResumeData] = useState(() => normalizeResumeData(EMPTY_RESUME));
    const [saveState, setSaveState] = useState({ status: 'idle', message: '' });
    const [saveConflict, setSaveConflict] = useState(null);
    const [publicationState, setPublicationState] = useState({ isPublished: false, publicationRevision: 0, sourceRevision: 0, status: 'idle', message: '' });
    const saveConflictRef = useRef(null);
    const resumeDataRef = useRef(resumeData);
    const currentTemplateRef = useRef(currentTemplate);
    const resumeIdRef = useRef(null);
    const revisionRef = useRef(0);
    const userIdRef = useRef(null);
    const hasLoadedRef = useRef(false);
    const changeVersionRef = useRef(0);
    const savedVersionRef = useRef(0);
    const saveTimerRef = useRef(null);
    const saveInFlightRef = useRef(null);
    const retryTimerRef = useRef(null);

    // Scroll helper for Step Navigation Ribbon
    const scrollRibbon = (direction) => {
        if (stepRibbonRef.current) {
            const offset = direction === 'left' ? -240 : 240;
            stepRibbonRef.current.scrollBy({ left: offset, behavior: 'smooth' });
        }
    };

    // Auto-scroll active step into center view on navigation
    useEffect(() => {
        if (stepRibbonRef.current) {
            const activeBtn = stepRibbonRef.current.querySelector('.step-nav-btn[aria-current="step"]');
            if (activeBtn) {
                activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }
    }, [location.pathname]);

    useEffect(() => {
        if (!isMobileMenuOpen && !isMobilePreviewOpen && !showAllStepsModal && !showAtsDrawer) return undefined;
        const closeOnEscape = event => {
            if (event.key === 'Escape') {
                setIsMobileMenuOpen(false);
                setIsMobilePreviewOpen(false);
                setShowAllStepsModal(false);
                setShowAtsDrawer(false);
            }
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [isMobileMenuOpen, isMobilePreviewOpen, showAllStepsModal, showAtsDrawer]);

    // Load module settings (Import Module, ATS Score Module, etc.)
    useEffect(() => {
        const syncSettings = (settings, { allowMissingDefault = true } = {}) => {
            const importEnabled = settings?.modules?.enableImportModule !== undefined
                ? settings.modules.enableImportModule === true
                : settings?.ai?.enableImportModule === true;
            setIsImportEnabled(importEnabled);
            if (location.search && location.search.includes('import=true') && importEnabled) {
                setShowImportModal(true);
            }

            const atsVisible = resolveAtsScoreVisibility(settings, { allowMissingDefault });
            if (atsVisible !== null) setIsAtsEnabled(atsVisible);

            const sharingEnabled = settings?.modules?.enablePublicSharingModule !== undefined
                ? settings.modules.enablePublicSharingModule === true
                : true;
            setIsPublicSharingEnabled(sharingEnabled);
        };

        getSystemSettings().then((settings) => {
            syncSettings(settings, { allowMissingDefault: true });
        }).catch(() => {
            setIsImportEnabled(false);
            setIsAtsEnabled(false);
        });

        const handleSettingsUpdated = (e) => {
            if (e.detail?.modules) {
                syncSettings({ modules: e.detail.modules }, { allowMissingDefault: false });
                return;
            }
            if (e.detail?.category === 'modules') {
                getSystemSettings().then((settings) => {
                    syncSettings(settings, { allowMissingDefault: true });
                }).catch(() => {});
            }
        };
        window.addEventListener('systemSettingsUpdated', handleSettingsUpdated);

        return () => {
            window.removeEventListener('systemSettingsUpdated', handleSettingsUpdated);
        };
    }, [location.search]);

    // Auto-resume export action after user signs in / registers
    useEffect(() => {
        let pending = null;
        try {
            pending = sessionStorage.getItem('pendingDownloadAfterAuth');
        } catch (_e) {}

        if (pending && authChecked && userData.user) {
            try {
                sessionStorage.removeItem('pendingDownloadAfterAuth');
                const parsed = JSON.parse(pending);
                const access = evaluateDownloadAccess({
                    user: userData.user,
                    membership: userData.membership,
                    membershipEnds: userData.membershipEnds,
                    subscriptionsStatus: userData.subscriptionsStatus,
                    isStatusLoaded: true
                });
                if (access.allowed) {
                    if (parsed.type === 'docx') performDocxDownload();
                    else performDownload();
                } else if (access.reason === 'PREMIUM_REQUIRED') {
                    setPendingExportType(parsed.type || 'pdf');
                    setShowPremiumUpgradeModal(true);
                }
            } catch (_e) {}
        }
    }, [authChecked, userData.user, userData.membership]);

    // Handle payment activation / membership update events
    useEffect(() => {
        const handleMembershipUpdated = async (e) => {
            const newTier = e.detail?.membership || 'Premium';
            setUserData(prev => ({ ...prev, membership: newTier }));
            if (pendingExportType) {
                setShowSubscriptionModal(false);
                setShowPremiumUpgradeModal(false);
                const typeToRun = pendingExportType;
                setPendingExportType(null);
                showToast('Success');
                if (typeToRun === 'docx') {
                    await performDocxDownload();
                } else {
                    await performDownload();
                }
            }
        };
        window.addEventListener('userMembershipUpdated', handleMembershipUpdated);
        return () => window.removeEventListener('userMembershipUpdated', handleMembershipUpdated);
    }, [pendingExportType]);

    const steps = [
        {
            id: 1,
            name: t('BuildResume.steps.personalInfo'),
            path: 'heading',
            component: HeadingStep,
            icon: (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
            ),
        },
        {
            id: 2,
            name: t('BuildResume.steps.workHistory'),
            path: 'work-history',
            component: WorkHistoryStep,
            icon: (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v6.5l1.5 1.5H1.5L3 15.5V8a2 2 0 012-2h1zM8 5v1h4V5a1 1 0 00-1-1h-2a1 1 0 00-1 1z" clipRule="evenodd" />
                </svg>
            ),
        },
        {
            id: 3,
            name: t('BuildResume.steps.education'),
            path: 'education',
            component: EducationStep,
            icon: (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
                </svg>
            ),
        },
        {
            id: 4,
            name: t('BuildResume.steps.skills'),
            path: 'skills',
            component: SkillsStep,
            icon: (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                        fillRule="evenodd"
                        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                        clipRule="evenodd"
                    />
                </svg>
            ),
        },
        {
            id: 5,
            name: t('BuildResume.steps.projects', 'Projects'),
            path: 'projects',
            component: ProjectsStep,
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
            ),
        },
        {
            id: 6,
            name: t('BuildResume.steps.certifications', 'Certifications'),
            path: 'certifications',
            component: CertificationsStep,
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="8" r="7" />
                    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
                </svg>
            ),
        },
        {
            id: 7,
            name: t('BuildResume.steps.languages', 'Languages'),
            path: 'languages',
            component: LanguagesStep,
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
            ),
        },
        {
            id: 8,
            name: t('BuildResume.steps.summary'),
            path: 'summary',
            component: SummaryStep,
            icon: (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                        fillRule="evenodd"
                        d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z"
                        clipRule="evenodd"
                    />
                </svg>
            ),
        },
        {
            id: 9,
            name: t('BuildResume.steps.achievements', 'Achievements'),
            path: 'achievements',
            component: AchievementsStep,
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
            ),
        },
        {
            id: 10,
            name: t('BuildResume.steps.references', 'References'),
            path: 'references',
            component: ReferencesStep,
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
        },
        ...((resumeData.customSections || []).length > 0 || /\/custom\/?$/.test(location.pathname) ? [{
            id: 11,
            name: t('BuildResume.steps.customSections', 'Custom Sections'),
            path: 'custom',
            component: CustomSectionsStep,
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
            ),
        }] : []),
        {
            id: 12,
            name: 'Review & export',
            path: 'review',
            component: ReviewStep,
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
        },
    ];
    const orderedSteps = steps;

    const getCurrentStepIndex = () => {
        const currentPath = location.pathname.toLowerCase().replace(/\/$/, '');
        const segments = currentPath.split('/').filter(Boolean);
        const lastSegment = segments[segments.length - 1] || 'heading';

        const stepIndex = orderedSteps.findIndex((step) => step.path.toLowerCase() === lastSegment);
        return stepIndex >= 0 ? stepIndex : 0;
    };

    const currentStepIndex = getCurrentStepIndex();
    const currentStep = currentStepIndex >= 0 ? orderedSteps[currentStepIndex] : orderedSteps[0];

    const buildCanonicalSnapshot = useCallback((data = resumeDataRef.current) => buildCanonicalResumeDocument(
        data,
        currentTemplateRef.current || data?.template || 'Cv1',
    ), []);

    const persistLatest = useCallback(async ({ manual = false } = {}) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        const userId = userIdRef.current;
        const resumeId = resumeIdRef.current;
        const version = changeVersionRef.current;
        const snapshot = buildCanonicalSnapshot();

        if (!hasLoadedRef.current || !userId || !resumeId) {
            setSaveState({ status: version > savedVersionRef.current ? 'pending' : 'idle', message: userId ? 'Preparing draft…' : 'Sign in to save this draft' });
            return false;
        }
        writeResumeRecovery(userId, resumeId, revisionRef.current, snapshot);
        if (saveConflictRef.current) return false;
        if (saveInFlightRef.current) {
            await saveInFlightRef.current;
            if (savedVersionRef.current < changeVersionRef.current && !saveConflictRef.current) return persistLatest({ manual });
            return savedVersionRef.current >= version;
        }

        setSaveState({ status: 'saving', message: manual ? 'Saving resume…' : 'Saving changes…' });
        const operation = (async () => {
            try {
                const result = await saveResumeDraft(userId, resumeId, snapshot, { expectedRevision: revisionRef.current });
                revisionRef.current = result.revision;
                savedVersionRef.current = Math.max(savedVersionRef.current, version);
                if (savedVersionRef.current >= changeVersionRef.current) {
                    clearResumeRecovery(userId, resumeId);
                    setSaveState({ status: 'saved', message: 'All changes saved' });
                } else {
                    setSaveState({ status: 'pending', message: 'More changes pending…' });
                }
                return true;
            } catch (error) {
                if (error.code === 'RESUME_CONFLICT') {
                    saveConflictRef.current = { remoteRevision: error.remoteRevision, remoteData: error.remoteData };
                    setSaveConflict(saveConflictRef.current);
                    setSaveState({ status: 'conflict', message: 'This resume changed in another tab or device.' });
                } else {
                    const retryable = !['RESUME_TOO_LARGE', 'permission-denied', 'unauthenticated'].includes(error.code);
                    setSaveState({ status: 'error', message: error.message || (retryable ? 'Save failed. Retrying…' : 'Save failed.') });
                    if (retryable) retryTimerRef.current = setTimeout(() => persistLatest(), 3000);
                }
                return false;
            } finally {
                saveInFlightRef.current = null;
            }
        })();
        saveInFlightRef.current = operation;
        const saved = await operation;
        if (saved && savedVersionRef.current < changeVersionRef.current) return persistLatest({ manual });
        return saved;
    }, [buildCanonicalSnapshot]);

    const scheduleSave = useCallback((delay = 800) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setSaveState({ status: 'pending', message: 'Changes pending…' });
        saveTimerRef.current = setTimeout(() => persistLatest(), delay);
    }, [persistLatest]);

    const persistBeforeNavigation = async () => {
        if (!userIdRef.current) return true;
        persistLatest({ manual: false });
        return true;
    };

    const handleNext = async () => {
        if (!await persistBeforeNavigation()) return;
        if (currentStepIndex < orderedSteps.length - 1) navigate(`/build-resume/${orderedSteps[currentStepIndex + 1].path}`);
    };

    const handlePrevious = async () => {
        if (!await persistBeforeNavigation()) return;
        if (currentStepIndex > 0) navigate(`/build-resume/${orderedSteps[currentStepIndex - 1].path}`);
    };

    const handleStepClick = async (stepPath) => {
        if (!await persistBeforeNavigation()) return;
        navigate(`/build-resume/${stepPath}`);
    };

    const isStepCompleted = (stepId, stepPath) => {
        const completed = resumeData.completedSteps || [];
        if (completed.includes(stepId)) return true;
        if (stepPath && completed.includes(stepPath)) return true;
        const legacyMap = {
            1: [1, 'heading'],
            2: [3, 2, 'work-history', 'employment'],
            3: [4, 3, 'education'],
            4: [5, 4, 'skills'],
            5: [6, 5, 'projects'],
            6: [7, 6, 'certifications'],
            7: [8, 7, 'languages'],
            8: [2, 8, 'summary'],
            9: [9, 'achievements'],
            10: [10, 'references'],
            11: [11, 'custom'],
        };
        const aliases = legacyMap[stepId] || [];
        if (aliases.some((alias) => completed.includes(alias))) return true;

        // Substantive content verification for instant dynamic feedback
        const targetPath = stepPath || (orderedSteps.find(s => s.id === stepId)?.path);
        switch (targetPath) {
            case 'heading':
                return Boolean(resumeData.firstname?.trim() || resumeData.email?.trim());
            case 'work-history':
                return Array.isArray(resumeData.workHistory) && resumeData.workHistory.length > 0;
            case 'education':
                return Array.isArray(resumeData.educations) && resumeData.educations.length > 0;
            case 'skills':
                return Array.isArray(resumeData.skills) && resumeData.skills.length > 0;
            case 'projects':
                return Array.isArray(resumeData.projects) && resumeData.projects.length > 0;
            case 'certifications':
                return Array.isArray(resumeData.certifications) && resumeData.certifications.length > 0;
            case 'languages':
                return Array.isArray(resumeData.languages) && resumeData.languages.length > 0;
            case 'summary':
                return Boolean(resumeData.summary && resumeData.summary.trim().length > 10);
            case 'achievements':
                return Array.isArray(resumeData.achievements) && resumeData.achievements.length > 0;
            case 'references':
                return Array.isArray(resumeData.references) && resumeData.references.length > 0;
            case 'custom':
                return Array.isArray(resumeData.customSections) && resumeData.customSections.length > 0;
            default:
                return false;
        }
    };

    const getStepAiGuidance = (stepPath) => {
        switch (stepPath) {
            case 'heading':
                return {
                    title: 'Contact Details & Location',
                    tip: 'Include your full name, location, and verified email. ATS parsers match geographic location to check residency eligibility.',
                    statusBadge: (resumeData.firstname && resumeData.email) ? '✓ Verified Contact' : 'Incomplete',
                };
            case 'work-history':
                return {
                    title: 'Professional Experience & Impact',
                    tip: 'Use action verbs (Architected, Engineered, Spearheaded) and quantify achievements with percentages, revenue, or team scale.',
                    statusBadge: `${(resumeData.workHistory || []).length} role(s) recorded`,
                };
            case 'education':
                return {
                    title: 'Academic Degrees & Honors',
                    tip: 'List your highest degrees, academic institutions, graduation dates, and relevant awards or coursework.',
                    statusBadge: `${(resumeData.educations || []).length} degree(s) recorded`,
                };
            case 'skills':
                return {
                    title: 'Core Technical & Professional Skills',
                    tip: 'List 6–12 target role keywords, frameworks, and methodologies to maximize automated keyword matching.',
                    statusBadge: `${(resumeData.skills || []).length} skill(s) listed`,
                };
            case 'projects':
                return {
                    title: 'Highlighted Technical Projects',
                    tip: 'Showcase standout projects with live demo links, repository URLs, and descriptions of technical challenges solved.',
                    statusBadge: `${(resumeData.projects || []).length} project(s) added`,
                };
            case 'certifications':
                return {
                    title: 'Industry Certifications',
                    tip: 'Active cloud and professional credentials (AWS, GCP, PMP, CISSP) increase hiring manager interview rates by 35%.',
                    statusBadge: `${(resumeData.certifications || []).length} cert(s) added`,
                };
            case 'languages':
                return {
                    title: 'Languages & Proficiency',
                    tip: 'Specify native, fluent, or professional proficiency levels to highlight multilingual communication capability.',
                    statusBadge: `${(resumeData.languages || []).length} language(s) added`,
                };
            case 'summary':
                return {
                    title: 'Executive Career Summary',
                    tip: 'Craft a 2–3 sentence high-impact summary capturing years of domain expertise, primary stack, and leadership impact.',
                    statusBadge: resumeData.summary?.trim() ? 'Summary drafted ✓' : 'Summary pending',
                };
            case 'achievements':
                return {
                    title: 'Key Honors & Awards',
                    tip: 'Highlight recognitions, hackathon wins, patents, or publications that demonstrate proven excellence.',
                    statusBadge: `${(resumeData.achievements || []).length} award(s) listed`,
                };
            case 'references':
                return {
                    title: 'Professional References',
                    tip: 'Add verified managerial references or indicate "Available upon request" according to application instructions.',
                    statusBadge: `${(resumeData.references || []).length} reference(s)`,
                };
            case 'custom':
                return {
                    title: 'Custom Sections & Portfolio',
                    tip: 'Include custom categories such as Volunteering, Publications, Speaking, or Open Source Contributions.',
                    statusBadge: `${(resumeData.customSections || []).length} custom section(s)`,
                };
            case 'review':
                return {
                    title: 'Quality Review & Document Export',
                    tip: 'Inspect formatting across all sections, review your ATS score breakdown, choose a CV template, and export to PDF or DOCX.',
                    statusBadge: `${progressPercentage}% Complete`,
                };
            default:
                return {
                    title: 'Resume Studio Workspace',
                    tip: 'Complete each step thoroughly to produce an ATS-optimized, recruiter-ready resume.',
                    statusBadge: `${progressPercentage}% Complete`,
                };
        }
    };

    const updateResumeData = useCallback((newData) => {
        const merged = normalizeResumeData({ ...resumeDataRef.current, ...newData, template: currentTemplateRef.current });
        if (JSON.stringify(merged) === JSON.stringify(resumeDataRef.current)) return;
        resumeDataRef.current = merged;
        changeVersionRef.current += 1;
        setResumeData(merged);
        const userId = userIdRef.current;
        const resumeId = resumeIdRef.current;
        if (userId && resumeId) writeResumeRecovery(userId, resumeId, revisionRef.current, merged);
        scheduleSave();
    }, [scheduleSave]);

    const resolveConflictWithRemote = () => {
        if (!saveConflict?.remoteData) return;
        const remote = normalizeResumeData(saveConflict.remoteData);
        revisionRef.current = saveConflict.remoteRevision;
        resumeDataRef.current = remote;
        setResumeData(remote);
        setCurrentTemplate(remote.template || 'Cv1');
        currentTemplateRef.current = remote.template || 'Cv1';
        changeVersionRef.current += 1;
        savedVersionRef.current = changeVersionRef.current;
        clearResumeRecovery(userIdRef.current, resumeIdRef.current);
        saveConflictRef.current = null;
        setSaveConflict(null);
        setSaveState({ status: 'saved', message: 'Loaded the newer saved version' });
    };

    const resolveConflictWithLocal = async () => {
        if (!saveConflict) return;
        revisionRef.current = saveConflict.remoteRevision;
        saveConflictRef.current = null;
        setSaveConflict(null);
        setSaveState({ status: 'pending', message: 'Saving your version…' });
        await persistLatest({ manual: true });
    };

    useEffect(() => {
        const beforeUnload = event => {
            if (changeVersionRef.current <= savedVersionRef.current || saveState.status === 'saved') return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [saveState.status]);

    useEffect(() => () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    }, []);

    // Get user-friendly template name
    const getTemplateName = (templateId) => {
        const templateNames = {
            Cv1: t('BuildResume.templates.professionalClassic'),
            Cv2: t('BuildResume.templates.modernCreative'),
            Cv3: t('BuildResume.templates.creativeBold'),
            Cv4: t('BuildResume.templates.executivePro'),
            Cv5: t('BuildResume.templates.techModern'),
            Cv6: t('BuildResume.templates.simpleElegant'),
            Cv7: t('BuildResume.templates.designerSpecial'),
            Cv8: t('BuildResume.templates.cleanSimple'),
            Cv9: t('BuildResume.templates.corporateElite'),
            Cv10: t('BuildResume.templates.startupReady'),
            Cv11: t('BuildResume.templates.creativePro'),
            Cv12: t('BuildResume.templates.minimalPro'),
            Cv13: t('BuildResume.templates.businessClassic'),
            Cv14: t('BuildResume.templates.modernEdge'),
            Cv15: t('BuildResume.templates.artistPortfolio'),
            Cv16: t('BuildResume.templates.techInnovation'),
            Cv17: t('BuildResume.templates.executiveSuite'),
            Cv18: t('BuildResume.templates.creativeShowcase'),
            Cv19: t('BuildResume.templates.cleanProfessional'),
            Cv20: t('BuildResume.templates.futureForward'),
            Cv21: t('BuildResume.templates.professional21'),
            Cv22: t('BuildResume.templates.professional22'),
            Cv23: t('BuildResume.templates.professional23'),
            Cv24: t('BuildResume.templates.professional24'),
            Cv25: t('BuildResume.templates.professional25'),
            Cv26: t('BuildResume.templates.professional26'),
            Cv27: t('BuildResume.templates.professional27'),
            Cv28: t('BuildResume.templates.professional28'),
            Cv29: t('BuildResume.templates.professional29'),
            Cv30: t('BuildResume.templates.professional30'),
            Cv31: t('BuildResume.templates.professional31'),
            Cv32: t('BuildResume.templates.professional32'),
            Cv33: t('BuildResume.templates.professional33'),
            Cv34: t('BuildResume.templates.professional34'),
            Cv35: t('BuildResume.templates.professional35'),
            Cv36: t('BuildResume.templates.professional36'),
            Cv37: t('BuildResume.templates.professional37'),
            Cv38: t('BuildResume.templates.professional38'),
            Cv39: t('BuildResume.templates.professional39'),
            Cv40: t('BuildResume.templates.professional40'),
            Cv41: t('BuildResume.templates.professional41'),
            Cv42: t('BuildResume.templates.professional42'),
            Cv43: t('BuildResume.templates.professional43'),
            Cv44: t('BuildResume.templates.professional44'),
            Cv45: t('BuildResume.templates.professional45'),
            Cv46: t('BuildResume.templates.professional46'),
            Cv47: t('BuildResume.templates.professional47'),
            Cv48: t('BuildResume.templates.professional48'),
            Cv49: t('BuildResume.templates.professional49'),
            Cv50: t('BuildResume.templates.professional50'),
        };

        // Cv51 (and any future id) resolves through the authoritative catalog
        // instead of a hard-coded caption. The previous literal
        // "Europass Executive Classic" contradicted the rendering archetype
        // (modern-split) and the theme name ("Standard Europass Modern"),
        // which is what made Cv51's classification ambiguous across reports.
        return templateNames[templateId] || getTemplateMeta(templateId).name;
    };

    const handleManualSave = async () => {
        setIsManualSaving(true);
        setSaveSuccessMsg(false);
        const saved = await persistLatest({ manual: true });
        if (saved) {
            setSaveSuccessMsg(true);
            setTimeout(() => setSaveSuccessMsg(false), 2500);
        }
        setIsManualSaving(false);
    };

    const handleTemplateSelect = (templateId) => {
        currentTemplateRef.current = templateId;
        setCurrentTemplate(templateId);
        // Template selection changes presentation only. Colors are not written
        // into the resume data model: the preview derives the palette from the
        // selected template (with legacy user palettes still honored), so
        // switching to Cv21+ can no longer wipe a previously chosen palette.
        const updated = normalizeResumeData({
            ...resumeDataRef.current,
            template: templateId,
        });
        resumeDataRef.current = updated;
        setResumeData(updated);
        changeVersionRef.current += 1;
        const userId = userIdRef.current;
        const resumeId = resumeIdRef.current;
        if (userId && resumeId) writeResumeRecovery(userId, resumeId, revisionRef.current, updated);
        scheduleSave(0);
    };

    // Load saved template and language on component mount
    React.useEffect(() => {
        // Initialize language from localStorage
        const savedLanguage = localStorage.getItem('preferredLanguage');
        if (savedLanguage && savedLanguage !== i18n.language) {
            i18n.changeLanguage(savedLanguage);
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Get default colors for each template based on their actual defaults
    const getTemplateDefaultColors = (templateId) => {
        const templateColors = {
            Cv1: { primary: '#1E40AF', secondary: '#F1F5F9' },
            Cv2: { primary: '#f0c30e', secondary: '#f5f5f5' },
            Cv3: { primary: '#be8a95', secondary: '#000000' },
            Cv4: { primary: '#3d3e42', secondary: '#3d3e42' },
            Cv5: { primary: '#000000', secondary: '#2d3039' },
            Cv6: { primary: '#000000', secondary: '#09043c' },
            Cv7: { primary: '#000000', secondary: '#f5f5f5' },
            Cv8: { primary: '#353f58', secondary: '#3d3e42' },
            Cv9: { primary: '#555555', secondary: '#000000' },
            Cv10: { primary: '#0369c4', secondary: '#000000' },
            Cv11: { primary: '#86198f', secondary: '#fdf4ff' },
            Cv12: { primary: '#166534', secondary: '#f0fdf4' },
            Cv13: { primary: '#1e40af', secondary: '#eff6ff' },
            Cv14: { primary: '#b91c1c', secondary: '#fef2f2' },
            Cv15: { primary: '#9333ea', secondary: '#faf5ff' },
            Cv16: { primary: '#0d9488', secondary: '#f0fdfa' },
            Cv17: { primary: '#374151', secondary: '#f9fafb' },
            Cv18: { primary: '#f59e0b', secondary: '#fffbeb' },
            Cv19: { primary: '#3730a3', secondary: '#eef2ff' },
            Cv20: { primary: '#be185d', secondary: '#fdf2f8' },
            // Cv21-Cv50: No color initialization - let them use their hardcoded defaults
            Cv21: null,
            Cv22: null,
            Cv23: null,
            Cv24: null,
            Cv25: null,
            Cv26: null,
            Cv27: null,
            Cv28: null,
            Cv29: null,
            Cv30: null,
            Cv31: null,
            Cv32: null,
            Cv33: null,
            Cv34: null,
            Cv35: null,
            Cv36: null,
            Cv37: null,
            Cv38: null,
            Cv39: null,
            Cv40: null,
            Cv41: null,
            Cv42: null,
            Cv43: null,
            Cv44: null,
            Cv45: null,
            Cv46: null,
            Cv47: null,
            Cv48: null,
            Cv49: null,
            Cv50: null,
            Cv51: null,
        };

        return Object.prototype.hasOwnProperty.call(templateColors, templateId) ? templateColors[templateId] : templateColors.Cv1;
    };

    // Memoize the normalized preview/export view model once per data or template change.
    const previewData = React.useMemo(() => {
        const templateColors = getTemplateDefaultColors(currentTemplate);

        const addressParts = [
            resumeData.address,
            resumeData.city,
            resumeData.postalcode || resumeData.postalCode,
            resumeData.country
        ].map(item => String(item || '').trim()).filter(Boolean);
        const formattedFullAddress = addressParts.join(', ');

        return {
            ...resumeData,
            template: currentTemplate,
            fullAddress: formattedFullAddress,
            // Ensure arrays exist to prevent component errors
            employments: resumeData.employments || [],
            // Transform skills from new format (skillName) to old format (name) for Cv1 compatibility
            skills: (resumeData.skills || []).map((skill, index) => ({
                name: skill.skillName || skill.name || '',
                rating: typeof skill.rating === 'number' && Number.isFinite(skill.rating) ? skill.rating : null,
                date: skill.date || index + 1,
            })),
            educations: resumeData.educations || [],
            languages: resumeData.languages || [],
            // Include template-specific default colors
            colors: resumeData.colors || templateColors,
        };
    }, [resumeData, currentTemplate]);

    // Show Toast function similar to BoardFilling.jsx
    const showToast = (type) => {
        if (type === 'Download') {
            setIsDownloadToastVisible(true);
            setTimeout(() => {
                setIsDownloadToastVisible(false);
            }, 8000);
        }
        if (type === 'Success') {
            setIsSuccessToastVisible(true);
            setTimeout(() => {
                setIsSuccessToastVisible(false);
            }, 8000);
        }
        if (type === 'Upgrade') {
            setIsUpgradeToastVisible(true);
            setTimeout(() => {
                setIsUpgradeToastVisible(false);
            }, 8000);
        }
    };

    const handleExitBuilder = async () => {
        if (userIdRef.current && changeVersionRef.current > savedVersionRef.current && !await persistLatest({ manual: true })) return;
        navigate(userData.user ? '/dashboard' : '/');
    };

    const handleAddCustomSection = () => {
        const title = window.prompt(
            t('BuildResume.customSection.prompt', 'Enter Custom Section Title (e.g. Volunteer Work, Awards, Publications):'),
            t('BuildResume.customSection.defaultTitle', 'Awards & Honors')
        );
        if (!title?.trim()) return;
        const id = `custom-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
        const customSections = [...(resumeDataRef.current.customSections || []), { id, title: title.trim().slice(0, 100), items: [], visible: true }];
        const sectionOrder = [...resumeDataRef.current.sectionOrder];
        if (!sectionOrder.includes(id)) sectionOrder.push(id);
        if (!sectionOrder.includes('custom')) sectionOrder.push('custom');
        updateResumeData({ customSections, sectionOrder });
        navigate('/build-resume/custom');
    };

    useEffect(() => {
        if (!publicationState.message) return;
        const timer = setTimeout(() => {
            setPublicationState(curr => ({ ...curr, message: '' }));
        }, 4000);
        return () => clearTimeout(timer);
    }, [publicationState.message]);

    const handlePublishForReview = async () => {
        const userId = userIdRef.current;
        const resumeId = resumeIdRef.current;
        if (!userId || !resumeId) return;
        setPublicationState(current => ({ ...current, status: 'saving', message: 'Publishing secure review link…' }));
        try {
            if (!await persistLatest({ manual: true })) throw new Error('Save the resume before sharing');
            const published = await publishResume(userId, resumeId, buildCanonicalSnapshot(), { expectedRevision: revisionRef.current, expectedPublicationRevision: publicationState.publicationRevision });
            const shareUrl = `${window.location.origin}/shared/${resumeId}`;
            setPublicationState({ ...published, status: 'saved', message: 'Review link published & copied!' });
            try {
                await navigator.clipboard.writeText(shareUrl);
            } catch {}
            setShowShareModal(true);
        } catch (error) {
            setPublicationState(current => ({ ...current, status: 'error', message: error.message || 'Unable to publish review link' }));
        }
    };

    const handleStopSharing = async () => {
        const userId = userIdRef.current;
        const resumeId = resumeIdRef.current;
        if (!userId || !resumeId) return;
        setPublicationState(current => ({ ...current, status: 'saving', message: 'Revoking public link…' }));
        try {
            const unpublished = await unpublishResume(userId, resumeId, { expectedPublicationRevision: publicationState.publicationRevision });
            setPublicationState(current => ({ ...current, ...unpublished, status: 'saved', message: 'Public link revoked' }));
        } catch (error) {
            setPublicationState(current => ({ ...current, status: 'error', message: error.message || 'Unable to revoke link' }));
        }
    };

    // Enhanced Download PDF functionality with unified subscription verification
    const handleDownload = async () => {
        if (isDownloading) return;


        const access = evaluateDownloadAccess({
            user: userData.user,
            membership: userData.membership,
            membershipEnds: userData.membershipEnds,
            subscriptionsStatus: userData.subscriptionsStatus,
            isStatusLoaded: authChecked
        });


        if (access.allowed) {
            showToast('Download');
            await performDownload();
            return;
        }

        if (access.reason === 'LOGIN_REQUIRED') {
            await persistLatest({ manual: true });
            try {
                sessionStorage.setItem('pendingDownloadAfterAuth', JSON.stringify({
                    type: 'pdf',
                    template: currentTemplate,
                    resumeId: resumeIdRef.current
                }));
            } catch (_e) {}
            alert(t('BuildResume.errors.loginRequired', 'Please log in or sign up to download your resume. Your work has been saved.'));
            navigate('/?redirect=build-resume');
            return;
        }

        if (access.reason === 'PREMIUM_REQUIRED') {
            await persistLatest({ manual: true });
            setPendingExportType('pdf');
            setShowPremiumUpgradeModal(true);
            return;
        }
    };

    // Separate function for actual download (only called for Premium users)
    const performDownload = async () => {
        setIsDownloading(true);

        try {
            const resumeId = resumeIdRef.current;
            const user = userIdRef.current;
            if (!resumeId || !user || !await persistLatest({ manual: true })) throw new Error('Resume must be saved before export');

            await IncrementDownloads();
            await addOneToNumberOfDocumentsDownloaded(user);

            const currentUser = fire.auth().currentUser;
            const token = currentUser && typeof currentUser.getIdToken === 'function' ? await currentUser.getIdToken().catch(() => null) : null;
            const headers = token ? { Authorization: `Bearer ${token}` } : {};

            const response = await axios.post(
                `${config.provider}://${config.backendUrl}/api/export`,
                {
                    language: i18n.language,
                    resumeId,
                    resumeName: currentTemplate,
                },
                {
                    responseType: 'blob',
                    headers,
                }
            );

            const pdfBlob = await toValidatedPdfBlob(response.data);
            download(pdfBlob, pdfFileName(previewData?.firstname, previewData?.lastname), 'application/pdf');

            // Track download analytics only once a genuine PDF has been delivered, so
            // success metrics cannot count failed exports.
            trackDownload(currentTemplate, 'resume');
            trackEvent('download_document', 'Documents', currentTemplate, 1);
            trackEngagement('document_downloaded', {
                template_name: currentTemplate,
                document_type: 'resume',
            });
        } catch (error) {
            console.error('Download failed:', error);
            // Track download failure
            trackEvent('download_failed', 'Documents', currentTemplate, 0);
            // Prefer the server's reason (e.g. subscription required) over a generic string.
            alert(error?.code === 'EXPORT_NOT_PDF' && error.message
                ? error.message
                : t('BuildResume.errors.downloadFailed'));
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDocxDownload = async () => {
        if (isDownloadingDocx) return;

        const access = evaluateDownloadAccess({
            user: userData.user,
            membership: userData.membership,
            membershipEnds: userData.membershipEnds,
            subscriptionsStatus: userData.subscriptionsStatus,
            isStatusLoaded: authChecked
        });

        if (access.allowed) {
            showToast('Download');
            await performDocxDownload();
            return;
        }

        if (access.reason === 'LOGIN_REQUIRED') {
            await persistLatest({ manual: true });
            try {
                sessionStorage.setItem('pendingDownloadAfterAuth', JSON.stringify({
                    type: 'docx',
                    template: currentTemplate,
                    resumeId: resumeIdRef.current
                }));
            } catch (_e) {}
            alert(t('BuildResume.errors.loginRequired', 'Please log in or sign up to export your resume in Word (.docx) format. Your work has been saved.'));
            navigate('/?redirect=build-resume');
            return;
        }

        if (access.reason === 'PREMIUM_REQUIRED') {
            await persistLatest({ manual: true });
            setPendingExportType('docx');
            setShowPremiumUpgradeModal(true);
            return;
        }
    };

    const performDocxDownload = async () => {
        setIsDownloadingDocx(true);
        try {
            const resumeId = resumeIdRef.current;
            const userId = userIdRef.current;
            if (!resumeId || !userId || !await persistLatest({ manual: true })) throw new Error('Resume must be saved before export');

            await executeDocxDownload({
                resumeId,
                resumeName: currentTemplate,
                language: i18n.language,
                firstname: previewData?.firstname,
                lastname: previewData?.lastname,
                colors: previewData?.colors || null,
                userId,
            });
        } catch (error) {
            console.error('DOCX Download failed:', error);
            trackEvent('download_failed_docx', 'Documents', currentTemplate, 0);
            alert(error?.code === 'EXPORT_NOT_DOCX' && error.message
                ? error.message
                : t('BuildResume.errors.downloadFailed'));
        } finally {
            setIsDownloadingDocx(false);
        }
    };

    // Export resume in standardized JSON Resume format (jsonresume.org)
    () => {;
        const data = previewData;
        const jsonResumeSchema = {
            $schema: "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json",
            basics: {
                name: `${data.firstname || ''} ${data.lastname || ''}`.trim(),
                label: data.occupation || '',
                email: data.email || '',
                phone: data.phone || '',
                location: {
                    city: data.city || '',
                    countryCode: data.country || '',
                    address: data.address || '',
                    postalCode: data.postalcode || ''
                },
                summary: data.summary || ''
            },
            work: (data.employments || []).map(emp => ({
                name: emp.employer || '',
                position: emp.jobTitle || '',
                startDate: emp.startDate || '',
                endDate: emp.endDate || '',
                summary: emp.description || ''
            })),
            education: (data.educations || []).map(edu => ({
                institution: edu.school || '',
                area: edu.degree || '',
                startDate: edu.startDate || '',
                endDate: edu.endDate || ''
            })),
            skills: (data.skills || []).map(s => ({
                name: s.skillName || s.name || ''
            })),
            languages: (data.languages || []).map(l => ({
                language: l.language || l.name || '', fluency: l.level || l.proficiency || ''
            })),
            projects: (data.projects || []).map(project => ({
                name: project.title || project.name || '', description: project.description || '', url: project.url || project.link || ''
            })),
            certificates: (data.certifications || []).map(certificate => ({
                name: certificate.title || certificate.name || '', issuer: certificate.issuer || certificate.organization || '', date: certificate.date || ''
            })),
            awards: (data.achievements || []).map(achievement => ({
                title: achievement.title || achievement.name || '', awarder: achievement.issuer || '', summary: achievement.description || ''
            })),
            references: (data.references || []).map(reference => ({
                name: reference.name || '', reference: reference.reference || reference.description || ''
            }))
        };

        const blob = new Blob([JSON.stringify(jsonResumeSchema, null, 2)], { type: 'application/json' });
        download(blob, 'resume.json', 'application/json');
    };

    // Complete and save resume handler
    const handleCompleteResume = async () => {
        const requiredPersonalFields = ['firstname', 'lastname', 'email', 'phone', 'occupation'];
        const missingPersonalFields = requiredPersonalFields.filter((field) => !String(resumeDataRef.current?.[field] || '').trim());
        if (missingPersonalFields.length) {
            setSaveState({ status: 'error', message: 'Complete your required personal details before finishing.' });
            navigate('/build-resume/heading');
            return;
        }
        const userId = userIdRef.current;
        if (!userId) {
            alert('Please sign in to save your resume');
            return;
        }
        const saved = await persistLatest({ manual: true });
        if (!saved) {
            setSaveState(current => ({ ...current, message: current.message || 'Failed to save resume. Please try again.' }));
            return;
        }
        showToast('Success');
        trackEvent('resume_completed', 'Documents', currentTemplate, 1);
        localStorage.removeItem('currentResumeId');
        localStorage.removeItem('currentResumeItem');
        setTimeout(() => navigate('/dashboard'), 700);
    };

    // Fetch global subscription status on component mount
    React.useEffect(() => {
        // Fetch global subscription status first
        getSubscriptionStatus()
            .then((subscriptionData) => {
                setUserData((prevData) => ({
                    ...prevData,
                    subscriptionsStatus: subscriptionData,
                }));
            })
            .catch((error) => {
                console.error('Error fetching subscription status:', error);
            });
    }, []);

    // Auth listener and user data fetching (similar to Welcome.jsx and DashboardMain.jsx)
    React.useEffect(() => {
        const authListener = fire.auth().onAuthStateChanged((user) => {
            if (user) {
                if (userIdRef.current && userIdRef.current !== user.uid) {
                    hasLoadedRef.current = false;
                    resumeIdRef.current = null;
                    revisionRef.current = 0;
                    setResumeData(normalizeResumeData(EMPTY_RESUME));
                }
                userIdRef.current = user.uid;
                setUserData((prevData) => ({
                    ...prevData,
                    user: user.uid,
                }));

                // Fetch user membership information
                getUserMembership(user.uid)
                    .then((value) => {
                        if (value && value.membership) {
                            setUserData((prevData) => ({
                                ...prevData,
                                membership: value.membership,
                                membershipEnds: parseSafeDate(value.membershipEnds),
                            }));
                        } else {
                            setUserData((prevData) => ({
                                ...prevData,
                                membership: 'Basic',
                            }));
                        }
                        setAuthChecked(true);
                    })
                    .catch((error) => {
                        console.error('Error fetching user membership:', error);
                        setUserData((prevData) => ({
                            ...prevData,
                            membership: 'Basic',
                        }));
                        setAuthChecked(true);
                    });
            } else {
                userIdRef.current = null;
                resumeIdRef.current = null;
                revisionRef.current = 0;
                setUserData({
                    user: null,
                    membership: 'Basic',
                    subscriptionsStatus: null,
                    membershipEnds: null,
                });
                localStorage.removeItem('user');
                setAuthChecked(true);
            }
        });

        // Cleanup function
        return () => authListener();
    }, []); // Empty dependency array to run only on mount

    // Load the owner-scoped canonical draft, with one-time migration from legacy pb data.
    React.useEffect(() => {
        if (!authChecked || hasLoadedRef.current) return undefined;
        let active = true;
        const applyLoaded = (data, resumeId, revision, dirty = false) => {
            if (!active) return;
            const normalized = normalizeResumeData(data);
            resumeIdRef.current = resumeId;
            revisionRef.current = revision;
            resumeDataRef.current = normalized;
            currentTemplateRef.current = normalized.template || 'Cv1';
            setResumeData(normalized);
            setCurrentTemplate(currentTemplateRef.current);
            localStorage.setItem('currentResumeId', resumeId);
            localStorage.removeItem('currentResumeItem');
            localStorage.removeItem('selectedTemplate');
            changeVersionRef.current = dirty ? 1 : 0;
            savedVersionRef.current = 0;
            hasLoadedRef.current = true;
            setSaveState(dirty ? { status: 'pending', message: 'Recovered unsaved changes' } : { status: 'saved', message: 'All changes saved' });
            setIsLoading(false);
            getResumePublication(userIdRef.current, resumeId).then(state => {
                if (active) setPublicationState({ ...state, status: 'idle', message: '' });
            }).catch(() => {});
            if (dirty) setTimeout(() => scheduleSave(0), 0);
        };

        const initialize = async () => {
            setIsLoading(true);
            const userId = userIdRef.current;
            if (!userId) {
                const blank = normalizeResumeData(EMPTY_RESUME);
                resumeDataRef.current = blank;
                setResumeData(blank);
                hasLoadedRef.current = true;
                    setSaveState({ status: 'idle', message: 'Sign in to save this draft' });
                setIsLoading(false);
                return;
            }

            let selectedId = localStorage.getItem('currentResumeId');
            if (selectedId) {
                try {
                    let loaded = await loadResumeDraft(userId, selectedId);
                    // Migrate old flat pb drafts into the owner-scoped canonical document.
                    if (!loaded) {
                        const legacy = await getJsonById(selectedId).catch(() => null);
                        if (legacy) loaded = await createResumeDraft(userId, legacy, { resumeId: selectedId });
                    } else if (loaded.revision === 0) {
                        const legacy = await getJsonById(selectedId).catch(() => null);
                        if (legacy) {
                            const migrated = normalizeResumeData({ ...loaded.data, ...legacy });
                            const saved = await saveResumeDraft(userId, selectedId, migrated, { expectedRevision: 0 });
                            loaded = { id: selectedId, revision: saved.revision, data: migrated };
                        }
                    }
                    if (loaded) {
                        const recovery = readResumeRecovery(userId, selectedId);
                        const useRecovery = recovery && recovery.revision >= loaded.revision
                            && JSON.stringify(recovery.data) !== JSON.stringify(loaded.data);
                        applyLoaded(useRecovery ? recovery.data : loaded.data, selectedId, loaded.revision, Boolean(useRecovery));
                        return;
                    }
                } catch (error) {
                    console.warn('[BuildResume] Selected resume could not be loaded:', error.message);
                }
                localStorage.removeItem('currentResumeId');
                selectedId = null;
            }

            let initial = normalizeResumeData(EMPTY_RESUME);
            try {
                const profile = await getProfileOfUser(userId);
                if (profile) initial = normalizeResumeData({
                    ...initial,
                    firstname: profile.firstname || profile.name?.split(' ')[0] || '',
                    lastname: profile.lastname || profile.name?.split(' ').slice(1).join(' ') || '',
                    email: profile.email || '', phone: profile.phone || '', occupation: profile.occupation || '',
                    city: profile.city || '', country: profile.country || '', address: profile.address || '',
                    postalcode: profile.postalCode || profile.postalcode || '', photo: profile.selectedImage || profile.photo || null,
                    employments: profile.employments || profile.workExperiences || [], educations: profile.educations || profile.education || [],
                    skills: profile.skills || [], languages: profile.languages || [], projects: profile.projects || [],
                    certifications: profile.certifications || [], achievements: profile.achievements || profile.awards || [],
                    references: profile.references || [], customSections: profile.customSections || [],
                    hobbies: profile.hobbies || [], summary: profile.summary || '',
                });
            } catch (error) {
                console.warn('[BuildResume] Profile prefill unavailable:', error.message);
            }
            const created = await createResumeDraft(userId, initial);
            applyLoaded(created.data, created.id, created.revision, false);
        };

        initialize().catch(error => {
            if (!active) return;
            console.error('[BuildResume] Resume initialization failed:', error);
            setSaveState({ status: 'error', message: 'Resume could not be loaded. Try refreshing.' });
            setIsLoading(false);
        });
        return () => { active = false; };
    }, [authChecked, userData.user, scheduleSave, loadRetry]);

    // Redirect to first step if on base path
    React.useEffect(() => {
        if (
            location.pathname === '/build-resume' ||
            location.pathname === '/build-resume/' ||
            location.pathname === '/create-resume' ||
            location.pathname === '/create-resume/'
        ) {
            navigate('/build-resume/heading');
        }
    }, [location.pathname, navigate]);

    const contentSteps = orderedSteps.filter((step) => step.path !== 'review');
    const completedStepCount = contentSteps.filter((step) => isStepCompleted(step.id, step.path)).length;
    const progressPercentage = contentSteps.length ? Math.round((completedStepCount / contentSteps.length) * 100) : 0;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center w-full" aria-busy="true">
                <div className="flex flex-col items-center space-y-4" role="status">
                    <div aria-hidden="true" className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-600 text-sm font-semibold">Loading your resume...</p>
                </div>
            </div>
        );
    }
    if (!hasLoadedRef.current && saveState.status === 'error') {
        return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><div role="alert" className="max-w-md text-center"><h1 className="text-lg font-semibold text-slate-900">Resume unavailable</h1><p className="mt-2 text-sm text-slate-600">{saveState.message}</p><button type="button" onClick={() => { setSaveState({ status: 'idle', message: '' }); setLoadRetry(value => value + 1); }} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Try again</button></div></main>;
    }

    return (
        <div className="h-screen w-full bg-slate-50 flex flex-col overflow-hidden">
            {/* Toast Notifications */}
            <AnimatePresence>
                {isSuccessToastVisible && (
                    <motion.div initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.9 }} className="fixed top-6 right-6 z-50">
                        <Toasts type="Success" />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isDownloadToastVisible && (
                    <motion.div initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.9 }} className="fixed top-6 right-6 z-50">
                        <Toasts type="Download" />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isUpgradeToastVisible && (
                    <motion.div initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.9 }} className="fixed top-6 right-6 z-50">
                        <Toasts type="Upgrade" />
                    </motion.div>
                )}
            </AnimatePresence>

            {publicationState.message && (
                <div role="status" aria-live="polite" className={`fixed bottom-4 right-4 z-[70] max-w-sm rounded-lg border bg-white p-3 text-sm shadow-xl flex items-center justify-between gap-3 ${publicationState.status === 'error' ? 'border-red-200 text-red-800' : 'border-emerald-200 text-emerald-800'}`}>
                    <span>{publicationState.message}</span>
                    {publicationState.isPublished && (
                        <a
                            href={`/shared/${resumeIdRef.current || ''}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline shrink-0 cursor-pointer"
                        >
                            Open Link ↗
                        </a>
                    )}
                </div>
            )}
            {(saveState.status === 'error' || saveState.status === 'conflict') && (
                <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] max-w-xl w-[calc(100%_-_2rem)] rounded-lg border border-red-200 bg-white p-3 shadow-xl">
                    <p className="text-sm font-semibold text-red-800">{saveState.message}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {saveState.status === 'error' && <button type="button" onClick={() => persistLatest({ manual: true })} className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white">Retry save</button>}
                        {saveState.status === 'conflict' && <>
                            {saveConflict?.remoteData && <button type="button" onClick={resolveConflictWithRemote} className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white">Load newer version</button>}
                            <button type="button" onClick={resolveConflictWithLocal} className="rounded border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-800">Keep my changes</button>
                        </>}
                    </div>
                </div>
            )}

            {/* Unified Top Studio Header */}
            <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-2xs gap-2 sm:gap-4">
                {/* Left: Brand / Dashboard Link & Resume Context */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 max-w-[42%] sm:max-w-[48%]">
                    <button
                        type="button"
                        onClick={handleExitBuilder}
                        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 border border-slate-200/80 transition-all cursor-pointer shrink-0 shadow-2xs"
                        aria-label="Save and exit to dashboard"
                    >
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span className="hidden md:inline">Dashboard</span>
                    </button>

                    <div className="h-4 w-px bg-slate-200 hidden md:block shrink-0"></div>

                    {/* Resume Title & Active Template Badge */}
                    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                        <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate tracking-tight" title={resumeData?.title || 'My Resume'}>
                            {resumeData?.title || `${resumeData?.firstname || ''} ${resumeData?.lastname || ''}`.trim() || t('DashboardHomepage.tabs.resumes', 'My Resume')}
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowTemplateSelection(true)}
                            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200/80 transition-colors cursor-pointer shrink-0 shadow-2xs"
                            title="Click to switch template"
                        >
                            <span>{getTemplateName(currentTemplate)}</span>
                            <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>

                    {/* Auto-save Status Pill */}
                    <div role="status" aria-live="polite" className="hidden 2xl:flex items-center gap-1.5 text-[11px] font-medium text-slate-500 ml-1 shrink-0">
                        <span className={`w-2 h-2 rounded-full ${saveState.status === 'saved' ? 'bg-emerald-500' : saveState.status === 'error' || saveState.status === 'conflict' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`}></span>
                        <span className="truncate">{saveState.status === 'saved' ? 'Saved' : (saveState.message || 'Saving...')}</span>
                    </div>
                </div>

                {/* Center: First-Class ATS Career Readiness Companion Pill */}
                {isAtsEnabled === true && (() => {
                    const atsResult = calculateAtsScore(resumeData);
                    const atsScore = atsResult?.qualityScore || 0;
                    const atsStatus = atsResult?.status?.label || 'Getting Started';
                    const isGood = atsScore >= 75;
                    const isMedium = atsScore >= 45 && atsScore < 75;
                    
                    return (
                        <div className="flex items-center justify-center shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowAtsDrawer(prev => !prev)}
                                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full border transition-all cursor-pointer shadow-2xs ${
                                    isGood ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' :
                                    isMedium ? 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100' :
                                    'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                }`}
                                title="Click to open ATS Career Readiness Intelligence"
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-emerald-500' : isMedium ? 'bg-indigo-500' : 'bg-amber-500'}`}></span>
                                    <span className="text-xs font-black tracking-tight">ATS: {atsScore}/100</span>
                                </div>
                                <span className="hidden lg:inline text-[11px] font-bold text-slate-600 border-l border-slate-300/80 pl-1.5">
                                    {atsStatus}
                                </span>
                                <svg className={`w-3.5 h-3.5 transition-transform ${showAtsDrawer ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        </div>
                    );
                })()}

                {/* Right: Studio Quick Actions */}
                <div className="flex items-center gap-2">
                    {/* AI Import (if enabled) */}
                    {isImportEnabled && (
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 text-purple-700 hover:from-purple-100 hover:to-indigo-100 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                        >
                            <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span>AI Import</span>
                        </button>
                    )}

                    {/* Share for Review */}
                    {isPublicSharingEnabled && (
                        <button
                            onClick={handlePublishForReview}
                            disabled={publicationState.status === 'saving'}
                            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                            title="Share review link with peers or mentors"
                        >
                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                            <span>{publicationState.isPublished ? 'Review Link' : 'Share'}</span>
                        </button>
                    )}


                    {/* Full Preview Modal Button */}
                    <button
                        onClick={() => setShowPreview(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                    >
                        <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span className="hidden sm:inline">Preview</span>
                    </button>

                    {/* Download PDF Button */}
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                    >
                        {isDownloading ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span className="hidden sm:inline">Exporting...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span>Download</span>
                            </>
                        )}
                    </button>

                    {/* Mobile Menu Drawer Toggle */}
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer"
                        aria-label="Open navigation menu"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Horizontal Step Navigation Ribbon (Sleek, Scrollable, Complete 11-Step Discoverability) */}
            <nav aria-label="Resume Steps Stepper" className="step-nav-ribbon step-nav sticky top-[57px] z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3 sm:px-6 py-2 flex items-center justify-between gap-2 shadow-2xs">
                {/* Scroll Left Button */}
                <button
                    type="button"
                    onClick={() => scrollRibbon('left')}
                    className="hidden sm:flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors shrink-0 cursor-pointer"
                    aria-label="Scroll steps left"
                    title="Scroll left"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                {/* Horizontal Steps Container */}
                <div ref={stepRibbonRef} className="flex items-center gap-1.5 overflow-x-auto scroll-smooth no-scrollbar py-0.5 min-w-0 flex-1">
                    {orderedSteps.map((step, index) => {
                        const isActive = currentStep.id === step.id;
                        const isCompleted = isStepCompleted(step.id, step.path);

                        return (
                            <button
                                key={step.id}
                                onClick={() => handleStepClick(step.path)}
                                className={`step-nav-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                                    isActive
                                        ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/25 font-bold'
                                        : isCompleted
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100 font-semibold'
                                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                                aria-current={isActive ? 'step' : undefined}
                                title={`${step.name} (${isCompleted ? 'Completed' : 'Pending'})`}
                            >
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                    isActive
                                        ? 'bg-white text-indigo-700'
                                        : isCompleted
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-200 text-slate-600'
                                }`}>
                                    {isCompleted ? '✓' : index + 1}
                                </span>
                                <span>{step.name}</span>
                            </button>
                        );
                    })}

                    {/* Add Custom Section Pill */}
                    <button
                        type="button"
                        onClick={handleAddCustomSection}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 text-xs font-bold transition-all shrink-0 cursor-pointer shadow-2xs"
                        title="Add Custom Section"
                    >
                        <span>+ Custom</span>
                    </button>
                </div>

                {/* Scroll Right Button */}
                <button
                    type="button"
                    onClick={() => scrollRibbon('right')}
                    className="hidden sm:flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors shrink-0 cursor-pointer"
                    aria-label="Scroll steps right"
                    title="Scroll right"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                </button>

                {/* Stepper Overview Modal Trigger & Progress Summary */}
                <div className="flex items-center gap-2 shrink-0 pl-2 border-l border-slate-200">
                    <button
                        type="button"
                        onClick={() => setShowAllStepsModal(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200/80 transition-colors cursor-pointer shadow-2xs"
                        title="View all resume sections in detail"
                    >
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="hidden md:inline">11 Steps</span>
                        <span className="text-[11px] text-slate-500 font-medium">({completedStepCount}/{contentSteps.length})</span>
                        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <div className="hidden lg:flex items-center text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-xl">
                        <span>{progressPercentage}% Complete</span>
                    </div>
                </div>
            </nav>

            {/* Main Editing Canvas */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Scrollable Form Content */}
                <div className={`flex-1 overflow-y-auto bg-slate-50 ${showDesktopSplitPreview ? 'xl:max-w-[58%]' : ''} transition-all duration-300`}>
                    <div className="min-h-[calc(100vh-190px)] max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-32 sm:pb-28 space-y-4">
                        {/* Contextual AI Studio Micro-Guidance Banner */}
                        {(() => {
                            const guidance = getStepAiGuidance(currentStep.path);
                            return (
                                <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/50 to-white border border-indigo-100/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-2xs shrink-0 mt-0.5 sm:mt-0">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider">{guidance.title}</h4>
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-indigo-700 border border-indigo-200/70 shadow-2xs">{guidance.statusBadge}</span>
                                            </div>
                                            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{guidance.tip}</p>
                                        </div>
                                    </div>
                                    {isAtsEnabled === true && (
                                        <button
                                            type="button"
                                            onClick={() => setShowAtsDrawer(true)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200/80 shadow-2xs transition-colors shrink-0 cursor-pointer self-start sm:self-center"
                                        >
                                            <span>ATS Insights</span>
                                            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Step Form Routes */}
                        <Routes>
                            <Route path="heading" element={<HeadingStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="work-history" element={<WorkHistoryStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="education" element={<EducationStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="skills" element={<SkillsStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="languages" element={<LanguagesStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="summary" element={<SummaryStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="projects" element={<ProjectsStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="certifications" element={<CertificationsStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="achievements" element={<AchievementsStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="references" element={<ReferencesStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="custom" element={<CustomSectionsStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            <Route path="review" element={<ReviewStep resumeData={resumeData} templateName={getTemplateName(currentTemplate)} saveState={saveState} onNavigate={handleStepClick} onChooseTemplate={() => setShowTemplateSelection(true)} onPreview={() => setShowPreview(true)} onDownload={handleDownload} isDownloading={isDownloading} />} />
                            <Route path="" element={<HeadingStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                        </Routes>
                    </div>

                    {/* Fixed Bottom Action Footer (Never covers form content, sticky to viewport bottom) */}
                    <footer className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-4 sm:px-6 lg:px-8 py-3.5 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
                        <div className="flex justify-between items-center max-w-5xl mx-auto gap-3">
                            {/* Previous Button */}
                            <button
                                onClick={handlePrevious}
                                disabled={currentStepIndex === 0}
                                className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs rounded-xl shadow-2xs cursor-pointer"
                                aria-label="Go to previous step"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                </svg>
                                <span className="hidden sm:inline">{currentStepIndex > 0 ? `Previous: ${orderedSteps[currentStepIndex - 1]?.name}` : t('BuildResume.navigation.previous')}</span>
                                <span className="sm:hidden">Back</span>
                            </button>

                            {/* Center Status */}
                            <div className="hidden sm:flex items-center gap-2.5 text-xs font-semibold text-slate-500">
                                <span>Step {currentStepIndex + 1} of {orderedSteps.length}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className="font-bold text-slate-900">{orderedSteps[currentStepIndex]?.name}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className={saveState.status === 'saved' ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                                    {saveState.status === 'saved' ? 'Saved ✓' : 'Saving...'}
                                </span>
                            </div>

                            {/* Right Actions & Primary CTA */}
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPreview(true)}
                                    className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 hover:border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
                                >
                                    <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    <span>Preview</span>
                                </button>

                                {currentStepIndex < orderedSteps.length - 1 ? (
                                    <button
                                        onClick={handleNext}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-xl font-bold transition-all text-xs shadow-sm hover:shadow-md cursor-pointer"
                                    >
                                        <span>{t('BuildResume.navigation.nextStep', { stepName: orderedSteps[currentStepIndex + 1]?.name })}</span>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCompleteResume}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white rounded-xl font-bold transition-all text-xs shadow-md hover:shadow-lg cursor-pointer"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span>{t('BuildResume.navigation.complete', 'Finalize & Export Resume')}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </footer>
                </div>

            </div>

            {/* ATS Career Readiness Slide-Over Companion Drawer */}
            <AnimatePresence>
                {showAtsDrawer && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex justify-end"
                        onClick={() => setShowAtsDrawer(false)}
                    >
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-label="ATS Career Readiness Companion"
                        >
                            {/* Drawer Header */}
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-2xs">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">ATS Readiness Companion</h3>
                                        <p className="text-[11px] text-slate-500">Real-time keyword &amp; structure diagnostics</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAtsDrawer(false)}
                                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                                    aria-label="Close ATS Drawer"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Drawer Content */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                <AtsScoreMeter resumeData={resumeData} onNavigate={handleStepClick} />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mobile Navigation Drawer Overlay */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="md:hidden fixed inset-0 z-50 bg-black bg-opacity-30"
                        onClick={() => setIsMobileMenuOpen(false)}>
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl flex flex-col"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Resume builder navigation"
                            onClick={(e) => e.stopPropagation()}>
                            {/* Mobile Navigation Header */}
                            <div className="px-4 py-4 border-b border-slate-100 flex justify-between items-center">
                                <button type="button" onClick={async () => { setIsMobileMenuOpen(false); await handleExitBuilder(); }} aria-label="Save and exit to dashboard">
                                    <img src={logo} alt="Logo" className="h-7 w-auto object-contain" />
                                </button>
                                <button type="button" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close navigation menu" className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Mobile Steps Navigation */}
                            <div className="flex-1 px-3 py-4 overflow-y-auto">
                                <nav className="space-y-1.5">
                                    {orderedSteps.map((step, index) => {
                                        const isActive = currentStep.id === step.id;
                                        const isCompleted = isStepCompleted(step.id, step.path);

                                        return (
                                            <button
                                                key={step.id}
                                                onClick={() => {
                                                    handleStepClick(step.path);
                                                    setIsMobileMenuOpen(false);
                                                }}
                                                className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all duration-200 group relative ${
                                                    isActive
                                                        ? 'bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold shadow-2xs'
                                                        : isCompleted
                                                        ? 'text-slate-700 hover:bg-slate-50'
                                                        : 'text-slate-600 hover:bg-slate-50'
                                                }`}
                                                aria-current={isActive ? 'step' : undefined}>
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div
                                                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 transition-all ${
                                                            isActive
                                                                ? 'bg-indigo-600 text-white'
                                                                : isCompleted
                                                                ? 'bg-emerald-500 text-white'
                                                                : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                        {isCompleted ? '✓' : index + 1}
                                                    </div>

                                                    <div className="min-w-0 text-left">
                                                        <span className={`text-xs block truncate ${isActive ? 'font-bold text-indigo-950' : isCompleted ? 'font-semibold text-slate-800' : 'font-medium text-slate-600'}`}>
                                                            {step.name}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </nav>

                                {/* Mobile ATS Section */}
                                {isAtsEnabled === true && (
                                    <div className="mt-4">
                                        <AtsScoreMeter resumeData={resumeData} onNavigate={(path) => { handleStepClick(path); setIsMobileMenuOpen(false); }} />
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* All 11 Steps Stepper Overview Modal */}
            <AnimatePresence>
                {showAllStepsModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
                        onClick={() => setShowAllStepsModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Resume Sections & Step Overview"
                        >
                            {/* Modal Header */}
                            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 font-bold">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-extrabold text-slate-900 tracking-tight">Resume Sections Overview (11 Steps)</h3>
                                        <p className="text-xs text-slate-500 font-medium">Jump instantly to any section or inspect overall completion</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAllStepsModal(false)}
                                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                                    aria-label="Close overview modal"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Overall Progress Gauge Bar */}
                            <div className="px-6 py-3 bg-indigo-50/60 border-b border-indigo-100/60 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                                    <span>Overall Completion:</span>
                                    <span className="text-indigo-600 font-extrabold">{completedStepCount} of {contentSteps.length} Sections Finished</span>
                                </div>
                                <div className="flex items-center gap-3 flex-1 max-w-xs">
                                    <div className="flex-1 h-2 bg-indigo-200/80 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                                            style={{ width: `${progressPercentage}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-xs font-black text-indigo-700">{progressPercentage}%</span>
                                </div>
                            </div>

                            {/* Steps Grid */}
                            <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50/40">
                                {orderedSteps.map((step, index) => {
                                    const isActive = currentStep.id === step.id;
                                    const isCompleted = isStepCompleted(step.id, step.path);
                                    const guidance = getStepAiGuidance(step.path);

                                    return (
                                        <button
                                            key={step.id}
                                            onClick={() => {
                                                handleStepClick(step.path);
                                                setShowAllStepsModal(false);
                                            }}
                                            className={`p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between gap-2.5 cursor-pointer shadow-2xs hover:shadow-md ${
                                                isActive
                                                    ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-500/25 shadow-md'
                                                    : isCompleted
                                                    ? 'bg-white text-slate-900 border-emerald-200/90 hover:border-emerald-400'
                                                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                                                        isActive
                                                            ? 'bg-white/20 text-white'
                                                            : isCompleted
                                                            ? 'bg-emerald-600 text-white'
                                                            : 'bg-slate-100 text-slate-500'
                                                    }`}>
                                                        {isCompleted ? '✓' : index + 1}
                                                    </span>
                                                    <span className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-slate-900'}`}>
                                                        {step.name}
                                                    </span>
                                                </div>
                                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                                    isActive
                                                        ? 'bg-white text-indigo-700'
                                                        : isCompleted
                                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                        : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {isActive ? 'Current' : isCompleted ? 'Completed' : 'Pending'}
                                                </span>
                                            </div>

                                            <p className={`text-[11px] line-clamp-1 ${isActive ? 'text-indigo-100' : 'text-slate-500'}`}>
                                                {guidance.statusBadge || guidance.title}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleAddCustomSection();
                                        setShowAllStepsModal(false);
                                    }}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                >
                                    <span>+ Add Custom Section</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAllStepsModal(false)}
                                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
                                >
                                    Close Overview
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal Components */}
            <PreviewModal
                showPreview={showPreview}
                setShowPreview={setShowPreview}
                resumeData={previewData}
                onDownload={handleDownload}
                isDownloading={isDownloading}
                onDownloadDocx={handleDocxDownload}
                isDownloadingDocx={isDownloadingDocx}
                currentTemplate={currentTemplate}
                getTemplateName={getTemplateName}
            />

            <TemplateSelectionModal
                showModal={showTemplateSelection}
                setShowModal={setShowTemplateSelection}
                currentTemplate={currentTemplate}
                onTemplateSelect={handleTemplateSelect}
                resumeData={previewData}
            />

            <ResumeImportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImportData={(data) => {
                    updateResumeData(data);
                    showToast('Success');
                }}
            />

            {/* Premium Upgrade Modal for Free candidate upsell flow */}
            <PremiumUpgradeModal
                isOpen={showPremiumUpgradeModal}
                onClose={() => {
                    setShowPremiumUpgradeModal(false);
                    setPendingExportType(null);
                }}
                onUpgrade={() => {
                    setShowPremiumUpgradeModal(false);
                    setShowSubscriptionModal(true);
                }}
                downloadType={pendingExportType || 'pdf'}
                resumeTitle={previewData?.firstname ? `${previewData.firstname}'s Resume` : 'Resume'}
            />

            {/* In-Place Subscription Checkout Modal */}
            <SubscriptionModal
                isOpen={showSubscriptionModal}
                onClose={() => {
                    setShowSubscriptionModal(false);
                    setPendingExportType(null);
                }}
                user={userData.user}
                onSuccess={async () => {
                    setShowSubscriptionModal(false);
                    const currentUser = fire.auth().currentUser;
                    if (currentUser) {
                        await currentUser.getIdToken(true).catch(() => null);
                        const info = await getAccountInfo(currentUser.uid).catch(() => null);
                        if (info?.membership) {
                            setUserData(prev => ({
                                ...prev,
                                membership: info.membership,
                                membershipEnds: info.membershipEnds
                            }));
                        }
                    }
                    showToast('Success');
                    const exportTypeToResume = pendingExportType;
                    setPendingExportType(null);
                    if (exportTypeToResume === 'docx') {
                        await performDocxDownload();
                    } else {
                        await performDownload();
                    }
                }}
            />

            {/* Review Link / Social Share Modal */}
            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                documentId={resumeIdRef.current || ''}
                documentTitle={previewData?.firstname ? `${previewData.firstname}'s Resume` : 'Resume'}
            />
        </div>
    );
};

export default BuildResume;
