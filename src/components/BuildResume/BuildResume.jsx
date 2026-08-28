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

import TemplateRenderer from '../TemplateRenderer';
import { getTemplateMeta } from '../../utils/templateCatalog';

// Modal Components
import PreviewModal from './PreviewModal';
import TemplateSelectionModal from './TemplateSelectionModal';
import AtsScoreMeter from './AtsScoreMeter';
import ResumeImportModal from './ResumeImportModal';

// Import necessary modules for PDF export
import axios from 'axios';
import download from 'downloadjs';
import config from '../../conf/configuration';
import { getJsonById, IncrementDownloads, addOneToNumberOfDocumentsDownloaded, getProfileOfUser, getSystemSettings } from '../../services/api/platform';
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

// Import user membership functions
import { getUserMembership } from '../../data/entitlements';
import { getSubscriptionStatus } from '../../services/api/platform';
import fire from '../../conf/fire';

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
    const [isLoading, setIsLoading] = useState(true);
    const [loadRetry, setLoadRetry] = useState(0);
    const [authChecked, setAuthChecked] = useState(false);
    const [isManualSaving, setIsManualSaving] = useState(false);
    const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

    // Mobile responsiveness states
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
    const [isFooterCompressed, setIsFooterCompressed] = useState(true);

    // Toast notification states
    const [isSuccessToastVisible, setIsSuccessToastVisible] = useState(false);
    const [isDownloadToastVisible, setIsDownloadToastVisible] = useState(false);
    const [isUpgradeToastVisible, setIsUpgradeToastVisible] = useState(false);

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

    useEffect(() => {
        if (!isMobileMenuOpen && !isMobilePreviewOpen) return undefined;
        const closeOnEscape = event => {
            if (event.key === 'Escape') {
                setIsMobileMenuOpen(false);
                setIsMobilePreviewOpen(false);
            }
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [isMobileMenuOpen, isMobilePreviewOpen]);

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
            id: 3,
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
            id: 4,
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
            id: 5,
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
            id: 6,
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
            id: 7,
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
            id: 8,
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
    ];
    const sectionKeyForPath = path => ({ 'work-history': 'employment' }[path] || path);
    const sectionOrderList = Array.isArray(resumeData?.sectionOrder) && resumeData.sectionOrder.length
        ? resumeData.sectionOrder
        : DEFAULT_SECTION_ORDER;
    const orderedSteps = [...steps].sort((left, right) => {
        const leftIndex = sectionOrderList.indexOf(sectionKeyForPath(left.path));
        const rightIndex = sectionOrderList.indexOf(sectionKeyForPath(right.path));
        return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
    });

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

    const handleNext = async () => {
        await persistLatest({ manual: true });
        if (currentStepIndex < orderedSteps.length - 1) navigate(`/build-resume/${orderedSteps[currentStepIndex + 1].path}`);
    };

    const handlePrevious = async () => {
        await persistLatest({ manual: true });
        if (currentStepIndex > 0) navigate(`/build-resume/${orderedSteps[currentStepIndex - 1].path}`);
    };

    const handleStepClick = async (stepPath) => {
        await persistLatest({ manual: true });
        navigate(`/build-resume/${stepPath}`);
    };

    const isStepCompleted = (stepId) => resumeData.completedSteps.includes(stepId);

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
        ].map(item => (item || '').trim()).filter(Boolean);
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
        if (changeVersionRef.current > savedVersionRef.current && !await persistLatest({ manual: true })) return;
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

    const handlePublishForReview = async () => {
        const userId = userIdRef.current;
        const resumeId = resumeIdRef.current;
        if (!userId || !resumeId) return;
        setPublicationState(current => ({ ...current, status: 'saving', message: 'Publishing secure review link…' }));
        try {
            if (!await persistLatest({ manual: true })) throw new Error('Save the resume before sharing');
            const published = await publishResume(userId, resumeId, buildCanonicalSnapshot(), { expectedRevision: revisionRef.current, expectedPublicationRevision: publicationState.publicationRevision });
            const shareUrl = `${window.location.origin}/shared/${resumeId}`;
            setPublicationState({ ...published, status: 'saved', message: 'Review link published' });
            try {
                await navigator.clipboard.writeText(shareUrl);
                setPublicationState(current => ({ ...current, status: 'saved', message: 'Review link copied' }));
            } catch {
                setPublicationState(current => ({ ...current, status: 'saved', message: `Published: ${shareUrl}` }));
            }
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

        console.log('Evaluated download access decision:', access);

        if (access.allowed) {
            console.log(`Download allowed. Reason: ${access.reason}`);
            showToast('Download');
            await performDownload();
            return;
        }

        if (access.reason === 'LOGIN_REQUIRED') {
            console.log('User not logged in, showing login prompt');
            alert(t('BuildResume.errors.loginRequired', 'Please log in to download your resume. You will be redirected to the login page.'));
            navigate('/');
            return;
        }

        if (access.reason === 'PREMIUM_REQUIRED') {
            console.log('Non-premium user with subscriptions enabled, redirecting to billing');

            const saved = await persistLatest({ manual: true });
            if (!saved) {
                setSaveState({ status: 'error', message: 'Save the resume before leaving for billing.' });
                return;
            }
            showToast('Success');
            showToast('Upgrade');
            setTimeout(() => {
                window.location.href = '/billing/plans';
            }, 3000);
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
            alert(t('BuildResume.errors.loginRequired', 'Please log in to download your resume. You will be redirected to the login page.'));
            navigate('/');
            return;
        }

        if (access.reason === 'PREMIUM_REQUIRED') {
            const saved = await persistLatest({ manual: true });
            if (!saved) {
                setSaveState({ status: 'error', message: 'Save the resume before leaving for billing.' });
                return;
            }
            showToast('Success');
            showToast('Upgrade');
            setTimeout(() => {
                window.location.href = '/billing/plans';
            }, 3000);
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
                console.log('Global subscription status:', subscriptionData);
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

    const progressPercentage = Math.round((resumeData.completedSteps.length / orderedSteps.length) * 100);

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
        <div className="h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex overflow-hidden">
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
                <div role="status" aria-live="polite" className={`fixed bottom-4 right-4 z-[70] max-w-sm rounded-lg border bg-white p-3 text-sm shadow-xl ${publicationState.status === 'error' ? 'border-red-200 text-red-800' : 'border-emerald-200 text-emerald-800'}`}>
                    {publicationState.message}
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

            {/* Mobile Header - Only visible on mobile */}
            <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 px-4 py-3 z-30 flex items-center justify-between">
                {/* Mobile Menu Button */}
                <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg" aria-label="Open navigation menu">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>

                {/* Logo */}
                <div className="flex flex-col items-center">
                    <button type="button" onClick={handleExitBuilder} aria-label="Save and exit to dashboard">
                        <img src={logo} alt="Logo" className="h-7 w-auto object-contain" />
                    </button>
                    <span role="status" aria-live="polite" className={`text-[10px] font-semibold ${saveState.status === 'error' || saveState.status === 'conflict' ? 'text-red-700' : saveState.status === 'saved' ? 'text-emerald-700' : 'text-amber-700'}`}>{saveState.message || 'Draft ready'}</span>
                </div>

                {/* Mobile Preview Button */}
                <button onClick={() => setIsMobilePreviewOpen(true)} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg" aria-label="Open resume preview">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                    </svg>
                </button>
            </div>

            {/* Mobile Navigation Overlay */}
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
                            className="fixed left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Resume builder navigation"
                            onClick={(e) => e.stopPropagation()}>
                            {/* Mobile Navigation Header */}
                            <div className="px-4 py-6 border-b border-slate-100 flex justify-between items-center">
                                <button type="button" onClick={async () => { setIsMobileMenuOpen(false); await handleExitBuilder(); }} aria-label="Save and exit to dashboard">
                                    <img src={logo} alt="Logo" className="h-8 w-auto object-contain" />
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
                                        const isCompleted = isStepCompleted(step.id);
                                        const isPrevious = index < currentStepIndex;

                                        return (
                                            <button
                                                key={step.id}
                                                onClick={() => {
                                                    handleStepClick(step.path);
                                                    setIsMobileMenuOpen(false);
                                                }}
                                                className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all duration-200 group relative ${
                                                    isActive
                                                        ? 'bg-gradient-to-r from-blue-50/90 to-indigo-50/60 border border-blue-200/90 text-blue-900 shadow-2xs'
                                                        : isCompleted
                                                        ? 'text-slate-700 hover:bg-slate-50/90 hover:border-slate-200/80 border border-transparent'
                                                        : isPrevious
                                                        ? 'text-slate-600 hover:bg-slate-50 hover:border-slate-200/80 border border-transparent'
                                                        : 'text-slate-400 hover:text-slate-600 border border-transparent'
                                                }`}
                                                disabled={!isCompleted && !isPrevious && !isActive}
                                                aria-current={isActive ? 'step' : undefined}>
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    {/* Step Icon/Status */}
                                                    <div
                                                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 transition-all duration-200 ${
                                                            isActive
                                                                ? 'bg-blue-600 text-white shadow-xs'
                                                                : isCompleted
                                                                ? 'bg-emerald-500 text-white shadow-2xs'
                                                                : isPrevious
                                                                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                                                : 'bg-slate-50 text-slate-400 border border-slate-200/60'
                                                        }`}>
                                                        {isCompleted ? (
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            step.icon
                                                        )}
                                                    </div>

                                                    <div className="min-w-0 text-left">
                                                        <span className={`text-xs block truncate ${isActive ? 'font-bold text-blue-950' : isCompleted ? 'font-semibold text-slate-800' : 'font-medium text-slate-600'}`}>
                                                            {step.name}
                                                        </span>
                                                        <span className={`text-[10px] block leading-tight ${isActive ? 'font-bold text-blue-600' : isCompleted ? 'font-medium text-emerald-600' : 'text-slate-400'}`}>
                                                            {isActive ? 'Editing' : isCompleted ? 'Complete' : 'Pending'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Active left indicator */}
                                                {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full"></div>}
                                            </button>
                                        );
                                    })}
                                </nav>

                                {/* Mobile Progress Section */}
                                {isAtsEnabled === true && (
                                    <div className="mt-4">
                                        <AtsScoreMeter resumeData={resumeData} onNavigate={(path) => { handleStepClick(path); setIsMobileMenuOpen(false); }} />
                                    </div>
                                )}

                                <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-semibold text-slate-700">{t('BuildResume.progress.progress')}</span>
                                        <span className="text-sm font-bold text-slate-900">{progressPercentage}%</span>
                                    </div>

                                    <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
                                        <div
                                            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500 ease-out"
                                            style={{ width: `${progressPercentage}%` }}></div>
                                    </div>

                                    <p className="text-xs text-slate-600">
                                        {resumeData.completedSteps.length}/{orderedSteps.length} {t('BuildResume.progress.completed')}
                                    </p>
                                </div>
                            </div>

                            {/* Mobile User Status and Actions */}
                            <div className="px-4 py-4 border-t border-slate-200 bg-white">
                                {/* User Status */}
                                {userData.user && (
                                    <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold text-slate-800">Plan:</span>
                                            <span
                                                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                                    userData.membership === 'Premium' ||
                                                    userData.subscriptionsStatus === false ||
                                                    (userData.subscriptionsStatus && userData.subscriptionsStatus.state === false)
                                                        ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border border-green-200/80'
                                                        : 'bg-gradient-to-r from-gray-100 to-slate-100 text-gray-700 border border-gray-200/80'
                                                }`}>
                                                {userData.subscriptionsStatus === false || (userData.subscriptionsStatus && userData.subscriptionsStatus.state === false)
                                                    ? 'Free Access'
                                                    : userData.membership}
                                                {(userData.membership === 'Premium' ||
                                                    userData.subscriptionsStatus === false ||
                                                    (userData.subscriptionsStatus && userData.subscriptionsStatus.state === false)) && <span className="ml-1">✓</span>}
                                            </span>
                                        </div>
                                        {userData.membership === 'Basic' &&
                                            userData.subscriptionsStatus !== false &&
                                            !(userData.subscriptionsStatus && userData.subscriptionsStatus.state === false) && (
                                                <button
                                                    onClick={() => {
                                                        window.location.href = '/billing/plans';
                                                        setIsMobileMenuOpen(false);
                                                    }}
                                                    className="w-full mt-3 text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 px-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-semibold shadow-sm hover:shadow-md">
                                                    Upgrade to Premium
                                                </button>
                                            )}
                                        {(userData.subscriptionsStatus === false || (userData.subscriptionsStatus && userData.subscriptionsStatus.state === false)) && (
                                            <div className="w-full mt-2 text-sm text-center text-green-700 font-semibold">🎉 Free downloads enabled</div>
                                        )}
                                    </div>
                                )}

                                {/* Mobile Action Buttons */}
                                <div className="space-y-3">
                                    <button
                                        onClick={() => {
                                            setShowTemplateSelection(true);
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-md hover:shadow-lg text-sm flex items-center justify-center space-x-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                            />
                                        </svg>
                                        <span>{t('BuildResume.preview.changeTemplate')}</span>
                                    </button>

                                    <button
                                        onClick={() => {
                                            setShowPreview(true);
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className="w-full border border-slate-300 text-slate-700 py-3 px-4 rounded-lg font-medium hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 text-sm flex items-center justify-center space-x-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                            />
                                        </svg>
                                        <span>{t('BuildResume.preview.viewFullSize')}</span>
                                    </button>

                                    <button
                                        onClick={() => {
                                            handleDownload();
                                            setIsMobileMenuOpen(false);
                                        }}
                                        disabled={isDownloading}
                                        className={`w-full py-3 px-4 font-medium transition-all duration-200 text-sm rounded-lg flex items-center justify-center space-x-2 ${
                                            isDownloading
                                                ? 'border border-slate-300 text-slate-400 cursor-not-allowed'
                                                : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400'
                                        }`}>
                                        {isDownloading ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                                                <span className="hidden sm:inline">{t('BuildResume.navigation.downloading')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                    />
                                                </svg>
                                                <span className="hidden sm:inline">{t('BuildResume.navigation.download')}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mobile Preview Overlay */}
            <AnimatePresence>
                {isMobilePreviewOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="md:hidden fixed inset-0 z-50 bg-black bg-opacity-30"
                        onClick={() => setIsMobilePreviewOpen(false)}>
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Mobile resume preview"
                            onClick={(e) => e.stopPropagation()}>
                            {/* Mobile Preview Header */}
                            <div className="px-4 py-4 border-b border-slate-100 flex justify-between items-center">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900">{t('BuildResume.preview.livePreview')}</h3>
                                    <p className="text-xs text-slate-600 mt-1">{getTemplateName(currentTemplate)}</p>
                                </div>
                                <button type="button" onClick={() => setIsMobilePreviewOpen(false)} aria-label="Close mobile preview" className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Mobile Resume Preview */}
                            <div className="flex-1 px-4 py-4 overflow-y-auto">
                                {/* Preview Window */}
                                <div className="bg-white border-2 border-slate-200 rounded-xl shadow-lg overflow-hidden">
                                    {/* Preview Header */}
                                    <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-3 py-2.5 flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                            <div className="flex space-x-1">
                                                <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                                                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                            </div>
                                            <div className="text-white text-xs font-medium ml-2">{t('BuildResume.preview.resumePdf')}</div>
                                        </div>
                                    </div>

                                    {/* Resume Content */}
                                    <div className="relative h-80 overflow-hidden bg-gradient-to-br from-slate-50 to-gray-50">
                                        <div
                                            className="cursor-pointer"
                                            onClick={() => {
                                                setShowPreview(true);
                                                setIsMobilePreviewOpen(false);
                                            }}
                                            style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '285%', height: '285%' }}>
                                            <TemplateRenderer
                                                templateId={currentTemplate}
                                                values={previewData}
                                                language={i18n.language}
                                                onError={(error) => console.error('Template preview failed:', error)}
                                            />
                                        </div>
                                    </div>

                                    {/* Progress indicator */}
                                    <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-3 py-2 border-t border-slate-200">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-slate-600">{t('BuildResume.progress.completeness')}</span>
                                            <span className="text-blue-600 font-semibold">{progressPercentage}%</span>
                                        </div>
                                        <div className="mt-1 w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                                            <div
                                                className="bg-gradient-to-r from-blue-500 to-purple-500 h-1 rounded-full transition-all duration-500 ease-out"
                                                style={{ width: `${progressPercentage}%` }}></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Mobile Action Buttons */}
                                <div className="mt-4 space-y-2">
                                    <button
                                        onClick={() => {
                                            setShowTemplateSelection(true);
                                            setIsMobilePreviewOpen(false);
                                        }}
                                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2.5 px-4 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-md hover:shadow-lg text-sm flex items-center justify-center space-x-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                            />
                                        </svg>
                                        <span>{t('BuildResume.preview.changeTemplate')}</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowPreview(true);
                                            setIsMobilePreviewOpen(false);
                                        }}
                                        className="w-full border border-slate-300 text-slate-700 py-2.5 px-4 rounded-lg font-medium hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 text-sm flex items-center justify-center space-x-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                            />
                                        </svg>
                                        <span>{t('BuildResume.preview.viewFullSize')}</span>
                                    </button>
                                    <button type="button" onClick={handlePublishForReview} disabled={publicationState.status === 'saving'} className="w-full border border-indigo-300 text-indigo-700 py-2.5 px-4 rounded-lg font-medium disabled:opacity-60">
                                        {publicationState.isPublished ? 'Copy / Update Review Link' : 'Share for Review'}
                                    </button>
                                    {publicationState.isPublished && <button type="button" onClick={handleStopSharing} className="w-full text-red-700 py-2 text-sm font-medium">Stop Sharing</button>}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Left Sidebar - Steps Navigation - Always Visible */}
            <div className="hidden md:flex flex-col w-56 lg:w-64 bg-white border-r border-slate-200 shadow-sm min-h-screen flex-shrink-0 relative z-20">
                {/* Header */}
                <div className="px-4 py-3.5 border-b border-slate-100 flex-shrink-0 flex flex-col gap-2.5">
                    {/* Top Row: Steps Title & Exit to Dashboard */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                                Resume Steps
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleExitBuilder}
                            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-slate-200/80 transition-all shadow-2xs cursor-pointer">
                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            <span>Dashboard</span>
                        </button>
                    </div>

                    {/* Dedicated Auto-Save Status Bar: Clean 1-line display */}
                    <div role="status" aria-live="polite" className={`flex items-center justify-between text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all ${
                        saveState.status === 'saved' ? 'text-emerald-800 bg-emerald-50/90 border-emerald-200/90' :
                        saveState.status === 'error' || saveState.status === 'conflict' ? 'text-red-800 bg-red-50 border-red-200' :
                        'text-amber-800 bg-amber-50 border-amber-200'
                    }`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${saveState.status === 'saved' ? 'bg-emerald-500' : saveState.status === 'error' || saveState.status === 'conflict' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`}></span>
                            <span className="truncate font-medium">{saveState.status === 'saved' ? 'All changes saved' : (saveState.message || 'Saving changes...')}</span>
                        </div>
                        {saveState.status === 'saved' && (
                            <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                        )}
                    </div>
                </div>

                {/* Steps Navigation */}
                <div className="flex-1 px-3 py-3.5 overflow-y-auto">
                    <nav className="space-y-1.5">
                        {orderedSteps.map((step, index) => {
                            const isActive = currentStep.id === step.id;
                            const isCompleted = isStepCompleted(step.id);
                            const isPrevious = index < currentStepIndex;

                            return (
                                <button
                                    key={step.id}
                                    onClick={() => handleStepClick(step.path)}
                                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all duration-200 group relative ${
                                        isActive
                                            ? 'bg-gradient-to-r from-blue-50/90 to-indigo-50/60 border border-blue-200/90 text-blue-900 shadow-2xs'
                                            : isCompleted
                                            ? 'text-slate-700 hover:bg-slate-50/90 hover:border-slate-200/80 border border-transparent'
                                            : isPrevious
                                            ? 'text-slate-600 hover:bg-slate-50 hover:border-slate-200/80 border border-transparent'
                                            : 'text-slate-400 hover:text-slate-600 border border-transparent'
                                    }`}
                                    disabled={!isCompleted && !isPrevious && !isActive}
                                    aria-current={isActive ? 'step' : undefined}>
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        {/* Step Icon/Status */}
                                        <div
                                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 transition-all duration-200 ${
                                                isActive
                                                    ? 'bg-blue-600 text-white shadow-xs'
                                                    : isCompleted
                                                    ? 'bg-emerald-500 text-white shadow-2xs'
                                                    : isPrevious
                                                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                                    : 'bg-slate-50 text-slate-400 border border-slate-200/60'
                                            }`}>
                                            {isCompleted ? (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                            ) : (
                                                step.icon
                                            )}
                                        </div>

                                        <div className="min-w-0 text-left">
                                            <span className={`text-xs block truncate ${isActive ? 'font-bold text-blue-950' : isCompleted ? 'font-semibold text-slate-800' : 'font-medium text-slate-600'}`}>
                                                {step.name}
                                            </span>
                                            <span className={`text-[10px] block leading-tight ${isActive ? 'font-bold text-blue-600' : isCompleted ? 'font-medium text-emerald-600' : 'text-slate-400'}`}>
                                                {isActive ? 'Editing' : isCompleted ? 'Complete' : 'Pending'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Active indicator bar */}
                                    {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full"></div>}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Add Custom Section Action */}
                    <button
                        type="button"
                        onClick={handleAddCustomSection}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-3 bg-gradient-to-r from-indigo-50/70 to-purple-50/70 hover:from-indigo-100 hover:to-purple-100 text-indigo-700 font-semibold text-xs rounded-xl border border-indigo-200/70 hover:border-indigo-300 transition-all shadow-2xs group">
                        <div className="w-4 h-4 rounded-md bg-indigo-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <svg className="w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <span>{t('BuildResume.customSection.add', 'Add Custom Section')}</span>
                    </button>

                    {/* Real-Time ATS Score Meter Widget */}
                    {isAtsEnabled === true && (
                        <div className="mt-4">
                            <AtsScoreMeter resumeData={resumeData} onNavigate={handleStepClick} />
                        </div>
                    )}

                    {/* Progress Section */}
                    <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-700">{t('BuildResume.progress.progress')}</span>
                            <span className="text-xs font-bold text-slate-900">{progressPercentage}%</span>
                        </div>

                        <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2 overflow-hidden">
                            <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }}></div>
                        </div>

                        <p className="text-xs text-slate-600">
                            {resumeData.completedSteps.length}/{orderedSteps.length} {t('BuildResume.progress.completed')}
                        </p>
                    </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-200 bg-white flex-shrink-0 sticky bottom-0 z-20 shadow-md">
                    {/* Expand/Compress Header */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-1.5">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Plan:</span>
                            <span
                                className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                                    userData.membership === 'Premium' || userData.subscriptionsStatus === false || (userData.subscriptionsStatus && userData.subscriptionsStatus.state === false)
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}>
                                {userData.subscriptionsStatus === false || (userData.subscriptionsStatus && userData.subscriptionsStatus.state === false)
                                    ? 'Free Access ✓'
                                    : (userData.membership || 'Basic')}
                            </span>
                        </div>
                        <button
                            onClick={() => setIsFooterCompressed(!isFooterCompressed)}
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                            title={isFooterCompressed ? "Expand Footer" : "Compress Footer"}>
                            {isFooterCompressed ? (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                                </svg>
                            ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            )}
                        </button>
                    </div>

                    {/* Upgrade to Premium Button - ALWAYS visible even when compressed */}
                    {userData.membership !== 'Premium' && userData.subscriptionsStatus !== false && !(userData.subscriptionsStatus && userData.subscriptionsStatus.state === false) && (
                        <button
                            onClick={() => (window.location.href = '/billing/plans')}
                            className="w-full text-xs bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white py-2 px-3 rounded-lg transition-all duration-200 font-bold shadow-sm hover:shadow-md flex items-center justify-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-amber-300 fill-current" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            Upgrade to Premium
                        </button>
                    )}

                    {/* Expanded Details: Help & Support, Privacy Policy, Copyright */}
                    {!isFooterCompressed && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5 animate-in fade-in duration-150">
                            <a href="/contact" target="_blank" rel="noopener noreferrer" className="flex items-center text-xs text-slate-600 hover:text-indigo-600 transition-colors font-medium group py-0.5">
                                <svg className="w-3.5 h-3.5 mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <span>Help & Support</span>
                            </a>
                            <a href="/p/privacy-policy" target="_blank" rel="noopener noreferrer" className="flex items-center text-xs text-slate-600 hover:text-indigo-600 transition-colors font-medium group py-0.5">
                                <svg className="w-3.5 h-3.5 mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                                </svg>
                                <span>Privacy Policy</span>
                            </a>
                            <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 font-medium">
                                © {new Date().getFullYear()} {config?.brand?.name || 'Bold Limited'}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Area - Responsive Center Section */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative pt-16 md:pt-0">
                {/* Main Form Content */}
                <div className="flex-1 bg-white flex flex-col h-full overflow-hidden">
                    {/* Scrollable content area */}
                    <div className="flex-1 overflow-y-auto bg-slate-50">
                        <div className="min-h-full pb-6">
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
                                <Route path="" element={<HeadingStep resumeData={resumeData} updateResumeData={updateResumeData} />} />
                            </Routes>
                        </div>
                    </div>

                    {/* Navigation Footer - Sticky at bottom with shadow */}
                    <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 md:px-6 py-3 md:py-4 flex-shrink-0 z-30 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
                        <div className="flex justify-between items-center max-w-4xl mx-auto">
                            {/* Left side - Progress indicator - Hidden on mobile */}
                            <div className="hidden md:flex items-center space-x-3">
                                <div className="text-xs text-slate-600">{t('BuildResume.progress.step', { current: currentStepIndex + 1, total: orderedSteps.length })}</div>
                                <div className="flex items-center space-x-1">
                                    {orderedSteps.map((_, index) => (
                                        <div key={index} className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${index <= currentStepIndex ? 'bg-blue-500' : 'bg-slate-200'}`} />
                                    ))}
                                </div>
                            </div>

                            {/* Mobile progress indicator */}
                            <div className="md:hidden flex items-center space-x-2">
                                <span className="text-xs font-medium text-slate-600">
                                    {currentStepIndex + 1}/{orderedSteps.length}
                                </span>
                                <div className="flex items-center space-x-1">
                                    {orderedSteps.map((_, index) => (
                                        <div key={index} className={`w-2 h-2 rounded-full transition-all duration-200 ${index <= currentStepIndex ? 'bg-blue-500' : 'bg-slate-200'}`} />
                                    ))}
                                </div>
                            </div>

                            {/* Right side - Action buttons */}
                            <div className="flex items-center gap-2">
                                {/* Previous Button */}
                                <button
                                    onClick={handlePrevious}
                                    disabled={currentStepIndex === 0}
                                    className="flex items-center px-3 py-2 border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 text-xs rounded-xl shadow-2xs">
                                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span className="hidden sm:inline">{t('BuildResume.navigation.previous')}</span>
                                </button>

                                {/* AI Import Resume Button */}
                                {isImportEnabled && (
                                    <button
                                        onClick={() => setShowImportModal(true)}
                                        className="hidden xl:flex items-center px-3 py-2 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 text-purple-700 font-semibold hover:bg-purple-100/70 hover:border-purple-300 transition-all duration-200 text-xs rounded-xl shadow-2xs">
                                        <svg className="w-3.5 h-3.5 mr-1 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        Import Resume
                                    </button>
                                )}

                                {/* Share for Mentor Review & Comments */}
                                {isPublicSharingEnabled && (
                                    <>
                                        <button
                                            onClick={handlePublishForReview}
                                            disabled={publicationState.status === 'saving'}
                                            className="hidden xl:flex items-center px-3 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-60 transition-all text-xs rounded-xl shadow-2xs font-medium">
                                            <svg className="w-3.5 h-3.5 mr-1 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                            </svg>
                                            {publicationState.status === 'saving' ? 'Updating…' : publicationState.isPublished ? 'Copy Link' : 'Share Review'}
                                        </button>
                                        {publicationState.isPublished && (
                                            <button type="button" onClick={handleStopSharing} disabled={publicationState.status === 'saving'} className="hidden xl:flex items-center px-2 py-2 text-red-600 hover:text-red-700 text-xs font-semibold disabled:opacity-60 transition-all">
                                                Stop Sharing
                                            </button>
                                        )}
                                    </>
                                )}

                                {/* Mobile Menu and Preview buttons - Only on mobile */}
                                <button
                                    onClick={() => setIsMobileMenuOpen(true)}
                                    className="md:hidden flex items-center px-2.5 py-2 border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-all duration-200 text-xs rounded-xl shadow-2xs">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                </button>

                                <button
                                    onClick={() => setIsMobilePreviewOpen(true)}
                                    className="md:hidden flex items-center px-2.5 py-2 border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-all duration-200 text-xs rounded-xl shadow-2xs">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </button>

                                {/* Desktop Preview Button */}
                                <button
                                    onClick={() => setShowPreview(true)}
                                    className="hidden md:flex items-center px-3.5 py-2 border border-blue-200 text-blue-700 bg-blue-50/40 hover:bg-blue-100/70 hover:border-blue-300 font-semibold transition-all duration-200 text-xs rounded-xl shadow-2xs">
                                    <svg className="w-3.5 h-3.5 mr-1 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                        />
                                    </svg>
                                    {t('BuildResume.navigation.preview')}
                                </button>

                                {/* Download Button */}
                                <button
                                    onClick={handleDownload}
                                    disabled={isDownloading}
                                    className={`flex items-center px-3.5 py-2 font-semibold transition-all duration-200 text-xs rounded-xl shadow-2xs ${
                                        isDownloading
                                            ? 'border border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                                            : 'border border-emerald-200 text-emerald-700 bg-emerald-50/40 hover:bg-emerald-100/70 hover:border-emerald-300'
                                    }`}>
                                    {isDownloading ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-1.5"></div>
                                            <span className="hidden sm:inline">{t('BuildResume.navigation.downloading')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5 mr-1 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                />
                                            </svg>
                                            <span className="hidden sm:inline">{t('BuildResume.navigation.download')}</span>
                                        </>
                                    )}
                                </button>

                                {/* Next/Complete Button */}
                                {currentStepIndex < orderedSteps.length - 1 ? (
                                    <button
                                        onClick={handleNext}
                                        className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 text-xs shadow-sm hover:shadow-md">
                                        <span className="hidden sm:inline">{t('BuildResume.navigation.nextStep', { stepName: orderedSteps[currentStepIndex + 1]?.name })}</span>
                                        <span className="sm:hidden">Next</span>
                                        <svg className="w-3.5 h-3.5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCompleteResume}
                                        className="flex items-center px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl font-bold hover:from-emerald-700 hover:to-green-700 transition-all duration-200 text-xs shadow-sm hover:shadow-md">
                                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="hidden sm:inline">{t('BuildResume.navigation.complete')}</span>
                                        <span className="sm:hidden">Done</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Sidebar - Resume Preview - Improved Desktop Support */}
            <div className="hidden lg:flex w-80 bg-white border-l border-slate-200 flex-col min-h-screen flex-shrink-0">
                {/* Simplified Header Section */}
                <div className="px-4 py-4 border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900">{t('BuildResume.preview.livePreview')}</h3>
                            <p className="text-xs text-slate-600 mt-1">{getTemplateName(currentTemplate)}</p>
                        </div>
                        <div className="flex items-center space-x-1">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-slate-600">{t('BuildResume.preview.autoUpdating')}</span>
                        </div>
                    </div>
                </div>

                {/* Resume Preview - Scrollable */}
                <div className="flex-1 px-4 py-4 overflow-y-auto">
                    {/* Preview Window */}
                    <div className="bg-white border-2 border-slate-200 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 group">
                        {/* Enhanced Preview Header */}
                        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-3 py-2.5 flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                </div>
                                <div className="text-white text-xs font-medium ml-2">{t('BuildResume.preview.resumePdf')}</div>
                            </div>
                        </div>

                        {/* Resume Content with Loading State - A4 Proportion Container */}
                        <div className="relative aspect-[1/1.414] w-full overflow-hidden bg-gradient-to-br from-slate-50 to-gray-50">
                            {/* Loading Overlay for better UX */}
                            <div className="absolute inset-0 bg-white bg-opacity-50 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                                <div onClick={() => setShowPreview(true)} className="cursor-pointer bg-white px-3 py-2 rounded-lg shadow-lg border">
                                    <span className="text-xs text-slate-600">{t('BuildResume.preview.clickToView')}</span>
                                </div>
                            </div>

                            <div
                                className="cursor-pointer transition-transform duration-200 group-hover:scale-105"
                                onClick={() => setShowPreview(true)}
                                style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '285%', height: '285%' }}>
                                <TemplateRenderer
                                                templateId={currentTemplate}
                                                values={previewData}
                                                language={i18n.language}
                                                onError={(error) => console.error('Template preview failed:', error)}
                                            />
                            </div>
                        </div>

                        {/* Progress indicator */}
                        <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-3 py-2 border-t border-slate-200">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-600">{t('BuildResume.progress.completeness')}</span>
                                <span className="text-blue-600 font-semibold">{progressPercentage}%</span>
                            </div>
                            <div className="mt-1 w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                                <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-1 rounded-full transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }}></div>
                            </div>
                        </div>
                    </div>

                    {/* Enhanced Action Buttons */}
                    <div className="mt-4 space-y-2">
                        <button
                            onClick={() => setShowTemplateSelection(true)}
                            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2.5 px-4 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-md hover:shadow-lg text-sm flex items-center justify-center space-x-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                            </svg>
                            <span>{t('BuildResume.preview.changeTemplate')}</span>
                        </button>
                        <button
                            onClick={() => setShowPreview(true)}
                            className="w-full border border-slate-300 text-slate-700 py-2.5 px-4 rounded-lg font-medium hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 text-sm flex items-center justify-center space-x-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                            </svg>
                            <span>{t('BuildResume.preview.viewFullSize')}</span>
                        </button>
                        <button
                            onClick={handleManualSave}
                            disabled={isManualSaving}
                            className={`w-full py-2.5 px-4 rounded-lg font-semibold transition-all duration-200 shadow-md text-sm flex items-center justify-center space-x-2 ${
                                saveSuccessMsg
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 hover:shadow-lg'
                            }`}>
                            {isManualSaving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                    <span>Saving Resume State...</span>
                                </>
                            ) : saveSuccessMsg ? (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Resume Saved Completely!</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                    </svg>
                                    <span>Save Resume State</span>
                                </>
                            )}
                        </button>
                        {isImportEnabled && (
                            <button
                                onClick={() => setShowImportModal(true)}
                                className="w-full border border-purple-300 text-purple-700 py-2.5 px-4 rounded-lg font-medium hover:bg-purple-50 hover:border-purple-400 transition-all duration-200 text-sm flex items-center justify-center space-x-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <span>{t('BuildResume.preview.importResume')}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Enhanced Footer */}
                <div className="px-4 py-4 bg-white border-t border-slate-200 flex-shrink-0">
                    <div className="text-center">
                        <p className="text-sm text-slate-700 font-semibold">{t('BuildResume.preview.trustedBy')}</p>
                        <p className="text-xs text-slate-500 mt-1">{t('BuildResume.preview.joinSuccess')}</p>
                    </div>
                </div>
            </div>

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
        </div>
    );
};

export default BuildResume;
