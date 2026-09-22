import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FaMagic, FaUserCheck, FaBolt, FaCheck, FaTimes, FaLightbulb, FaCopy, FaTrash } from 'react-icons/fa';
import RichTextEditor from './components/RichTextEditor';
import StepShell from '../components/StepShell.jsx';
import AiPromptCard from '../components/AiPromptCard.jsx';
import { useAiAssist } from '../ai/useAiAssist.js';
import { canRunAssistOperation } from '../ai/aiContract.js';
import { calculateAtsScore, stripHtml } from '../../../utils/atsScore';
import { hasMeaningfulText } from '../../../engine/hybrid/utils/contentSanitizer';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import { calculateYearsOfExperience } from '../../../utils/resumeData.js';
import { getProfileOfUser } from '../../../services/api/platform.js';
import { saveProfile } from '../../../services/profilePersistence.js';
import fire from '../../../conf/fire.js';

const TONES = [
    { id: 'balanced', label: 'Balanced' },
    { id: 'concise', label: 'Concise' },
    { id: 'technical', label: 'Technical' },
    { id: 'executive', label: 'Executive' },
];

/**
 * SummaryStep — Executive Bio & Professional Summary with 10/10 Parity to Master Profile Settings.
 * Synthesizes full career history, education, skills, and projects with tone selection,
 * bidirectional Master Profile bio import/export, and safe AiPromptCard draft review (zero silent overwrites).
 */
const SummaryStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const candidateContext = React.useMemo(
        () => getCandidateContext(resumeData, resumeData.targetJobDescription || ''),
        [resumeData],
    );
    const targetJd = resumeData.targetJobDescription || '';

    const [summary, setSummary] = useState(resumeData.summary || '');
    const [charCount, setCharCount] = useState(() => hasMeaningfulText(resumeData.summary) ? stripHtml(resumeData.summary).length : 0);
    const [selectedTone, setSelectedTone] = useState('balanced');
    const [masterBio, setMasterBio] = useState('');
    const [showImportConfirm, setShowImportConfirm] = useState(false);
    const [showSaveProfileConfirm, setShowSaveProfileConfirm] = useState(false);
    const [isSavingToProfile, setIsSavingToProfile] = useState(false);
    const [summaryCopied, setSummaryCopied] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [syncNotice, setSyncNotice] = useState(null);
    const ai = useAiAssist();

    // Load Master Profile Executive Bio with async auth-listener and profileUpdated event subscription
    useEffect(() => {
        let isMounted = true;
        const loadMasterBio = async (uid) => {
            if (!uid) return;
            try {
                const prof = await getProfileOfUser(uid);
                if (isMounted && prof) {
                    const bioText = stripHtml(prof.summary || prof.bio || '').trim();
                    if (bioText) setMasterBio(bioText);
                }
            } catch {
                // Ignore profile load error
            }
        };

        const current = fire.auth().currentUser;
        if (current?.uid) loadMasterBio(current.uid);

        const unsubscribe = fire.auth().onAuthStateChanged((user) => {
            if (user?.uid) loadMasterBio(user.uid);
        });

        const handleProfileUpdated = (e) => {
            if (isMounted && e.detail) {
                const bioText = stripHtml(e.detail.summary || e.detail.bio || '').trim();
                if (bioText) setMasterBio(bioText);
            }
        };
        window.addEventListener('profileUpdated', handleProfileUpdated);

        return () => {
            isMounted = false;
            unsubscribe();
            window.removeEventListener('profileUpdated', handleProfileUpdated);
        };
    }, []);

    useEffect(() => {
        if (resumeData.summary !== undefined) {
            setSummary(resumeData.summary || '');
            const count = hasMeaningfulText(resumeData.summary) ? stripHtml(resumeData.summary).length : 0;
            setCharCount(count);
        }
    }, [resumeData.summary]);

    const handleSummaryChange = (text) => {
        const meaningful = hasMeaningfulText(text);
        const count = meaningful ? stripHtml(text).length : 0;
        setSummary(text);
        setCharCount(count);
        updateResumeData({ summary: meaningful ? text : '' });
    };

    const aiReadiness = canRunAssistOperation('generate-summary', { resumeData, targetJd });

    const runDraft = () => {
        ai.run({
            operation: 'generate-summary',
            resumeData,
            targetJd,
            tone: selectedTone,
        });
    };

    const handleUseDraft = (text) => {
        const clean = String(text || '').trim();
        setSummary(clean);
        setCharCount(clean.length);
        updateResumeData({ summary: clean });
        ai.reset();
    };

    const handleAiAnswers = (answers) => {
        const merged = { ...answers };
        ai.run({
            operation: 'generate-summary',
            resumeData,
            targetJd,
            tone: selectedTone,
            answers: merged,
        });
    };

    const handleImportMasterBio = () => {
        if (!masterBio) return;
        const currentPlain = stripHtml(summary).trim();
        if (currentPlain.length > 0 && currentPlain !== masterBio) {
            setShowImportConfirm(true);
        } else {
            setSummary(masterBio);
            setCharCount(masterBio.length);
            updateResumeData({ summary: masterBio });
        }
    };

    const confirmImportMasterBio = () => {
        if (!masterBio) return;
        setSummary(masterBio);
        setCharCount(masterBio.length);
        updateResumeData({ summary: masterBio });
        setShowImportConfirm(false);
    };

    const handleSaveToMasterProfile = () => {
        const currentPlain = stripHtml(summary).trim();
        if (!currentPlain || currentPlain.length < 20) return;
        if (masterBio && masterBio !== currentPlain) {
            setShowSaveProfileConfirm(true);
        } else {
            executeSaveToMasterProfile(currentPlain);
        }
    };

    const executeSaveToMasterProfile = async (bioText) => {
        const user = fire.auth().currentUser;
        if (!user?.uid) return;
        setIsSavingToProfile(true);
        try {
            const currentProfile = await getProfileOfUser(user.uid);
            const baseRevision = Number(currentProfile?.revision) || 0;
            const updatedProfile = {
                ...(currentProfile || {}),
                summary: bioText,
            };
            const result = await saveProfile(user.uid, updatedProfile, baseRevision);
            if (result.success) {
                setMasterBio(bioText);
                setShowSaveProfileConfirm(false);
                setSyncNotice('Saved as Master Profile Executive Bio!');
                setTimeout(() => setSyncNotice(null), 3000);
                window.dispatchEvent(new CustomEvent('profileUpdated', {
                    detail: result.profile || { ...updatedProfile, revision: result.revision }
                }));
            }
        } catch (err) {
            console.error('Failed to save to Master Profile:', err);
        } finally {
            setIsSavingToProfile(false);
        }
    };

    const handleCopy = () => {
        const plain = stripHtml(summary).trim();
        if (!plain) return;
        navigator.clipboard.writeText(plain).then(() => {
            setSummaryCopied(true);
            setTimeout(() => setSummaryCopied(false), 2000);
        }).catch(() => {});
    };

    const handleClear = () => {
        setSummary('');
        setCharCount(0);
        updateResumeData({ summary: '' });
        setShowClearConfirm(false);
    };

    const handleSave = () => {
        const meaningful = hasMeaningfulText(summary);
        const plainText = meaningful ? stripHtml(summary).trim() : '';
        const completedSteps = [...(resumeData.completedSteps || [])];
        let updatedCompletedSteps = null;

        if (plainText.length >= 20 && !completedSteps.includes(8)) {
            updatedCompletedSteps = [...completedSteps, 8];
        } else if (plainText.length < 20 && completedSteps.includes(8)) {
            updatedCompletedSteps = completedSteps.filter((step) => step !== 8);
        }

        updateResumeData({
            summary: meaningful ? summary : '',
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [summary]);

    // Unmount flush: synchronously commit state on step exit
    const summaryRef = useRef(summary);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { summaryRef.current = summary; }, [summary]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => () => {
        const sum = summaryRef.current;
        const meaningful = hasMeaningfulText(sum);
        const plainText = meaningful ? stripHtml(sum).trim() : '';
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (plainText.length >= 20 && !completedSteps.includes(8)) {
            updatedCompletedSteps = [...completedSteps, 8];
        } else if (plainText.length < 20 && completedSteps.includes(8)) {
            updatedCompletedSteps = completedSteps.filter((step) => step !== 8);
        }
        updateResumeDataRef.current({
            summary: meaningful ? sum : '',
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    }, []);

    const getProgressStatus = () => {
        if (charCount === 0) return { text: 'Empty', color: 'text-slate-400', bar: 'bg-slate-200' };
        if (charCount < 100) return { text: 'Getting started', color: 'text-amber-600', bar: 'bg-amber-500' };
        if (charCount <= 450) return { text: 'Good length', color: 'text-emerald-600', bar: 'bg-emerald-500' };
        return { text: 'Long — consider trimming', color: 'text-amber-600', bar: 'bg-amber-500' };
    };

    const progress = getProgressStatus();
    const currentPlain = stripHtml(summary).trim();
    const hasSummary = currentPlain.length >= 20;
    const isSyncedWithMaster = Boolean(masterBio && currentPlain && currentPlain === masterBio);
    const canSaveToProfile = Boolean(currentPlain.length >= 20 && currentPlain !== masterBio);
    const canImportFromProfile = Boolean(masterBio && masterBio !== currentPlain);

    // Career evidence counts
    const rawRoles = Array.isArray(resumeData.employments) ? resumeData.employments
        : (Array.isArray(resumeData.workExperiences) ? resumeData.workExperiences
        : (Array.isArray(resumeData.workExperience) ? resumeData.workExperience : []));
    const rawEdus = Array.isArray(resumeData.educations) ? resumeData.educations
        : (Array.isArray(resumeData.education) ? resumeData.education : []);
    const rawSkills = Array.isArray(resumeData.skills) ? resumeData.skills
        : (Array.isArray(resumeData.existingSkills) ? resumeData.existingSkills : []);
    const rawCerts = Array.isArray(resumeData.certifications) ? resumeData.certifications
        : (Array.isArray(resumeData.certificates) ? resumeData.certificates : []);

    const yearsExp = calculateYearsOfExperience(rawRoles);
    const rolesCount = rawRoles.length;
    const skillsCount = rawSkills.length;
    const eduCount = rawEdus.length;
    const certsCount = rawCerts.length;

    // JD alignment hint — real engine output only
    const atsResult = calculateAtsScore(resumeData, { jobDescription: targetJd });
    const jdMatch = atsResult?.jdMatch;

    const wordCount = currentPlain ? currentPlain.split(/\s+/).filter(Boolean).length : 0;

    return (
        <StepShell
            stepNumber={8}
            stepPath="summary"
            title={t('SummaryStep.title', 'Executive Bio & Professional Summary')}
            subtitle={t('SummaryStep.subtitle', 'Synthesizes your full career history, education, skills, and projects into an authoritative executive overview.')}
            isComplete={hasSummary}
            statusBadge={`${charCount} characters`}
            resumeData={resumeData}
            targetJd={targetJd}
        >
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm space-y-5">
                {/* Header & ATS Character Meter */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-slate-900 tracking-tight">Executive Bio &amp; Professional Summary</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Written in your authentic voice — AI synthesizes your verified career history with zero hallucinations.
                        </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-2xs">
                        <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                                className={`h-full ${progress.bar} transition-all duration-300`}
                                style={{ width: `${Math.min(100, (charCount / 400) * 100)}%` }}
                            />
                        </div>
                        <span className={`text-[11px] font-bold ${progress.color}`}>{charCount}/400 · {progress.text}</span>
                    </div>
                </div>

                {/* 10/10 Parity Action Toolbar: Tone Selector + AI Generator + Master Profile Bidirectional Sync */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                    {/* Tone Selection Pills */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} role="group" aria-label="Tone preference">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1 shrink-0">Tone:</span>
                        {TONES.map(tone => (
                            <button
                                key={tone.id}
                                type="button"
                                onClick={() => setSelectedTone(tone.id)}
                                aria-pressed={selectedTone === tone.id}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                                    selectedTone === tone.id
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                }`}
                            >
                                {tone.label}
                            </button>
                        ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                        {charCount > 0 && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    title="Copy summary to clipboard"
                                    className="px-2.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-all shadow-2xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                                >
                                    {summaryCopied ? <FaCheck className="w-3.5 h-3.5 text-emerald-600" /> : <FaCopy className="w-3.5 h-3.5 text-slate-500" />}
                                    <span>{summaryCopied ? 'Copied!' : 'Copy'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowClearConfirm(true)}
                                    title="Clear summary"
                                    className="p-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 rounded-lg text-xs font-semibold transition-all shadow-2xs flex items-center justify-center shrink-0 cursor-pointer"
                                >
                                    <FaTrash className="w-3.5 h-3.5" />
                                </button>
                            </>
                        )}

                        {isSyncedWithMaster && (
                            <span className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0">
                                <FaCheck className="w-3 h-3 text-emerald-600" />
                                <span>Profile Bio Synced</span>
                            </span>
                        )}

                        {canImportFromProfile && (
                            <button
                                type="button"
                                onClick={handleImportMasterBio}
                                title="Import your saved Executive Bio from Profile Settings"
                                className="w-full sm:w-auto px-3 py-2 bg-white hover:bg-indigo-50/70 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                            >
                                <FaUserCheck className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Import from Profile</span>
                            </button>
                        )}

                        {canSaveToProfile && (
                            <button
                                type="button"
                                onClick={handleSaveToMasterProfile}
                                disabled={isSavingToProfile}
                                title="Save this resume summary as your permanent Master Profile Executive Bio"
                                className="w-full sm:w-auto px-3 py-2 bg-white hover:bg-emerald-50/70 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                            >
                                <FaCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{isSavingToProfile ? 'Saving...' : 'Save to Profile'}</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={runDraft}
                            disabled={!aiReadiness.ok || ai.status === 'loading'}
                            title={!aiReadiness.ok ? aiReadiness.reason : 'Synthesize career history into an executive summary'}
                            className="w-full sm:w-auto whitespace-nowrap px-4 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <FaMagic className={`w-3.5 h-3.5 ${ai.status === 'loading' ? 'animate-spin' : ''}`} />
                            <span>{ai.status === 'loading' ? 'Generating Bio...' : 'Generate Executive Bio (AI)'}</span>
                        </button>
                    </div>
                </div>

                {/* Feedback Notices */}
                {syncNotice && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2 animate-in fade-in duration-200">
                        <FaCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-semibold">{syncNotice}</span>
                    </div>
                )}

                {/* Import Confirmation Dialog */}
                {showImportConfirm && (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2">
                            <FaLightbulb className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Replace your current summary with your saved Master Profile Executive Bio?</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={confirmImportMasterBio}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                                Confirm Replace
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowImportConfirm(false)}
                                className="px-3 py-1.5 bg-white hover:bg-amber-100/60 border border-amber-300 text-amber-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Save to Profile Confirmation Dialog */}
                {showSaveProfileConfirm && (
                    <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2">
                            <FaUserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span>Replace your saved Master Profile Executive Bio with this resume summary?</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => executeSaveToMasterProfile(currentPlain)}
                                disabled={isSavingToProfile}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                                {isSavingToProfile ? 'Saving...' : 'Confirm Save'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowSaveProfileConfirm(false)}
                                className="px-3 py-1.5 bg-white hover:bg-indigo-100/60 border border-indigo-300 text-indigo-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Clear Confirmation Dialog */}
                {showClearConfirm && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in duration-200">
                        <span className="font-medium">Clear your executive summary for this resume?</span>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={handleClear}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                                Confirm Clear
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowClearConfirm(false)}
                                className="px-2.5 py-1 bg-white hover:bg-amber-100/60 border border-amber-300 text-amber-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Career Evidence Digest Badge */}
                <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                        <FaBolt className="w-3 h-3 text-amber-500" />
                        <span>Synthesizes:</span>
                    </span>
                    <span>
                        {yearsExp ? <strong className="text-slate-700">{yearsExp} yrs exp · </strong> : null}
                        <strong className="text-slate-700">{rolesCount}</strong> {rolesCount === 1 ? 'position' : 'positions'} ·{' '}
                        <strong className="text-slate-700">{skillsCount}</strong> skills
                        {eduCount > 0 ? <> · <strong className="text-slate-700">{eduCount}</strong> {eduCount === 1 ? 'degree' : 'degrees'}</> : null}
                        {certsCount > 0 ? <> · <strong className="text-slate-700">{certsCount}</strong> credentials</> : null}
                    </span>
                </div>

                {/* AI Review / Draft Gate (Invariant 7: Zero Silent Overwrites) */}
                {(ai.status !== 'idle' || ai.result) && (
                    <AiPromptCard
                        title="Executive Bio Draft"
                        buttonLabel="Generate Executive Bio (AI)"
                        evidenceHint="Uses only your work history, education, and skills — the draft is editable before you use it."
                        status={ai.status}
                        result={ai.result}
                        error={ai.error?.message}
                        disabled={!aiReadiness.ok}
                        disabledReason={aiReadiness.reason}
                        draftExisting={summary}
                        onRun={runDraft}
                        onUseDraft={handleUseDraft}
                        onAnswers={handleAiAnswers}
                        onDismiss={() => ai.reset()}
                    />
                )}

                {/* Editor Container */}
                <div className="space-y-1.5">
                    <RichTextEditor
                        value={summary}
                        onChange={handleSummaryChange}
                        rows={7}
                        placeholder={getDynamicPlaceholder('summary', 'summary', candidateContext) || t('SummaryStep.placeholder', 'Who you are professionally, what you have done, and what you do well — in your own words.')}
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-medium">
                        <span>{wordCount} words</span>
                        <span>Recommended: 2–4 sentences (50–90 words)</span>
                    </div>
                </div>

                {/* JD Competency Coverage Card */}
                {targetJd && candidateContext.target.role && jdMatch && jdMatch.score !== null && (
                    <div className="text-xs text-slate-600 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 flex items-start gap-2.5">
                        <FaBolt className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-bold text-indigo-900">Job Description Alignment: </span>
                            Your resume currently covers <strong className="text-indigo-950 font-bold">{jdMatch.matched.length}</strong> of the{' '}
                            <strong className="text-indigo-950 font-bold">{jdMatch.total}</strong> distinctive terms in the job description for{' '}
                            <span className="font-bold text-indigo-900">{candidateContext.target.role}</span>.
                        </div>
                    </div>
                )}
            </div>
        </StepShell>
    );
};

export default SummaryStep;
