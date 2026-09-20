import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    FaMagic,
    FaPlus,
    FaThLarge,
    FaTags,
    FaTimes,
    FaSearch,
    FaBolt,
    FaChevronDown,
    FaChevronUp,
    FaTrash,
} from 'react-icons/fa';
import { MdCheckCircle } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import AutocompleteInputField from './components/AutocompleteInputField';
import AiRecommendationModal from '../../Form/AiRecommendationModal.jsx';
import { generateUserAiContent, cleanSkillName } from '../../../services/aiService.js';
import { buildAssistPayload } from '../ai/aiContract.js';
import { calculateAtsScore } from '../../../utils/atsScore.js';
import { getCandidateContext } from '../../../utils/candidateContext.js';

const PROFICIENCY_LEVELS = [
    { label: 'Beginner', value: 25 },
    { label: 'Intermediate', value: 50 },
    { label: 'Advanced', value: 75 },
    { label: 'Expert', value: 100 },
];

const ratingToLevel = (rating) => {
    const num = Number(rating) || 75;
    if (num >= 100) return 'Expert';
    if (num >= 75) return 'Advanced';
    if (num >= 50) return 'Intermediate';
    return 'Beginner';
};

const levelToRating = (level) => {
    switch (String(level || '').toLowerCase()) {
        case 'expert': return 100;
        case 'advanced': return 75;
        case 'intermediate': return 50;
        case 'beginner': return 25;
        default: return 75;
    }
};

const LEVEL_COLOR_CLASSES = {
    expert: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    advanced: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    intermediate: 'bg-sky-100 text-sky-800 border-sky-200',
    beginner: 'bg-slate-200 text-slate-700 border-slate-300',
};

/**
 * 10/10 Skills Step — World-Class Resume Builder Experience:
 * - 2-Tier Header Toolbar: Title, Count Badge, AI Auto-Recommend Modal & Add Skill actions.
 * - Live Search Filter across all skills and proficiency levels.
 * - Collapsible Bulk Ingestion Drawer with multi-delimiter support (comma, semicolon, newline).
 * - Dual View Modes: Spacious 2-Column Responsive Cards Grid vs High-Density Compact Tags Matrix.
 * - 4-Tier Segmented Proficiency Controls (Beginner, Intermediate, Advanced, Expert) with colored indicator.
 * - Micro-Action Pods (▲ Move Up, ▼ Move Down, 🗑 Delete).
 * - Interactive AI Recommendation Review Modal with Core vs Recommended separation & multi-select.
 * - ATS JD Alignment Engine (Matched / Partial / Missing) & Real-time Duplicate Detection.
 * - Zero-Data Loss Autosaving & Synchronous Step Flush on Unmount.
 */
const SkillsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [skills, setSkills] = useState(resumeData.skills || []);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');
    const targetJd = resumeData.targetJobDescription || '';

    // View & Search States
    const [skillsViewMode, setSkillsViewMode] = useState('grid'); // 'grid' | 'compact'
    const [skillsSearchQuery, setSkillsSearchQuery] = useState('');
    const [showBulkSkills, setShowBulkSkills] = useState(false);
    const [bulkSkillsInput, setBulkSkillsInput] = useState('');

    // AI & Notification States
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [toastState, setToastState] = useState(null);
    const [aiModalState, setAiModalState] = useState({
        isOpen: false,
        title: '',
        type: 'skills',
        items: [],
        onApply: null,
    });

    const idCounter = useRef(0);

    useEffect(() => {
        if (resumeData.skills && Array.isArray(resumeData.skills)) {
            setSkills(resumeData.skills);
        }
    }, [resumeData.skills]);

    const triggerNotification = (msg, type = 'success') => {
        setToastState({ msg, type });
        setTimeout(() => setToastState(null), 4500);
    };

    const createNewSkill = (name = '', rating = 75) => {
        idCounter.current += 1;
        const cleaned = cleanSkillName(name) || name;
        return {
            id: `skill_${Date.now()}_${idCounter.current}_${Math.random().toString(36).substr(2, 4)}`,
            skillName: cleaned,
            name: cleaned,
            rating: Number.isFinite(rating) ? rating : 75,
        };
    };

    const normalizeSkillName = value => String(value || '').trim().toLowerCase();

    const addSkill = (name = '', rating = 75) => {
        const newSkill = createNewSkill(name, rating);
        setSkills(prev => [...prev, newSkill]);
    };

    const updateSkill = (id, field, value) => {
        setSkills(prev => prev.map(s => {
            if (s.id !== id) return s;
            if (field === 'rating') {
                return { ...s, rating: Number(value) };
            }
            if (field === 'level') {
                return { ...s, rating: levelToRating(value) };
            }
            if (field === 'name' || field === 'skillName') {
                return { ...s, skillName: value, name: value };
            }
            return { ...s, [field]: value };
        }));
    };

    const removeSkill = (id) => setSkills(prev => prev.filter(skill => skill.id !== id));

    const moveSkill = (index, direction) => {
        setSkills(prev => {
            const nextIndex = index + direction;
            if (nextIndex < 0 || nextIndex >= prev.length) return prev;
            const updated = [...prev];
            const temp = updated[index];
            updated[index] = updated[nextIndex];
            updated[nextIndex] = temp;
            return updated;
        });
    };

    const cycleSkillRating = (id) => {
        setSkills(prev => prev.map(s => {
            if (s.id !== id) return s;
            const r = Number(s.rating) || 75;
            let nextR = 75;
            if (r <= 25) nextR = 50;
            else if (r <= 50) nextR = 75;
            else if (r <= 75) nextR = 100;
            else nextR = 25;
            return { ...s, rating: nextR };
        }));
    };

    // Bulk ingestion parser supporting commas, semicolons, and newlines
    const handleBulkSkillAdd = () => {
        if (!bulkSkillsInput.trim()) return;
        const tokens = bulkSkillsInput.split(/[,;\n]+/).map(t => cleanSkillName(t)).filter(Boolean);
        if (!tokens.length) return;

        setSkills(prev => {
            const existingNames = new Set(prev.map(s => normalizeSkillName(s?.skillName || s?.name)));
            const toAdd = [];
            for (const token of tokens) {
                const norm = normalizeSkillName(token);
                if (norm && !existingNames.has(norm)) {
                    existingNames.add(norm);
                    toAdd.push(createNewSkill(token, 75));
                }
            }
            if (toAdd.length > 0) {
                triggerNotification(`Added ${toAdd.length} skill(s) to your resume!`);
                return [...prev, ...toAdd];
            } else {
                triggerNotification('All entered skills already exist in your resume.', 'info');
                return prev;
            }
        });
        setBulkSkillsInput('');
        setShowBulkSkills(false);
    };

    // AI Contextual Recommendation Modal Trigger
    const handleRecommendAiSkills = async () => {
        const effectiveRole = String(
            candidateContext?.target?.role ||
            resumeData.targetRole ||
            resumeData.occupation ||
            (resumeData.workExperience?.[0]?.jobTitle || resumeData.workExperiences?.[0]?.jobTitle) ||
            ''
        ).trim();

        setIsAiGenerating(true);
        try {
            const existing = skills.map(s => String(s?.skillName || s?.name || '').trim().toLowerCase()).filter(Boolean);
            let prepared;
            try {
                prepared = buildAssistPayload('generate-skills', {
                    resumeData,
                    targetJd,
                });
            } catch {
                prepared = { payload: { targetRole: effectiveRole, occupation: effectiveRole, existingSkills: existing } };
            }

            const data = await generateUserAiContent('generate-skills', {
                ...prepared.payload,
                targetRole: effectiveRole || prepared.payload?.targetRole || 'Professional',
                existingSkills: existing,
            });

            const rawSkills = Array.isArray(data?.skills)
                ? data.skills
                : (Array.isArray(data?.data?.skills)
                    ? data.data.skills
                    : (Array.isArray(data?.suggestions)
                        ? data.suggestions
                        : (Array.isArray(data) ? data : [])));

            if (!rawSkills.length) {
                const note = data?.note || 'AI skill suggestions are currently unavailable. Please verify your target role and try again.';
                triggerNotification(note, 'info');
                return;
            }

            const unadded = rawSkills.filter(s => {
                const name = typeof s === 'string' ? s : s?.name || s?.skill || s?.title;
                return name && !existing.some(e => e.toLowerCase() === name.trim().toLowerCase());
            });

            const itemsToReview = unadded.map((s, idx) => {
                const raw = typeof s === 'string' ? s : s?.name || s?.skill || s?.title;
                const cleaned = cleanSkillName(raw);
                const category = (typeof s === 'object' && s?.category && ['mandatory', 'recommended'].includes(s.category))
                    ? s.category
                    : (idx < 5 ? 'mandatory' : 'recommended');
                return { name: cleaned, category };
            }).filter(s => s.name);

            if (!itemsToReview.length) {
                triggerNotification('All recommended skills for this role are already in your resume!', 'info');
                return;
            }

            setAiModalState({
                isOpen: true,
                title: `Review AI Recommended Skills for ${effectiveRole || 'Your Target Role'}`,
                type: 'skills',
                items: itemsToReview,
                onApply: (approvedItems) => {
                    const toAdd = approvedItems.map(item => createNewSkill(item.name, 100));
                    setSkills(prev => {
                        const existingNames = new Set(prev.map(s => normalizeSkillName(s?.skillName || s?.name)));
                        const fresh = toAdd.filter(s => !existingNames.has(normalizeSkillName(s.skillName)));
                        return [...prev, ...fresh];
                    });
                    triggerNotification(`Added ${approvedItems.length} approved ATS skills to your resume!`);
                },
            });
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('AI skill recommendation error:', err);
            const msg = (err?.code === 'AI_DAILY_QUOTA_EXCEEDED' || err?.status === 429)
                ? 'Daily AI limit reached. Please upgrade your plan or try again later.'
                : (err?.message || 'Unable to generate skills recommendations.');
            triggerNotification(msg, 'error');
        } finally {
            setIsAiGenerating(false);
        }
    };

    // Autosave synchronization
    const handleSave = () => {
        const hasValidSkill = skills.some(s => String(s?.skillName || s?.name || '').trim() !== '');
        const completedSteps = [...(resumeData.completedSteps || [])];
        let updatedCompletedSteps = null;

        if (hasValidSkill && !completedSteps.includes(4)) {
            updatedCompletedSteps = [...completedSteps, 4];
        } else if (!hasValidSkill && completedSteps.includes(4)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 4);
        }

        updateResumeData({
            skills,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);
        return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skills]);

    // Unmount flush: synchronously commit state on step exit
    const skillsRef = useRef(skills);
    const updateResumeDataRef = useRef(updateResumeData);
    const completedStepsRef = useRef(resumeData?.completedSteps || []);
    useEffect(() => { skillsRef.current = skills; }, [skills]);
    useEffect(() => { updateResumeDataRef.current = updateResumeData; }, [updateResumeData]);
    useEffect(() => { completedStepsRef.current = resumeData?.completedSteps || []; }, [resumeData?.completedSteps]);
    useEffect(() => () => {
        const sks = skillsRef.current;
        const hasValidSkill = sks.some(s => String(s?.skillName || s?.name || '').trim() !== '');
        const completedSteps = [...(completedStepsRef.current || [])];
        let updatedCompletedSteps = null;
        if (hasValidSkill && !completedSteps.includes(4)) {
            updatedCompletedSteps = [...completedSteps, 4];
        } else if (!hasValidSkill && completedSteps.includes(4)) {
            updatedCompletedSteps = completedSteps.filter(step => step !== 4);
        }
        updateResumeDataRef.current({
            skills: sks,
            ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
        });
    }, []);

    // Deterministic duplicate detection
    const nameCounts = new Map();
    skills.forEach(s => {
        const key = normalizeSkillName(s?.skillName || s?.name);
        if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    });
    const duplicates = skills
        .map((s, index) => ({ skill: s, index, key: normalizeSkillName(s?.skillName || s?.name) }))
        .filter(item => item.key && (nameCounts.get(item.key) || 0) > 1);

    const hasSkills = skills.some(s => String(s?.skillName || s?.name || '').trim() !== '');

    // JD alignment — real engine output (MATCHED / PARTIAL / MISSING)
    const atsResult = calculateAtsScore(resumeData, { jobDescription: targetJd });
    const jdMatch = atsResult?.jdMatch;

    // Filtered skills based on live search
    const filteredSkills = skills
        .map((skill, originalIndex) => ({ ...skill, originalIndex }))
        .filter(skill => {
            if (!skillsSearchQuery.trim()) return true;
            const q = skillsSearchQuery.toLowerCase().trim();
            const name = (skill.skillName || skill.name || '').toLowerCase();
            const level = ratingToLevel(skill.rating).toLowerCase();
            return name.includes(q) || level.includes(q);
        });

    return (
        <StepShell
            stepNumber={4}
            stepPath="skills"
            title={t('SkillsStep.title', 'Skills')}
            subtitle={t('SkillsStep.subtitle', 'The skills you actually used in your work — list them as they appear on your CVs, certificates, or project documentation.')}
            isComplete={hasSkills}
            statusBadge={skills.length > 0 ? `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}` : ''}
            resumeData={resumeData}
            targetJd={targetJd}
        >
            <div className="space-y-4">
                {/* 10/10 Header & Actions Toolbar */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
                    {/* Row 1: Title, Counter Badge & Primary Creation Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h3 className="text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">
                                    Skills & Technical Competencies
                                </h3>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/80 whitespace-nowrap shrink-0">
                                    {skills.length} {skills.length === 1 ? 'Skill' : 'Skills'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Save core technical competencies and soft skills parsed by ATS screening engines.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                            {/* Auto-Recommend Skills (AI) */}
                            <button
                                type="button"
                                onClick={handleRecommendAiSkills}
                                disabled={isAiGenerating}
                                className="whitespace-nowrap px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer shrink-0 disabled:opacity-50">
                                <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                <span>Auto-Recommend (AI)</span>
                            </button>

                            {/* Add Single Skill */}
                            <button
                                type="button"
                                onClick={() => addSkill()}
                                className="whitespace-nowrap px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0">
                                <FaPlus className="w-3 h-3" /> Add Skill
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Search Filter + View & Utility Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        {/* Search / Filter Input */}
                        <div className="relative flex-1 max-w-md">
                            <FaSearch className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={skillsSearchQuery}
                                onChange={(e) => setSkillsSearchQuery(e.target.value)}
                                placeholder={skills.length > 0 ? `Search across ${skills.length} skills...` : "Filter skills..."}
                                className="w-full text-xs pl-9 pr-8 py-2 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200/90 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                            />
                            {skillsSearchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSkillsSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                    title="Clear search">
                                    <FaTimes className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        {/* View & Utility Controls */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            {/* Quick Bulk Paste Toggle */}
                            <button
                                type="button"
                                onClick={() => setShowBulkSkills(prev => !prev)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border cursor-pointer ${
                                    showBulkSkills || bulkSkillsInput.trim()
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-2xs font-bold'
                                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                                title="Toggle quick bulk paste ingestion">
                                <FaBolt className={`w-3 h-3 ${showBulkSkills || bulkSkillsInput.trim() ? 'text-indigo-600' : 'text-amber-500'}`} />
                                <span>Bulk Paste</span>
                                {showBulkSkills ? <FaChevronUp className="w-2.5 h-2.5 opacity-60" /> : <FaChevronDown className="w-2.5 h-2.5 opacity-60" />}
                            </button>

                            {/* View Mode Switcher */}
                            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80">
                                <button
                                    type="button"
                                    onClick={() => setSkillsViewMode('grid')}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                        skillsViewMode === 'grid'
                                            ? 'bg-white text-indigo-700 shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                    title="Cards View (Detailed view with proficiency controls)">
                                    <FaThLarge className="w-3 h-3" />
                                    <span>Cards</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSkillsViewMode('compact')}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                        skillsViewMode === 'compact'
                                            ? 'bg-white text-indigo-700 shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                    title="Compact Tags View (High-density overview of all skills)">
                                    <FaTags className="w-3 h-3" />
                                    <span>Tags</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Collapsible Bulk Skills Ingestion Drawer */}
                {(showBulkSkills || bulkSkillsInput.trim()) && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 transition-all animate-fadeIn">
                        <div className="flex items-center justify-between">
                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                <span>⚡ Quick Bulk Paste Ingestion</span>
                                <span className="text-[10px] text-slate-500 font-normal lowercase">(comma, semicolon, or newline separated)</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => setShowBulkSkills(false)}
                                className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer">
                                Hide
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <textarea
                                value={bulkSkillsInput}
                                onChange={(e) => setBulkSkillsInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault();
                                        handleBulkSkillAdd();
                                    }
                                }}
                                placeholder="Paste multiple skills at once (e.g. React.js, TypeScript, Node.js, Docker, Kubernetes, Clinical Leadership)..."
                                className="flex-1 text-xs p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none h-14"
                            />
                            <button
                                type="button"
                                onClick={handleBulkSkillAdd}
                                disabled={!bulkSkillsInput.trim()}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs shrink-0 cursor-pointer h-14"
                            >
                                <FaPlus className="w-3.5 h-3.5" /> Add All
                            </button>
                        </div>
                    </div>
                )}

                {/* Duplicate warning banner */}
                {duplicates.length > 1 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-800 space-y-2">
                        <p className="font-semibold">
                            Duplicate skills detected ({[...new Set(duplicates.map(d => d.skill.skillName || d.skill.name))].join(', ')}).
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {duplicates.slice(1).map(({ skill }) => (
                                <button
                                    key={`dup-${skill.id}`}
                                    type="button"
                                    onClick={() => removeSkill(skill.id)}
                                    className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-semibold hover:bg-amber-100 transition-colors cursor-pointer shadow-2xs"
                                >
                                    Remove “{skill.skillName || skill.name}”
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* JD Alignment Panel — ATS Engine Output */}
                {jdMatch && jdMatch.score !== null && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-sm font-bold text-slate-900">
                                Alignment with your target role
                                {candidateContext.target.role ? ` — ${candidateContext.target.role}` : ''}
                            </h2>
                            <span className="text-xs font-semibold text-slate-500">
                                {jdMatch.matched.length} matched · {jdMatch.partial?.length || 0} partial · {jdMatch.missing.length} missing
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">
                            Matched means the term appears in your resume. Partial means part of a multi-word term appears —
                            consider whether the resume should use the full term, if it is true for you.
                        </p>
                        {jdMatch.matched.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">Matched</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {jdMatch.matched.slice(0, 12).map(term => (
                                        <span key={`m-${term}`} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                                            <MdCheckCircle className="w-3 h-3" />{term}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {(jdMatch.partial?.length || 0) > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1.5">Partial match</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {jdMatch.partial.slice(0, 12).map(term => (
                                        <span key={`p-${term}`} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                                            {term}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {jdMatch.missing.length > 0 && (
                            <div>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Not found in your resume</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {jdMatch.missing.slice(0, 12).map(term => (
                                        <span key={`x-${term}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
                                            {term}
                                        </span>
                                    ))}
                                </div>
                                <p className="mt-1.5 text-[11px] text-slate-400">
                                    Add terms only if they are true for you — never pad the list.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Skills Presentation: Empty State vs Cards vs Compact Tags */}
                {skills.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-3.5">
                        <p className="text-xs font-semibold text-slate-700">No skills added to your resume yet</p>
                        <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                            Add technical skills, industry tools, and soft competencies that will be evaluated by ATS scanners.
                        </p>
                        <div className="flex items-center justify-center gap-2.5 pt-1">
                            <button
                                type="button"
                                onClick={handleRecommendAiSkills}
                                disabled={isAiGenerating}
                                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50">
                                <FaMagic className={`w-3.5 h-3.5 ${isAiGenerating ? 'animate-spin' : ''}`} />
                                <span>Auto-Recommend Top Skills (AI)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => addSkill()}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold cursor-pointer transition-colors">
                                Add Skill
                            </button>
                        </div>
                    </div>
                ) : skillsViewMode === 'compact' ? (
                    /* High-Density Compact Tags / Quick View */
                    <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                Quick Skill Matrix ({filteredSkills.length})
                            </span>
                            <span className="text-[11px] text-slate-500">
                                Click badge to cycle level • Reorder with arrows • Click × to delete
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {filteredSkills.map((skill) => {
                                const idx = skill.originalIndex;
                                const currentLvl = ratingToLevel(skill.rating);
                                const lvlColors = LEVEL_COLOR_CLASSES[currentLvl.toLowerCase()] || 'bg-indigo-100 text-indigo-800 border-indigo-200';

                                return (
                                    <div
                                        key={skill.id || idx}
                                        className="group inline-flex items-center gap-2 pl-3 pr-2 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl shadow-2xs transition-all"
                                    >
                                        <span className="text-xs font-semibold text-slate-900">
                                            {skill.skillName || skill.name || <span className="text-slate-400 italic">Untitled Skill</span>}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => cycleSkillRating(skill.id)}
                                            className={`text-[10px] px-2 py-0.5 rounded-lg font-bold border transition-all cursor-pointer ${lvlColors}`}
                                            title="Click to cycle: Beginner → Intermediate → Advanced → Expert"
                                        >
                                            {currentLvl}
                                        </button>
                                        <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                disabled={idx === 0}
                                                onClick={() => moveSkill(idx, -1)}
                                                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-20 text-[9px] cursor-pointer"
                                                title="Move up"
                                            >
                                                ▲
                                            </button>
                                            <button
                                                type="button"
                                                disabled={idx === skills.length - 1}
                                                onClick={() => moveSkill(idx, 1)}
                                                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-20 text-[9px] cursor-pointer"
                                                title="Move down"
                                            >
                                                ▼
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeSkill(skill.id)}
                                                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-red-600 ml-0.5 cursor-pointer"
                                                title="Delete skill"
                                            >
                                                <FaTimes className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() => addSkill()}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-dashed border-indigo-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                            >
                                <FaPlus className="w-2.5 h-2.5" /> Add Skill
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Spacious 2-Column Responsive Cards Grid with Segmented Controls */
                    <div className="space-y-3.5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {filteredSkills.map((skill) => {
                                const idx = skill.originalIndex;
                                const currentLvl = ratingToLevel(skill.rating);

                                return (
                                    <div
                                        key={skill.id || idx}
                                        className="group relative p-3.5 bg-white hover:bg-slate-50/50 border border-slate-200/90 hover:border-indigo-200 rounded-2xl transition-all shadow-2xs hover:shadow-xs space-y-2.5"
                                    >
                                        {/* Header: Skill Name Input with Autocomplete + Compact Action Pod */}
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0">
                                                <AutocompleteInputField
                                                    hideLabel
                                                    name={`skill_${idx}`}
                                                    value={skill.skillName || skill.name || ''}
                                                    onChange={(e) => updateSkill(skill.id, 'skillName', e.target.value)}
                                                    onSelect={(val) => updateSkill(skill.id, 'skillName', val)}
                                                    placeholder="Skill name (e.g. React.js, Python, Medical Leadership)"
                                                    suggestionType="skill"
                                                    context={candidateContext}
                                                    inputClassName="w-full text-xs p-2.5 pr-8 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                                />
                                            </div>
                                            <div className="flex items-center gap-0.5 shrink-0 bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/70">
                                                <button
                                                    type="button"
                                                    disabled={idx === 0}
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveSkill(idx, -1); }}
                                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-20 rounded-lg hover:bg-white text-[10px] font-bold transition-all cursor-pointer"
                                                    title="Move skill up">
                                                    ▲
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={idx === skills.length - 1}
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveSkill(idx, 1); }}
                                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-20 rounded-lg hover:bg-white text-[10px] font-bold transition-all cursor-pointer"
                                                    title="Move skill down">
                                                    ▼
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeSkill(skill.id); }}
                                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                                    title="Delete skill">
                                                    <FaTrash className="w-2.5 h-2.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Proficiency Level Segmented Control */}
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between text-[11px] px-1">
                                                <span className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider">Proficiency</span>
                                                <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                                                    {currentLvl}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100/80 rounded-xl border border-slate-200/60">
                                                {PROFICIENCY_LEVELS.map((lvl) => {
                                                    const isSelected = currentLvl.toLowerCase() === lvl.label.toLowerCase();
                                                    return (
                                                        <button
                                                            key={lvl.value}
                                                            type="button"
                                                            onClick={() => updateSkill(skill.id, 'rating', lvl.value)}
                                                            className={`py-1 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                                                isSelected
                                                                    ? 'bg-indigo-600 text-white shadow-2xs'
                                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                                                            }`}
                                                        >
                                                            {lvl.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Add Skill Button at bottom of Cards Grid */}
                        <div className="pt-1">
                            <button
                                type="button"
                                onClick={() => addSkill()}
                                className="w-full py-3 bg-indigo-50/70 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer">
                                <FaPlus className="w-3.5 h-3.5" /> Add Another Skill
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* AI Recommendation Review Modal */}
            <AiRecommendationModal
                isOpen={aiModalState.isOpen}
                onClose={() => setAiModalState((prev) => ({ ...prev, isOpen: false }))}
                title={aiModalState.title}
                type={aiModalState.type}
                items={aiModalState.items}
                onApply={aiModalState.onApply || (() => {})}
            />

            {/* Notification Toast Alert */}
            {toastState && (
                <div className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-bold transition-all flex items-center gap-2 animate-fadeIn ${
                    toastState.type === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : toastState.type === 'info'
                        ? 'bg-sky-50 border-sky-200 text-sky-700'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}>
                    <span>{toastState.msg}</span>
                </div>
            )}
        </StepShell>
    );
};

export default SkillsStep;
