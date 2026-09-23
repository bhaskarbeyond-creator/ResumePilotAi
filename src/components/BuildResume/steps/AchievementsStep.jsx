import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    MdAdd,
    MdSearch,
    MdClose,
    MdAutoAwesome,
    MdCheckCircle,
    MdContentCopy,
    MdDeleteOutline,
    MdOutlineSearch
} from 'react-icons/md';
import {
    FaTrophy,
    FaMedal,
    FaRocket,
    FaGraduationCap,
    FaStar,
    FaSearch
} from 'react-icons/fa';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Field from '../components/Field.jsx';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';
import { generateUserAiContent } from '../../../services/aiService';

export const ACHIEVEMENT_TYPES = [
    { id: 'Award', label: 'Award', icon: FaTrophy, badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
    { id: 'Honor', label: 'Honor', icon: FaMedal, badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { id: 'Competition', label: 'Hackathon / Contest', icon: FaRocket, badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
    { id: 'Academic', label: 'Academic Distinction', icon: FaGraduationCap, badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { id: 'Milestone', label: 'Key Milestone', icon: FaStar, badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
];

export const SUGGESTION_CHIPS = [
    { label: '🏆 1st Place / Winner', text: 'Awarded 1st place out of 100+ competitors for engineering innovation and technical execution.' },
    { label: '🌟 Top 5% Performer', text: 'Recognized in top 5% of global team for outstanding quarterly performance and customer satisfaction.' },
    { label: '💡 Innovation & Patent', text: 'Honored with company-wide Innovation Award for conceiving and deploying automated workflow.' },
    { label: '🎓 Dean\'s Honor Roll', text: 'Maintained top academic standing on Dean’s Honor List across consecutive semesters.' }
];

export const TYPE_STYLE_MAP = {
    Award: {
        cardBorder: 'border-amber-200/90 hover:border-amber-300 focus-within:border-amber-400',
        headerGradient: 'from-amber-50/60 via-amber-50/20 to-transparent',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        indexBadge: 'bg-amber-500 text-white',
        iconColor: 'text-amber-600',
    },
    Honor: {
        cardBorder: 'border-indigo-200/90 hover:border-indigo-300 focus-within:border-indigo-400',
        headerGradient: 'from-indigo-50/60 via-indigo-50/20 to-transparent',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        indexBadge: 'bg-indigo-600 text-white',
        iconColor: 'text-indigo-600',
    },
    Competition: {
        cardBorder: 'border-purple-200/90 hover:border-purple-300 focus-within:border-purple-400',
        headerGradient: 'from-purple-50/60 via-purple-50/20 to-transparent',
        badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
        indexBadge: 'bg-purple-600 text-white',
        iconColor: 'text-purple-600',
    },
    Academic: {
        cardBorder: 'border-emerald-200/90 hover:border-emerald-300 focus-within:border-emerald-400',
        headerGradient: 'from-emerald-50/60 via-emerald-50/20 to-transparent',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        indexBadge: 'bg-emerald-600 text-white',
        iconColor: 'text-emerald-600',
    },
    Milestone: {
        cardBorder: 'border-rose-200/90 hover:border-rose-300 focus-within:border-rose-400',
        headerGradient: 'from-rose-50/60 via-rose-50/20 to-transparent',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        indexBadge: 'bg-rose-600 text-white',
        iconColor: 'text-rose-600',
    },
};

const RECOGNITION_SIGNAL = /\b(?:award(?:ed|s)?|honou?r(?:s|ed)?|dean'?s\s+list|won|winner|winning|first\s+place|top\s+performer|employee\s+of\s+|certificate\s+of\s+(?:excellence|appreciation)|recognition|recognised|recognized|commendation|promoted|published|publication|patent(?:ed)?|scholarship|distinction|outstanding)\b/iu;

function findAchievementSignals(resumeData = {}) {
    const sources = [];
    (resumeData.employments || []).forEach(emp => {
        const where = `${emp.jobTitle || ''} at ${emp.employer || ''}`.trim();
        String(emp.description || '').split(/\r?\n/).forEach(line => {
            const clean = line.replace(/<[^>]*>/g, ' ').replace(/^\s*[•▪·\-]\s*/, '').trim();
            if (clean.length >= 15 && RECOGNITION_SIGNAL.test(clean)) {
                sources.push({ text: clean.slice(0, 300), source: where || 'Work experience' });
            }
        });
    });
    (resumeData.projects || []).forEach(project => {
        const where = String(project.title || 'Project');
        String(project.description || '').split(/\r?\n/).forEach(line => {
            const clean = line.replace(/<[^>]*>/g, ' ').replace(/^\s*[•▪·\-]\s*/, '').trim();
            if (clean.length >= 15 && RECOGNITION_SIGNAL.test(clean)) {
                sources.push({ text: clean.slice(0, 300), source: where });
            }
        });
    });
    (resumeData.educations || []).forEach(edu => {
        const where = `${edu.degree || ''} ${edu.school || ''}`.trim();
        String(edu.description || '').split(/\r?\n/).forEach(line => {
            const clean = line.replace(/<[^>]*>/g, ' ').replace(/^\s*[•▪·\-]\s*/, '').trim();
            if (clean.length >= 15 && RECOGNITION_SIGNAL.test(clean)) {
                sources.push({ text: clean.slice(0, 300), source: where || 'Education' });
            }
        });
    });
    const seen = new Set();
    return sources
        .filter(item => {
            const key = item.text.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 6);
}

const AchievementsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [achievements, setAchievements] = useState(resumeData.achievements || []);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');
    const [scanOpen, setScanOpen] = useState(false);

    // Search and Category Filter States
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');

    // AI Polishing and Feedback States
    const [isPolishingId, setIsPolishingId] = useState(null);
    const [toastState, setToastState] = useState(null);

    const signals = useMemo(() => findAchievementSignals(resumeData), [resumeData]);

    useEffect(() => {
        if (resumeData.achievements && Array.isArray(resumeData.achievements)) {
            setAchievements(resumeData.achievements);
        }
    }, [resumeData.achievements]);

    const triggerToast = (message, type = 'success') => {
        setToastState({ message, type });
        setTimeout(() => setToastState(null), 3500);
    };

    const createNewAchievement = (prefill = null) => {
        const item = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            title: '',
            description: '',
            awarder: '',
            issuer: '',
            date: '',
            achievementType: 'Award',
        };
        if (prefill) {
            item.title = prefill.title || prefill.name || '';
            item.description = prefill.description || prefill.text || '';
            item.awarder = prefill.awarder || prefill.issuer || prefill.source || '';
            item.issuer = prefill.issuer || prefill.awarder || prefill.source || '';
            item.date = prefill.date || '';
            item.achievementType = prefill.achievementType || 'Award';
        }
        return item;
    };

    const addAchievement = (prefill = null) => {
        const next = createNewAchievement(prefill);
        setAchievements(prev => [...prev, next]);
        triggerToast('New honor/award entry added!');
    };

    const removeAchievement = (id) => {
        setAchievements(prev => prev.filter(item => item.id !== id));
        triggerToast('Achievement removed', 'info');
    };

    const moveAchievement = (id, direction) => {
        setAchievements(current => moveResumeItem(current, id, direction));
    };

    const duplicateAchievement = (id) => {
        setAchievements(current => {
            const source = current.find(item => item.id === id);
            return duplicateResumeItem(current, id, {
                title: `${source?.title || source?.name || 'Achievement'} (Copy)`,
            });
        });
        triggerToast('Achievement duplicated!');
    };

    const updateAchievement = (id, field, value) => {
        setAchievements(prev => prev.map(item => {
            if (item.id !== id) return item;
            const updated = { ...item, [field]: value };
            if (field === 'awarder') {
                updated.issuer = value;
            }
            return updated;
        }));
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            const validAchievements = achievements.filter(item => String(item?.title || item?.name || '').trim() !== '');

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validAchievements.length > 0 && !completedSteps.includes(9)) {
                updatedCompletedSteps = [...completedSteps, 9];
            } else if (validAchievements.length === 0 && completedSteps.includes(9)) {
                updatedCompletedSteps = completedSteps.filter(step => step !== 9);
            }

            updateResumeData({
                achievements,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [achievements]); // eslint-disable-line react-hooks/exhaustive-deps

    // Unmount flush: synchronously commit state on step exit
    const achievementsRef = useRef(achievements);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { achievementsRef.current = achievements; }, [achievements]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => () => {
        const achs = achievementsRef.current;
        const valid = achs.filter(item => String(item?.title || item?.name || '').trim() !== '');
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (valid.length > 0 && !completedSteps.includes(9)) {
            updatedCompletedSteps = [...completedSteps, 9];
        } else if (valid.length === 0 && completedSteps.includes(9)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 9);
        }
        updateResumeDataRef.current({
            achievements: achs,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    }, []);

    const polishAchievementDescription = async (achievement) => {
        if (!achievement) return;
        setIsPolishingId(achievement.id);
        const title = achievement.title || achievement.name || 'Achievement';
        const currentDesc = achievement.description || '';
        const awarder = achievement.awarder || achievement.issuer || '';

        try {
            const prompt = `Rewrite this resume achievement as 1-2 concise, ATS-readable sentences using ONLY the facts given below. Do not add numbers, percentages, rankings, dates, scope or impact that are not stated. If the draft is empty, describe only what the title and awarding organization state. Achievement: "${title}". Awarding Organization: "${awarder}". Draft: "${currentDesc}".`;
            const res = await generateUserAiContent('generate-summary', {
                prompt,
                targetRole: candidateContext?.target?.role || resumeData?.targetRole || 'Professional',
                context: `${title} conferred by ${awarder}`,
                language: resumeData.language || 'en',
            });
            const text = res?.content || res?.summary || res?.data?.content;
            if (text && typeof text === 'string') {
                const cleaned = text.replace(/^["']|["']$/g, '').trim();
                updateAchievement(achievement.id, 'description', cleaned);
                triggerToast('Achievement description polished with AI!');
                return;
            }
        } catch {
            // AI unavailable: handled below without generating any text.
        } finally {
            setIsPolishingId(null);
        }

        // No AI result: never synthesize a description. Keep the candidate's own
        // text exactly as written and tell them AI is unavailable.
        triggerToast(
            currentDesc
                ? 'AI polishing is unavailable right now. Your description was left unchanged.'
                : 'AI polishing is unavailable right now. Add a sentence describing what you were recognized for, then try again.',
            'info'
        );
    };



    const hasAchievements = achievements.some(a => String(a?.title || a?.name || '').trim() !== '');

    // Filter achievements by live search query and category
    const filteredAchievements = achievements.filter(achievement => {
        const matchesQuery = !searchQuery.trim() ||
            (achievement.title || achievement.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (achievement.awarder || achievement.issuer || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (achievement.description || '').toLowerCase().includes(searchQuery.toLowerCase());

        const activeType = achievement.achievementType || 'Award';
        const matchesType = selectedTypeFilter === 'all' || activeType === selectedTypeFilter;

        return matchesQuery && matchesType;
    });

    return (
        <StepShell
            stepNumber={9}
            stepPath="achievements"
            title={t('AchievementsStep.title', 'Honors, Awards & Key Achievements')}
            subtitle="Record competitive accolades, hackathons, academic distinctions, or notable career milestones."
            isComplete={hasAchievements}
            statusBadge={achievements.length > 0 ? `${achievements.length} ${achievements.length === 1 ? 'Award' : 'Awards'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
            onNavigate={onNavigate}
        >
            {/* Toast Feedback */}
            {toastState && (
                <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-2xs animate-fadeIn ${
                    toastState.type === 'error'
                        ? 'bg-rose-50 text-rose-800 border border-rose-200'
                        : toastState.type === 'info'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}>
                    <div className="flex items-center gap-2">
                        <MdCheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>{toastState.message}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setToastState(null)}
                        className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                        <MdClose className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {achievements.length === 0 ? (
                <div className="space-y-4">
                    <EmptyState
                        title={t('AchievementsStep.empty.title', 'Add an achievement, honor, or award')}
                        description="Record competitive accolades, hackathons, academic distinctions, patents, or leadership recognitions that make your resume stand out."
                        primaryAction={{
                            label: 'Add Award / Achievement',
                            icon: <MdAdd className="w-4 h-4" />,
                            onClick: () => addAchievement(),
                        }}
                    />

                    {signals.length > 0 && (
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <FaSearch className="w-3.5 h-3.5 text-indigo-600" />
                                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Recognition Signals in Your Experience</h3>
                                </div>
                                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                    {signals.length} found
                                </span>
                            </div>
                            <p className="text-xs text-slate-500">
                                Detected recognition lines from what you already entered in work history or education. Click to feature as standalone awards:
                            </p>
                            <ul className="divide-y divide-indigo-100/60 rounded-xl border border-indigo-100 bg-white shadow-2xs overflow-hidden">
                                {signals.map((signal, index) => (
                                    <li key={index} className="flex items-start justify-between gap-3 px-3.5 py-3 hover:bg-indigo-50/20 transition-colors">
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium leading-relaxed text-slate-800">{signal.text}</p>
                                            <p className="mt-1 text-[11px] text-slate-400 font-medium">from {signal.source}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => addAchievement(signal)}
                                            className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer shadow-2xs"
                                        >
                                            + Add as Award
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Modern Command Toolbar */}
                    <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-2.5">
                            <span className="text-sm font-extrabold text-slate-800 tracking-tight">
                                Honors &amp; Key Achievements
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-200/60">
                                {achievements.length} {achievements.length === 1 ? 'Award' : 'Awards'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            {signals.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setScanOpen(prev => !prev)}
                                    className={`h-9 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer ${
                                        scanOpen
                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                            : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                                    }`}
                                    title="Scan existing work and project descriptions for award signals"
                                >
                                    <FaSearch className="w-3 h-3 text-indigo-600" />
                                    <span>{scanOpen ? 'Hide Scan' : `Scan Experience (${signals.length})`}</span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => addAchievement()}
                                className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                            >
                                <MdAdd className="w-4 h-4 text-white" />
                                <span>Add Award / Achievement</span>
                            </button>
                        </div>
                    </div>

                    {/* Toolbar Row 2: Search and Type Filter Tabs (when > 1 achievement) */}
                    {achievements.length > 1 && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                            {/* Live Search */}
                            <div className="relative flex-1 max-w-sm">
                                <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search honors, awards, or organizations..."
                                    className="w-full h-9 pl-9 pr-8 text-xs bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                        <MdClose className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Category Filter Pills */}
                            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                                <button
                                    type="button"
                                    onClick={() => setSelectedTypeFilter('all')}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                        selectedTypeFilter === 'all'
                                            ? 'bg-slate-800 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    All ({achievements.length})
                                </button>
                                {ACHIEVEMENT_TYPES.map(t => {
                                    const count = achievements.filter(a => (a.achievementType || 'Award') === t.id).length;
                                    if (count === 0 && selectedTypeFilter !== t.id) return null;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setSelectedTypeFilter(t.id)}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                                                selectedTypeFilter === t.id
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                        >
                                            {t.label} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Scan Results Drawer */}
                    {scanOpen && signals.length > 0 && (
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3 animate-fadeIn">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <FaSearch className="w-3.5 h-3.5 text-indigo-600" />
                                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Recognition Signals in Your Experience</h3>
                                </div>
                                <button type="button" onClick={() => setScanOpen(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer">
                                    ✕ Close
                                </button>
                            </div>
                            <p className="text-xs text-slate-500">
                                Lines detected in your work history or education text that match recognition signals. Click to add:
                            </p>
                            <ul className="divide-y divide-indigo-100/60 rounded-xl border border-indigo-100 bg-white shadow-2xs overflow-hidden">
                                {signals.map((signal, index) => (
                                    <li key={index} className="flex items-start justify-between gap-3 px-3.5 py-3 hover:bg-indigo-50/20 transition-colors">
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium leading-relaxed text-slate-800">{signal.text}</p>
                                            <p className="mt-1 text-[11px] text-slate-400 font-medium">from {signal.source}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => addAchievement(signal)}
                                            className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer shadow-2xs"
                                        >
                                            + Add as Award
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Elevated Honor & Award Cards View */}
                    <div className="space-y-4">
                        {filteredAchievements.map((achievement) => {
                            const originalIndex = achievements.findIndex(a => a.id === achievement.id);
                            const activeType = achievement.achievementType || 'Award';
                            const typeConfig = ACHIEVEMENT_TYPES.find(t => t.id === activeType) || ACHIEVEMENT_TYPES[0];
                            const theme = TYPE_STYLE_MAP[activeType] || TYPE_STYLE_MAP.Award;
                            const TypeIcon = typeConfig.icon;
                            const achTitle = achievement.title || achievement.name || '';

                            const subtitleParts = [
                                achievement.awarder || achievement.issuer,
                                achievement.date ? `Received ${achievement.date}` : '',
                            ].filter(Boolean);

                            const subtitle = subtitleParts.length > 0
                                ? subtitleParts.join(' • ')
                                : 'Add awarding organization, dates, and significance';

                            return (
                                <div
                                    key={achievement.id}
                                    className={`bg-white border ${theme.cardBorder} rounded-2xl shadow-xs hover:shadow-md transition-all overflow-hidden`}
                                >
                                    {/* Card Header */}
                                    <div className={`p-3.5 sm:p-4 border-b border-slate-100 bg-gradient-to-r ${theme.headerGradient} flex items-center justify-between gap-3`}>
                                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                            <span className={`w-6 h-6 rounded-md ${theme.indexBadge} font-extrabold flex items-center justify-center text-[11px] shrink-0 shadow-2xs`}>
                                                #{originalIndex + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                                        {achTitle || 'Untitled Honor / Award'}
                                                    </h4>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 flex items-center gap-1 ${theme.badgeClass}`}>
                                                        <TypeIcon className="w-3 h-3" />
                                                        <span>{typeConfig.label}</span>
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                                    {subtitle}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Action Button Group */}
                                        <div className="flex items-center gap-0.5 bg-white/95 backdrop-blur-xs p-1 rounded-xl border border-slate-200/80 shadow-2xs shrink-0">
                                            <button
                                                type="button"
                                                disabled={originalIndex === 0}
                                                onClick={(e) => { e.stopPropagation(); moveAchievement(achievement.id, -1); }}
                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 disabled:opacity-20 rounded-lg hover:bg-slate-100 text-[11px] font-bold transition-all cursor-pointer"
                                                title="Move award up"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                type="button"
                                                disabled={originalIndex === achievements.length - 1}
                                                onClick={(e) => { e.stopPropagation(); moveAchievement(achievement.id, 1); }}
                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 disabled:opacity-20 rounded-lg hover:bg-slate-100 text-[11px] font-bold transition-all cursor-pointer"
                                                title="Move award down"
                                            >
                                                ▼
                                            </button>
                                            <div className="w-[1px] h-3.5 bg-slate-200 mx-0.5" />
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); duplicateAchievement(achievement.id); }}
                                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50/70 transition-all cursor-pointer"
                                                title="Duplicate award"
                                            >
                                                <MdContentCopy className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); removeAchievement(achievement.id); }}
                                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50/70 transition-all cursor-pointer ml-0.5"
                                                title="Delete award"
                                            >
                                                <MdDeleteOutline className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-4 sm:p-5 space-y-4">
                                        {/* Category Selector Segmented Bar */}
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                                                Category &amp; Recognition Type
                                            </label>
                                            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/70 border border-slate-200/80 rounded-xl">
                                                {ACHIEVEMENT_TYPES.map(type => {
                                                    const Icon = type.icon;
                                                    const isSelected = activeType === type.id;
                                                    return (
                                                        <button
                                                            key={type.id}
                                                            type="button"
                                                            onClick={() => updateAchievement(achievement.id, 'achievementType', type.id)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                                                                isSelected
                                                                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/90 font-bold'
                                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 border border-transparent'
                                                            }`}
                                                        >
                                                            <Icon className={`w-3.5 h-3.5 ${isSelected ? theme.iconColor : 'text-slate-400'}`} />
                                                            <span>{type.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Row 1: Award Title & Date Received */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="sm:col-span-2">
                                                <Field
                                                    label={t('AchievementsStep.fields.title.label', 'Award or Honor Title')}
                                                    name={`achievement-title-${achievement.id}`}
                                                    placeholder="Award or Honor Title (e.g. Employee of the Year, Hackathon 1st Place)"
                                                    value={achTitle}
                                                    onChange={(e) => updateAchievement(achievement.id, 'title', e.target.value)}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <Field
                                                    label="Date Received"
                                                    name={`achievement-date-${achievement.id}`}
                                                    placeholder="e.g. Nov 2024"
                                                    value={achievement.date || ''}
                                                    onChange={(e) => updateAchievement(achievement.id, 'date', e.target.value)}
                                                    optional
                                                />
                                            </div>
                                        </div>

                                        {/* Row 2: Awarding Organization / Issuer */}
                                        <div>
                                            <Field
                                                label="Awarding Organization or Issuer"
                                                name={`achievement-awarder-${achievement.id}`}
                                                placeholder="Awarding Organization or Issuer (e.g. IEEE, Google Cloud, University)"
                                                value={achievement.awarder || achievement.issuer || ''}
                                                onChange={(e) => updateAchievement(achievement.id, 'awarder', e.target.value)}
                                                optional
                                            />
                                        </div>

                                        {/* Row 3: Description of Accomplishment & Significance with AI Polish */}
                                        <div className="space-y-2">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                                <div>
                                                    <label className="text-[13px] font-semibold text-slate-700">
                                                        Accomplishment &amp; Significance
                                                    </label>
                                                    <span className="block sm:inline sm:ml-1.5 text-[11px] text-slate-400 font-normal">
                                                        — scope, measurable impact, or why this honor was awarded
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={isPolishingId === achievement.id}
                                                    onClick={() => polishAchievementDescription(achievement)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 text-indigo-700 border border-indigo-200/80 rounded-lg text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer disabled:opacity-50 self-start sm:self-auto shrink-0"
                                                    title="Auto-enhance phrasing with impact metrics and action verbs"
                                                >
                                                    <MdAutoAwesome className={`w-3.5 h-3.5 text-indigo-600 ${isPolishingId === achievement.id ? 'animate-spin' : ''}`} />
                                                    <span>{isPolishingId === achievement.id ? 'Polishing...' : '🪄 Enhance with AI'}</span>
                                                </button>
                                            </div>

                                            <textarea
                                                value={achievement.description || ''}
                                                onChange={(e) => updateAchievement(achievement.id, 'description', e.target.value)}
                                                placeholder={getDynamicPlaceholder('achievements', 'description', candidateContext) || 'Brief description of the accomplishment and its significance...'}
                                                className="w-full min-h-[78px] text-xs p-3.5 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200/90 rounded-xl font-medium text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 outline-none resize-y transition-all shadow-2xs leading-relaxed"
                                            />

                                            {/* Quick Starter Chips */}
                                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                                <span className="text-[11px] font-semibold text-slate-400">Quick starters:</span>
                                                {SUGGESTION_CHIPS.map((chip, cIdx) => (
                                                    <button
                                                        key={cIdx}
                                                        type="button"
                                                        onClick={() => {
                                                            const current = (achievement.description || '').trim();
                                                            const separator = current ? (current.endsWith('.') ? ' ' : '. ') : '';
                                                            updateAchievement(achievement.id, 'description', `${current}${separator}${chip.text}`);
                                                        }}
                                                        className="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-indigo-50/80 text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 transition-all cursor-pointer shadow-2xs"
                                                    >
                                                        {chip.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Bottom Add Action Button */}
                    <button
                        type="button"
                        onClick={() => addAchievement()}
                        className="w-full h-11 rounded-2xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-bold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                    >
                        <MdAdd className="w-4 h-4 text-indigo-600" />
                        <span>{t('AchievementsStep.actions.addAchievement', 'Add Another Achievement')}</span>
                    </button>
                </div>
            )}
        </StepShell>
    );
};

export default AchievementsStep;
